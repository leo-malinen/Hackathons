"""Async OpenRouter client.

Three things this wrapper exists to guarantee:

1. Structured output. Every agent in the pipeline asks for a strict JSON
   schema, so the orchestrator never has to parse prose.
2. Resilience. Free-tier models rate-limit and occasionally return prose
   anyway, so we retry, then fall back to other models, then repair.
3. Accounting. Token use is tallied per investigation so the UI can show it.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import ssl
from dataclasses import dataclass, field
from typing import Any

import httpx

from ..config import settings

log = logging.getLogger("reality_check.llm")

# Corporate TLS inspection is common on developer laptops and breaks certifi's
# bundle. truststore delegates verification to the OS trust store, which does
# carry the intercepting CA, so this keeps the client working in both worlds.
try:  # pragma: no cover - environment dependent
    import truststore

    _SSL_CONTEXT: ssl.SSLContext | bool = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
except Exception:  # pragma: no cover
    _SSL_CONTEXT = True


class LLMError(RuntimeError):
    pass


class QuotaExhausted(LLMError):
    """The account's model quota is gone, so retrying cannot help.

    Distinct from a transient 429: a per-minute burst limit clears on its own
    and is worth backing off for, while a daily cap does not clear until the
    reset and every further request is wasted. The pipeline aborts fast on
    this and the UI explains what to do about it.
    """

    def __init__(self, message: str, reset_at: float | None = None) -> None:
        super().__init__(message)
        self.reset_at = reset_at


class RateLimiter:
    """Keeps the pipeline inside OpenRouter's free-tier budget.

    Free models allow roughly 20 requests a minute. The pipeline fans out
    aggressively by design (several claims, each with several critic batches),
    which sails past that in a burst and earns a 429 on everything at once,
    including the Reasoner, whose loss silently degrades the verdict.

    Two controls, because they solve different failures: a semaphore bounds
    how many calls are in flight, and a minimum spacing bounds the rate. On a
    429 the limiter backs the whole pipeline off, so one rejected call slows
    everyone down instead of the fleet retrying into the same wall.
    """

    def __init__(self, *, max_concurrent: int = 3, min_interval: float = 0.9) -> None:
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._min_interval = min_interval
        self._last_start = 0.0
        self._penalty_until = 0.0
        self._pace_lock = asyncio.Lock()

    async def __aenter__(self) -> RateLimiter:
        await self._semaphore.acquire()
        async with self._pace_lock:
            loop = asyncio.get_running_loop()
            now = loop.time()
            wait = max(
                self._last_start + self._min_interval - now,
                self._penalty_until - now,
                0.0,
            )
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_start = loop.time()
        return self

    async def __aexit__(self, *_exc: object) -> None:
        self._semaphore.release()

    def penalise(self, seconds: float) -> None:
        """Hold every caller back after a rate-limit rejection."""
        loop = asyncio.get_running_loop()
        self._penalty_until = max(self._penalty_until, loop.time() + seconds)


_limiter = RateLimiter()


@dataclass
class Usage:
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    cost: float = 0.0
    by_model: dict[str, int] = field(default_factory=dict)

    def add(self, model: str, usage: dict[str, Any]) -> None:
        self.calls += 1
        self.prompt_tokens += int(usage.get("prompt_tokens") or 0)
        self.completion_tokens += int(usage.get("completion_tokens") or 0)
        self.total_tokens += int(usage.get("total_tokens") or 0)
        try:
            self.cost += float(usage.get("cost") or 0.0)
        except (TypeError, ValueError):
            pass
        self.by_model[model] = self.by_model.get(model, 0) + 1


_JSON_BLOCK = re.compile(r"```(?:json)?\s*(.*?)```", re.S)


def extract_json(text: str) -> Any:
    """Best-effort recovery of a JSON value from a model response.

    Order matters: a clean parse first, then fenced blocks, then the widest
    balanced brace or bracket span in the text.
    """
    text = (text or "").strip()
    if not text:
        raise LLMError("empty model response")

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    for match in _JSON_BLOCK.finditer(text):
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            continue

    for opener, closer in (("{", "}"), ("[", "]")):
        start = text.find(opener)
        end = text.rfind(closer)
        if start != -1 and end > start:
            candidate = text[start : end + 1]
            try:
                return json.loads(candidate)
            except json.JSONDecodeError:
                # Trailing commas are the most common malformation.
                repaired = re.sub(r",(\s*[}\]])", r"\1", candidate)
                try:
                    return json.loads(repaired)
                except json.JSONDecodeError:
                    continue

    raise LLMError(f"could not parse JSON from response: {text[:200]!r}")


class OpenRouterClient:
    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or settings.openrouter_api_key
        self.usage = Usage()
        self._client: httpx.AsyncClient | None = None
        self._lock = asyncio.Lock()

    async def _http(self) -> httpx.AsyncClient:
        async with self._lock:
            if self._client is None or self._client.is_closed:
                self._client = httpx.AsyncClient(
                    base_url=settings.openrouter_base_url,
                    timeout=httpx.Timeout(settings.llm_timeout_s, connect=20.0),
                    verify=_SSL_CONTEXT,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": settings.app_url,
                        "X-Title": settings.app_title,
                    },
                    limits=httpx.Limits(max_connections=12, max_keepalive_connections=6),
                )
            return self._client

    async def aclose(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # ------------------------------------------------------------------
    async def complete_json(
        self,
        *,
        system: str,
        user: str,
        schema: dict[str, Any],
        schema_name: str = "response",
        model: str | None = None,
        images: list[str] | None = None,
        temperature: float | None = None,
        max_tokens: int = 4000,
    ) -> Any:
        """Run a chat completion constrained to ``schema`` and return parsed JSON."""
        if not self.api_key:
            raise LLMError(
                "OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your key."
            )

        primary = model or settings.model_reasoning
        chain = [primary] + [m for m in settings.fallback_list if m != primary]

        content: Any = user
        if images:
            content = [{"type": "text", "text": user}] + [
                {"type": "image_url", "image_url": {"url": img}} for img in images
            ]

        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": content},
        ]

        last_error: Exception | None = None
        for model_id in chain:
            for attempt in range(settings.llm_max_retries):
                try:
                    return await self._attempt(
                        model_id, messages, schema, schema_name,
                        temperature if temperature is not None else settings.llm_temperature,
                        max_tokens,
                    )
                except LLMError as exc:
                    last_error = exc
                    log.warning("llm parse issue on %s (try %d): %s", model_id, attempt + 1, exc)
                    await asyncio.sleep(0.6 * (attempt + 1))
                except QuotaExhausted:
                    raise  # no model will work; stop immediately
                except httpx.HTTPStatusError as exc:
                    last_error = exc
                    status = exc.response.status_code
                    if status == 429:
                        _raise_if_quota_exhausted(exc.response)
                        # Respect the server's own pacing hint when it gives one.
                        retry_after = exc.response.headers.get("retry-after")
                        try:
                            delay = float(retry_after) if retry_after else 0.0
                        except ValueError:
                            delay = 0.0
                        delay = max(delay, 2.5 * (attempt + 1))
                        _limiter.penalise(delay)
                        log.warning(
                            "rate limited on %s, backing off %.1fs", model_id, delay
                        )
                        await asyncio.sleep(delay)
                        continue
                    if status in (502, 503, 524):
                        await asyncio.sleep(1.5 * (attempt + 1))
                        continue
                    # 400/404 usually means this model rejects the schema.
                    break
                except (httpx.HTTPError, asyncio.TimeoutError) as exc:
                    last_error = exc
                    await asyncio.sleep(1.0 * (attempt + 1))
            log.warning("falling back from model %s", model_id)

        raise LLMError(f"all models failed; last error: {last_error}")

    async def _attempt(
        self,
        model_id: str,
        messages: list[dict[str, Any]],
        schema: dict[str, Any],
        schema_name: str,
        temperature: float,
        max_tokens: int,
    ) -> Any:
        body = {
            "model": model_id,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": schema_name, "strict": True, "schema": schema},
            },
        }

        client = await self._http()
        async with _limiter:
            response = await client.post("/chat/completions", json=body)
        response.raise_for_status()
        payload = response.json()

        if "error" in payload and not payload.get("choices"):
            raise LLMError(str(payload["error"])[:300])

        self.usage.add(model_id, payload.get("usage") or {})
        choices = payload.get("choices") or []
        if not choices:
            raise LLMError("no choices returned")
        text = (choices[0].get("message") or {}).get("content") or ""
        return extract_json(text)


def _raise_if_quota_exhausted(response: httpx.Response) -> None:
    """Turn a daily-cap 429 into a fatal, explainable error.

    OpenRouter distinguishes the two cases in the body and in
    X-RateLimit-Remaining; a per-minute burst still has headroom left, a
    spent daily allowance does not.
    """
    try:
        body = response.json()
        message = str((body.get("error") or {}).get("message") or "")
    except Exception:  # noqa: BLE001
        message = response.text[:300]

    remaining = response.headers.get("x-ratelimit-remaining")
    daily = "per-day" in message.lower() or "daily" in message.lower()

    if not (daily or remaining == "0"):
        return

    reset_at: float | None = None
    raw_reset = response.headers.get("x-ratelimit-reset")
    if raw_reset:
        try:  # the header is in milliseconds
            reset_at = float(raw_reset) / 1000.0
        except ValueError:
            reset_at = None

    hint = (
        "The OpenRouter account has used its free-model quota for today "
        f"(limit {response.headers.get('x-ratelimit-limit', '50')} requests per "
        "day). Add 10 credits at openrouter.ai/credits to raise it to 1000 per "
        "day, or wait for the daily reset."
    )
    raise QuotaExhausted(hint, reset_at)


_client: OpenRouterClient | None = None


def get_client() -> OpenRouterClient:
    global _client
    if _client is None:
        _client = OpenRouterClient()
    return _client

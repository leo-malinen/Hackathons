"""OpenRouter client (default model: openai/gpt-4o-mini).

Deliberately implemented with urllib so the GitHub Action has no HTTP
dependency to install and no SDK version to fight.

Three rules this module enforces:
  1. The LLM is OPTIONAL. Every caller must work when `available` is False.
  2. The LLM never sees a question whose answer would change the lineage.
     It classifies, narrates and writes code - it does not traverse graphs.
  3. Failures are non-fatal. A flaky model provider must never turn a
     merge-blocking status check into a crash.
"""

from __future__ import annotations

import json
import logging
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

log = logging.getLogger("blast_radius.llm")


@dataclass
class LlmUsage:
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    errors: List[str] = field(default_factory=list)

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens

    def to_dict(self) -> Dict[str, Any]:
        return {
            "calls": self.calls,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "errors": self.errors[:5],
        }


class LlmClient:
    def __init__(
        self,
        api_key: str = "",
        model: str = "openai/gpt-4o-mini",
        base_url: str = "https://openrouter.ai/api/v1",
        temperature: float = 0.1,
        max_tokens: int = 3000,
        timeout: float = 90.0,
        app_url: str = "",
        app_title: str = "Blast Radius",
        enabled: bool = True,
    ) -> None:
        self.api_key = api_key or ""
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.timeout = timeout
        self.app_url = app_url
        self.app_title = app_title
        self.enabled = bool(enabled and self.api_key)
        self.usage = LlmUsage()

    # ------------------------------------------------------------------
    @classmethod
    def from_settings(cls, settings) -> "LlmClient":
        return cls(
            api_key=settings.openrouter_api_key,
            model=settings.model,
            base_url=settings.openrouter_base_url,
            temperature=settings.temperature,
            max_tokens=settings.max_tokens,
            app_url=settings.app_url,
            app_title=settings.app_title,
            enabled=settings.llm_enabled,
        )

    @property
    def available(self) -> bool:
        return self.enabled

    def describe(self) -> str:
        if not self.enabled:
            return "disabled (deterministic mode)"
        host = self.base_url.replace("https://", "").split("/")[0]
        return f"{self.model} via {host}"

    # ------------------------------------------------------------------
    def complete(
        self,
        system: str,
        user: str,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        json_mode: bool = False,
        retries: int = 2,
    ) -> Optional[str]:
        if not self.enabled:
            return None

        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": self.temperature if temperature is None else temperature,
            "max_tokens": max_tokens or self.max_tokens,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        # OpenRouter attribution headers (harmless against plain OpenAI).
        if self.app_url:
            headers["HTTP-Referer"] = self.app_url
        if self.app_title:
            headers["X-Title"] = self.app_title

        url = f"{self.base_url}/chat/completions"
        body = json.dumps(payload).encode("utf-8")

        last_error = ""
        for attempt in range(retries + 1):
            try:
                req = urllib.request.Request(url, data=body, headers=headers, method="POST")
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:  # noqa: S310
                    data = json.loads(resp.read().decode("utf-8"))
                usage = data.get("usage") or {}
                self.usage.calls += 1
                self.usage.prompt_tokens += int(usage.get("prompt_tokens") or 0)
                self.usage.completion_tokens += int(usage.get("completion_tokens") or 0)
                choices = data.get("choices") or []
                if not choices:
                    last_error = "no choices returned"
                    continue
                return (choices[0].get("message") or {}).get("content") or ""
            except urllib.error.HTTPError as exc:
                detail = ""
                try:
                    detail = exc.read().decode("utf-8")[:300]
                except Exception:
                    pass
                last_error = f"HTTP {exc.code}: {detail}"
                if exc.code in (429, 500, 502, 503, 504) and attempt < retries:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                break
            except Exception as exc:
                last_error = str(exc)
                if attempt < retries:
                    time.sleep(1.0 * (attempt + 1))
                    continue
                break

        log.warning("LLM call failed: %s", last_error)
        self.usage.errors.append(last_error)
        return None

    # ------------------------------------------------------------------
    def complete_json(
        self, system: str, user: str, max_tokens: Optional[int] = None
    ) -> Optional[Dict[str, Any]]:
        raw = self.complete(system, user, max_tokens=max_tokens, json_mode=True)
        if not raw:
            return None
        return extract_json(raw)


def extract_json(text: str) -> Optional[Dict[str, Any]]:
    """Tolerant JSON extraction: handles fenced blocks and leading prose."""
    if not text:
        return None
    text = text.strip()
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else {"value": parsed}
    except json.JSONDecodeError:
        pass

    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        try:
            return json.loads(fence.group(1))
        except json.JSONDecodeError:
            pass

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return None
    return None


def extract_code(text: str, language: str = "") -> str:
    """Pull the first fenced code block out of an LLM response."""
    if not text:
        return ""
    pattern = rf"```{language}[a-z]*\s*\n(.*?)```" if language else r"```[a-z]*\s*\n(.*?)```"
    match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return text.strip()

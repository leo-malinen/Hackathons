"""HTTP surface.

Two shapes for the same pipeline:

  POST /api/analyze         run and return the finished investigation
  POST /api/analyze/stream  run and stream progress as server-sent events

The streaming route is what the UI uses, because the investigation timeline in
PRD section 23 is only meaningful if the steps arrive while the work happens.
"""
from __future__ import annotations

import base64
import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from .. import store
from ..config import settings
from ..llm.openrouter import OpenRouterClient, QuotaExhausted, get_client
from ..pipeline.orchestrator import Investigator, stream_investigation
from ..pipeline.replay import list_fixtures, stream_fixture
from ..schemas import AnalyzeRequest, Investigation

log = logging.getLogger("reality_check.api")
router = APIRouter(prefix="/api", tags=["reality-check"])


def _new_id() -> str:
    return f"inv_{uuid.uuid4().hex[:16]}"


def _sse(event: str, data: Any) -> str:
    """Serialise one server-sent event.

    Newlines inside a data payload would terminate the event early, so the
    JSON is emitted as a single line.
    """
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


# --------------------------------------------------------------------------
@router.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "llm_configured": bool(settings.openrouter_api_key),
        "models": {
            "reasoning": settings.model_reasoning,
            "fast": settings.model_fast,
            "vision": settings.model_vision,
            "fallbacks": settings.fallback_list,
        },
        "providers": ["openalex", "europepmc", "crossref", "wikipedia", "duckduckgo"],
    }


# --------------------------------------------------------------------------
@router.post("/analyze/stream")
async def analyze_stream(request: AnalyzeRequest) -> StreamingResponse:
    investigation_id = _new_id()
    client = get_client()

    async def generator():
        yield _sse("started", {"id": investigation_id})
        final: dict[str, Any] | None = None
        try:
            async for event, payload in stream_investigation(
                request, investigation_id, client
            ):
                if event == "complete":
                    final = payload
                yield _sse(event, payload)
        except Exception as exc:  # noqa: BLE001
            log.exception("stream failed")
            yield _sse("error", {"message": str(exc)[:300], "kind": "internal"})

        if final:
            try:
                await store.save(Investigation.model_validate(final))
            except Exception:  # noqa: BLE001
                log.exception("could not persist investigation %s", investigation_id)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # stops nginx-style proxies buffering the stream
        },
    )


@router.post("/analyze")
async def analyze(request: AnalyzeRequest) -> dict[str, Any]:
    """Non-streaming variant, matching the PRD section 40 contract."""
    investigation_id = _new_id()
    client = get_client()
    final: dict[str, Any] | None = None
    error: dict[str, Any] | None = None

    async for event, payload in stream_investigation(request, investigation_id, client):
        if event == "complete":
            final = payload
        elif event == "error":
            error = payload

    if error:
        raise HTTPException(
            status_code=400 if error.get("kind") == "input" else 500,
            detail=error.get("message", "Investigation failed"),
        )
    if not final:
        raise HTTPException(status_code=500, detail="Investigation produced no result")

    await store.save(Investigation.model_validate(final))
    return final


# --------------------------------------------------------------------------
@router.post("/analyze/image")
async def analyze_image(
    file: UploadFile = File(...),
    note: str = Form(""),
    depth: str = Form("standard"),
) -> StreamingResponse:
    """Screenshot and image input (PRD 9.3 and 9.4)."""
    raw = await file.read()
    if len(raw) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Image is larger than {settings.max_upload_bytes // 1_000_000}MB.",
        )
    media_type = file.content_type or "image/png"
    if not media_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="That file is not an image.")

    data_url = f"data:{media_type};base64,{base64.b64encode(raw).decode()}"
    request = AnalyzeRequest(
        content=note,
        image_base64=data_url,
        input_type="image",
        depth=depth,  # type: ignore[arg-type]
    )
    return await analyze_stream(request)


# --------------------------------------------------------------------------
@router.post("/investigations/{investigation_id}/challenge")
async def challenge(investigation_id: str) -> StreamingResponse:
    """Prove Me Wrong (PRD sections 22 and 35)."""
    investigation = await store.load(investigation_id)
    if investigation is None:
        raise HTTPException(status_code=404, detail="Investigation not found")

    client: OpenRouterClient = get_client()
    investigator = Investigator(client)

    async def generator():
        import asyncio
        import time

        queue: asyncio.Queue[tuple[str, dict[str, Any]] | None] = asyncio.Queue()
        started = time.perf_counter()

        async def emit(event: str, payload: dict[str, Any]) -> None:
            payload.setdefault("at", round(time.perf_counter() - started, 2))
            payload.setdefault("status", "done")
            await queue.put((event, payload))

        async def worker() -> None:
            try:
                await investigator.challenge(investigation, emit)
                await store.save(investigation)
                await queue.put(("complete", investigation.model_dump(mode="json")))
            except QuotaExhausted as exc:
                await queue.put(("error", {"message": str(exc), "kind": "quota"}))
            except ValueError as exc:
                await queue.put(("error", {"message": str(exc), "kind": "input"}))
            except Exception as exc:  # noqa: BLE001
                log.exception("challenge failed")
                await queue.put(("error", {"message": str(exc)[:300], "kind": "internal"}))
            finally:
                await queue.put(None)

        task = asyncio.create_task(worker())
        yield _sse("started", {"id": investigation_id, "mode": "challenge"})
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                event, payload = item
                yield _sse(event, payload)
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


# --------------------------------------------------------------------------
@router.get("/investigations/{investigation_id}")
async def get_investigation(investigation_id: str) -> dict[str, Any]:
    investigation = await store.load(investigation_id)
    if investigation is None:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return investigation.model_dump(mode="json")


@router.get("/investigations")
async def list_investigations(limit: int = 20) -> dict[str, Any]:
    return {"investigations": await store.recent(min(max(limit, 1), 50))}


@router.get("/demo/fixtures")
async def demo_fixtures() -> dict[str, Any]:
    """Investigations captured from real runs, replayable without the API."""
    return {"fixtures": list_fixtures()}


@router.post("/demo/{slug}/replay")
async def demo_replay(slug: str) -> StreamingResponse:
    """Replay a captured investigation, so a demo never depends on quota."""

    async def generator():
        yield _sse("started", {"id": f"replay_{slug}", "mode": "replay"})
        async for event, payload in stream_fixture(slug):
            yield _sse(event, payload)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


@router.get("/examples")
async def examples() -> dict[str, Any]:
    """The demo set from PRD section 44, spanning every verdict band."""
    from ..demo import DEMO_CLAIMS

    return {"examples": DEMO_CLAIMS, "fixtures": list_fixtures()}

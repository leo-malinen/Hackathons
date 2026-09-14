"""Demo replay.

A live demo that depends on a third-party API is a demo that can fail in front
of judges, and free-model quotas make that likely rather than hypothetical.

So a completed investigation can be captured to a fixture and replayed later:
the same timeline, the same evidence, the same verdict, streamed back with
realistic pacing and zero model calls. It is a recording of a real run, never
a fabricated result, and the UI labels it as a replay so nobody is misled
about what they are watching.

Capture one with:

    python -m app.capture "Humans only use 10% of their brains."
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from ..schemas import Investigation

log = logging.getLogger("reality_check.replay")

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "fixtures"

# Replay is paced rather than instant: the investigation timeline is part of
# what the product communicates, and a result that appears in one frame reads
# as a lookup rather than an investigation. Real runs take 30 to 120 seconds;
# this compresses that to roughly 12 while keeping the rhythm.
SPEED = 0.28
MAX_GAP = 2.2


def fixture_path(slug: str) -> Path:
    safe = "".join(c for c in slug if c.isalnum() or c in "-_")[:64]
    return FIXTURE_DIR / f"{safe}.json"


def list_fixtures() -> list[dict[str, Any]]:
    if not FIXTURE_DIR.exists():
        return []
    entries: list[dict[str, Any]] = []
    for path in sorted(FIXTURE_DIR.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        investigation = payload.get("investigation") or {}
        entries.append({
            "slug": path.stem,
            "label": payload.get("label") or path.stem,
            "claim": payload.get("claim") or investigation.get("input_text", "")[:200],
            "verdict": investigation.get("verdict"),
            "confidence": investigation.get("confidence", 0.0),
            "evidence_count": len(investigation.get("evidence") or []),
            "captured_at": payload.get("captured_at"),
        })
    return entries


def save_fixture(
    slug: str, investigation: Investigation, steps: list[dict[str, Any]], label: str
) -> Path:
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    path = fixture_path(slug)
    payload = {
        "label": label,
        "claim": investigation.input_text[:300],
        "captured_at": investigation.created_at.isoformat(),
        "steps": steps,
        "investigation": json.loads(investigation.model_dump_json()),
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def load_fixture(slug: str) -> dict[str, Any] | None:
    path = fixture_path(slug)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        log.warning("fixture %s is unreadable", slug)
        return None


async def stream_fixture(slug: str) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Replay a captured investigation with its original step rhythm."""
    payload = load_fixture(slug)
    if payload is None:
        yield ("error", {"message": f"No saved investigation named {slug!r}.", "kind": "input"})
        return

    steps: list[dict[str, Any]] = payload.get("steps") or []
    previous = 0.0
    for step in steps:
        at = float(step.get("at", previous))
        await asyncio.sleep(min(max(at - previous, 0.0) * SPEED, MAX_GAP))
        previous = at
        yield ("step", {**step, "replay": True})

    await asyncio.sleep(0.35)
    investigation = payload.get("investigation") or {}
    yield ("complete", {**investigation, "replay": True})

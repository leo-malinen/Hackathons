"""Capture a real investigation to a replayable demo fixture.

    python -m app.capture "Humans only use 10% of their brains." --slug brains
    python -m app.capture --all            # capture the whole demo set
    python -m app.capture --list           # show what has been captured

Run this once while the model quota is healthy. The demo then replays from
disk and never touches the network again.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from typing import Any

from .demo import DEMO_CLAIMS
from .llm.openrouter import QuotaExhausted, get_client
from .pipeline.orchestrator import stream_investigation
from .pipeline.replay import list_fixtures, save_fixture
from .schemas import AnalyzeRequest, Investigation


async def capture(
    text: str, slug: str, label: str, depth: str = "standard", challenge: bool = False
) -> bool:
    client = get_client()
    request = AnalyzeRequest(content=text, input_type="text", depth=depth)  # type: ignore[arg-type]

    steps: list[dict[str, Any]] = []
    final: dict[str, Any] | None = None

    print(f"\n=== capturing {slug!r} ({depth}) ===")
    print(f"    {text}")

    async for event, payload in stream_investigation(request, f"demo_{slug}", client):
        if event == "step":
            steps.append(payload)
            count = f" [{payload['count']}]" if payload.get("count") is not None else ""
            print(f"    {payload.get('at', 0):6.1f}s  {payload.get('label', '')}{count}")
        elif event == "error":
            kind = payload.get("kind")
            print(f"    FAILED ({kind}): {payload.get('message')}", file=sys.stderr)
            if kind == "quota":
                raise SystemExit(
                    "\nModel quota exhausted. Wait for the daily reset or add "
                    "credits at openrouter.ai/credits, then run this again."
                )
            return False
        elif event == "complete":
            final = payload

    if not final:
        print("    FAILED: no result", file=sys.stderr)
        return False

    investigation = Investigation.model_validate(final)

    if challenge:
        from .pipeline.orchestrator import Investigator

        print("    running Prove Me Wrong...")
        investigator = Investigator(client)

        async def emit(_event: str, payload: dict[str, Any]) -> None:
            payload.setdefault("at", (steps[-1]["at"] if steps else 0) + 1.0)
            payload.setdefault("status", "done")
            steps.append(payload)
            print(f"    {payload.get('at', 0):6.1f}s  {payload.get('label', '')}")

        try:
            await investigator.challenge(investigation, emit)
        except QuotaExhausted as exc:
            print(f"    challenge skipped: {exc}", file=sys.stderr)

    path = save_fixture(slug, investigation, steps, label)
    verdict = investigation.verdict.value if investigation.verdict else "?"
    print(
        f"    saved -> {path.name}  "
        f"[{verdict} @ {investigation.confidence:.0%}, "
        f"{len(investigation.evidence)} sources]"
    )
    return True


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("text", nargs="?", help="claim to investigate")
    parser.add_argument("--slug", help="fixture filename stem")
    parser.add_argument("--label", default="", help="human-readable label")
    parser.add_argument("--depth", default="standard", choices=["quick", "standard", "deep"])
    parser.add_argument("--challenge", action="store_true", help="also run Prove Me Wrong")
    parser.add_argument("--all", action="store_true", help="capture the whole demo set")
    parser.add_argument("--list", action="store_true", help="list captured fixtures")
    args = parser.parse_args()

    if args.list:
        fixtures = list_fixtures()
        if not fixtures:
            print("No fixtures captured yet.")
            return
        print(f"{len(fixtures)} fixture(s):\n")
        for entry in fixtures:
            print(
                f"  {entry['slug']:<16} {str(entry['verdict']):<22} "
                f"{entry['confidence']:.0%}  {entry['evidence_count']} sources"
            )
            print(f"    {entry['claim'][:90]}")
        return

    if args.all:
        captured = 0
        for item in DEMO_CLAIMS:
            ok = await capture(
                item["text"], item["id"], item["label"],
                depth="quick", challenge=False,
            )
            captured += int(ok)
            await asyncio.sleep(2.0)  # stay polite to the rate limiter
        print(f"\ncaptured {captured}/{len(DEMO_CLAIMS)} fixtures")
    elif args.text:
        slug = args.slug or "custom"
        await capture(
            args.text, slug, args.label or slug,
            depth=args.depth, challenge=args.challenge,
        )
    else:
        parser.print_help()

    await get_client().aclose()


if __name__ == "__main__":
    asyncio.run(main())

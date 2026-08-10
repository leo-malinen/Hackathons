"""Context factory: pick the best available path to DataHub.

  sdk     -> DataHub Python SDK / GraphQL   (GitHub Action, headless)
  mcp     -> @acryldata/mcp-server-datahub  (interactive dev loop)
  fixture -> bundled offline graph          (always works, used by tests)

`auto` tries sdk, then mcp, then fixture, and never raises. A demo that dies
because Docker is unhappy is a demo you do not give.
"""

from __future__ import annotations

import logging
from typing import List, Optional, Tuple

from ..config import Settings
from .base import (  # noqa: F401  (re-exported)
    BI_TYPES,
    DATASET_TYPES,
    ML_TYPES,
    PIPELINE_TYPES,
    DataHubContext,
    Entity,
    LineageEdge,
    LineagePath,
    QueryUsage,
    SchemaField,
    WritebackRecord,
    icon_for,
    make_dataset_urn,
    make_schema_field_urn,
    parse_dataset_urn,
    pretty_urn,
    urn_entity_type,
)
from .fixture import FixtureContext

log = logging.getLogger("blast_radius.context")

__all__ = [
    "DataHubContext",
    "Entity",
    "LineageEdge",
    "LineagePath",
    "QueryUsage",
    "SchemaField",
    "WritebackRecord",
    "FixtureContext",
    "build_context",
    "icon_for",
    "make_dataset_urn",
    "make_schema_field_urn",
    "parse_dataset_urn",
    "pretty_urn",
    "urn_entity_type",
    "ML_TYPES",
    "BI_TYPES",
    "DATASET_TYPES",
    "PIPELINE_TYPES",
]


def build_context(settings: Settings) -> Tuple[DataHubContext, List[str]]:
    """Returns (context, notes). Notes explain any fallback that happened."""
    notes: List[str] = []
    want = (settings.context_source or "auto").lower()

    order = {
        "auto": ["sdk", "mcp", "fixture"],
        "sdk": ["sdk"],
        "mcp": ["mcp"],
        "fixture": ["fixture"],
        "offline": ["fixture"],
    }.get(want, ["sdk", "mcp", "fixture"])

    for candidate in order:
        ctx = _try_build(candidate, settings, notes)
        if ctx is not None:
            return ctx, notes

    notes.append("All context sources failed; using the bundled fixture graph.")
    return _fixture(settings), notes


def _try_build(kind: str, settings: Settings, notes: List[str]) -> Optional[DataHubContext]:
    if kind == "fixture":
        return _fixture(settings)

    if kind == "sdk":
        try:
            from .sdk import SdkContext
        except ImportError:
            notes.append(
                "acryl-datahub is not installed; skipping the SDK context "
                "(pip install 'blast-radius[datahub]')."
            )
            return None
        try:
            return SdkContext(
                gms_url=settings.datahub_gms_url,
                token=settings.datahub_gms_token,
                frontend_url=settings.datahub_frontend_url,
                prefer_proposals=settings.prefer_proposals,
            )
        except Exception as exc:
            notes.append(f"DataHub SDK unavailable at {settings.datahub_gms_url}: {_short(exc)}")
            return None

    if kind == "mcp":
        try:
            from .mcp import McpContext

            env = {
                "DATAHUB_GMS_URL": settings.datahub_gms_url,
                "DATAHUB_GMS_TOKEN": settings.datahub_gms_token,
                "TOOLS_IS_MUTATION_ENABLED": "true" if settings.mutations_enabled else "false",
            }
            ctx = McpContext(
                command=settings.mcp_command,
                env=env,
                frontend_url=settings.datahub_frontend_url,
            )
            if not ctx.tools:
                notes.append("MCP server started but exposed no tools.")
                ctx.close()
                return None
            if not ctx.supports_mutations:
                notes.append(
                    "MCP server has no mutation tools. Set TOOLS_IS_MUTATION_ENABLED=true "
                    "to enable writeback."
                )
            return ctx
        except Exception as exc:
            notes.append(f"MCP server unavailable: {_short(exc)}")
            return None

    return None


def _fixture(settings: Settings) -> FixtureContext:
    return FixtureContext(
        journal_dir=settings.output_dir / "datahub",
        frontend_url=settings.datahub_frontend_url,
    )


def _short(exc: Exception, limit: int = 160) -> str:
    text = str(exc).replace("\n", " ")
    return text[:limit] + ("..." if len(text) > limit else "")

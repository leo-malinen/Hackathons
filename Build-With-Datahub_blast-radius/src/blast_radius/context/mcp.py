"""DataHub context over the official MCP server.

This is the interactive / dev-loop path: `npx -y @acryldata/mcp-server-datahub`
over stdio, driven by our tiny JSON-RPC client. Same interface as the SDK
context, so `--context-source mcp` runs the identical firewall pipeline.

Tool names are resolved dynamically from `tools/list`, with aliases, because
the MCP server's tool surface evolves. If a mutation tool is missing (i.e.
TOOLS_IS_MUTATION_ENABLED is not set), writeback degrades to a clear
"unsupported" receipt instead of crashing the PR check.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import quote

from ..mcp_client import McpError, McpStdioClient
from .base import (
    DataHubContext,
    Entity,
    LineageEdge,
    QueryUsage,
    SchemaField,
    WritebackRecord,
    urn_entity_type,
)

log = logging.getLogger("blast_radius.context.mcp")

# Preferred tool name first; the rest are accepted aliases.
TOOL_ALIASES: Dict[str, List[str]] = {
    "search": ["search", "search_entities", "datahub_search"],
    "get_entities": ["get_entities", "get_entity", "get_dataset"],
    "get_lineage": ["get_lineage", "get_downstream_lineage", "lineage"],
    "get_lineage_paths_between": ["get_lineage_paths_between", "get_lineage_path"],
    "get_dataset_queries": ["get_dataset_queries", "get_queries", "get_usage"],
    "list_schema_fields": ["list_schema_fields", "get_schema_fields", "get_schema"],
    "add_tags": ["add_tags", "add_tag"],
    "update_description": ["update_description", "set_description"],
    "add_structured_properties": ["add_structured_properties", "set_structured_properties"],
    "save_document": ["save_document", "create_document", "upsert_document"],
    "propose_lifecycle_stage": ["propose_lifecycle_stage", "propose_deprecation", "propose_tag"],
    "list_pending_proposals": ["list_pending_proposals", "list_proposals"],
}


class McpContext(DataHubContext):
    name = "mcp"

    def __init__(
        self,
        command: str = "npx -y @acryldata/mcp-server-datahub",
        env: Optional[Dict[str, str]] = None,
        frontend_url: str = "http://localhost:9002",
    ) -> None:
        self.frontend_url = frontend_url.rstrip("/")
        self.client = McpStdioClient(command=command, env=env)
        self.client.start()
        self.tools = {t.get("name"): t for t in self.client.list_tools()}
        self._resolved: Dict[str, Optional[str]] = {
            key: next((a for a in aliases if a in self.tools), None)
            for key, aliases in TOOL_ALIASES.items()
        }
        self.supports_mutations = bool(self._resolved.get("add_tags"))
        self._entity_cache: Dict[str, Optional[Entity]] = {}

    # ------------------------------------------------------------------
    def close(self) -> None:
        self.client.close()

    def describe(self) -> str:
        available = [k for k, v in self._resolved.items() if v]
        return f"MCP server ({len(self.tools)} tools; {len(available)} mapped)"

    def health(self) -> Dict[str, Any]:
        return {
            "source": "mcp",
            "ok": bool(self.tools),
            "mutations": self.supports_mutations,
            "tool_count": len(self.tools),
            "mapped": {k: v for k, v in self._resolved.items()},
            "missing": [k for k, v in self._resolved.items() if not v],
        }

    def _call(self, key: str, **arguments: Any) -> Any:
        tool = self._resolved.get(key)
        if not tool:
            raise McpError(f"MCP server does not expose a '{key}' tool")
        return self.client.call_tool(tool, {k: v for k, v in arguments.items() if v is not None})

    def _try(self, key: str, **arguments: Any) -> Any:
        try:
            return self._call(key, **arguments)
        except McpError as exc:
            log.debug("MCP %s failed: %s", key, exc)
            return None

    # -- read ------------------------------------------------------------
    def search(
        self,
        query: str,
        entity_types: Optional[Sequence[str]] = None,
        platform: Optional[str] = None,
        limit: int = 10,
    ) -> List[Entity]:
        raw = self._try(
            "search",
            query=query or "*",
            entity_types=list(entity_types) if entity_types else None,
            platform=platform,
            num_results=limit,
        )
        return [e for e in (_entities_from_payload(raw) or []) if e][:limit]

    def get_entity(self, urn: str) -> Optional[Entity]:
        if urn in self._entity_cache:
            return self._entity_cache[urn]
        raw = self._try("get_entities", urns=[urn])
        entities = _entities_from_payload(raw)
        entity = entities[0] if entities else Entity(urn=urn, entity_type=urn_entity_type(urn), name=urn)
        if entity and not entity.schema_fields and urn_entity_type(urn) == "dataset":
            entity.schema_fields = self.list_schema_fields(urn)
        self._entity_cache[urn] = entity
        return entity

    def list_schema_fields(self, urn: str) -> List[SchemaField]:
        raw = self._try("list_schema_fields", urn=urn, dataset_urn=urn)
        return _fields_from_payload(raw)

    def get_downstream_edges(self, urn: str) -> List[LineageEdge]:
        raw = self._try(
            "get_lineage", urn=urn, direction="DOWNSTREAM", max_hops=1, num_results=200
        )
        return _edges_from_payload(raw, source=urn, downstream=True)

    def get_upstream_edges(self, urn: str) -> List[LineageEdge]:
        raw = self._try("get_lineage", urn=urn, direction="UPSTREAM", max_hops=1, num_results=200)
        return _edges_from_payload(raw, source=urn, downstream=False)

    def get_dataset_queries(self, urn: str, column: Optional[str] = None) -> QueryUsage:
        raw = self._try("get_dataset_queries", urn=urn, dataset_urn=urn, column=column)
        if not isinstance(raw, dict):
            return QueryUsage()
        return QueryUsage(
            total_queries=int(raw.get("total_queries") or raw.get("query_count") or 0),
            distinct_users=int(raw.get("distinct_users") or raw.get("unique_users") or 0),
            window_days=int(raw.get("window_days") or 30),
            top_queries=[str(q) for q in (raw.get("queries") or raw.get("top_queries") or [])][:3],
        )

    def entity_url(self, urn: str) -> str:
        return f"{self.frontend_url}/{urn_entity_type(urn)}/{quote(urn, safe='')}"

    # -- write -----------------------------------------------------------
    def add_tags(self, urn: str, tags: Sequence[str]) -> WritebackRecord:
        raw = self._try("add_tags", urn=urn, tags=list(tags))
        ok = raw is not None
        return WritebackRecord("add_tags", urn, f"tagged {', '.join(tags)}", ok=ok,
                               url=self.entity_url(urn),
                               error="" if ok else "mcp tool unavailable")

    def update_description(
        self, urn: str, description: str, column: Optional[str] = None
    ) -> WritebackRecord:
        raw = self._try("update_description", urn=urn, description=description, column=column)
        ok = raw is not None
        return WritebackRecord(
            "update_description", f"{urn}#{column}" if column else urn,
            f"documented {column or 'asset'}", ok=ok, url=self.entity_url(urn),
            error="" if ok else "mcp tool unavailable",
        )

    def add_structured_properties(self, urn: str, properties: Dict[str, Any]) -> WritebackRecord:
        raw = self._try("add_structured_properties", urn=urn, properties=properties)
        ok = raw is not None
        return WritebackRecord(
            "add_structured_properties", urn, f"set {', '.join(sorted(properties))}",
            ok=ok, url=self.entity_url(urn), error="" if ok else "mcp tool unavailable",
        )

    def save_document(
        self, title: str, content: str, related_urns: Sequence[str] = ()
    ) -> WritebackRecord:
        raw = self._try(
            "save_document", title=title, content=content, related_assets=list(related_urns)
        )
        ok = raw is not None
        url = None
        if isinstance(raw, dict):
            url = raw.get("url") or (self.entity_url(raw["urn"]) if raw.get("urn") else None)
        return WritebackRecord("save_document", title, "Change Impact Record saved", ok=ok,
                               url=url, error="" if ok else "mcp tool unavailable")

    def propose_lifecycle_stage(
        self, urn: str, stage: str, note: str = "", column: Optional[str] = None
    ) -> WritebackRecord:
        raw = self._try(
            "propose_lifecycle_stage", urn=urn, stage=stage, note=note, column=column
        )
        ok = raw is not None
        return WritebackRecord(
            "propose_lifecycle_stage", f"{urn}#{column}" if column else urn,
            f"proposed lifecycle={stage}", ok=ok, proposed=True, url=self.entity_url(urn),
            error="" if ok else "mcp tool unavailable",
        )

    def list_pending_proposals(self, limit: int = 25) -> List[Dict[str, Any]]:
        raw = self._try("list_pending_proposals", limit=limit)
        if isinstance(raw, dict):
            raw = raw.get("proposals") or raw.get("results") or []
        return list(raw or [])[:limit]


# ----------------------------------------------------------------------
# Payload coercion: MCP servers return JSON with varying shapes.
# ----------------------------------------------------------------------
def _iter_records(payload: Any) -> List[Dict[str, Any]]:
    if payload is None:
        return []
    if isinstance(payload, list):
        return [p for p in payload if isinstance(p, dict)]
    if isinstance(payload, dict):
        for key in ("results", "entities", "searchResults", "items", "data", "nodes", "edges"):
            value = payload.get(key)
            if isinstance(value, list):
                return [v for v in value if isinstance(v, dict)]
        if payload.get("urn"):
            return [payload]
    return []


def _entities_from_payload(payload: Any) -> List[Entity]:
    out: List[Entity] = []
    for rec in _iter_records(payload):
        node = rec.get("entity") if isinstance(rec.get("entity"), dict) else rec
        urn = node.get("urn")
        if not urn:
            continue
        tags = [str(t) for t in (node.get("tags") or [])]
        out.append(
            Entity(
                urn=urn,
                entity_type=str(node.get("type") or node.get("entity_type") or urn_entity_type(urn)),
                name=str(node.get("name") or node.get("qualifiedName") or urn),
                platform=node.get("platform"),
                tier=next((t for t in tags if t.lower().startswith("tier")), None),
                domain=node.get("domain"),
                description=str(node.get("description") or ""),
                owners=[str(o) for o in (node.get("owners") or [])],
                tags=tags,
                deprecated=bool(node.get("deprecated")),
                certified=any(t.lower() in {"certified", "gold"} for t in tags),
                schema_fields=_fields_from_payload(node.get("schema_fields") or node.get("fields")),
                query_count_30d=int(node.get("query_count_30d") or 0),
                properties=dict(node.get("custom_properties") or node.get("properties") or {}),
            )
        )
    return out


def _fields_from_payload(payload: Any) -> List[SchemaField]:
    out: List[SchemaField] = []
    for rec in _iter_records(payload):
        name = rec.get("name") or rec.get("fieldPath") or rec.get("field_path")
        if not name:
            continue
        out.append(
            SchemaField(
                name=str(name).split(".")[-1],
                type=str(rec.get("type") or "unknown"),
                native_type=str(rec.get("native_type") or rec.get("nativeDataType") or ""),
                nullable=bool(rec.get("nullable", True)),
                description=str(rec.get("description") or ""),
            )
        )
    return out


def _edges_from_payload(payload: Any, source: str, downstream: bool) -> List[LineageEdge]:
    out: List[LineageEdge] = []
    for rec in _iter_records(payload):
        node = rec.get("entity") if isinstance(rec.get("entity"), dict) else rec
        other = node.get("urn") or rec.get("downstream") or rec.get("upstream")
        if not other or other == source:
            continue
        up_col = rec.get("upstream_column") or rec.get("source_field")
        down_col = rec.get("downstream_column") or rec.get("target_field")
        transform = str(rec.get("transform") or rec.get("transformOperation") or "")
        if downstream:
            out.append(
                LineageEdge(source, other, up_col, down_col, transform,
                            via="fineGrained" if up_col and down_col else "lineage")
            )
        else:
            out.append(
                LineageEdge(other, source, up_col, down_col, transform,
                            via="fineGrained" if up_col and down_col else "lineage")
            )

        # Some servers nest fine-grained column pairs under the neighbour.
        for fg in rec.get("fine_grained") or rec.get("columns") or []:
            if not isinstance(fg, dict):
                continue
            pair = (
                fg.get("upstream_column") or fg.get("source"),
                fg.get("downstream_column") or fg.get("target"),
            )
            if not all(pair):
                continue
            if downstream:
                out.append(LineageEdge(source, other, pair[0], pair[1],
                                       str(fg.get("transform") or ""), via="fineGrained"))
            else:
                out.append(LineageEdge(other, source, pair[0], pair[1],
                                       str(fg.get("transform") or ""), via="fineGrained"))
    return out

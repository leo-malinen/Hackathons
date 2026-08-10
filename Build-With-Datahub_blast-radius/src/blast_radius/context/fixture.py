"""Offline context backed by a bundled JSON graph.

This exists for one reason: **the demo must never depend on Docker being
healthy**. It implements the exact same interface as the live SDK context,
including column-level lineage, query usage, and all mutation/governance
tools (which are journalled to disk so you can show the judges the payloads
that *would* be sent to DataHub).

It is also how the test suite runs in CI.
"""

from __future__ import annotations

import json
import os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from .base import (
    DataHubContext,
    Entity,
    LineageEdge,
    QueryUsage,
    SchemaField,
    WritebackRecord,
)

DEFAULT_FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "demo_graph.json"


class FixtureContext(DataHubContext):
    name = "fixture"
    supports_mutations = True

    def __init__(
        self,
        path: Optional[Path] = None,
        journal_dir: Optional[Path] = None,
        frontend_url: str = "http://localhost:9002",
    ) -> None:
        self.path = Path(path or os.environ.get("BLAST_RADIUS_FIXTURE") or DEFAULT_FIXTURE)
        self.frontend_url = frontend_url.rstrip("/")
        self.journal_dir = Path(journal_dir) if journal_dir else None
        raw = json.loads(self.path.read_text(encoding="utf-8"))

        self.entities: Dict[str, Entity] = {}
        for item in raw.get("entities", []):
            e = _entity_from_dict(item)
            self.entities[e.urn] = e

        self._down: Dict[str, List[LineageEdge]] = defaultdict(list)
        self._up: Dict[str, List[LineageEdge]] = defaultdict(list)
        for item in raw.get("edges", []):
            edge = LineageEdge(
                upstream_urn=item["upstream"],
                downstream_urn=item["downstream"],
                upstream_column=item.get("upstream_column"),
                downstream_column=item.get("downstream_column"),
                transform=item.get("transform", ""),
                via=item.get("via", "lineage"),
                confidence=float(item.get("confidence", 1.0)),
            )
            self._down[edge.upstream_urn].append(edge)
            self._up[edge.downstream_urn].append(edge)

        self._queries: Dict[str, Dict[str, Any]] = raw.get("queries", {})
        self.journal: List[Dict[str, Any]] = []

    # -- description -------------------------------------------------------
    def describe(self) -> str:
        return f"fixture ({self.path.name}: {len(self.entities)} entities, {sum(len(v) for v in self._down.values())} edges)"

    def health(self) -> Dict[str, Any]:
        return {
            "source": "fixture",
            "ok": True,
            "mutations": True,
            "path": str(self.path),
            "entities": len(self.entities),
        }

    # -- read --------------------------------------------------------------
    def search(
        self,
        query: str,
        entity_types: Optional[Sequence[str]] = None,
        platform: Optional[str] = None,
        limit: int = 10,
    ) -> List[Entity]:
        q = (query or "").strip().lower().strip("*")
        types = set(entity_types) if entity_types else None
        hits: List[tuple] = []
        for e in self.entities.values():
            if types and e.entity_type not in types:
                continue
            if platform and (e.platform or "").lower() != platform.lower():
                continue
            if not q:
                hits.append((0, e))
                continue
            hay = f"{e.name} {e.short_name} {e.urn}".lower()
            if q == e.short_name.lower():
                hits.append((0, e))
            elif q in hay:
                hits.append((1, e))
        hits.sort(key=lambda t: (t[0], len(t[1].name)))
        return [e for _, e in hits[:limit]]

    def get_entity(self, urn: str) -> Optional[Entity]:
        return self.entities.get(urn)

    def get_downstream_edges(self, urn: str) -> List[LineageEdge]:
        return list(self._down.get(urn, []))

    def get_upstream_edges(self, urn: str) -> List[LineageEdge]:
        return list(self._up.get(urn, []))

    def get_dataset_queries(self, urn: str, column: Optional[str] = None) -> QueryUsage:
        node = self._queries.get(urn)
        if not node:
            return QueryUsage()
        if column:
            col = (node.get("columns") or {}).get(column)
            if col:
                return QueryUsage(
                    total_queries=int(col.get("total_queries", 0)),
                    distinct_users=int(col.get("distinct_users", 0)),
                    window_days=int(node.get("window_days", 30)),
                    top_queries=list(col.get("top_queries", [])),
                )
            return QueryUsage(window_days=int(node.get("window_days", 30)))
        return QueryUsage(
            total_queries=int(node.get("total_queries", 0)),
            distinct_users=int(node.get("distinct_users", 0)),
            window_days=int(node.get("window_days", 30)),
            top_queries=list(node.get("top_queries", [])),
        )

    def list_prod_ml_models(self) -> List[Entity]:
        return [e for e in self.entities.values() if e.entity_type == "mlModel"]

    def entity_url(self, urn: str) -> str:
        from urllib.parse import quote

        kind = urn.split(":")[2] if len(urn.split(":")) > 2 else "dataset"
        return f"{self.frontend_url}/{kind}/{quote(urn, safe='')}"

    # -- write (journalled) -----------------------------------------------
    def _record(self, action: str, target: str, payload: Dict[str, Any], detail: str,
                proposed: bool = False, url: Optional[str] = None) -> WritebackRecord:
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "action": action,
            "target": target,
            "payload": payload,
            "proposed": proposed,
        }
        self.journal.append(entry)
        if self.journal_dir:
            self.journal_dir.mkdir(parents=True, exist_ok=True)
            out = self.journal_dir / "datahub-writeback.jsonl"
            with out.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(entry) + "\n")
        return WritebackRecord(action, target, detail, ok=True, proposed=proposed, url=url)

    def add_tags(self, urn: str, tags: Sequence[str]) -> WritebackRecord:
        entity = self.entities.get(urn)
        if entity:
            for t in tags:
                if t not in entity.tags:
                    entity.tags.append(t)
        return self._record(
            "add_tags", urn, {"tags": list(tags)}, f"tagged {', '.join(tags)}",
            url=self.entity_url(urn),
        )

    def update_description(
        self, urn: str, description: str, column: Optional[str] = None
    ) -> WritebackRecord:
        target = f"{urn}#{column}" if column else urn
        return self._record(
            "update_description",
            target,
            {"description": description, "column": column},
            f"documented {column or 'asset'}",
            url=self.entity_url(urn),
        )

    def add_structured_properties(self, urn: str, properties: Dict[str, Any]) -> WritebackRecord:
        entity = self.entities.get(urn)
        if entity:
            entity.properties.update(properties)
        keys = ", ".join(sorted(properties))
        return self._record(
            "add_structured_properties", urn, {"properties": properties},
            f"set {keys}", url=self.entity_url(urn),
        )

    def save_document(
        self, title: str, content: str, related_urns: Sequence[str] = ()
    ) -> WritebackRecord:
        doc_id = title.lower().replace(" ", "-").replace("/", "-")[:80]
        url = f"{self.frontend_url}/documents/{doc_id}"
        if self.journal_dir:
            self.journal_dir.mkdir(parents=True, exist_ok=True)
            (self.journal_dir / f"{doc_id}.md").write_text(content, encoding="utf-8")
        return self._record(
            "save_document", title,
            {"related": list(related_urns), "bytes": len(content)},
            "Change Impact Record saved", url=url,
        )

    def propose_lifecycle_stage(
        self, urn: str, stage: str, note: str = "", column: Optional[str] = None
    ) -> WritebackRecord:
        target = f"{urn}#{column}" if column else urn
        return self._record(
            "propose_lifecycle_stage", target,
            {"stage": stage, "note": note},
            f"proposed lifecycle={stage}", proposed=True, url=self.entity_url(urn),
        )

    def list_pending_proposals(self, limit: int = 25) -> List[Dict[str, Any]]:
        return [j for j in self.journal if j.get("proposed")][:limit]


def _entity_from_dict(item: Dict[str, Any]) -> Entity:
    fields = [
        SchemaField(
            name=f["name"],
            type=f.get("type", "unknown"),
            native_type=f.get("native_type", ""),
            nullable=bool(f.get("nullable", True)),
            description=f.get("description", ""),
            tags=list(f.get("tags", [])),
            is_primary_key=bool(f.get("is_primary_key", False)),
        )
        for f in item.get("schema_fields", [])
    ]
    return Entity(
        urn=item["urn"],
        entity_type=item["type"],
        name=item.get("name", ""),
        platform=item.get("platform"),
        tier=item.get("tier"),
        domain=item.get("domain"),
        description=item.get("description", ""),
        owners=list(item.get("owners", [])),
        tags=list(item.get("tags", [])),
        glossary_terms=list(item.get("glossary_terms", [])),
        deprecated=bool(item.get("deprecated", False)),
        certified=bool(item.get("certified", False)),
        schema_fields=fields,
        query_count_30d=int(item.get("query_count_30d", 0)),
        monthly_cost_usd=float(item.get("monthly_cost_usd", 0.0)),
        external_url=item.get("external_url"),
        properties=dict(item.get("properties", {})),
    )

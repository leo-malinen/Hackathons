"""Live DataHub context over the Python SDK / GraphQL.

This is the headless CI runtime - no MCP subprocess to babysit inside a
GitHub Action.

Column-level lineage strategy (important, and the part most impact-analysis
tools get wrong):

  1. `searchAcrossLineage(urn, DOWNSTREAM, degree=1)` gives us the set of
     entities one hop downstream.
  2. For each downstream *dataset* we read its `upstreamLineage` aspect, whose
     `fineGrainedLineages` contain the exact schemaField -> schemaField
     mapping plus `transformOperation`. Reading the mapping from the
     downstream side is the only reliable way to get column-level edges.
  3. For ML entities we read `mlFeatureProperties.sources` (dataset fields
     that feed a feature) and `mlModelProperties.mlFeatures` (features a model
     consumes) - this is what produces the
     raw column -> feature -> model -> deployment path.

Everything is wrapped defensively: if an aspect or query shape is unavailable
on the server version you are running, we degrade to table-level lineage
instead of crashing the PR check.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import quote

from .base import (
    DataHubContext,
    Entity,
    LineageEdge,
    QueryUsage,
    SchemaField,
    WritebackRecord,
    urn_entity_type,
)

log = logging.getLogger("blast_radius.context.sdk")

_SEARCH_QUERY = """
query brSearch($input: SearchAcrossEntitiesInput!) {
  searchAcrossEntities(input: $input) {
    total
    searchResults { entity { urn type } }
  }
}
"""

_LINEAGE_QUERY = """
query brLineage($input: SearchAcrossLineageInput!) {
  searchAcrossLineage(input: $input) {
    total
    searchResults {
      degree
      entity { urn type }
    }
  }
}
"""

_ENTITY_QUERY = """
query brEntity($urn: String!) {
  entity(urn: $urn) {
    urn
    type
    ... on Dataset {
      name
      platform { name }
      properties { name description customProperties { key value } }
      deprecation { deprecated note }
      ownership { owners { owner { ... on CorpUser { username } ... on CorpGroup { name } } } }
      globalTags { tags { tag { urn name } } }
      domain { domain { urn properties { name } } }
      schemaMetadata { fields { fieldPath type nativeDataType nullable description } }
      subTypes { typeNames }
    }
    ... on Dashboard {
      properties { name description }
      deprecation { deprecated }
      ownership { owners { owner { ... on CorpUser { username } ... on CorpGroup { name } } } }
      globalTags { tags { tag { urn name } } }
      domain { domain { urn properties { name } } }
    }
    ... on Chart {
      properties { name description }
      ownership { owners { owner { ... on CorpUser { username } ... on CorpGroup { name } } } }
      globalTags { tags { tag { urn name } } }
    }
    ... on DataJob {
      properties { name description }
      ownership { owners { owner { ... on CorpUser { username } ... on CorpGroup { name } } } }
      globalTags { tags { tag { urn name } } }
    }
    ... on MLFeature {
      name
      properties { description }
      globalTags { tags { tag { urn name } } }
    }
    ... on MLPrimaryKey { name properties { description } }
    ... on MLFeatureTable { name properties { description } }
    ... on MLModel {
      name
      properties { description customProperties { key value } }
      ownership { owners { owner { ... on CorpUser { username } ... on CorpGroup { name } } } }
      globalTags { tags { tag { urn name } } }
    }
    ... on MLModelDeployment {
      name
      properties { description status customProperties { key value } }
    }
  }
}
"""


class SdkContext(DataHubContext):
    name = "sdk"
    supports_mutations = True

    def __init__(self, gms_url: str, token: str = "", frontend_url: str = "",
                 prefer_proposals: bool = True) -> None:
        self.gms_url = gms_url.rstrip("/")
        self.token = token
        self.frontend_url = (frontend_url or gms_url.replace(":8080", ":9002")).rstrip("/")
        self.prefer_proposals = prefer_proposals
        self._entity_cache: Dict[str, Optional[Entity]] = {}
        self._graph = self._connect()

    # ------------------------------------------------------------------
    def _connect(self):
        from datahub.ingestion.graph.client import DatahubClientConfig, DataHubGraph

        graph = DataHubGraph(DatahubClientConfig(server=self.gms_url, token=self.token or None))
        graph.test_connection()
        return graph

    def describe(self) -> str:
        return f"DataHub SDK @ {self.gms_url}"

    def health(self) -> Dict[str, Any]:
        ok = True
        detail = ""
        try:
            self._graph.test_connection()
        except Exception as exc:  # pragma: no cover - network
            ok = False
            detail = str(exc)
        return {
            "source": "sdk",
            "ok": ok,
            "mutations": True,
            "gms": self.gms_url,
            "error": detail,
        }

    def _gql(self, query: str, variables: Dict[str, Any]) -> Dict[str, Any]:
        try:
            return self._graph.execute_graphql(query, variables=variables) or {}
        except Exception as exc:
            log.warning("GraphQL call failed: %s", exc)
            return {}

    def _aspect(self, urn: str, aspect_cls):
        try:
            return self._graph.get_aspect(entity_urn=urn, aspect_type=aspect_cls)
        except Exception as exc:
            log.debug("aspect %s unavailable for %s: %s", aspect_cls, urn, exc)
            return None

    # -- read ----------------------------------------------------------
    def search(
        self,
        query: str,
        entity_types: Optional[Sequence[str]] = None,
        platform: Optional[str] = None,
        limit: int = 10,
    ) -> List[Entity]:
        gql_types = [_gql_entity_type(t) for t in (entity_types or ["dataset"])]
        filters = []
        if platform:
            filters.append(
                {
                    "and": [
                        {
                            "field": "platform",
                            "values": [f"urn:li:dataPlatform:{platform}"],
                            "condition": "EQUAL",
                        }
                    ]
                }
            )
        payload = {
            "input": {
                "types": gql_types,
                "query": query or "*",
                "start": 0,
                "count": limit,
                "orFilters": filters or None,
            }
        }
        data = self._gql(_SEARCH_QUERY, payload)
        results = (((data.get("searchAcrossEntities") or {}).get("searchResults")) or [])
        out: List[Entity] = []
        for r in results:
            urn = ((r or {}).get("entity") or {}).get("urn")
            if not urn:
                continue
            e = self.get_entity(urn)
            if e:
                out.append(e)
        return out

    def get_entity(self, urn: str) -> Optional[Entity]:
        if urn in self._entity_cache:
            return self._entity_cache[urn]
        data = self._gql(_ENTITY_QUERY, {"urn": urn})
        node = data.get("entity") or {}
        entity = _entity_from_graphql(urn, node) if node else Entity(
            urn=urn, entity_type=urn_entity_type(urn), name=urn
        )
        # Enrich datasets/ML entities with aspects GraphQL may not expose.
        try:
            self._enrich(entity)
        except Exception as exc:  # pragma: no cover
            log.debug("enrich failed for %s: %s", urn, exc)
        self._entity_cache[urn] = entity
        return entity

    def _enrich(self, entity: Entity) -> None:
        if entity.entity_type == "mlModelDeployment":
            try:
                from datahub.metadata.schema_classes import MLModelDeploymentPropertiesClass
            except Exception:
                return
            props = self._aspect(entity.urn, MLModelDeploymentPropertiesClass)
            if props is not None:
                custom = dict(getattr(props, "customProperties", {}) or {})
                entity.properties.update(custom)
                status = getattr(props, "status", None)
                if status:
                    entity.properties["status"] = str(status)

    def list_schema_fields(self, urn: str) -> List[SchemaField]:
        e = self.get_entity(urn)
        if e and e.schema_fields:
            return list(e.schema_fields)
        try:
            from datahub.metadata.schema_classes import SchemaMetadataClass
        except Exception:
            return []
        meta = self._aspect(urn, SchemaMetadataClass)
        if meta is None:
            return []
        out = []
        for f in getattr(meta, "fields", []) or []:
            out.append(
                SchemaField(
                    name=_leaf(getattr(f, "fieldPath", "")),
                    type=type(getattr(f, "type", None)).__name__.replace("Class", ""),
                    native_type=getattr(f, "nativeDataType", "") or "",
                    nullable=bool(getattr(f, "nullable", True)),
                    description=getattr(f, "description", "") or "",
                )
            )
        return out

    # -- lineage --------------------------------------------------------
    def get_downstream_edges(self, urn: str) -> List[LineageEdge]:
        return self._edges(urn, "DOWNSTREAM")

    def get_upstream_edges(self, urn: str) -> List[LineageEdge]:
        return self._edges(urn, "UPSTREAM")

    def _edges(self, urn: str, direction: str) -> List[LineageEdge]:
        data = self._gql(
            _LINEAGE_QUERY,
            {
                "input": {
                    "urn": urn,
                    "direction": direction,
                    "query": "*",
                    "start": 0,
                    "count": 200,
                }
            },
        )
        results = (((data.get("searchAcrossLineage") or {}).get("searchResults")) or [])
        neighbours = [
            ((r or {}).get("entity") or {}).get("urn")
            for r in results
            if (r or {}).get("degree") == 1
        ]
        neighbours = [n for n in neighbours if n]

        edges: List[LineageEdge] = []
        for other in neighbours:
            if direction == "DOWNSTREAM":
                edges.extend(self._column_edges(upstream=urn, downstream=other))
            else:
                edges.extend(self._column_edges(upstream=other, downstream=urn))
        return edges

    def _column_edges(self, upstream: str, downstream: str) -> List[LineageEdge]:
        """Resolve the fine-grained mapping between two adjacent entities."""
        kind = urn_entity_type(downstream)
        fine: List[LineageEdge] = []

        if kind == "dataset":
            fine = self._dataset_fine_grained(upstream, downstream)
        elif kind in ("mlFeature", "mlPrimaryKey"):
            fine = self._ml_feature_sources(upstream, downstream)
        elif kind == "mlModel":
            fine = [LineageEdge(upstream, downstream, via="mlModelFeature",
                                transform="model consumes feature")]
        elif kind == "mlModelDeployment":
            fine = [LineageEdge(upstream, downstream, via="mlDeployment",
                                transform="model deployed as")]
        elif kind in ("dataJob", "dataFlow"):
            fine = [LineageEdge(upstream, downstream, via="consumes",
                                transform="pipeline reads asset")]

        return fine or [LineageEdge(upstream, downstream, via="lineage")]

    def _dataset_fine_grained(self, upstream: str, downstream: str) -> List[LineageEdge]:
        try:
            from datahub.metadata.schema_classes import UpstreamLineageClass
        except Exception:
            return []
        aspect = self._aspect(downstream, UpstreamLineageClass)
        if aspect is None:
            return []
        out: List[LineageEdge] = []
        for fg in getattr(aspect, "fineGrainedLineages", None) or []:
            transform = getattr(fg, "transformOperation", "") or ""
            ups = list(getattr(fg, "upstreams", None) or [])
            downs = list(getattr(fg, "downstreams", None) or [])
            for u in ups:
                if upstream not in u:
                    continue
                for d in downs:
                    out.append(
                        LineageEdge(
                            upstream_urn=upstream,
                            downstream_urn=downstream,
                            upstream_column=_schema_field_column(u),
                            downstream_column=_schema_field_column(d),
                            transform=transform,
                            via="fineGrained",
                            confidence=float(getattr(fg, "confidenceScore", 1.0) or 1.0),
                        )
                    )
        return out

    def _ml_feature_sources(self, upstream: str, downstream: str) -> List[LineageEdge]:
        try:
            from datahub.metadata.schema_classes import (
                MLFeaturePropertiesClass,
                MLPrimaryKeyPropertiesClass,
            )
        except Exception:
            return []
        cls = (
            MLPrimaryKeyPropertiesClass
            if urn_entity_type(downstream) == "mlPrimaryKey"
            else MLFeaturePropertiesClass
        )
        props = self._aspect(downstream, cls)
        if props is None:
            return []
        out: List[LineageEdge] = []
        for src in getattr(props, "sources", None) or []:
            if upstream not in str(src):
                continue
            out.append(
                LineageEdge(
                    upstream_urn=upstream,
                    downstream_urn=downstream,
                    upstream_column=_schema_field_column(str(src)),
                    downstream_column=_ml_entity_name(downstream),
                    transform="feature materialisation",
                    via="mlFeatureSource",
                )
            )
        return out

    # -- usage -----------------------------------------------------------
    def get_dataset_queries(self, urn: str, column: Optional[str] = None) -> QueryUsage:
        query = """
        query brUsage($urn: String!) {
          dataset(urn: $urn) {
            usageStats(resource: $urn, range: MONTH) {
              aggregations {
                uniqueUserCount
                totalSqlQueries
                fields { fieldName count }
              }
            }
          }
        }
        """
        data = self._gql(query, {"urn": urn})
        agg = (((data.get("dataset") or {}).get("usageStats") or {}).get("aggregations")) or {}
        total = int(agg.get("totalSqlQueries") or 0)
        users = int(agg.get("uniqueUserCount") or 0)
        if column:
            for f in agg.get("fields") or []:
                if str(f.get("fieldName", "")).lower() == column.lower():
                    total = int(f.get("count") or 0)
                    break
        return QueryUsage(total_queries=total, distinct_users=users, window_days=30)

    def list_prod_ml_models(self) -> List[Entity]:
        return self.search("*", entity_types=["mlModel"], limit=200)

    def entity_url(self, urn: str) -> str:
        kind = urn_entity_type(urn)
        return f"{self.frontend_url}/{kind}/{quote(urn, safe='')}"

    # -- write -----------------------------------------------------------
    def add_tags(self, urn: str, tags: Sequence[str]) -> WritebackRecord:
        mutation = """
        mutation brAddTags($input: AddTagsInput!) { addTags(input: $input) }
        """
        tag_urns = [t if t.startswith("urn:li:tag:") else f"urn:li:tag:{t}" for t in tags]
        data = self._gql(mutation, {"input": {"tagUrns": tag_urns, "resourceUrn": urn}})
        ok = bool(data.get("addTags"))
        return WritebackRecord(
            "add_tags", urn, f"tagged {', '.join(tags)}", ok=ok,
            url=self.entity_url(urn), error="" if ok else "mutation rejected",
        )

    def update_description(
        self, urn: str, description: str, column: Optional[str] = None
    ) -> WritebackRecord:
        if column:
            mutation = """
            mutation brDesc($input: UpdateDescriptionInput!) { updateDescription(input: $input) }
            """
            payload = {
                "input": {
                    "description": description,
                    "resourceUrn": urn,
                    "subResource": column,
                    "subResourceType": "DATASET_FIELD",
                }
            }
        else:
            mutation = """
            mutation brDesc($input: UpdateDescriptionInput!) { updateDescription(input: $input) }
            """
            payload = {"input": {"description": description, "resourceUrn": urn}}
        data = self._gql(mutation, payload)
        ok = bool(data.get("updateDescription"))
        return WritebackRecord(
            "update_description", f"{urn}#{column}" if column else urn,
            f"documented {column or 'asset'}", ok=ok, url=self.entity_url(urn),
            error="" if ok else "mutation rejected",
        )

    def add_structured_properties(self, urn: str, properties: Dict[str, Any]) -> WritebackRecord:
        mutation = """
        mutation brProps($input: UpsertStructuredPropertiesInput!) {
          upsertStructuredProperties(input: $input) { properties { structuredProperty { urn } } }
        }
        """
        entries = []
        for key, value in properties.items():
            prop_urn = key if key.startswith("urn:li:structuredProperty:") else (
                f"urn:li:structuredProperty:io.acryl.blastradius.{key}"
            )
            values = value if isinstance(value, list) else [value]
            entries.append(
                {
                    "propertyUrn": prop_urn,
                    "values": [
                        {"numberValue": v} if isinstance(v, (int, float))
                        else {"stringValue": str(v)}
                        for v in values
                    ],
                }
            )
        data = self._gql(mutation, {"input": {"assetUrn": urn, "structuredPropertyInputParams": entries}})
        ok = bool(data.get("upsertStructuredProperties"))
        return WritebackRecord(
            "add_structured_properties", urn, f"set {', '.join(sorted(properties))}",
            ok=ok, url=self.entity_url(urn), error="" if ok else "mutation rejected",
        )

    def save_document(
        self, title: str, content: str, related_urns: Sequence[str] = ()
    ) -> WritebackRecord:
        """Persist a Change Impact Record as a DataHub Context Document.

        Tries the first-class document API, then falls back to institutional
        memory links + a documentation aspect on the primary asset so the
        knowledge always lands somewhere durable.
        """
        mutation = """
        mutation brDoc($input: CreateDocumentInput!) { createDocument(input: $input) { urn } }
        """
        data = self._gql(
            mutation,
            {"input": {"title": title, "content": content, "relatedAssets": list(related_urns)}},
        )
        urn = ((data.get("createDocument") or {}).get("urn"))
        if urn:
            return WritebackRecord("save_document", title, "Change Impact Record saved",
                                   ok=True, url=self.entity_url(urn))

        if related_urns:
            primary = related_urns[0]
            fallback = self.update_description(
                primary,
                content[:4000],
            )
            fallback.action = "save_document(fallback:documentation)"
            fallback.detail = "Change Impact Record written to asset documentation"
            return fallback
        return WritebackRecord("save_document", title, ok=False, error="no document API available")

    def propose_lifecycle_stage(
        self, urn: str, stage: str, note: str = "", column: Optional[str] = None
    ) -> WritebackRecord:
        """Governance-first: propose, do not blindly mutate."""
        mutation = """
        mutation brProposeTag($input: TagAssociationInput!) { proposeTag(input: $input) }
        """
        tag_urn = f"urn:li:tag:lifecycle.{stage}"
        payload: Dict[str, Any] = {"input": {"tagUrn": tag_urn, "resourceUrn": urn}}
        if column:
            payload["input"]["subResource"] = column
            payload["input"]["subResourceType"] = "DATASET_FIELD"
        data = self._gql(mutation, payload)
        ok = bool(data.get("proposeTag"))
        if not ok:
            # Open-source DataHub without proposals: fall back to a deprecation
            # note, which is still non-destructive.
            dep = """
            mutation brDeprecate($input: UpdateDeprecationInput!) { updateDeprecation(input: $input) }
            """
            data = self._gql(
                dep,
                {"input": {"urn": urn, "deprecated": stage == "deprecated", "note": note[:500]}},
            )
            ok = bool(data.get("updateDeprecation"))
        return WritebackRecord(
            "propose_lifecycle_stage", f"{urn}#{column}" if column else urn,
            f"proposed lifecycle={stage}", ok=ok, proposed=True,
            url=self.entity_url(urn), error="" if ok else "proposal rejected",
        )

    def list_pending_proposals(self, limit: int = 25) -> List[Dict[str, Any]]:
        query = """
        query brProposals($input: ListActionRequestsInput!) {
          listActionRequests(input: $input) {
            actionRequests { urn type status entity { urn } }
          }
        }
        """
        data = self._gql(query, {"input": {"start": 0, "count": limit, "status": "PENDING"}})
        return list(((data.get("listActionRequests") or {}).get("actionRequests")) or [])


# ----------------------------------------------------------------------
def _leaf(field_path: str) -> str:
    """`[version=2.0].[type=struct].[type=string].email` -> `email`."""
    if not field_path:
        return ""
    return field_path.split(".")[-1].strip("[]")


def _schema_field_column(field_urn: str) -> Optional[str]:
    if "urn:li:schemaField:" not in field_urn:
        return None
    inner = field_urn.split("urn:li:schemaField:", 1)[1].strip("()")
    return _leaf(inner.rsplit(",", 1)[-1])


def _ml_entity_name(urn: str) -> Optional[str]:
    if "(" not in urn:
        return None
    inner = urn[urn.index("(") + 1 : urn.rindex(")")]
    return inner.rsplit(",", 1)[-1]


def _gql_entity_type(t: str) -> str:
    mapping = {
        "dataset": "DATASET",
        "dashboard": "DASHBOARD",
        "chart": "CHART",
        "dataJob": "DATA_JOB",
        "dataFlow": "DATA_FLOW",
        "mlModel": "MLMODEL",
        "mlModelGroup": "MLMODEL_GROUP",
        "mlFeature": "MLFEATURE",
        "mlPrimaryKey": "MLPRIMARY_KEY",
        "mlFeatureTable": "MLFEATURE_TABLE",
        "mlModelDeployment": "MLMODEL_DEPLOYMENT",
    }
    return mapping.get(t, t.upper())


def _entity_from_graphql(urn: str, node: Dict[str, Any]) -> Entity:
    gql_type = str(node.get("type", "")).lower()
    type_map = {
        "dataset": "dataset",
        "dashboard": "dashboard",
        "chart": "chart",
        "data_job": "dataJob",
        "data_flow": "dataFlow",
        "mlmodel": "mlModel",
        "mlmodel_group": "mlModelGroup",
        "mlfeature": "mlFeature",
        "mlprimary_key": "mlPrimaryKey",
        "mlfeature_table": "mlFeatureTable",
        "mlmodel_deployment": "mlModelDeployment",
    }
    entity_type = type_map.get(gql_type, urn_entity_type(urn))

    props = node.get("properties") or {}
    name = node.get("name") or props.get("name") or urn

    owners = []
    for o in ((node.get("ownership") or {}).get("owners") or []):
        owner = o.get("owner") or {}
        owners.append(owner.get("username") or owner.get("name") or "")
    owners = [o for o in owners if o]

    tags = []
    for t in ((node.get("globalTags") or {}).get("tags") or []):
        tag = t.get("tag") or {}
        tags.append(tag.get("name") or str(tag.get("urn", "")).split(":")[-1])

    tier = next((t for t in tags if t.lower().startswith("tier")), None)
    certified = any(t.lower() in {"certified", "gold"} for t in tags)

    dep = node.get("deprecation") or {}
    domain_node = ((node.get("domain") or {}).get("domain") or {})
    domain = ((domain_node.get("properties") or {}).get("name")) or None

    fields = []
    for f in ((node.get("schemaMetadata") or {}).get("fields") or []):
        fields.append(
            SchemaField(
                name=_leaf(f.get("fieldPath", "")),
                type=str((f.get("type") or "unknown")).lower(),
                native_type=f.get("nativeDataType") or "",
                nullable=bool(f.get("nullable", True)),
                description=f.get("description") or "",
            )
        )

    custom = {}
    for kv in props.get("customProperties") or []:
        custom[str(kv.get("key"))] = kv.get("value")
    if props.get("status"):
        custom["status"] = props["status"]
    for key in ("requests_per_day", "requestsPerDay", "qps"):
        if key in custom:
            custom["requests_per_day"] = _to_int(custom[key])
    if "monthly_cost_usd" in custom:
        custom["monthly_cost_usd"] = _to_float(custom["monthly_cost_usd"])

    return Entity(
        urn=urn,
        entity_type=entity_type,
        name=name,
        platform=((node.get("platform") or {}).get("name")),
        tier=tier,
        domain=domain,
        description=props.get("description") or "",
        owners=owners,
        tags=tags,
        deprecated=bool(dep.get("deprecated")),
        certified=certified,
        schema_fields=fields,
        monthly_cost_usd=_to_float(custom.get("monthly_cost_usd", 0)),
        properties=custom,
    )


def _to_int(value: Any) -> int:
    try:
        return int(float(str(value).replace(",", "")))
    except (TypeError, ValueError):
        return 0


def _to_float(value: Any) -> float:
    try:
        return float(str(value).replace(",", "").replace("$", ""))
    except (TypeError, ValueError):
        return 0.0


def _dumps(obj: Any) -> str:
    try:
        return json.dumps(obj, indent=2, default=str)
    except Exception:
        return str(obj)

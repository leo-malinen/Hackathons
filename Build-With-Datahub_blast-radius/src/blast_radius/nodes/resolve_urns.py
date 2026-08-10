"""[2a] Resolve file paths to DataHub URNs.

This is the #1 failure mode of every impact-analysis tool, so it gets its own
node, a disk cache, and three strategies in strict priority order:

  1. `urn_overrides` in blast-radius.yml   -> confidence: override
  2. `search(name, platform=dbt)`          -> confidence: search
  3. naming convention from config         -> confidence: convention

When we fall back to a convention we verify the URN actually exists before
trusting it; if it does not, the asset is reported as unresolved in the PR
comment rather than silently producing an empty blast radius. Silence is the
most dangerous possible output for a firewall.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..context import make_dataset_urn
from ..state import ChangedAsset

log = logging.getLogger("blast_radius.resolve_urns")

PLATFORM_BY_ASSET_TYPE = {
    "dbt_model": "dbt",
    "dbt_contract": "dbt",
    "sql": "dbt",
    "feature_def": "feast",
}


class UrnCache:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.data: Dict[str, str] = {}
        if path.is_file():
            try:
                self.data = json.loads(path.read_text(encoding="utf-8"))
            except Exception:
                self.data = {}

    def get(self, key: str) -> Optional[str]:
        return self.data.get(key)

    def put(self, key: str, urn: str) -> None:
        self.data[key] = urn

    def save(self) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(self.data, indent=2), encoding="utf-8")
        except OSError:
            pass


def convention_urn(path: str, name: str, settings) -> Optional[str]:
    dbt_cfg = settings.section("dbt")
    if not dbt_cfg:
        return None
    database = dbt_cfg.get("database", "analytics")
    env = dbt_cfg.get("env", "PROD")
    schema_map = dbt_cfg.get("schema_by_folder") or {}

    schema = None
    parts = Path(path).parts
    for folder, mapped in schema_map.items():
        if folder in parts:
            schema = mapped
            break
    if schema is None:
        # models/<schema>/<file>.sql
        if "models" in parts:
            idx = parts.index("models")
            if len(parts) > idx + 2:
                schema = parts[idx + 1]
    if schema is None:
        return None
    return make_dataset_urn("dbt", f"{database}.{schema}.{name}", env)


def airflow_urn(name: str, settings) -> Optional[str]:
    cfg = settings.section("airflow")
    namespace = cfg.get("flow_namespace", "prod") if cfg else "prod"
    return f"urn:li:dataFlow:(airflow,{name},{namespace})"


def resolve_one(asset: ChangedAsset, ctx, settings, cache: UrnCache) -> ChangedAsset:
    overrides = settings.raw.get("urn_overrides") or {}

    # 1. explicit override
    if asset.path in overrides and overrides[asset.path]:
        asset.urn = str(overrides[asset.path])
        asset.urn_confidence = "override"
        return asset

    cache_key = f"{asset.asset_type}:{asset.path}:{asset.name}"
    cached = cache.get(cache_key)
    if cached:
        asset.urn = cached
        asset.urn_confidence = "cache"
        return asset

    # 2. catalog search with a platform filter
    platform = PLATFORM_BY_ASSET_TYPE.get(asset.asset_type)
    if asset.asset_type == "airflow_dag":
        candidate = airflow_urn(asset.name, settings)
        if candidate and ctx.get_entity(candidate):
            asset.urn = candidate
            asset.urn_confidence = "convention"
            cache.put(cache_key, candidate)
            return asset

    if platform:
        try:
            hits = ctx.search(asset.name, entity_types=["dataset"], platform=platform, limit=10)
        except Exception as exc:
            log.debug("search failed for %s: %s", asset.name, exc)
            hits = []
        best = _best_hit(hits, asset.name)
        if best is not None:
            asset.urn = best.urn
            asset.urn_confidence = "search"
            cache.put(cache_key, best.urn)
            return asset

        # Retry without the platform filter - dbt models are frequently
        # catalogued under the warehouse platform instead.
        try:
            hits = ctx.search(asset.name, entity_types=["dataset"], limit=10)
        except Exception:
            hits = []
        best = _best_hit(hits, asset.name)
        if best is not None:
            asset.urn = best.urn
            asset.urn_confidence = "search"
            asset.notes.append(
                f"resolved to platform `{best.platform or 'unknown'}` (no dbt entity found)"
            )
            cache.put(cache_key, best.urn)
            return asset

    # 3. naming convention, verified against the catalog
    candidate = convention_urn(asset.path, asset.name, settings)
    if candidate:
        exists = False
        try:
            entity = ctx.get_entity(candidate)
            exists = bool(entity and (entity.name != candidate or entity.schema_fields))
        except Exception:
            exists = False
        if exists:
            asset.urn = candidate
            asset.urn_confidence = "convention"
            cache.put(cache_key, candidate)
            return asset
        asset.notes.append(
            f"convention URN `{candidate}` is not in the catalog - is this model ingested?"
        )

    asset.urn_confidence = "unresolved"
    return asset


def _best_hit(hits, name: str):
    if not hits:
        return None
    target = name.lower()
    exact = [h for h in hits if h.short_name.lower() == target]
    if exact:
        # Prefer PROD over dev/staging environments.
        prod = [h for h in exact if ",PROD)" in h.urn]
        return (prod or exact)[0]
    contains = [h for h in hits if target in h.name.lower()]
    return contains[0] if contains else None


def resolve_urns(state, deps) -> Dict[str, Any]:
    settings = deps.settings
    cache = UrnCache(settings.output_dir / "urn-cache.json")

    resolved: List[ChangedAsset] = []
    seeds: List[str] = []
    unresolved: List[str] = []

    for asset in state.changed_assets:
        resolve_one(asset, deps.ctx, settings, cache)
        resolved.append(asset)
        if asset.urn:
            seeds.append(asset.urn)
        else:
            unresolved.append(asset.path)

    cache.save()

    errors = list(state.errors)
    if unresolved and not seeds:
        errors.append(
            "Could not map any changed file to a DataHub entity. "
            "Add `urn_overrides` to blast-radius.yml, or check that the models are ingested."
        )

    return {
        "changed_assets": resolved,
        "seed_urns": seeds,
        "errors": errors,
    }

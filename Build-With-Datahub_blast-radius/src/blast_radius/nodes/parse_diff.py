"""[1] Change Parser Agent - structural diff. No LLM, no regex guessing.

For SQL we parse both revisions with sqlglot and compare the *projected output
columns* of the final SELECT, including each column's underlying expression.
That is how we tell a rename (same expression, new alias) apart from a drop
(expression gone) - something a textual diff can never do.

Also handles:
  * dbt schema.yml contracts (column list + data_type + tests)
  * Airflow DAGs (Python AST: task ids and embedded SQL)
  * ingestion configs / feature YAML (key-level diff)
"""

from __future__ import annotations

import ast
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from ..dbt_jinja import render_stub
from ..git_diff import ChangedFile, changed_files, current_file, file_at, is_repo, merge_base
from ..state import ChangedAsset, ColumnChange

log = logging.getLogger("blast_radius.parse_diff")

try:
    import sqlglot
    from sqlglot import exp
except Exception:  # pragma: no cover
    sqlglot = None  # type: ignore
    exp = None  # type: ignore

try:
    import yaml
except Exception:  # pragma: no cover
    yaml = None  # type: ignore

SQL_SUFFIXES = {".sql"}
YAML_SUFFIXES = {".yml", ".yaml"}
PY_SUFFIXES = {".py"}


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------
def classify_path(path: str) -> str:
    p = path.lower()
    suffix = Path(p).suffix
    if suffix in SQL_SUFFIXES and ("/models/" in p or p.startswith("models/")):
        return "dbt_model"
    if suffix in SQL_SUFFIXES:
        return "sql"
    if suffix in YAML_SUFFIXES and ("/models/" in p or p.startswith("models/")):
        return "dbt_contract"
    if suffix in PY_SUFFIXES and ("dag" in p or "/dags/" in p or "airflow" in p):
        return "airflow_dag"
    if suffix in YAML_SUFFIXES and ("feature" in p or "feast" in p):
        return "feature_def"
    if suffix in YAML_SUFFIXES and ("ingest" in p or "recipe" in p or "source" in p):
        return "ingestion_config"
    if suffix in YAML_SUFFIXES:
        return "config"
    return "unknown"


def asset_name(path: str, asset_type: str) -> str:
    stem = Path(path).stem
    if asset_type == "airflow_dag":
        return stem
    return stem


# ---------------------------------------------------------------------------
# SQL projection extraction
# ---------------------------------------------------------------------------
def projected_columns(sql: str, dialect: Optional[str] = None) -> Dict[str, Dict[str, Any]]:
    """alias -> {expression, cast_type, is_star}. Empty dict when unparseable."""
    if not sql or sqlglot is None:
        return {}
    stub = render_stub(sql)
    if not stub.strip():
        return {}
    try:
        tree = sqlglot.parse_one(stub, read=dialect, error_level=None)
    except Exception as err:
        log.debug("sqlglot could not parse: %s", err)
        return {}
    if tree is None:
        return {}

    select = _final_select(tree)
    if select is None:
        return {}

    out: Dict[str, Dict[str, Any]] = {}
    for projection in select.expressions:
        if isinstance(projection, exp.Star):
            out["*"] = {"expression": "*", "cast_type": None, "is_star": True}
            continue
        alias = projection.alias_or_name
        if not alias:
            continue
        inner = projection.this if isinstance(projection, exp.Alias) else projection
        try:
            expression_sql = inner.sql(dialect=dialect)
        except Exception:
            expression_sql = str(inner)
        out[alias] = {
            "expression": _normalise(expression_sql),
            "cast_type": _cast_type(inner),
            "is_star": False,
        }
    return out


def _final_select(tree):
    """The SELECT whose columns the model actually publishes."""
    if isinstance(tree, exp.Select):
        return tree
    # Handle `WITH ... SELECT`, set operations, subqueries.
    if isinstance(tree, (exp.Union, exp.Except, exp.Intersect)):
        left = tree.this
        return _final_select(left) if left is not None else None
    node = tree.find(exp.Select)
    if node is None:
        return None
    # For a CTE chain, sqlglot's first Select may be the CTE body. Prefer the
    # outermost select that is not inside a CTE definition.
    candidates = [s for s in tree.find_all(exp.Select) if not _inside_cte(s)]
    return candidates[-1] if candidates else node


def _inside_cte(node) -> bool:
    parent = node.parent
    while parent is not None:
        if isinstance(parent, exp.CTE):
            return True
        parent = parent.parent
    return False


def _cast_type(node) -> Optional[str]:
    if isinstance(node, exp.Cast):
        try:
            return node.to.sql().upper()
        except Exception:
            return None
    cast = node.find(exp.Cast) if hasattr(node, "find") else None
    if cast is not None:
        try:
            return cast.to.sql().upper()
        except Exception:
            return None
    return None


def _normalise(sql: str) -> str:
    return " ".join((sql or "").lower().replace('"', "").split())


# ---------------------------------------------------------------------------
# Diffing
# ---------------------------------------------------------------------------
def diff_sql(name: str, old_sql: str, new_sql: str, dialect: Optional[str] = None) -> List[ColumnChange]:
    old = projected_columns(old_sql, dialect)
    new = projected_columns(new_sql, dialect)
    if not old and not new:
        return []

    changes: List[ColumnChange] = []
    removed = [c for c in old if c not in new and c != "*"]
    added = [c for c in new if c not in old and c != "*"]

    # Rename detection: identical underlying expression, different alias.
    matched_added: set = set()
    for gone in list(removed):
        gone_expr = old[gone]["expression"]
        # A bare column reference renamed to itself-under-a-new-name also
        # counts: old expression == old alias.
        for candidate in added:
            if candidate in matched_added:
                continue
            cand_expr = new[candidate]["expression"]
            if _expressions_equivalent(gone, gone_expr, candidate, cand_expr):
                changes.append(
                    ColumnChange(
                        kind="rename",
                        asset=name,
                        column=gone,
                        new_column=candidate,
                        old_expression=gone_expr,
                        new_expression=cand_expr,
                        old_type=old[gone]["cast_type"],
                        new_type=new[candidate]["cast_type"],
                        detail="same expression, new output name",
                    )
                )
                matched_added.add(candidate)
                removed.remove(gone)
                break

    for gone in removed:
        changes.append(
            ColumnChange(
                kind="drop",
                asset=name,
                column=gone,
                old_expression=old[gone]["expression"],
                old_type=old[gone]["cast_type"],
                detail="column no longer projected",
            )
        )

    for new_col in added:
        if new_col in matched_added:
            continue
        changes.append(
            ColumnChange(
                kind="add",
                asset=name,
                column=new_col,
                new_expression=new[new_col]["expression"],
                new_type=new[new_col]["cast_type"],
                detail="new output column",
            )
        )

    # Same name, different logic or cast.
    for col in old:
        if col not in new or col == "*":
            continue
        old_meta, new_meta = old[col], new[col]
        if old_meta["cast_type"] != new_meta["cast_type"] and (
            old_meta["cast_type"] or new_meta["cast_type"]
        ):
            changes.append(
                ColumnChange(
                    kind="type_change",
                    asset=name,
                    column=col,
                    old_type=old_meta["cast_type"],
                    new_type=new_meta["cast_type"],
                    old_expression=old_meta["expression"],
                    new_expression=new_meta["expression"],
                    detail="cast target changed",
                )
            )
        elif old_meta["expression"] != new_meta["expression"]:
            changes.append(
                ColumnChange(
                    kind="expression_change",
                    asset=name,
                    column=col,
                    old_expression=old_meta["expression"],
                    new_expression=new_meta["expression"],
                    detail="same column name, different logic",
                )
            )

    return changes


def _expressions_equivalent(old_alias: str, old_expr: str, new_alias: str, new_expr: str) -> bool:
    if not old_expr or not new_expr:
        return False
    if old_expr == new_expr:
        return True
    # `select txn_amount_usd` -> `select txn_amount_usd as transaction_amount_usd`
    if old_expr == old_alias.lower() and new_expr == old_alias.lower():
        return True
    # `select x as a` -> `select x as b`
    return old_expr.replace(old_alias.lower(), "") == new_expr.replace(new_alias.lower(), "")


def diff_dbt_contract(name: str, old_yaml: str, new_yaml: str) -> Tuple[List[ColumnChange], List[str]]:
    """Diff a dbt schema.yml: columns, data types, and contract enforcement."""
    notes: List[str] = []
    if yaml is None:
        return [], notes
    try:
        old_doc = yaml.safe_load(old_yaml) or {}
        new_doc = yaml.safe_load(new_yaml) or {}
    except Exception:
        return [], ["schema.yml could not be parsed"]

    changes: List[ColumnChange] = []
    old_models = {m.get("name"): m for m in (old_doc.get("models") or []) if isinstance(m, dict)}
    new_models = {m.get("name"): m for m in (new_doc.get("models") or []) if isinstance(m, dict)}

    for model_name in set(old_models) | set(new_models):
        if not model_name:
            continue
        old_cols = {
            c.get("name"): c
            for c in (old_models.get(model_name, {}).get("columns") or [])
            if isinstance(c, dict)
        }
        new_cols = {
            c.get("name"): c
            for c in (new_models.get(model_name, {}).get("columns") or [])
            if isinstance(c, dict)
        }
        for col in set(old_cols) - set(new_cols):
            changes.append(
                ColumnChange(
                    kind="drop", asset=model_name, column=col,
                    old_type=str(old_cols[col].get("data_type") or "") or None,
                    detail="removed from dbt contract",
                )
            )
        for col in set(new_cols) - set(old_cols):
            changes.append(
                ColumnChange(
                    kind="add", asset=model_name, column=col,
                    new_type=str(new_cols[col].get("data_type") or "") or None,
                    detail="added to dbt contract",
                )
            )
        for col in set(old_cols) & set(new_cols):
            old_type = str(old_cols[col].get("data_type") or "")
            new_type = str(new_cols[col].get("data_type") or "")
            if old_type and new_type and old_type != new_type:
                changes.append(
                    ColumnChange(
                        kind="type_change", asset=model_name, column=col,
                        old_type=old_type, new_type=new_type,
                        detail="dbt contract data_type changed",
                    )
                )
            old_tests = _test_names(old_cols[col])
            new_tests = _test_names(new_cols[col])
            if "not_null" in old_tests and "not_null" not in new_tests:
                changes.append(
                    ColumnChange(
                        kind="nullability", asset=model_name, column=col,
                        detail="not_null test removed",
                    )
                )
            dropped_tests = old_tests - new_tests - {"not_null"}
            if dropped_tests:
                notes.append(
                    f"`{model_name}.{col}` lost tests: {', '.join(sorted(dropped_tests))}"
                )

    return changes, notes


def _test_names(column: Dict[str, Any]) -> set:
    out = set()
    for t in (column.get("tests") or column.get("data_tests") or []):
        if isinstance(t, str):
            out.add(t)
        elif isinstance(t, dict):
            out.update(t.keys())
    return out


def diff_airflow_dag(name: str, old_py: str, new_py: str) -> Tuple[List[ColumnChange], List[str]]:
    """Compare task ids and embedded SQL between two revisions of a DAG."""
    notes: List[str] = []
    old_tasks, old_sql = _dag_facts(old_py)
    new_tasks, new_sql = _dag_facts(new_py)

    for gone in sorted(old_tasks - new_tasks):
        notes.append(f"task `{gone}` removed from DAG `{name}`")
    for added in sorted(new_tasks - old_tasks):
        notes.append(f"task `{added}` added to DAG `{name}`")

    changes: List[ColumnChange] = []
    if old_sql and new_sql and _normalise(old_sql) != _normalise(new_sql):
        changes.extend(diff_sql(name, old_sql, new_sql))
        if not changes:
            notes.append(f"SQL inside DAG `{name}` changed")
    return changes, notes


def _dag_facts(source: str) -> Tuple[set, str]:
    tasks: set = set()
    sql_blobs: List[str] = []
    if not source:
        return tasks, ""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return tasks, ""
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            for kw in node.keywords or []:
                if kw.arg == "task_id" and isinstance(kw.value, ast.Constant):
                    tasks.add(str(kw.value.value))
                if kw.arg == "sql" and isinstance(kw.value, ast.Constant):
                    sql_blobs.append(str(kw.value.value))
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and "sql" in target.id.lower():
                    if isinstance(node.value, ast.Constant) and isinstance(node.value.value, str):
                        sql_blobs.append(node.value.value)
    return tasks, "\n".join(sql_blobs)


def diff_yaml_keys(name: str, old_yaml: str, new_yaml: str) -> List[str]:
    if yaml is None:
        return []
    try:
        old_doc = yaml.safe_load(old_yaml) or {}
        new_doc = yaml.safe_load(new_yaml) or {}
    except Exception:
        return ["config could not be parsed"]
    old_keys = set(_flatten_keys(old_doc))
    new_keys = set(_flatten_keys(new_doc))
    notes = []
    for gone in sorted(old_keys - new_keys)[:10]:
        notes.append(f"`{gone}` removed from `{name}`")
    for added in sorted(new_keys - old_keys)[:10]:
        notes.append(f"`{added}` added to `{name}`")
    return notes


def _flatten_keys(node: Any, prefix: str = "") -> List[str]:
    out: List[str] = []
    if isinstance(node, dict):
        for k, v in node.items():
            path = f"{prefix}.{k}" if prefix else str(k)
            out.append(path)
            out.extend(_flatten_keys(v, path))
    elif isinstance(node, list):
        for item in node:
            out.extend(_flatten_keys(item, prefix))
    return out


# ---------------------------------------------------------------------------
# Simulation (demo mode, no git required)
# ---------------------------------------------------------------------------
_SIM_RE = re.compile(
    r"^(?P<kind>rename|drop|type_change|add|nullability|expression_change):"
    r"(?P<asset>[\w.]+)\.(?P<column>\w+)"
    r"(?:->(?P<target>[\w.:]+))?$"
)


def parse_simulations(specs: List[str]) -> List[ChangedAsset]:
    """`rename:stg_user_transactions.txn_amount_usd->transaction_amount_usd`"""
    by_asset: Dict[str, ChangedAsset] = {}
    for spec in specs:
        match = _SIM_RE.match(spec.strip())
        if not match:
            continue
        kind = match.group("kind")
        asset = match.group("asset")
        column = match.group("column")
        target = match.group("target")

        entry = by_asset.get(asset)
        if entry is None:
            entry = ChangedAsset(
                path=f"<simulated>/{asset}.sql",
                asset_type="dbt_model",
                name=asset,
                status="modified",
                notes=["simulated change (no git diff)"],
            )
            by_asset[asset] = entry

        change = ColumnChange(kind=kind, asset=asset, column=column, detail="simulated")
        if kind == "rename":
            change.new_column = target or f"{column}_v2"
        elif kind == "type_change" and target:
            change.new_type = target.upper()
        entry.changes.append(change)
    return list(by_asset.values())


# ---------------------------------------------------------------------------
# Node entry point
# ---------------------------------------------------------------------------
def parse_diff(state, deps) -> Dict[str, Any]:
    settings = deps.settings
    root = settings.repo_root

    if state.simulate:
        assets = parse_simulations(state.simulate)
        return {"changed_assets": assets}

    if not state.base_ref or not is_repo(root):
        return {
            "changed_assets": [],
            "errors": state.errors + [
                "No --base ref supplied and no git repository detected. "
                "Use `blast-radius demo` or pass --simulate."
            ],
        }

    base = merge_base(state.base_ref, state.head_ref, root)
    try:
        files = changed_files(base, state.head_ref, root)
    except Exception as exc:
        return {"changed_assets": [], "errors": state.errors + [f"git diff failed: {exc}"]}

    assets: List[ChangedAsset] = []
    for cf in files:
        asset = _parse_one(cf, base, state.head_ref, root)
        if asset is not None:
            assets.append(asset)
    return {"changed_assets": assets}


def _parse_one(cf: ChangedFile, base: str, head: str, root: Path) -> Optional[ChangedAsset]:
    asset_type = classify_path(cf.path)
    if asset_type == "unknown":
        return None

    old_text = file_at(base, cf.old_path or cf.path, root) if cf.status != "added" else ""
    new_text = (
        ""
        if cf.status == "deleted"
        else (file_at(head, cf.path, root) or current_file(cf.path, root))
    )

    name = asset_name(cf.path, asset_type)
    asset = ChangedAsset(path=cf.path, asset_type=asset_type, name=name, status=cf.status)

    if asset_type in ("dbt_model", "sql"):
        asset.changes = diff_sql(name, old_text, new_text)
        if cf.status == "deleted":
            asset.notes.append("model file deleted entirely")
        if not asset.changes and old_text and new_text:
            asset.notes.append("SQL changed but output columns are identical")
    elif asset_type == "dbt_contract":
        asset.changes, notes = diff_dbt_contract(name, old_text, new_text)
        asset.notes.extend(notes)
        # A contract file describes other models; use the first model's name.
        if asset.changes:
            asset.name = asset.changes[0].asset
    elif asset_type == "airflow_dag":
        asset.changes, notes = diff_airflow_dag(name, old_text, new_text)
        asset.notes.extend(notes)
    elif asset_type in ("feature_def", "ingestion_config", "config"):
        asset.notes.extend(diff_yaml_keys(name, old_text, new_text))

    if not asset.changes and not asset.notes:
        return None
    return asset

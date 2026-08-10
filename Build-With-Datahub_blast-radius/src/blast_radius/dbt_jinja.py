"""Turn a dbt model file into SQL that sqlglot can parse.

We are not rendering dbt properly (that needs a manifest and a warehouse
connection). We are producing a *structurally faithful stub*: refs become
table names, config blocks disappear, and unknown Jinja expressions become
harmless literals. That is enough to diff the projected column list, which is
all the Change Parser Agent needs.
"""

from __future__ import annotations

import re
from typing import List, Tuple

_REF = re.compile(r"\{\{\s*ref\(\s*['\"]([^'\"]+)['\"]\s*\)\s*\}\}")
_REF_PKG = re.compile(r"\{\{\s*ref\(\s*['\"][^'\"]+['\"]\s*,\s*['\"]([^'\"]+)['\"]\s*\)\s*\}\}")
_SOURCE = re.compile(
    r"\{\{\s*source\(\s*['\"]([^'\"]+)['\"]\s*,\s*['\"]([^'\"]+)['\"]\s*\)\s*\}\}"
)
_VAR = re.compile(r"\{\{\s*var\(\s*['\"]([^'\"]+)['\"][^}]*\)\s*\}\}")
_STATEMENT = re.compile(r"\{%-?.*?-?%\}", re.DOTALL)
_COMMENT = re.compile(r"\{#.*?#\}", re.DOTALL)
_EXPR = re.compile(r"\{\{.*?\}\}", re.DOTALL)


def render_stub(sql: str) -> str:
    """Best-effort de-Jinja. Order matters."""
    if not sql:
        return ""
    out = _COMMENT.sub(" ", sql)
    out = _SOURCE.sub(lambda m: f"{m.group(1)}.{m.group(2)}", out)
    out = _REF_PKG.sub(lambda m: m.group(1), out)
    out = _REF.sub(lambda m: m.group(1), out)
    out = _VAR.sub(lambda m: f"'{m.group(1)}'", out)
    # {% config %}, {% if %}, {% for %} ... drop the tags, keep the body.
    out = _STATEMENT.sub(" ", out)
    # Anything else in {{ }} becomes a literal so the SQL still parses.
    out = _EXPR.sub("'__jinja__'", out)
    return out.strip()


def extract_refs(sql: str) -> List[str]:
    """Every model this file depends on, in declaration order."""
    refs: List[str] = []
    for match in _REF.finditer(sql or ""):
        if match.group(1) not in refs:
            refs.append(match.group(1))
    for match in _REF_PKG.finditer(sql or ""):
        if match.group(1) not in refs:
            refs.append(match.group(1))
    return refs


def extract_sources(sql: str) -> List[Tuple[str, str]]:
    return [(m.group(1), m.group(2)) for m in _SOURCE.finditer(sql or "")]


def is_incremental(sql: str) -> bool:
    return "is_incremental" in (sql or "")


def materialization(sql: str) -> str:
    match = re.search(r"materialized\s*=\s*['\"](\w+)['\"]", sql or "")
    return match.group(1) if match else "view"

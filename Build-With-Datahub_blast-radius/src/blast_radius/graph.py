"""The five-agent pipeline.

LangGraph when it is installed (that is the advertised architecture), and an
identical sequential runner when it is not. Both paths execute the same node
functions in the same order with the same conditional edge, so the demo never
depends on an optional dependency resolving.

    parse_diff -> resolve_urns -> traverse -> ml_risk -> {remediate | writeback}
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from .config import Settings
from .context import build_context
from .llm import LlmClient
from .nodes import ml_risk, parse_diff, remediate, resolve_urns, traverse, writeback
from .severity import severity_at_least
from .state import BlastRadiusState

log = logging.getLogger("blast_radius.graph")

NODE_ORDER = ["parse_diff", "resolve_urns", "traverse", "ml_risk", "remediate", "writeback"]

NODE_FUNCS: Dict[str, Callable[..., Dict[str, Any]]] = {
    "parse_diff": parse_diff,
    "resolve_urns": resolve_urns,
    "traverse": traverse,
    "ml_risk": ml_risk,
    "remediate": remediate,
    "writeback": writeback,
}

NODE_LABEL = {
    "parse_diff": "[1] Change Parser",
    "resolve_urns": "[2a] URN Resolver",
    "traverse": "[2b] Blast Radius",
    "ml_risk": "[3] ML Risk",
    "remediate": "[4] Remediation",
    "writeback": "[5] Knowledge Writeback",
}


@dataclass
class Deps:
    """Everything the nodes need, built once and threaded through."""

    settings: Settings
    ctx: Any
    llm: Optional[LlmClient] = None
    notes: List[str] = field(default_factory=list)

    @classmethod
    def build(cls, settings: Optional[Settings] = None) -> "Deps":
        settings = settings or Settings.load()
        ctx, notes = build_context(settings)
        llm = LlmClient.from_settings(settings)
        notes.append("llm=" + llm.describe())
        return cls(settings=settings, ctx=ctx, llm=llm, notes=notes)

    def close(self) -> None:
        closer = getattr(self.ctx, "close", None)
        if callable(closer):
            try:
                closer()
            except Exception:  # noqa: BLE001
                pass


def route_after_ml_risk(state: BlastRadiusState) -> str:
    """The conditional edge from the brief: remediate only when it matters."""
    threshold = "HIGH"
    return "remediate" if severity_at_least(state.severity, threshold) else "writeback"


def _apply(state: BlastRadiusState, update: Optional[Dict[str, Any]]) -> BlastRadiusState:
    for key, value in (update or {}).items():
        if hasattr(state, key):
            setattr(state, key, value)
        else:
            log.debug("node returned unknown state key %r", key)
    return state


def _run_node(name: str, state: BlastRadiusState, deps: Deps) -> BlastRadiusState:
    started = time.time()
    label = NODE_LABEL.get(name, name)
    log.info("%s ...", label)
    try:
        update = NODE_FUNCS[name](state, deps)
        _apply(state, update)
    except Exception as exc:  # noqa: BLE001
        log.exception("%s failed", label)
        state.errors.append("%s failed: %s" % (label, str(exc)[:240]))
    finally:
        state.timings[name] = round(time.time() - started, 3)
        log.info("%s done in %.2fs", label, state.timings.get(name, 0.0))
    return state


def build_langgraph(deps: Deps):
    """Return a compiled LangGraph app, or None if langgraph is unavailable."""
    try:
        from langgraph.graph import END, StateGraph
    except Exception as exc:  # noqa: BLE001
        log.info("langgraph unavailable (%s); using the sequential runner", exc)
        return None

    def _wrap(name: str):
        def _node(state: BlastRadiusState) -> BlastRadiusState:
            return _run_node(name, state, deps)

        return _node

    try:
        graph = StateGraph(BlastRadiusState)
        for name in NODE_ORDER:
            graph.add_node(name, _wrap(name))
        graph.set_entry_point("parse_diff")
        graph.add_edge("parse_diff", "resolve_urns")
        graph.add_edge("resolve_urns", "traverse")
        graph.add_edge("traverse", "ml_risk")
        graph.add_conditional_edges(
            "ml_risk",
            route_after_ml_risk,
            {"remediate": "remediate", "writeback": "writeback"},
        )
        graph.add_edge("remediate", "writeback")
        graph.add_edge("writeback", END)
        return graph.compile()
    except Exception as exc:  # noqa: BLE001
        log.warning("could not compile LangGraph (%s); using the sequential runner", exc)
        return None


def run_sequential(state: BlastRadiusState, deps: Deps) -> BlastRadiusState:
    for name in ("parse_diff", "resolve_urns", "traverse", "ml_risk"):
        _run_node(name, state, deps)
    next_node = route_after_ml_risk(state)
    if next_node == "remediate":
        _run_node("remediate", state, deps)
    _run_node("writeback", state, deps)
    return state


def run_pipeline(
    state: BlastRadiusState,
    deps: Optional[Deps] = None,
    prefer_langgraph: bool = True,
) -> BlastRadiusState:
    """Run the whole firewall and leave a rendered PR comment on the state."""
    owns_deps = deps is None
    deps = deps or Deps.build()
    started = time.time()

    state.context_source = getattr(deps.ctx, "name", "unknown")

    app = build_langgraph(deps) if (
        prefer_langgraph and os.environ.get("BLAST_RADIUS_USE_LANGGRAPH", "1") != "0"
    ) else None
    if app is not None:
        log.info("running the LangGraph pipeline")
        try:
            result = app.invoke(state)
            if isinstance(result, BlastRadiusState):
                state = result
            elif isinstance(result, dict):
                _apply(state, result)
        except Exception as exc:  # noqa: BLE001
            log.warning("LangGraph run failed (%s); falling back to sequential", exc)
            state.errors.append("LangGraph fallback: %s" % str(exc)[:200])
            run_sequential(state, deps)
    else:
        run_sequential(state, deps)

    state.timings["total"] = round(time.time() - started, 3)
    for note in deps.notes:
        if note and note not in state.errors:
            log.info("%s", note)

    from .render.comment import render_comment

    try:
        state.comment_markdown = render_comment(state, deps.settings)
    except Exception as exc:  # noqa: BLE001
        log.exception("comment rendering failed")
        state.errors.append("comment rendering failed: %s" % str(exc)[:200])

    if owns_deps:
        deps.close()
    return state

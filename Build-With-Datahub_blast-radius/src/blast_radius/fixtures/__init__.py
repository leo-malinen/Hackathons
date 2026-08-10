"""Checked-in metadata graph so the demo never depends on Docker.

`demo_graph.json` mirrors exactly what scripts/seed_datahub_ml_slice.py emits
into a real DataHub instance: the same URNs, the same column-level edges, the
same ML slice. Swapping between them changes nothing about the output.
"""

import os

DEMO_GRAPH = os.path.join(os.path.dirname(__file__), "demo_graph.json")

__all__ = ["DEMO_GRAPH"]

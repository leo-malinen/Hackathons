"""Blast Radius - a pre-merge Data Change Firewall built on DataHub context.

The design contract of this package, in one sentence:

    Graph traversal is deterministic code. The LLM only writes prose and code.

Everything that decides *what breaks* is plain Python over metadata returned by
DataHub. The language model is used for classification narrative, severity
explanation and remediation code generation - never to decide a lineage hop.
"""

from __future__ import annotations

__version__ = "0.1.0"

__all__ = ["__version__"]

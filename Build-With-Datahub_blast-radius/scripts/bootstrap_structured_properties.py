#!/usr/bin/env python3
"""Register the structured properties Blast Radius writes back.

DataHub will reject add_structured_properties for a property that was never
defined, so this runs once before the first analysis.

    python scripts/bootstrap_structured_properties.py
"""
from __future__ import annotations

import argparse
import os
import sys

try:
    from datahub.emitter.mcp import MetadataChangeProposalWrapper
    from datahub.emitter.rest_emitter import DatahubRestEmitter
    from datahub.metadata.schema_classes import (
        PropertyValueClass,
        StructuredPropertyDefinitionClass,
    )
except ImportError:
    sys.exit("python3 -m pip install --upgrade acryl-datahub")

NAMESPACE = "io.acryl.blastradius"

DEFINITIONS = [
    {
        "key": "blast_radius_score",
        "displayName": "Blast radius score",
        "valueType": "urn:li:dataType:datahub.number",
        "description": (
            "0-100 severity of the most recent pre-merge impact analysis that "
            "reached this asset. Higher means a change here hurts more."
        ),
        "cardinality": "SINGLE",
    },
    {
        "key": "last_impact_review",
        "displayName": "Last impact review",
        "valueType": "urn:li:dataType:datahub.string",
        "description": "Date of the most recent Blast Radius analysis touching this asset.",
        "cardinality": "SINGLE",
    },
    {
        "key": "blast_radius_verdict",
        "displayName": "Blast radius verdict",
        "valueType": "urn:li:dataType:datahub.string",
        "description": "NONE | LOW | MEDIUM | HIGH | CRITICAL, from the last analysis.",
        "cardinality": "SINGLE",
        "allowedValues": ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"],
    },
]

ENTITY_TYPES = [
    "urn:li:entityType:datahub.dataset",
    "urn:li:entityType:datahub.dashboard",
    "urn:li:entityType:datahub.chart",
    "urn:li:entityType:datahub.dataJob",
    "urn:li:entityType:datahub.dataFlow",
    "urn:li:entityType:datahub.mlModel",
    "urn:li:entityType:datahub.mlFeature",
    "urn:li:entityType:datahub.mlFeatureTable",
    "urn:li:entityType:datahub.mlModelDeployment",
]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--gms", default=os.environ.get("DATAHUB_GMS_URL", "http://localhost:8080"))
    ap.add_argument("--token", default=os.environ.get("DATAHUB_GMS_TOKEN", ""))
    args = ap.parse_args()

    emitter = DatahubRestEmitter(gms_server=args.gms, token=args.token or None)

    for spec in DEFINITIONS:
        urn = "urn:li:structuredProperty:%s.%s" % (NAMESPACE, spec["key"])
        allowed = spec.get("allowedValues")
        definition = StructuredPropertyDefinitionClass(
            qualifiedName="%s.%s" % (NAMESPACE, spec["key"]),
            displayName=spec["displayName"],
            valueType=spec["valueType"],
            description=spec["description"],
            cardinality=spec["cardinality"],
            entityTypes=ENTITY_TYPES,
            allowedValues=(
                [PropertyValueClass(value=v) for v in allowed] if allowed else None
            ),
        )
        emitter.emit(MetadataChangeProposalWrapper(entityUrn=urn, aspect=definition))
        print("registered %s" % urn)

    print("\n%d structured properties ready." % len(DEFINITIONS))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

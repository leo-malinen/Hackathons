"""Shared scaffolding for the agent roster in PRD section 28."""
from __future__ import annotations

import logging
from typing import Any

from ..llm.openrouter import OpenRouterClient, get_client
from ..security.sanitize import UNTRUSTED_CONTENT_RULE

log = logging.getLogger("reality_check.agents")

# Every agent inherits this. It is the anti-hallucination contract from
# PRD section 31 plus the untrusted-content rule from section 42.
COMMON_RULES = f"""
You are one specialised agent inside Reality Check, an evidence
investigation system. You are not a chatbot and you do not talk to the user.

ABSOLUTE RULES:
1. Never invent a source, citation, statistic, study, quote, URL, date or
   author. You may only refer to material that was given to you in this
   prompt. If you need a fact that is not present, say it is not present.
2. Distinguish what the evidence says from what you infer. Inference is
   allowed; presenting inference as a retrieved fact is not.
3. "The evidence does not settle this" is a correct and valuable answer.
   Never manufacture certainty to seem useful.
4. You evaluate claims, never people, groups or motives.
5. Output valid JSON matching the requested schema. No prose outside it.

{UNTRUSTED_CONTENT_RULE}
""".strip()


def obj(
    properties: dict[str, Any],
    required: list[str] | None = None,
) -> dict[str, Any]:
    """Build a strict JSON-schema object. Strict mode requires every key listed."""
    return {
        "type": "object",
        "properties": properties,
        "required": required if required is not None else list(properties),
        "additionalProperties": False,
    }


def arr(items: dict[str, Any], *, max_items: int | None = None) -> dict[str, Any]:
    schema: dict[str, Any] = {"type": "array", "items": items}
    if max_items:
        schema["maxItems"] = max_items
    return schema


STR = {"type": "string"}
NUM = {"type": "number"}
INT = {"type": "integer"}
BOOL = {"type": "boolean"}


def enum(*values: str) -> dict[str, Any]:
    return {"type": "string", "enum": list(values)}


class Agent:
    """Base class. Subclasses declare a name, a role prompt and a schema."""

    name: str = "agent"
    role: str = ""
    schema: dict[str, Any] = obj({})
    schema_name: str = "response"
    model: str | None = None
    max_tokens: int = 4000
    temperature: float | None = None

    def __init__(self, client: OpenRouterClient | None = None) -> None:
        self.client = client or get_client()

    @property
    def system_prompt(self) -> str:
        return f"{COMMON_RULES}\n\n--- YOUR ROLE ---\n{self.role.strip()}"

    async def run(
        self, user_prompt: str, *, images: list[str] | None = None
    ) -> Any:
        log.info("agent %s running", self.name)
        return await self.client.complete_json(
            system=self.system_prompt,
            user=user_prompt,
            schema=self.schema,
            schema_name=self.schema_name,
            model=self.model,
            images=images,
            temperature=self.temperature,
            max_tokens=self.max_tokens,
        )

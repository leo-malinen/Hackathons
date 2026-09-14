"""Persistence.

Investigations are stored whole as JSON alongside the few columns worth
querying. The shape of an investigation is defined by the Pydantic models and
changes as the pipeline evolves; freezing that into twelve normalised tables
would buy nothing here and cost every schema migration.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, DateTime, Float, Integer, String, Text, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from .config import settings
from .schemas import Investigation


class Base(DeclarativeBase):
    pass


class InvestigationRow(Base):
    __tablename__ = "investigations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc), index=True
    )
    input_text: Mapped[str] = mapped_column(Text, default="")
    input_type: Mapped[str] = mapped_column(String(16), default="text")
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="running", index=True)
    verdict: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    headline: Mapped[str] = mapped_column(Text, default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    claim_count: Mapped[int] = mapped_column(Integer, default=0)
    evidence_count: Mapped[int] = mapped_column(Integer, default=0)
    challenged: Mapped[int] = mapped_column(Integer, default=0)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


_engine = create_async_engine(settings.database_url, future=True, echo=False)
_session_factory = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)


async def init_db() -> None:
    async with _engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


async def dispose_db() -> None:
    await _engine.dispose()


async def save(investigation: Investigation) -> None:
    payload = json.loads(investigation.model_dump_json())
    async with _session_factory() as session:
        row = await session.get(InvestigationRow, investigation.id)
        if row is None:
            row = InvestigationRow(id=investigation.id)
            session.add(row)
        row.input_text = investigation.input_text[:8000]
        row.input_type = investigation.input_type
        row.source_url = investigation.source_url
        row.status = investigation.status
        row.verdict = investigation.verdict.value if investigation.verdict else None
        row.confidence = investigation.confidence
        row.headline = investigation.headline
        row.summary = investigation.summary
        row.claim_count = len(investigation.claims)
        row.evidence_count = len(investigation.evidence)
        row.challenged = 1 if investigation.challenge else 0
        row.payload = payload
        await session.commit()


async def load(investigation_id: str) -> Investigation | None:
    async with _session_factory() as session:
        row = await session.get(InvestigationRow, investigation_id)
        if row is None or not row.payload:
            return None
        return Investigation.model_validate(row.payload)


async def recent(limit: int = 20) -> list[dict[str, Any]]:
    async with _session_factory() as session:
        result = await session.execute(
            select(InvestigationRow)
            .where(InvestigationRow.status == "complete")
            .order_by(InvestigationRow.created_at.desc())
            .limit(limit)
        )
        return [
            {
                "id": row.id,
                "created_at": row.created_at.isoformat(),
                "input_preview": " ".join(row.input_text.split())[:160],
                "input_type": row.input_type,
                "verdict": row.verdict,
                "confidence": row.confidence,
                "headline": row.headline,
                "claim_count": row.claim_count,
                "evidence_count": row.evidence_count,
                "challenged": bool(row.challenged),
            }
            for row in result.scalars().all()
        ]

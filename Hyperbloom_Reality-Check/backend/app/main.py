"""Reality Check API entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import store
from .api.routes import router
from .config import settings
from .llm.openrouter import get_client
from .retrieval.base import close_http

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(name)-26s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("reality_check")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await store.init_db()
    if not settings.openrouter_api_key:
        log.warning(
            "OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your key."
        )
    else:
        log.info("reasoning model: %s", settings.model_reasoning)
    yield
    await get_client().aclose()
    await close_http()
    await store.dispose_db()


app = FastAPI(
    title="Reality Check API",
    description=(
        "An AI evidence engine. Extracts claims, retrieves evidence for and "
        "against them, scores source quality and independence, and produces a "
        "transparent verdict."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
async def root() -> JSONResponse:
    return JSONResponse({
        "name": "Reality Check",
        "tagline": "Don't just believe it. Check it.",
        "docs": "/docs",
        "health": "/api/health",
    })

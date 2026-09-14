"""Fetch and extract readable text from a web page.

Used for two jobs: pulling the article when the user submits a URL, and
enriching a handful of top evidence documents so the stance classifier reads
real body text instead of a search snippet.

Everything that comes back is untrusted and goes through the sanitiser
before it reaches any model.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from ..config import settings
from ..security.sanitize import sanitise
from .base import clean_text, domain_of, http

log = logging.getLogger("reality_check.fetch")

_STRIP_TAGS = (
    "script", "style", "noscript", "iframe", "svg", "form", "button",
    "nav", "header", "footer", "aside", "figure", "figcaption",
)
_CONTENT_SELECTORS = (
    "article", "main", '[role="main"]', ".post-content", ".article-body",
    ".entry-content", "#content", ".content",
)


@dataclass
class FetchedPage:
    url: str
    title: str
    text: str
    publisher: str
    published_at: str | None
    ok: bool
    error: str = ""
    injection_findings: list[str] | None = None


def _meta(tree, *names: str) -> str | None:
    for name in names:
        for attr in ("property", "name", "itemprop"):
            node = tree.css_first(f'meta[{attr}="{name}"]')
            if node:
                value = node.attributes.get("content")
                if value:
                    return value.strip()
    return None


async def fetch_page(url: str, *, max_chars: int = 12000) -> FetchedPage:
    try:
        from selectolax.parser import HTMLParser
    except ImportError:  # pragma: no cover
        return FetchedPage(url, "", "", "", None, False, "selectolax not installed")

    client = await http()
    try:
        response = await client.get(url, headers={"Accept": "text/html,*/*"})
        response.raise_for_status()
        content_type = response.headers.get("content-type", "")
        if "html" not in content_type and "text" not in content_type:
            return FetchedPage(url, "", "", domain_of(url), None, False,
                               f"unsupported content type: {content_type}")
        raw = response.text[: settings.max_page_bytes]
    except Exception as exc:
        log.info("fetch failed for %s: %s", url, exc)
        return FetchedPage(url, "", "", domain_of(url), None, False, str(exc)[:160])

    tree = HTMLParser(raw)
    for tag in _STRIP_TAGS:
        for node in tree.css(tag):
            node.decompose()

    title = ""
    if tree.css_first("title"):
        title = clean_text(tree.css_first("title").text())
    title = _meta(tree, "og:title", "twitter:title") or title

    body = ""
    for selector in _CONTENT_SELECTORS:
        node = tree.css_first(selector)
        if node:
            candidate = node.text(separator=" ", strip=True)
            if len(candidate) > len(body):
                body = candidate
    if len(body) < 400 and tree.body:
        body = tree.body.text(separator=" ", strip=True)

    body = re.sub(r"\s+", " ", body).strip()[:max_chars]
    cleaned = sanitise(body, max_chars=max_chars)

    return FetchedPage(
        url=url,
        title=title[:300],
        text=cleaned.text,
        publisher=_meta(tree, "og:site_name") or domain_of(url),
        published_at=_meta(
            tree, "article:published_time", "datePublished", "og:updated_time", "date"
        ),
        ok=bool(cleaned.text),
        injection_findings=cleaned.findings or None,
    )

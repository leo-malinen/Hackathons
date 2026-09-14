"""Shared HTTP plumbing and URL helpers for evidence retrieval."""
from __future__ import annotations

import asyncio
import hashlib
import re
import ssl
from urllib.parse import urlparse, urlunparse

import httpx

from ..config import settings

try:  # pragma: no cover - environment dependent
    import truststore

    _SSL_CONTEXT: ssl.SSLContext | bool = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
except Exception:  # pragma: no cover
    _SSL_CONTEXT = True

USER_AGENT = (
    f"RealityCheck/1.0 (evidence verification research prototype; "
    f"mailto:{settings.retrieval_contact_email})"
)

_client: httpx.AsyncClient | None = None
_lock = asyncio.Lock()


async def http() -> httpx.AsyncClient:
    global _client
    async with _lock:
        if _client is None or _client.is_closed:
            _client = httpx.AsyncClient(
                timeout=httpx.Timeout(settings.retrieval_timeout_s, connect=10.0),
                follow_redirects=True,
                verify=_SSL_CONTEXT,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept-Language": "en-US,en;q=0.9",
                },
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            )
        return _client


async def close_http() -> None:
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
    _client = None


# --------------------------------------------------------------------------
# URL and domain helpers
# --------------------------------------------------------------------------
_TRACKING = re.compile(r"^(utm_|fbclid|gclid|mc_|ref_?$|source$|igshid)", re.I)


def normalise_url(url: str) -> str:
    """Drop tracking parameters and fragments so duplicates collapse."""
    if not url:
        return ""
    try:
        parts = urlparse(url.strip())
    except ValueError:
        return url.strip()
    if parts.scheme not in ("http", "https"):
        return url.strip()

    kept = [
        kv
        for kv in parts.query.split("&")
        if kv and not _TRACKING.match(kv.split("=", 1)[0])
    ]
    path = parts.path.rstrip("/") or "/"
    return urlunparse(
        (parts.scheme, parts.netloc.lower().removeprefix("www."), path, "", "&".join(kept), "")
    )


def domain_of(url: str) -> str:
    try:
        return urlparse(url).netloc.lower().removeprefix("www.")
    except ValueError:
        return ""


def registrable_domain(url_or_host: str) -> str:
    """Coarse eTLD+1. Good enough to tell nature.com from nih.gov."""
    host = url_or_host if "://" not in url_or_host else domain_of(url_or_host)
    host = host.lower().removeprefix("www.")
    parts = [p for p in host.split(".") if p]
    if len(parts) < 2:
        return host
    # Handle the common two-part public suffixes we actually meet.
    two_part = {"co.uk", "ac.uk", "gov.uk", "org.uk", "com.au", "co.jp", "go.jp", "gov.au"}
    if len(parts) >= 3 and ".".join(parts[-2:]) in two_part:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def stable_id(prefix: str, *parts: str) -> str:
    digest = hashlib.sha1("||".join(p or "" for p in parts).encode()).hexdigest()[:12]
    return f"{prefix}_{digest}"


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    text = re.sub(r"<[^>]+>", " ", value)
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    text = text.replace("&quot;", '"').replace("&#39;", "'").replace("&nbsp;", " ")
    return re.sub(r"\s+", " ", text).strip()


def year_of(published_at: str | None) -> int | None:
    if not published_at:
        return None
    match = re.search(r"(19|20)\d{2}", str(published_at))
    return int(match.group(0)) if match else None

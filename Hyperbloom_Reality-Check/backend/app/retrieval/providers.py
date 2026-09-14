"""Evidence providers. Every one of these is keyless and free.

That is a deliberate design choice, not a shortcut. The PRD's retrieval
ladder asks for primary research and government data first, and the scholarly
APIs give exactly that, with structured metadata a scraped SERP cannot offer:
DOIs, publication dates, citation counts, peer-review status, and in
OpenAlex's case the reference list itself, which is what makes real source
independence detection possible.

Providers, in ladder order:
  openalex    240M scholarly works, with reference graphs
  europepmc   biomedical and life sciences literature
  crossref    DOI registry metadata for published work
  wikipedia   reference layer and entity grounding
  duckduckgo  general web, for claims with no scholarly footprint
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any
from urllib.parse import parse_qs, quote_plus, urlparse

from ..schemas import RetrievedDoc
from .base import clean_text, http, normalise_url, stable_id

log = logging.getLogger("reality_check.retrieval")


def _doc(**kw: Any) -> RetrievedDoc:
    kw["url"] = normalise_url(kw.get("url", ""))
    kw["id"] = stable_id("doc", kw.get("doi") or kw["url"] or kw.get("title", ""))
    return RetrievedDoc(**kw)


def _decode_inverted_abstract(index: dict[str, list[int]] | None, limit: int = 1400) -> str:
    """OpenAlex ships abstracts as {word: [positions]}. Rebuild the prose."""
    if not index:
        return ""
    slots: list[tuple[int, str]] = []
    for word, positions in index.items():
        for pos in positions:
            slots.append((pos, word))
    if not slots:
        return ""
    slots.sort()
    return " ".join(word for _, word in slots)[:limit]


# --------------------------------------------------------------------------
async def search_openalex(query: str, limit: int = 6) -> list[RetrievedDoc]:
    client = await http()
    params = {
        "search": query,
        "per_page": str(limit),
        "sort": "relevance_score:desc",
        "select": (
            "id,doi,display_name,publication_year,publication_date,cited_by_count,"
            "type,open_access,primary_location,referenced_works,abstract_inverted_index"
        ),
    }
    try:
        response = await client.get("https://api.openalex.org/works", params=params)
        response.raise_for_status()
        results = response.json().get("results") or []
    except Exception as exc:
        log.warning("openalex failed for %r: %s", query, exc)
        return []

    docs: list[RetrievedDoc] = []
    for work in results:
        location = work.get("primary_location") or {}
        source = location.get("source") or {}
        oa = work.get("open_access") or {}
        url = (
            location.get("landing_page_url")
            or oa.get("oa_url")
            or work.get("doi")
            or work.get("id")
            or ""
        )
        doi = (work.get("doi") or "").replace("https://doi.org/", "") or None
        work_type = work.get("type") or ""
        docs.append(
            _doc(
                title=clean_text(work.get("display_name")) or "Untitled work",
                url=url,
                snippet=clean_text(
                    _decode_inverted_abstract(work.get("abstract_inverted_index"))
                ),
                publisher=clean_text(source.get("display_name")) or "Scholarly work",
                published_at=work.get("publication_date")
                or (str(work.get("publication_year")) if work.get("publication_year") else None),
                provider="openalex",
                doi=doi,
                openalex_id=work.get("id"),
                referenced_works=list(work.get("referenced_works") or [])[:80],
                cited_by_count=int(work.get("cited_by_count") or 0),
                is_peer_reviewed=work_type in ("article", "review", "book-chapter"),
                is_oa=bool(oa.get("is_oa")),
                doc_type=work_type,
                query=query,
            )
        )
    return docs


# --------------------------------------------------------------------------
async def search_europepmc(query: str, limit: int = 6) -> list[RetrievedDoc]:
    client = await http()
    params = {
        "query": query,
        "format": "json",
        "pageSize": str(limit),
        "resultType": "core",
        "sort": "CITED desc",
    }
    try:
        response = await client.get(
            "https://www.ebi.ac.uk/europepmc/webservices/rest/search", params=params
        )
        response.raise_for_status()
        results = (response.json().get("resultList") or {}).get("result") or []
    except Exception as exc:
        log.warning("europepmc failed for %r: %s", query, exc)
        return []

    docs: list[RetrievedDoc] = []
    for item in results:
        doi = item.get("doi")
        pmid = item.get("pmid")
        if doi:
            url = f"https://doi.org/{doi}"
        elif pmid:
            url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
        else:
            url = f"https://europepmc.org/article/{item.get('source', 'MED')}/{item.get('id', '')}"
        pub_type = (item.get("pubType") or "").lower()
        docs.append(
            _doc(
                title=clean_text(item.get("title")) or "Untitled article",
                url=url,
                snippet=clean_text(item.get("abstractText"))[:1400],
                publisher=clean_text(item.get("journalTitle"))
                or clean_text((item.get("journalInfo") or {}).get("journal", {}).get("title"))
                or "Europe PMC",
                published_at=item.get("firstPublicationDate") or item.get("pubYear"),
                provider="europepmc",
                doi=doi,
                cited_by_count=int(item.get("citedByCount") or 0),
                is_peer_reviewed=True,
                is_oa=item.get("isOpenAccess") == "Y",
                doc_type="review" if "review" in pub_type else "article",
                query=query,
            )
        )
    return docs


# --------------------------------------------------------------------------
async def search_crossref(query: str, limit: int = 5) -> list[RetrievedDoc]:
    client = await http()
    params = {"query": query, "rows": str(limit), "select": (
        "DOI,title,container-title,publisher,issued,type,is-referenced-by-count,abstract,URL"
    )}
    try:
        response = await client.get("https://api.crossref.org/works", params=params)
        response.raise_for_status()
        items = (response.json().get("message") or {}).get("items") or []
    except Exception as exc:
        log.warning("crossref failed for %r: %s", query, exc)
        return []

    docs: list[RetrievedDoc] = []
    for item in items:
        titles = item.get("title") or []
        containers = item.get("container-title") or []
        parts = ((item.get("issued") or {}).get("date-parts") or [[None]])[0]
        published = "-".join(str(p) for p in parts if p) if parts and parts[0] else None
        doi = item.get("DOI")
        item_type = item.get("type") or ""
        docs.append(
            _doc(
                title=clean_text(titles[0] if titles else "") or "Untitled work",
                url=item.get("URL") or (f"https://doi.org/{doi}" if doi else ""),
                snippet=clean_text(item.get("abstract"))[:1200],
                publisher=clean_text(containers[0] if containers else item.get("publisher") or ""),
                published_at=published,
                provider="crossref",
                doi=doi,
                cited_by_count=int(item.get("is-referenced-by-count") or 0),
                is_peer_reviewed=item_type in ("journal-article", "proceedings-article"),
                doc_type=item_type,
                query=query,
            )
        )
    return docs


# --------------------------------------------------------------------------
async def search_wikipedia(query: str, limit: int = 3) -> list[RetrievedDoc]:
    client = await http()
    params = {
        "action": "query",
        "format": "json",
        "list": "search",
        "srsearch": query,
        "srlimit": str(limit),
        "srprop": "snippet|timestamp",
    }
    try:
        response = await client.get("https://en.wikipedia.org/w/api.php", params=params)
        response.raise_for_status()
        hits = ((response.json().get("query") or {}).get("search")) or []
    except Exception as exc:
        log.warning("wikipedia failed for %r: %s", query, exc)
        return []

    docs: list[RetrievedDoc] = []
    for hit in hits:
        title = hit.get("title", "")
        docs.append(
            _doc(
                title=title,
                url=f"https://en.wikipedia.org/wiki/{quote_plus(title.replace(' ', '_'))}",
                snippet=clean_text(hit.get("snippet")),
                publisher="Wikipedia",
                published_at=hit.get("timestamp"),
                provider="wikipedia",
                doc_type="encyclopedia",
                query=query,
            )
        )
    return docs


# --------------------------------------------------------------------------
_DDG_RESULT = re.compile(
    r'result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>.*?'
    r'(?:result__snippet"[^>]*>(.*?)</a>)?',
    re.S,
)


def _unwrap_ddg(href: str) -> str:
    """DuckDuckGo wraps outbound links in a redirector; pull the real URL out."""
    if "duckduckgo.com/l/" in href or href.startswith("//duckduckgo.com/l/"):
        qs = parse_qs(urlparse("https:" + href if href.startswith("//") else href).query)
        target = qs.get("uddg", [None])[0]
        if target:
            return target
    if href.startswith("//"):
        return "https:" + href
    return href


async def search_duckduckgo(query: str, limit: int = 6) -> list[RetrievedDoc]:
    client = await http()
    try:
        response = await client.post(
            "https://html.duckduckgo.com/html/",
            data={"q": query},
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
                ),
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        response.raise_for_status()
        html = response.text
    except Exception as exc:
        log.warning("duckduckgo failed for %r: %s", query, exc)
        return []

    docs: list[RetrievedDoc] = []
    seen: set[str] = set()
    for match in _DDG_RESULT.finditer(html):
        if len(docs) >= limit:
            break
        url = _unwrap_ddg(match.group(1) or "")
        title = clean_text(match.group(2))
        snippet = clean_text(match.group(3) or "")
        if not url.startswith("http") or not title:
            continue
        key = normalise_url(url)
        if key in seen:
            continue
        seen.add(key)
        host = urlparse(url).netloc.lower().removeprefix("www.")
        docs.append(
            _doc(
                title=title,
                url=url,
                snippet=snippet,
                publisher=host,
                provider="duckduckgo",
                doc_type="web",
                query=query,
            )
        )
    return docs


# --------------------------------------------------------------------------
# Crossref's public pool rate-limits hard under concurrent fan-out, and its
# metadata largely duplicates OpenAlex, so it queues behind a small semaphore
# rather than being dropped.
_CROSSREF_GATE = asyncio.Semaphore(2)


async def search_crossref_polite(query: str, limit: int = 5) -> list[RetrievedDoc]:
    async with _CROSSREF_GATE:
        docs = await search_crossref(query, limit)
    if not docs:
        await asyncio.sleep(0.35)
    return docs


PROVIDERS = {
    "openalex": search_openalex,
    "europepmc": search_europepmc,
    "crossref": search_crossref_polite,
    "wikipedia": search_wikipedia,
    "duckduckgo": search_duckduckgo,
}

# Scholarly claims and everyday claims need different mixes. The planner picks
# a profile per claim so a pop-culture claim does not waste four academic calls.
PROFILES: dict[str, list[tuple[str, int]]] = {
    "scientific": [
        ("openalex", 6), ("europepmc", 5), ("crossref", 3),
        ("duckduckgo", 5), ("wikipedia", 2),
    ],
    "general": [
        ("duckduckgo", 7), ("wikipedia", 3), ("openalex", 3), ("crossref", 2),
    ],
    "balanced": [
        ("openalex", 4), ("duckduckgo", 6), ("wikipedia", 2),
        ("europepmc", 3), ("crossref", 2),
    ],
}


async def search_all(
    query: str, profile: str = "balanced", agent: str = "researcher"
) -> list[RetrievedDoc]:
    """Fan out one query across the profile's providers, concurrently."""
    plan = PROFILES.get(profile, PROFILES["balanced"])
    tasks = [PROVIDERS[name](query, limit) for name, limit in plan if name in PROVIDERS]
    settled = await asyncio.gather(*tasks, return_exceptions=True)

    docs: list[RetrievedDoc] = []
    for result in settled:
        if isinstance(result, BaseException):
            continue
        for doc in result:
            doc.agent = agent
            docs.append(doc)
    return docs

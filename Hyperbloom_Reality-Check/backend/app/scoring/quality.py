"""Source quality scoring (PRD section 15).

Five sub-scores, each 0-100, combined into an overall figure the UI shows as
a breakdown rather than a bare number. The point is that a user can disagree
with any one axis and see exactly how much it moved the result.

The scoring is deterministic and metadata-driven. The model contributes only
the relevance judgement; authority, evidence quality, recency and
independence come from retrieved facts, so the score cannot be talked up by
a persuasive page.
"""
from __future__ import annotations

from datetime import datetime, timezone

from ..retrieval.base import registrable_domain, year_of
from ..schemas import QualityBreakdown, RetrievedDoc, SourceTier

# --------------------------------------------------------------------------
# Authority
# --------------------------------------------------------------------------
_TLD_AUTHORITY: list[tuple[tuple[str, ...], int, SourceTier]] = [
    ((".gov", ".gov.uk", ".gov.au", ".mil", ".europa.eu"), 93, SourceTier.GOVERNMENT),
    ((".edu", ".ac.uk", ".edu.au", ".ac.jp"), 88, SourceTier.ACADEMIC),
    ((".int",), 88, SourceTier.INSTITUTIONAL),
]

_DOMAIN_AUTHORITY: dict[str, tuple[int, SourceTier]] = {
    # Primary research and preprint infrastructure
    "nature.com": (95, SourceTier.PRIMARY_RESEARCH),
    "science.org": (95, SourceTier.PRIMARY_RESEARCH),
    "nejm.org": (96, SourceTier.PRIMARY_RESEARCH),
    "thelancet.com": (95, SourceTier.PRIMARY_RESEARCH),
    "bmj.com": (93, SourceTier.PRIMARY_RESEARCH),
    "jamanetwork.com": (94, SourceTier.PRIMARY_RESEARCH),
    "cell.com": (93, SourceTier.PRIMARY_RESEARCH),
    "pnas.org": (93, SourceTier.PRIMARY_RESEARCH),
    "cochranelibrary.com": (96, SourceTier.PRIMARY_RESEARCH),
    "nih.gov": (94, SourceTier.GOVERNMENT),
    "ncbi.nlm.nih.gov": (92, SourceTier.PRIMARY_RESEARCH),
    "pubmed.ncbi.nlm.nih.gov": (92, SourceTier.PRIMARY_RESEARCH),
    "europepmc.org": (90, SourceTier.PRIMARY_RESEARCH),
    "doi.org": (85, SourceTier.PRIMARY_RESEARCH),
    "arxiv.org": (74, SourceTier.ACADEMIC),
    "biorxiv.org": (70, SourceTier.ACADEMIC),
    "medrxiv.org": (70, SourceTier.ACADEMIC),
    "plos.org": (87, SourceTier.PRIMARY_RESEARCH),
    "frontiersin.org": (76, SourceTier.ACADEMIC),
    "springer.com": (86, SourceTier.ACADEMIC),
    "sciencedirect.com": (88, SourceTier.ACADEMIC),
    "wiley.com": (86, SourceTier.ACADEMIC),
    "tandfonline.com": (83, SourceTier.ACADEMIC),
    "sagepub.com": (83, SourceTier.ACADEMIC),
    "oup.com": (87, SourceTier.ACADEMIC),
    "cambridge.org": (88, SourceTier.ACADEMIC),
    "jstor.org": (86, SourceTier.ACADEMIC),
    "semanticscholar.org": (80, SourceTier.ACADEMIC),
    "mdpi.com": (62, SourceTier.ACADEMIC),
    # Government and intergovernmental
    "who.int": (93, SourceTier.INSTITUTIONAL),
    "cdc.gov": (93, SourceTier.GOVERNMENT),
    "fda.gov": (92, SourceTier.GOVERNMENT),
    "nasa.gov": (94, SourceTier.GOVERNMENT),
    "noaa.gov": (93, SourceTier.GOVERNMENT),
    "epa.gov": (90, SourceTier.GOVERNMENT),
    "nhs.uk": (90, SourceTier.GOVERNMENT),
    "ec.europa.eu": (89, SourceTier.GOVERNMENT),
    "un.org": (86, SourceTier.INSTITUTIONAL),
    "worldbank.org": (87, SourceTier.INSTITUTIONAL),
    "oecd.org": (87, SourceTier.INSTITUTIONAL),
    "imf.org": (87, SourceTier.INSTITUTIONAL),
    "census.gov": (93, SourceTier.GOVERNMENT),
    "bls.gov": (93, SourceTier.GOVERNMENT),
    "ipcc.ch": (93, SourceTier.INSTITUTIONAL),
    # Expert organisations
    "mayoclinic.org": (85, SourceTier.EXPERT_ORG),
    "hopkinsmedicine.org": (87, SourceTier.EXPERT_ORG),
    "health.harvard.edu": (86, SourceTier.EXPERT_ORG),
    "clevelandclinic.org": (83, SourceTier.EXPERT_ORG),
    "heart.org": (85, SourceTier.EXPERT_ORG),
    "cancer.org": (85, SourceTier.EXPERT_ORG),
    "nationalacademies.org": (92, SourceTier.INSTITUTIONAL),
    # Journalism
    "reuters.com": (84, SourceTier.JOURNALISM),
    "apnews.com": (85, SourceTier.JOURNALISM),
    "bbc.com": (81, SourceTier.JOURNALISM),
    "bbc.co.uk": (81, SourceTier.JOURNALISM),
    "npr.org": (79, SourceTier.JOURNALISM),
    "nytimes.com": (78, SourceTier.JOURNALISM),
    "washingtonpost.com": (77, SourceTier.JOURNALISM),
    "theguardian.com": (76, SourceTier.JOURNALISM),
    "economist.com": (80, SourceTier.JOURNALISM),
    "ft.com": (80, SourceTier.JOURNALISM),
    "wsj.com": (78, SourceTier.JOURNALISM),
    "bloomberg.com": (78, SourceTier.JOURNALISM),
    "scientificamerican.com": (80, SourceTier.JOURNALISM),
    "newscientist.com": (74, SourceTier.JOURNALISM),
    "nationalgeographic.com": (76, SourceTier.JOURNALISM),
    "arstechnica.com": (72, SourceTier.JOURNALISM),
    # Fact-checking outfits
    "snopes.com": (74, SourceTier.EXPERT_ORG),
    "factcheck.org": (80, SourceTier.EXPERT_ORG),
    "politifact.com": (75, SourceTier.EXPERT_ORG),
    "fullfact.org": (79, SourceTier.EXPERT_ORG),
    # Reference
    "wikipedia.org": (64, SourceTier.REFERENCE),
    "britannica.com": (74, SourceTier.REFERENCE),
    "ourworldindata.org": (84, SourceTier.REFERENCE),
    # Low-authority surfaces
    "medium.com": (32, SourceTier.BLOG_SOCIAL),
    "substack.com": (34, SourceTier.BLOG_SOCIAL),
    "reddit.com": (24, SourceTier.BLOG_SOCIAL),
    "quora.com": (20, SourceTier.BLOG_SOCIAL),
    "x.com": (20, SourceTier.BLOG_SOCIAL),
    "twitter.com": (20, SourceTier.BLOG_SOCIAL),
    "facebook.com": (18, SourceTier.BLOG_SOCIAL),
    "tiktok.com": (14, SourceTier.BLOG_SOCIAL),
    "instagram.com": (16, SourceTier.BLOG_SOCIAL),
    "youtube.com": (28, SourceTier.BLOG_SOCIAL),
    "pinterest.com": (14, SourceTier.BLOG_SOCIAL),
    "blogspot.com": (22, SourceTier.BLOG_SOCIAL),
    "wordpress.com": (26, SourceTier.BLOG_SOCIAL),
    "healthline.com": (54, SourceTier.SECONDARY),
    "webmd.com": (58, SourceTier.SECONDARY),
}

_COMMERCIAL_HINTS = ("shop", "store", "buy", "supplement", "product", "offer", "deal")


def classify_source(doc: RetrievedDoc) -> tuple[int, SourceTier]:
    """Return (authority score, tier) for a retrieved document."""
    domain = registrable_domain(doc.url or "")

    if domain in _DOMAIN_AUTHORITY:
        score, tier = _DOMAIN_AUTHORITY[domain]
        return score, tier

    for suffixes, score, tier in _TLD_AUTHORITY:
        if any(domain.endswith(s.lstrip(".")) or domain.endswith(s) for s in suffixes):
            return score, tier

    # Scholarly provenance beats an unrecognised domain.
    if doc.provider in ("openalex", "europepmc", "crossref"):
        if doc.is_peer_reviewed:
            return 80, SourceTier.ACADEMIC
        return 68, SourceTier.ACADEMIC
    if doc.provider == "wikipedia":
        return 64, SourceTier.REFERENCE

    lowered = f"{domain} {doc.url}".lower()
    if any(hint in lowered for hint in _COMMERCIAL_HINTS):
        return 30, SourceTier.SECONDARY

    return 45, SourceTier.UNKNOWN


# --------------------------------------------------------------------------
def score_evidence_quality(doc: RetrievedDoc) -> int:
    """Does the source contain primary data, methodology, citations?"""
    score = 40

    if doc.is_peer_reviewed:
        score += 18
    if doc.doi:
        score += 8

    doc_type = (doc.doc_type or "").lower()
    if "review" in doc_type or "meta" in doc_type:
        score += 14  # systematic reviews and meta-analyses sit at the top
    elif doc_type in ("article", "journal-article", "proceedings-article"):
        score += 8
    elif doc_type in ("web", "encyclopedia"):
        score -= 6
    elif doc_type in ("posted-content", "preprint"):
        score -= 4

    citations = doc.cited_by_count
    if citations >= 1000:
        score += 16
    elif citations >= 250:
        score += 13
    elif citations >= 50:
        score += 9
    elif citations >= 10:
        score += 5

    text = f"{doc.snippet} {doc.full_text}".lower()
    if text:
        for marker, bonus in (
            ("meta-analys", 6), ("systematic review", 6), ("randomi", 5),
            ("cohort", 4), ("confidence interval", 4), ("p <", 3), ("p<", 3),
            ("sample size", 3), ("methodolog", 3), ("participants", 2),
        ):
            if marker in text:
                score += bonus
        for marker, penalty in (
            ("sponsored", 6), ("advertorial", 8), ("affiliate", 6),
            ("buy now", 8), ("miracle", 6), ("shocking", 4),
        ):
            if marker in text:
                score -= penalty

    if doc.is_oa:
        score += 3  # verifiable in full, not paywalled

    return max(0, min(100, score))


def score_recency(doc: RetrievedDoc, *, half_life_years: float = 9.0) -> int:
    """Newer evidence scores higher, but age alone is never disqualifying."""
    year = year_of(doc.published_at)
    if not year:
        return 50
    age = max(0, datetime.now(timezone.utc).year - year)
    if age <= 1:
        return 97
    decayed = 97 * (0.5 ** ((age - 1) / half_life_years))
    return max(18, min(100, int(round(decayed))))


def combine(
    *, authority: int, evidence_quality: int, recency: int,
    relevance: int, independence: int,
) -> QualityBreakdown:
    """Weighted blend. Relevance and authority dominate by design."""
    overall = (
        authority * 0.28
        + evidence_quality * 0.26
        + relevance * 0.24
        + recency * 0.11
        + independence * 0.11
    )
    return QualityBreakdown(
        authority=authority,
        evidence_quality=evidence_quality,
        recency=recency,
        relevance=relevance,
        independence=independence,
        overall=int(round(max(0, min(100, overall)))),
    )

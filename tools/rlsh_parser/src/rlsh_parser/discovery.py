from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
import logging
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from .http import HttpClient

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class DiscoveryResult:
    hero_urls: list[str]
    pages_seen: int
    pages_failed: int
    raw_candidate_links: int = 0
    rejected_candidate_links: int = 0
    failures: list[dict[str, str]] = field(default_factory=list)


def discover_hero_urls(base_url: str, client: HttpClient, max_pages: int | None = None) -> DiscoveryResult:
    queue = deque([base_url])
    visited_pages: set[str] = set()
    hero_urls: set[str] = set()
    pages_seen = 0
    pages_failed = 0
    raw_candidate_links = 0
    rejected_candidate_links = 0
    failures: list[dict[str, str]] = []

    while queue:
        page_url = queue.popleft()
        if page_url in visited_pages:
            continue
        if max_pages is not None and pages_seen >= max_pages:
            break

        visited_pages.add(page_url)
        pages_seen += 1

        try:
            _, html = client.get_text(page_url)
        except Exception as error:
            pages_failed += 1
            message = str(error)
            failures.append({"url": page_url, "error": message})
            logger.warning("Failed to discover category page: %s (%s)", page_url, message)
            continue

        soup = BeautifulSoup(html, "html.parser")

        page_hero_urls, pagination_targets, page_raw, page_rejected = _extract_category_links(soup, page_url, base_url)
        hero_urls.update(page_hero_urls)
        raw_candidate_links += page_raw
        rejected_candidate_links += page_rejected

        for target in pagination_targets:
            if target not in visited_pages:
                queue.append(target)

    return DiscoveryResult(
        hero_urls=sorted(hero_urls),
        pages_seen=pages_seen,
        pages_failed=pages_failed,
        raw_candidate_links=raw_candidate_links,
        rejected_candidate_links=rejected_candidate_links,
        failures=failures,
    )


def _looks_like_hero_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.netloc != "wiki.rlsh.net":
        return False
    path = parsed.path or ""
    if not path.startswith("/wiki/"):
        return False
    title = path.replace("/wiki/", "", 1)
    if not title:
        return False
    if ":" in title:
        return False
    return True


def _extract_category_links(soup: BeautifulSoup, page_url: str, base_url: str) -> tuple[set[str], set[str], int, int]:
    hero_urls: set[str] = set()
    pagination_targets: set[str] = set()
    raw_candidate_links = 0
    rejected_candidate_links = 0

    category_containers = soup.select("#mw-pages .mw-category, #mw-pages, .mw-category")
    anchors = [anchor for container in category_containers for anchor in container.select("a[href]")]

    if not anchors:
        anchors = soup.select("a[href]")

    for anchor in anchors:
        href = anchor.get("href")
        if not href:
            continue
        raw_candidate_links += 1
        full_url = urljoin(page_url, href)
        if _looks_like_hero_url(full_url):
            hero_urls.add(full_url)
        else:
            rejected_candidate_links += 1

    for anchor in soup.select("a[href]"):
        href = anchor.get("href")
        if not href:
            continue
        full_url = urljoin(page_url, href)
        text = anchor.get_text(" ", strip=True).lower()

        if _is_pagination_url(full_url, base_url) or "next page" in text:
            pagination_targets.add(full_url)

    return hero_urls, pagination_targets, raw_candidate_links, rejected_candidate_links


def _is_pagination_url(url: str, base_url: str) -> bool:
    parsed = urlparse(url)
    if parsed.netloc != "wiki.rlsh.net":
        return False

    if "pagefrom=" in (parsed.query or "") and "Category:RLSH_Directory" in (parsed.query or ""):
        return True

    if re.search(r"[?&]from=", url, flags=re.IGNORECASE):
        return True

    base_parsed = urlparse(base_url)
    return parsed.path == base_parsed.path and "from=" in (parsed.query or "")
from __future__ import annotations

from dataclasses import dataclass, field
import logging

from .cache import read_cached_html, write_cached_html
from .config import ParserConfig
from .http import HttpClient

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class FetchResult:
    pages: dict[str, tuple[str, str]]
    attempted: int
    fetched: int
    cache_hits: int
    failed: int
    failures: list[dict[str, str]] = field(default_factory=list)


def fetch_pages(urls: list[str], config: ParserConfig, client: HttpClient) -> FetchResult:
    result: dict[str, tuple[str, str]] = {}
    failures: list[dict[str, str]] = []
    cache_hits = 0

    for url in urls:
        if not config.force_refresh:
            cached_html = read_cached_html(config.cache_dir, url)
            if cached_html is not None:
                result[url] = (url, cached_html)
                cache_hits += 1
                continue

        try:
            canonical_url, html = client.get_text(url)
            write_cached_html(config.cache_dir, url, html)
            result[url] = (canonical_url, html)
        except Exception as error:
            message = str(error)
            logger.warning("Failed to fetch page: %s (%s)", url, message)
            failures.append({"url": url, "error": message})

    return FetchResult(
        pages=result,
        attempted=len(urls),
        fetched=len(result),
        cache_hits=cache_hits,
        failed=len(failures),
        failures=failures,
    )
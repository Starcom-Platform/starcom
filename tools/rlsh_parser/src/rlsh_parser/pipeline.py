from __future__ import annotations

from dataclasses import dataclass, field
import logging
from time import perf_counter

from .config import ParserConfig
from .discovery import discover_hero_urls
from .fetcher import fetch_pages
from .geocode import geocode_from_location_text, parse_embedded_coordinates
from .http import HttpClient
from .models import HeroEntry
from .output import write_chunked_output
from .parser import parse_hero_page

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class PipelineReport:
    status: str
    started_at: float
    duration_seconds: float
    urls_discovered: int
    discovery_pages_seen: int
    discovery_pages_failed: int
    discovery_raw_candidate_links: int
    discovery_rejected_candidate_links: int
    discovery_noise_ratio: float
    pages_attempted: int
    pages_fetched: int
    pages_failed: int
    cache_hits: int
    entries_parsed: int
    parse_failed: int
    output_summary: dict[str, object] = field(default_factory=dict)
    failures: list[dict[str, str]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        return {
            "status": self.status,
            "started_at": self.started_at,
            "duration_seconds": round(self.duration_seconds, 3),
            "urls_discovered": self.urls_discovered,
            "discovery_pages_seen": self.discovery_pages_seen,
            "discovery_pages_failed": self.discovery_pages_failed,
            "discovery_raw_candidate_links": self.discovery_raw_candidate_links,
            "discovery_rejected_candidate_links": self.discovery_rejected_candidate_links,
            "discovery_noise_ratio": round(self.discovery_noise_ratio, 4),
            "pages_attempted": self.pages_attempted,
            "pages_fetched": self.pages_fetched,
            "pages_failed": self.pages_failed,
            "cache_hits": self.cache_hits,
            "entries_parsed": self.entries_parsed,
            "parse_failed": self.parse_failed,
            "output_summary": self.output_summary,
            "failures": self.failures,
            "warnings": self.warnings,
        }


def run_pipeline(config: ParserConfig) -> dict[str, object]:
    started = perf_counter()
    client = HttpClient(
        timeout_seconds=config.request_timeout_seconds,
        max_retries=config.max_retries,
        min_delay_seconds=config.request_delay_seconds,
    )

    logger.info("Discovering hero URLs from %s", config.base_url)
    discovery = discover_hero_urls(config.base_url, client, max_pages=config.max_pages)
    hero_urls = discovery.hero_urls
    logger.info("Discovered %s hero URLs", len(hero_urls))
    discovery_noise_ratio = _compute_noise_ratio(discovery.raw_candidate_links, discovery.rejected_candidate_links)

    if len(hero_urls) == 0:
        report = PipelineReport(
            status="failure",
            started_at=started,
            duration_seconds=perf_counter() - started,
            urls_discovered=0,
            discovery_pages_seen=discovery.pages_seen,
            discovery_pages_failed=discovery.pages_failed,
            discovery_raw_candidate_links=discovery.raw_candidate_links,
            discovery_rejected_candidate_links=discovery.rejected_candidate_links,
            discovery_noise_ratio=discovery_noise_ratio,
            pages_attempted=0,
            pages_fetched=0,
            pages_failed=0,
            cache_hits=0,
            entries_parsed=0,
            parse_failed=0,
            output_summary={},
            failures=[
                *[{"stage": "discovery", **item} for item in discovery.failures],
                {"stage": "discovery", "url": config.base_url, "error": "zero-urls-discovered"},
            ],
            warnings=["Discovery returned zero hero URLs; verify selectors/filtering against live category HTML."],
        )
        return report.to_dict()

    logger.info("Fetching hero pages with cache dir: %s", config.cache_dir)
    fetch_result = fetch_pages(hero_urls, config=config, client=client)
    logger.info("Fetched %s pages", fetch_result.fetched)

    entries: list[HeroEntry] = []
    failures = [
        *[{"stage": "discovery", **item} for item in discovery.failures],
        *[{"stage": "fetch", **item} for item in fetch_result.failures],
    ]
    parse_failed = 0

    for source_url, (canonical_url, html) in fetch_result.pages.items():
        try:
            raw = parse_hero_page(source_url, canonical_url, html)
            entries.append(_normalize_entry(raw))
        except Exception as error:
            parse_failed += 1
            message = str(error)
            failures.append({"stage": "parse", "url": source_url, "error": message})
            logger.warning("Failed to parse page: %s (%s)", source_url, message)

    logger.info("Parsed %s entries", len(entries))
    output_summary = write_chunked_output(config.output_dir, entries, config.chunk_size)
    logger.info("Wrote output to %s", config.output_dir)

    total_attempted = max(1, fetch_result.attempted)
    failed_total = fetch_result.failed + parse_failed
    failure_ratio = failed_total / total_attempted
    parse_failure_ratio = parse_failed / max(1, fetch_result.fetched)
    warnings: list[str] = []

    status = "success"
    if fetch_result.fetched < config.min_successful_pages or len(entries) == 0:
        status = "failure"
        warnings.append("No sufficient successful pages or parsed entries.")
    elif config.strict and len(hero_urls) < config.min_discovered_urls:
        status = "failure"
        warnings.append(
            f"Strict mode: discovered URLs {len(hero_urls)} below minimum {config.min_discovered_urls}."
        )
    elif config.strict and discovery_noise_ratio > config.max_namespace_noise_ratio:
        status = "failure"
        warnings.append(
            "Strict mode: discovery namespace noise ratio "
            f"{discovery_noise_ratio:.2f} exceeded {config.max_namespace_noise_ratio:.2f}."
        )
    elif config.strict and parse_failure_ratio > config.max_parse_failure_ratio:
        status = "failure"
        warnings.append(
            f"Strict mode: parse failure ratio {parse_failure_ratio:.2f} exceeded {config.max_parse_failure_ratio:.2f}."
        )
    elif failure_ratio > config.max_failure_ratio or discovery.pages_failed > 0:
        status = "degraded"
        warnings.append(
            f"Failure ratio {failure_ratio:.2f} exceeded threshold {config.max_failure_ratio:.2f}"
            if failure_ratio > config.max_failure_ratio
            else "Discovery encountered failed pages."
        )

    report = PipelineReport(
        status=status,
        started_at=started,
        duration_seconds=perf_counter() - started,
        urls_discovered=len(hero_urls),
        discovery_pages_seen=discovery.pages_seen,
        discovery_pages_failed=discovery.pages_failed,
        discovery_raw_candidate_links=discovery.raw_candidate_links,
        discovery_rejected_candidate_links=discovery.rejected_candidate_links,
        discovery_noise_ratio=discovery_noise_ratio,
        pages_attempted=fetch_result.attempted,
        pages_fetched=fetch_result.fetched,
        pages_failed=fetch_result.failed,
        cache_hits=fetch_result.cache_hits,
        entries_parsed=len(entries),
        parse_failed=parse_failed,
        output_summary=output_summary,
        failures=failures,
        warnings=warnings,
    )
    return report.to_dict()


def run_preflight(config: ParserConfig) -> dict[str, object]:
    started = perf_counter()
    client = HttpClient(
        timeout_seconds=config.request_timeout_seconds,
        max_retries=config.max_retries,
        min_delay_seconds=config.request_delay_seconds,
    )

    logger.info("Running discovery preflight for %s", config.base_url)
    discovery = discover_hero_urls(config.base_url, client, max_pages=config.max_pages)
    hero_urls = discovery.hero_urls
    discovery_noise_ratio = _compute_noise_ratio(discovery.raw_candidate_links, discovery.rejected_candidate_links)

    failures = [{"stage": "discovery", **item} for item in discovery.failures]
    warnings: list[str] = []
    status = "success"

    if len(hero_urls) == 0:
        status = "failure"
        failures.append({"stage": "discovery", "url": config.base_url, "error": "zero-urls-discovered"})
        warnings.append("Discovery returned zero hero URLs; verify selectors/filtering against live category HTML.")
    elif config.strict and len(hero_urls) < config.min_discovered_urls:
        status = "failure"
        warnings.append(f"Strict mode: discovered URLs {len(hero_urls)} below minimum {config.min_discovered_urls}.")
    elif config.strict and discovery_noise_ratio > config.max_namespace_noise_ratio:
        status = "failure"
        warnings.append(
            "Strict mode: discovery namespace noise ratio "
            f"{discovery_noise_ratio:.2f} exceeded {config.max_namespace_noise_ratio:.2f}."
        )
    elif discovery.pages_failed > 0:
        status = "degraded"
        warnings.append("Discovery encountered failed pages.")

    report = PipelineReport(
        status=status,
        started_at=started,
        duration_seconds=perf_counter() - started,
        urls_discovered=len(hero_urls),
        discovery_pages_seen=discovery.pages_seen,
        discovery_pages_failed=discovery.pages_failed,
        discovery_raw_candidate_links=discovery.raw_candidate_links,
        discovery_rejected_candidate_links=discovery.rejected_candidate_links,
        discovery_noise_ratio=discovery_noise_ratio,
        pages_attempted=0,
        pages_fetched=0,
        pages_failed=0,
        cache_hits=0,
        entries_parsed=0,
        parse_failed=0,
        output_summary={},
        failures=failures,
        warnings=warnings,
    )
    return report.to_dict()


def _normalize_entry(raw) -> HeroEntry:
    infobox = raw.infobox

    name = (
        infobox.get("hero")
        or infobox.get("name")
        or raw.title
        or raw.canonical_url.rsplit("/", 1)[-1].replace("_", " ")
    )

    aliases = _split_multi(infobox.get("alias(es)") or infobox.get("aliases") or "")
    team = _split_multi(infobox.get("team") or "")
    affiliates = _split_multi(infobox.get("affiliates") or "")

    location_text = infobox.get("location") or infobox.get("base")
    lat, lon, conf = parse_embedded_coordinates(location_text)
    if lat is None or lon is None:
        glat, glon, gconf = geocode_from_location_text(location_text)
        lat = lat if lat is not None else glat
        lon = lon if lon is not None else glon
        conf = conf if conf is not None else gconf

    return HeroEntry(
        name=name,
        aliases=aliases,
        identity=infobox.get("identity"),
        category=infobox.get("category"),
        status=infobox.get("status"),
        team=team,
        affiliates=affiliates,
        foes=infobox.get("foes"),
        actions=infobox.get("actions") or infobox.get("activity"),
        location_text=location_text,
        latitude=lat,
        longitude=lon,
        geoint_confidence=conf,
        image_url=infobox.get("image"),
        symbol_image_url=infobox.get("symbol_image"),
        equipment=infobox.get("equipment"),
        abilities=infobox.get("abilities"),
        full_text=raw.page_text,
        source_url=raw.canonical_url,
    )


def _split_multi(value: str) -> list[str]:
    normalized = value.replace(";", ",").replace("|", ",")
    tokens = [part.strip() for part in normalized.split(",")]
    return [token for token in tokens if token]


def _compute_noise_ratio(raw_candidate_links: int, rejected_candidate_links: int) -> float:
    if raw_candidate_links <= 0:
        return 0.0
    return rejected_candidate_links / raw_candidate_links
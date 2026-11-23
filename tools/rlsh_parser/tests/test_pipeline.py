from __future__ import annotations

from types import SimpleNamespace
from pathlib import Path

from rlsh_parser.config import ParserConfig
from rlsh_parser.discovery import DiscoveryResult
from rlsh_parser.fetcher import FetchResult
from rlsh_parser import pipeline


def make_config(tmp_path: Path) -> ParserConfig:
    return ParserConfig(
        base_url="https://wiki.rlsh.net/wiki/Category:RLSH_Directory",
        cache_dir=tmp_path / ".cache",
        output_dir=tmp_path / "output",
        max_failure_ratio=0.35,
        min_successful_pages=1,
    )


def _raw(title: str) -> SimpleNamespace:
    return SimpleNamespace(
        title=title,
        canonical_url=f"https://wiki.rlsh.net/wiki/{title}",
        infobox={
            "hero": title,
            "location": "New York, USA",
            "aliases": "A, B",
        },
        page_text="body",
    )


def test_pipeline_success(monkeypatch, tmp_path: Path) -> None:
    config = make_config(tmp_path)

    monkeypatch.setattr(
        pipeline,
        "discover_hero_urls",
        lambda base, client, max_pages=None: DiscoveryResult(
            hero_urls=["u1", "u2"], pages_seen=1, pages_failed=0, failures=[]
        ),
    )
    monkeypatch.setattr(
        pipeline,
        "fetch_pages",
        lambda urls, config, client: FetchResult(
            pages={"u1": ("u1", "<html/>"), "u2": ("u2", "<html/>")},
            attempted=2,
            fetched=2,
            cache_hits=0,
            failed=0,
            failures=[],
        ),
    )
    monkeypatch.setattr(pipeline, "parse_hero_page", lambda source_url, canonical_url, html: _raw(source_url))
    monkeypatch.setattr(
        pipeline,
        "write_chunked_output",
        lambda output_dir, entries, chunk_size: {"total_entries": len(entries), "chunks": []},
    )

    result = pipeline.run_pipeline(config)

    assert result["status"] == "success"
    assert result["entries_parsed"] == 2
    assert result["parse_failed"] == 0
    assert result["pages_failed"] == 0
    assert result["discovery_raw_candidate_links"] == 0
    assert result["discovery_rejected_candidate_links"] == 0
    assert result["discovery_noise_ratio"] == 0.0


def test_pipeline_degraded_on_failure_ratio(monkeypatch, tmp_path: Path) -> None:
    config = make_config(tmp_path)

    monkeypatch.setattr(
        pipeline,
        "discover_hero_urls",
        lambda base, client, max_pages=None: DiscoveryResult(
            hero_urls=["u1", "u2"], pages_seen=1, pages_failed=0, failures=[]
        ),
    )
    monkeypatch.setattr(
        pipeline,
        "fetch_pages",
        lambda urls, config, client: FetchResult(
            pages={"u1": ("u1", "<html/>"), "u2": ("u2", "<html/>")},
            attempted=2,
            fetched=2,
            cache_hits=0,
            failed=0,
            failures=[],
        ),
    )

    def parse_maybe_fail(source_url: str, canonical_url: str, html: str):
        if source_url == "u2":
            raise RuntimeError("parse fail")
        return _raw(source_url)

    monkeypatch.setattr(pipeline, "parse_hero_page", parse_maybe_fail)
    monkeypatch.setattr(
        pipeline,
        "write_chunked_output",
        lambda output_dir, entries, chunk_size: {"total_entries": len(entries), "chunks": []},
    )

    result = pipeline.run_pipeline(config)

    assert result["status"] == "degraded"
    assert result["parse_failed"] == 1
    assert any(item["stage"] == "parse" for item in result["failures"])


def test_pipeline_failure_when_no_successful_pages(monkeypatch, tmp_path: Path) -> None:
    config = make_config(tmp_path)

    monkeypatch.setattr(
        pipeline,
        "discover_hero_urls",
        lambda base, client, max_pages=None: DiscoveryResult(
            hero_urls=["u1"], pages_seen=1, pages_failed=0, failures=[]
        ),
    )
    monkeypatch.setattr(
        pipeline,
        "fetch_pages",
        lambda urls, config, client: FetchResult(
            pages={},
            attempted=1,
            fetched=0,
            cache_hits=0,
            failed=1,
            failures=[{"url": "u1", "error": "boom"}],
        ),
    )
    monkeypatch.setattr(
        pipeline,
        "write_chunked_output",
        lambda output_dir, entries, chunk_size: {"total_entries": len(entries), "chunks": []},
    )

    result = pipeline.run_pipeline(config)

    assert result["status"] == "failure"
    assert result["entries_parsed"] == 0
    assert result["pages_fetched"] == 0


def test_pipeline_failure_when_discovery_returns_zero_urls(monkeypatch, tmp_path: Path) -> None:
    config = make_config(tmp_path)

    monkeypatch.setattr(
        pipeline,
        "discover_hero_urls",
        lambda base, client, max_pages=None: DiscoveryResult(
            hero_urls=[], pages_seen=1, pages_failed=0, failures=[]
        ),
    )

    result = pipeline.run_pipeline(config)

    assert result["status"] == "failure"
    assert result["urls_discovered"] == 0
    assert result["pages_attempted"] == 0
    assert any(item["error"] == "zero-urls-discovered" for item in result["failures"])


def test_pipeline_strict_fails_when_discovery_too_small(monkeypatch, tmp_path: Path) -> None:
    config = make_config(tmp_path)
    config.strict = True
    config.min_discovered_urls = 3

    monkeypatch.setattr(
        pipeline,
        "discover_hero_urls",
        lambda base, client, max_pages=None: DiscoveryResult(
            hero_urls=["u1", "u2"],
            pages_seen=1,
            pages_failed=0,
            raw_candidate_links=10,
            rejected_candidate_links=1,
            failures=[],
        ),
    )
    monkeypatch.setattr(
        pipeline,
        "fetch_pages",
        lambda urls, config, client: FetchResult(
            pages={"u1": ("u1", "<html/>"), "u2": ("u2", "<html/>")},
            attempted=2,
            fetched=2,
            cache_hits=0,
            failed=0,
            failures=[],
        ),
    )
    monkeypatch.setattr(pipeline, "parse_hero_page", lambda source_url, canonical_url, html: _raw(source_url))
    monkeypatch.setattr(
        pipeline,
        "write_chunked_output",
        lambda output_dir, entries, chunk_size: {"total_entries": len(entries), "chunks": []},
    )

    result = pipeline.run_pipeline(config)

    assert result["status"] == "failure"
    assert any("Strict mode: discovered URLs" in warning for warning in result["warnings"])


def test_pipeline_strict_fails_on_parse_ratio(monkeypatch, tmp_path: Path) -> None:
    config = make_config(tmp_path)
    config.strict = True
    config.min_discovered_urls = 5
    config.max_parse_failure_ratio = 0.2

    monkeypatch.setattr(
        pipeline,
        "discover_hero_urls",
        lambda base, client, max_pages=None: DiscoveryResult(
            hero_urls=["u1", "u2", "u3", "u4", "u5"],
            pages_seen=1,
            pages_failed=0,
            failures=[],
        ),
    )
    monkeypatch.setattr(
        pipeline,
        "fetch_pages",
        lambda urls, config, client: FetchResult(
            pages={key: (key, "<html/>") for key in urls},
            attempted=5,
            fetched=5,
            cache_hits=0,
            failed=0,
            failures=[],
        ),
    )

    def parse_maybe_fail(source_url: str, canonical_url: str, html: str):
        if source_url in {"u2", "u3"}:
            raise RuntimeError("parse fail")
        return _raw(source_url)

    monkeypatch.setattr(pipeline, "parse_hero_page", parse_maybe_fail)
    monkeypatch.setattr(
        pipeline,
        "write_chunked_output",
        lambda output_dir, entries, chunk_size: {"total_entries": len(entries), "chunks": []},
    )

    result = pipeline.run_pipeline(config)

    assert result["status"] == "failure"
    assert result["parse_failed"] == 2
    assert any("Strict mode: parse failure ratio" in warning for warning in result["warnings"])


def test_preflight_degraded_when_discovery_has_failed_pages(monkeypatch, tmp_path: Path) -> None:
    config = make_config(tmp_path)

    monkeypatch.setattr(
        pipeline,
        "discover_hero_urls",
        lambda base, client, max_pages=None: DiscoveryResult(
            hero_urls=["u1", "u2"],
            pages_seen=2,
            pages_failed=1,
            raw_candidate_links=10,
            rejected_candidate_links=2,
            failures=[{"url": "cat-2", "error": "timeout"}],
        ),
    )

    result = pipeline.run_preflight(config)

    assert result["status"] == "degraded"
    assert result["discovery_noise_ratio"] == 0.2
    assert result["entries_parsed"] == 0
    assert result["pages_attempted"] == 0
    assert any(item["stage"] == "discovery" for item in result["failures"])


def test_preflight_strict_fails_on_noise_ratio(monkeypatch, tmp_path: Path) -> None:
    config = make_config(tmp_path)
    config.strict = True
    config.min_discovered_urls = 3
    config.max_namespace_noise_ratio = 0.1

    monkeypatch.setattr(
        pipeline,
        "discover_hero_urls",
        lambda base, client, max_pages=None: DiscoveryResult(
            hero_urls=["u1", "u2", "u3"],
            pages_seen=1,
            pages_failed=0,
            raw_candidate_links=10,
            rejected_candidate_links=3,
            failures=[],
        ),
    )

    result = pipeline.run_preflight(config)

    assert result["status"] == "failure"
    assert any("Strict mode: discovery namespace noise ratio" in warning for warning in result["warnings"])
from __future__ import annotations

from pathlib import Path

from rlsh_parser.config import ParserConfig
from rlsh_parser.fetcher import fetch_pages


class FakeClient:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def get_text(self, url: str) -> tuple[str, str]:
        self.calls.append(url)
        if url.endswith("fail"):
            raise RuntimeError("fetch failed")
        return f"{url}/canonical", f"<html>{url}</html>"


def make_config(tmp_path: Path) -> ParserConfig:
    return ParserConfig(
        base_url="https://wiki.rlsh.net/wiki/Category:RLSH_Directory",
        cache_dir=tmp_path / ".cache",
        output_dir=tmp_path / "output",
    )


def test_fetch_pages_records_failures(tmp_path: Path) -> None:
    client = FakeClient()
    config = make_config(tmp_path)

    result = fetch_pages(["https://wiki.rlsh.net/wiki/a", "https://wiki.rlsh.net/wiki/fail"], config, client)

    assert result.attempted == 2
    assert result.fetched == 1
    assert result.failed == 1
    assert result.cache_hits == 0
    assert result.failures[0]["url"].endswith("fail")


def test_fetch_pages_uses_cache_when_available(tmp_path: Path) -> None:
    config = make_config(tmp_path)
    url = "https://wiki.rlsh.net/wiki/cached"
    cache_dir = config.cache_dir
    cache_dir.mkdir(parents=True, exist_ok=True)

    from rlsh_parser.cache import write_cached_html

    write_cached_html(cache_dir, url, "<html>cached</html>")
    client = FakeClient()

    result = fetch_pages([url], config, client)

    assert result.cache_hits == 1
    assert result.fetched == 1
    assert result.failed == 0
    assert client.calls == []
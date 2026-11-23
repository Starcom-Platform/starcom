from __future__ import annotations

from rlsh_parser.discovery import discover_hero_urls


class FakeClient:
    def __init__(self, pages: dict[str, str], failures: set[str] | None = None) -> None:
        self.pages = pages
        self.failures = failures or set()

    def get_text(self, url: str) -> tuple[str, str]:
        if url in self.failures:
            raise RuntimeError("network error")
        return url, self.pages[url]


def test_discovery_pagination_and_deduplication() -> None:
    base = "https://wiki.rlsh.net/wiki/Category:RLSH_Directory"
    page2 = "https://wiki.rlsh.net/wiki/Category:RLSH_Directory?from=J"

    pages = {
        base: """
            <div>
              <a class='mw-category-generated' href='/wiki/Hero_A'>Hero A</a>
              <a class='mw-category-generated' href='/wiki/Hero_B'>Hero B</a>
              <a class='mw-category-generated' href='/wiki/Category:Ignore_Me'>Ignore</a>
              <div class='mw-category-pager'><a href='/wiki/Category:RLSH_Directory?from=J'>(next page)</a></div>
            </div>
        """,
        page2: """
            <div>
              <a class='mw-category-generated' href='/wiki/Hero_B'>Hero B duplicate</a>
              <a class='mw-category-generated' href='/wiki/Hero_C'>Hero C</a>
            </div>
        """,
    }

    result = discover_hero_urls(base, FakeClient(pages))

    assert result.pages_seen == 2
    assert result.pages_failed == 0
    assert result.hero_urls == [
        "https://wiki.rlsh.net/wiki/Hero_A",
        "https://wiki.rlsh.net/wiki/Hero_B",
        "https://wiki.rlsh.net/wiki/Hero_C",
    ]


def test_discovery_captures_page_failures() -> None:
    base = "https://wiki.rlsh.net/wiki/Category:RLSH_Directory"
    page2 = "https://wiki.rlsh.net/wiki/Category:RLSH_Directory?from=J"
    pages = {
        base: f"""
            <div>
              <a class='mw-category-generated' href='/wiki/Hero_A'>Hero A</a>
              <div class='mw-category-pager'><a href='{page2}'>(next page)</a></div>
            </div>
        """,
        page2: "<div></div>",
    }

    result = discover_hero_urls(base, FakeClient(pages, failures={page2}))

    assert result.pages_seen == 2
    assert result.pages_failed == 1
    assert result.hero_urls == ["https://wiki.rlsh.net/wiki/Hero_A"]
    assert result.failures[0]["url"] == page2


def test_discovery_mediawiki_category_markup_and_pagefrom_pagination() -> None:
        base = "https://wiki.rlsh.net/wiki/Category:RLSH_Directory"
        page2 = "https://wiki.rlsh.net/index.php?title=Category:RLSH_Directory&pagefrom=Jack-O-Lantern#mw-pages"

        pages = {
                base: f"""
                        <div id='mw-pages'>
                            <div class='mw-category'>
                                <a href='/wiki/Ace'>Ace</a>
                                <a href='/wiki/Discordia'>Discordia</a>
                                <a href='/wiki/Template:InfoboxHero'>Template Noise</a>
                            </div>
                            <a href='{page2}'>(next page)</a>
                        </div>
                """,
                page2: """
                        <div id='mw-pages'>
                            <div class='mw-category'>
                                <a href='/wiki/Jaguar'>Jaguar</a>
                            </div>
                        </div>
                """,
        }

        result = discover_hero_urls(base, FakeClient(pages))

        assert result.pages_seen == 2
        assert result.pages_failed == 0
        assert "https://wiki.rlsh.net/wiki/Discordia" in result.hero_urls
        assert "https://wiki.rlsh.net/wiki/Jaguar" in result.hero_urls
        assert not any("Template:" in url for url in result.hero_urls)
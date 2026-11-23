from __future__ import annotations

import requests

from rlsh_parser.http import HttpClient


class FakeResponse:
    def __init__(self, url: str, text: str, ok: bool = True) -> None:
        self.url = url
        self.text = text
        self._ok = ok

    def raise_for_status(self) -> None:
        if not self._ok:
            raise requests.HTTPError("bad status")


def test_http_get_text_retries_then_succeeds(monkeypatch) -> None:
    client = HttpClient(timeout_seconds=1, max_retries=3, min_delay_seconds=0)
    attempts = {"count": 0}

    def fake_get(url: str, timeout: float, allow_redirects: bool):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise requests.ConnectionError("transient")
        return FakeResponse(url="https://final", text="ok")

    monkeypatch.setattr(client._session, "get", fake_get)

    final_url, text = client.get_text("https://start")
    assert final_url == "https://final"
    assert text == "ok"
    assert attempts["count"] == 2


def test_http_get_text_raises_after_max_retries(monkeypatch) -> None:
    client = HttpClient(timeout_seconds=1, max_retries=2, min_delay_seconds=0)

    def fake_get(url: str, timeout: float, allow_redirects: bool):
        raise requests.ConnectionError("down")

    monkeypatch.setattr(client._session, "get", fake_get)

    try:
        client.get_text("https://start")
        assert False, "expected exception"
    except requests.RequestException:
        assert True
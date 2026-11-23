from __future__ import annotations

from hashlib import sha1
from pathlib import Path


def cache_key_for_url(url: str) -> str:
    return sha1(url.encode("utf-8")).hexdigest()


def cache_path(cache_dir: Path, url: str) -> Path:
    return cache_dir / f"{cache_key_for_url(url)}.html"


def read_cached_html(cache_dir: Path, url: str) -> str | None:
    file_path = cache_path(cache_dir, url)
    if not file_path.exists():
        return None
    return file_path.read_text(encoding="utf-8", errors="ignore")


def write_cached_html(cache_dir: Path, url: str, html: str) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    file_path = cache_path(cache_dir, url)
    file_path.write_text(html, encoding="utf-8")
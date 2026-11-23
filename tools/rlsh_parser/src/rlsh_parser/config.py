from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class ParserConfig:
    base_url: str
    cache_dir: Path
    output_dir: Path
    request_delay_seconds: float = 10.0
    request_timeout_seconds: float = 20.0
    max_retries: int = 3
    chunk_size: int = 120
    max_pages: int | None = None
    force_refresh: bool = False
    max_failure_ratio: float = 0.35
    min_successful_pages: int = 1
    strict: bool = False
    min_discovered_urls: int = 50
    max_namespace_noise_ratio: float = 0.20
    max_parse_failure_ratio: float = 0.25
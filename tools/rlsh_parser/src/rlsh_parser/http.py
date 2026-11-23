from __future__ import annotations

import time
from dataclasses import dataclass, field

import requests


DEFAULT_USER_AGENT = "StarcomRLSHParser/1.0 (+https://github.com/Arch-Angel-Agency-LLC/starcom-app)"


@dataclass(slots=True)
class HttpClient:
    timeout_seconds: float
    max_retries: int
    min_delay_seconds: float
    user_agent: str = DEFAULT_USER_AGENT
    _session: requests.Session = field(init=False, repr=False)
    _last_request_at: float = field(init=False, default=0.0, repr=False)

    def __post_init__(self) -> None:
        self._session = requests.Session()
        self._session.headers.update({"User-Agent": self.user_agent})
        self._last_request_at = 0.0

    def get_text(self, url: str) -> tuple[str, str]:
        attempts = 0
        while True:
            attempts += 1
            self._throttle()
            try:
                response = self._session.get(url, timeout=self.timeout_seconds, allow_redirects=True)
                response.raise_for_status()
                return response.url, response.text
            except requests.RequestException:
                if attempts >= self.max_retries:
                    raise
                time.sleep(min(2**attempts, 20))

    def _throttle(self) -> None:
        now = time.time()
        remaining = self.min_delay_seconds - (now - self._last_request_at)
        if remaining > 0:
            time.sleep(remaining)
        self._last_request_at = time.time()
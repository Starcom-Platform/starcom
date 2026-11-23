from __future__ import annotations

import re


DMS_PATTERN = re.compile(
    r"(?P<lat_deg>\d{1,2})\D+(?P<lat_min>\d{1,2})\D+(?P<lat_sec>\d{1,2}(?:\.\d+)?)\D*(?P<lat_dir>[NS])"
    r"[^\d]+"
    r"(?P<lon_deg>\d{1,3})\D+(?P<lon_min>\d{1,2})\D+(?P<lon_sec>\d{1,2}(?:\.\d+)?)\D*(?P<lon_dir>[EW])",
    flags=re.IGNORECASE,
)


LOCATION_CENTROIDS: dict[str, tuple[float, float, float]] = {
    "usa": (39.8283, -98.5795, 0.5),
    "united states": (39.8283, -98.5795, 0.5),
    "canada": (56.1304, -106.3468, 0.5),
    "toronto": (43.6532, -79.3832, 0.8),
    "new york": (40.7128, -74.0060, 0.8),
    "los angeles": (34.0522, -118.2437, 0.8),
    "portland": (45.5152, -122.6784, 0.7),
    "atlanta": (33.7490, -84.3880, 0.8),
}


def parse_embedded_coordinates(text: str | None) -> tuple[float | None, float | None, float | None]:
    if not text:
        return None, None, None
    match = DMS_PATTERN.search(text)
    if not match:
        return None, None, None

    lat = _to_decimal(
        int(match.group("lat_deg")),
        int(match.group("lat_min")),
        float(match.group("lat_sec")),
        match.group("lat_dir"),
    )
    lon = _to_decimal(
        int(match.group("lon_deg")),
        int(match.group("lon_min")),
        float(match.group("lon_sec")),
        match.group("lon_dir"),
    )
    return lat, lon, 1.0


def geocode_from_location_text(location_text: str | None) -> tuple[float | None, float | None, float | None]:
    if not location_text:
        return None, None, None

    probe = location_text.lower()
    for key, (lat, lon, confidence) in sorted(LOCATION_CENTROIDS.items(), key=lambda item: len(item[0]), reverse=True):
        if key in probe:
            return lat, lon, confidence

    return None, None, None


def _to_decimal(degrees: int, minutes: int, seconds: float, direction: str) -> float:
    value = degrees + minutes / 60 + seconds / 3600
    if direction.upper() in {"S", "W"}:
        return -value
    return value
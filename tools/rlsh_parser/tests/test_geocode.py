from __future__ import annotations

import pytest

from rlsh_parser.geocode import geocode_from_location_text, parse_embedded_coordinates


def test_parse_embedded_coordinates_dms() -> None:
    text = '43° 39\' 56.53" N, 79° 23\' 38.28" W'
    lat, lon, confidence = parse_embedded_coordinates(text)

    assert lat is not None
    assert lon is not None
    assert lat == pytest.approx(43.6657, rel=0, abs=1e-4)
    assert lon == pytest.approx(-79.3940, rel=0, abs=1e-4)
    assert confidence == 1.0


def test_parse_embedded_coordinates_invalid() -> None:
    assert parse_embedded_coordinates("Toronto ON, Canada") == (None, None, None)


def test_geocode_from_location_text_known_city() -> None:
    lat, lon, confidence = geocode_from_location_text("New York, USA")
    assert (lat, lon, confidence) == (40.7128, -74.006, 0.8)


def test_geocode_from_location_text_unknown() -> None:
    assert geocode_from_location_text("Atlantis") == (None, None, None)
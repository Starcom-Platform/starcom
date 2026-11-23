from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(slots=True)
class HeroPageRaw:
    source_url: str
    canonical_url: str
    title: str | None
    infobox: dict[str, str]
    page_text: str


@dataclass(slots=True)
class HeroEntry:
    name: str
    aliases: list[str] = field(default_factory=list)
    identity: str | None = None
    category: str | None = None
    status: str | None = None
    team: list[str] = field(default_factory=list)
    affiliates: list[str] = field(default_factory=list)
    foes: str | None = None
    actions: str | None = None
    location_text: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    geoint_confidence: float | None = None
    image_url: str | None = None
    symbol_image_url: str | None = None
    equipment: str | None = None
    abilities: str | None = None
    full_text: str | None = None
    source_url: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
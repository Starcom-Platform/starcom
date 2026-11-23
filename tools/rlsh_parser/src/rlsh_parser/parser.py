from __future__ import annotations

import re

from bs4 import BeautifulSoup, Tag

from .models import HeroPageRaw


def parse_hero_page(source_url: str, canonical_url: str, html: str) -> HeroPageRaw:
    soup = BeautifulSoup(html, "html.parser")
    title = _extract_title(soup)
    infobox = _extract_infobox(soup)
    page_text = _extract_page_text(soup)

    return HeroPageRaw(
        source_url=source_url,
        canonical_url=canonical_url,
        title=title,
        infobox=infobox,
        page_text=page_text,
    )


def _extract_title(soup: BeautifulSoup) -> str | None:
    heading = soup.select_one("#firstHeading")
    if heading is None:
        return None
    text = heading.get_text(" ", strip=True)
    return text or None


def _extract_infobox(soup: BeautifulSoup) -> dict[str, str]:
    table = soup.select_one("table.infobox")
    if table is None:
        return {}

    data: dict[str, str] = {}

    for row in table.select("tr"):
        cells = [cell for cell in row.find_all("td", recursive=False)]
        if len(cells) >= 2:
            key = _normalize_infobox_key(cells[0].get_text(" ", strip=True))
            value = _extract_cell_text(cells[1])
            if key:
                data[key] = value
                continue

        header = row.find("th")
        if isinstance(header, Tag):
            header_text = _clean_text(header.get_text(" ", strip=True))
            if header_text and "name" not in data:
                data["name"] = header_text

        image = row.find("img")
        if isinstance(image, Tag):
            src = image.get("src")
            if src:
                key = "symbol_image" if "symbol" in row.get_text(" ", strip=True).lower() else "image"
                data.setdefault(key, src)

    return data


def _extract_page_text(soup: BeautifulSoup) -> str:
    content = soup.select_one("#mw-content-text")
    if content is None:
        return ""

    cloned = BeautifulSoup(str(content), "html.parser")
    infobox = cloned.select_one("table.infobox")
    if infobox is not None:
        infobox.decompose()

    text = cloned.get_text("\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _extract_cell_text(cell: Tag) -> str:
    text = cell.get_text(" | ", strip=True)
    text = _clean_text(text)
    text = re.sub(r"\s*\|\s*", "|", text)
    return text


def _normalize_infobox_key(raw_key: str) -> str:
    cleaned = _clean_text(raw_key).lower().strip(":")
    cleaned = re.sub(r"\s+", " ", cleaned)

    aliases = {
        "hero": "hero",
        "name": "name",
        "alias(es)": "aliases",
        "aliases": "aliases",
        "identity": "identity",
        "alter ego": "alter_ego",
        "category": "category",
        "location": "location",
        "status": "status",
        "team": "team",
        "affiliates": "affiliates",
        "foes": "foes",
        "actions": "actions",
        "activity": "actions",
        "equipment": "equipment",
        "abilities": "abilities",
        "gender": "gender",
        "outfit": "outfit",
        "colors": "colors",
        "symbol": "symbol",
    }
    return aliases.get(cleaned, cleaned.replace(" ", "_"))
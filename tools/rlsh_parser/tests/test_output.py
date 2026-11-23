from __future__ import annotations

import json
from pathlib import Path

from rlsh_parser.models import HeroEntry
from rlsh_parser.output import write_chunked_output


def test_write_chunked_output_writes_index_and_chunks(tmp_path: Path) -> None:
    entries = [
        HeroEntry(name="Zulu"),
        HeroEntry(name="Alpha"),
        HeroEntry(name="Mike"),
    ]

    summary = write_chunked_output(tmp_path, entries, chunk_size=2)

    assert summary["total_entries"] == 3
    assert len(summary["chunks"]) == 2

    index_payload = json.loads((tmp_path / "index.json").read_text(encoding="utf-8"))
    assert index_payload["total_entries"] == 3

    chunk1 = json.loads((tmp_path / "chunk-001.json").read_text(encoding="utf-8"))
    assert chunk1["entry_count"] == 2
    assert [item["name"] for item in chunk1["entries"]] == ["Alpha", "Mike"]

    chunk2 = json.loads((tmp_path / "chunk-002.json").read_text(encoding="utf-8"))
    assert chunk2["entry_count"] == 1
    assert chunk2["entries"][0]["name"] == "Zulu"
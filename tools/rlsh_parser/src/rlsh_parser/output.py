from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
import tempfile

from .models import HeroEntry


def write_chunked_output(output_dir: Path, entries: list[HeroEntry], chunk_size: int) -> dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)
    generated_at = datetime.now(UTC).isoformat()

    sorted_entries = sorted(entries, key=lambda entry: entry.name.lower())
    chunk_files: list[dict[str, object]] = []

    for start in range(0, len(sorted_entries), chunk_size):
        chunk_entries = sorted_entries[start : start + chunk_size]
        chunk_number = start // chunk_size + 1
        chunk_id = f"chunk-{chunk_number:03d}"
        file_name = f"{chunk_id}.json"

        payload = {
            "generated_at": generated_at,
            "chunk_id": chunk_id,
            "entry_count": len(chunk_entries),
            "entries": [entry.to_dict() for entry in chunk_entries],
        }
        _write_json_atomic(output_dir / file_name, payload)

        chunk_files.append(
            {
                "chunk_id": chunk_id,
                "file": file_name,
                "entry_count": len(chunk_entries),
            }
        )

    index_payload = {
        "generated_at": generated_at,
        "total_entries": len(sorted_entries),
        "chunk_size": chunk_size,
        "chunks": chunk_files,
    }
    _write_json_atomic(output_dir / "index.json", index_payload)
    return index_payload


def _write_json_atomic(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as tmp:
        tmp.write(json.dumps(payload, ensure_ascii=False))
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)
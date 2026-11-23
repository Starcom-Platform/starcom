# Starcom RLSH Parser

Standalone Python sub-project for crawling the RLSH wiki directory and generating chunked JSON assets for Starcom.

## What this does

- Discovers hero URLs from `Category:RLSH_Directory` pagination.
- Fetches/caches hero pages with crawl-delay throttling.
- Parses infobox + page text into normalized entry objects.
- Resolves coordinates from embedded DMS coords first, then location-text centroid fallback.
- Writes chunked JSON output plus an index manifest for app-side lazy loading.

## Quick start

```bash
cd tools/rlsh_parser
python -m venv .venv
source .venv/bin/activate
pip install -e .
rlsh-parser run
```

## CLI usage

```bash
rlsh-parser run \
  --base-url "https://wiki.rlsh.net/wiki/Category:RLSH_Directory" \
  --cache-dir "./.cache/pages" \
  --output-dir "../../src/data/rlsh" \
  --chunk-size 120 \
  --request-delay-seconds 10 \
  --max-failure-ratio 0.35 \
  --min-successful-pages 1
```

## Status + exit codes

- `success` -> exit code `0`
- `degraded` -> exit code `2` (or `0` with `--allow-degraded-exit-zero`)
- `failure` -> exit code `1`

The command prints a structured run report JSON containing discovery/fetch/parse failure details.

## Output shape

- `index.json` with generation metadata and chunk list.
- `chunk-001.json`, `chunk-002.json`, ... with normalized entries.

Each chunk contains:

```json
{
  "generated_at": "2026-03-02T00:00:00Z",
  "chunk_id": "chunk-001",
  "entry_count": 120,
  "entries": []
}
```

## Notes

- This project is intentionally offline-friendly via local HTML cache reuse.
- Geocoding is deterministic and conservative by default; plug in a full geocoder later if needed.
- Failed pages are logged and skipped so a run can complete.
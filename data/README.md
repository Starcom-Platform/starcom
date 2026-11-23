# Source data

Raw data that build scripts turn into what the app serves from `public/`. The app never reads this folder at run
time. Each dataset keeps its own licence, listed in [`THIRD-PARTY.md`](../THIRD-PARTY.md).

| Folder | What it holds | Read by |
|---|---|---|
| `raw/geopolitical/` | Natural Earth 1:50m boundaries, as downloaded, with their own README and version files | `scripts/fetch_geopolitical_data.sh`, `scripts/generate-geopolitical-manifest.ts` |
| `eez/raw/` | Maritime boundaries and exclusive economic zones (Flanders Marine Institute), with their attribution | `scripts/fetch-eez-data.ts`, `scripts/process-maritime-eez.ts`, `scripts/ingest-maritime-eez.ts` |
| `zsp2/` | The Zone and Sector Protocol 2.0 grid (Terrae, Maria and their containers), the source of the globe's Zones | `scripts/zones/build-terrae.ts`; checked by `scripts/guard-zsp.mjs` |

A local relay database, if you run one here, is ignored by git (`data/relaynode.db-*`).

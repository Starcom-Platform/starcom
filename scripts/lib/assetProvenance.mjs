/**
 * The committed-asset registry and the provenance rule, in one place.
 *
 * Extracted because two consumers now need it: the freshness guard, which
 * fails a build when an asset has aged past the point where publishing from it
 * would mislead; and the health endpoint, which reports the same distribution
 * to the network so another node can see provenance decay without reading this
 * repository.
 *
 * They must not drift. A health endpoint that reports `archived` for something
 * the guard calls `UNREPRODUCIBLE` is worse than no endpoint — it is a node
 * publishing a claim about its own reliability that its own gate contradicts,
 * which is the exact failure this project keeps finding in other people's
 * integrations.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Half-life used to express what an asset's age is currently worth. */
export const HALF_LIFE_DAYS = 180;

export const ASSETS = [
  { file: 'companies-house.json', label: 'Companies House register', cadenceDays: 30, maxAgeDays: 120 },
  { file: 'psc-control.json', label: 'Companies House PSC register', cadenceDays: 30, maxAgeDays: 120 },
  { file: 'brreg.json', label: 'Enhetsregisteret', cadenceDays: 1, maxAgeDays: 90 },
  { file: 'gleif.json', label: 'GLEIF Global LEI Index', cadenceDays: 1, maxAgeDays: 90 },
];

/**
 * Can anyone still obtain the bytes a claim was derived from?
 *
 * `archived`        we kept the bytes and can prove which ones by digest.
 * `upstream-dated`  the publisher names the exact file in its url.
 * `UNREPRODUCIBLE`  neither — nobody can re-derive the claim, including us.
 *
 * The third state is the load-bearing one. A pipeline that cannot admit an
 * unreproducible result will quietly launder one.
 */
export function retention(asset) {
  if (asset.archivedSnapshot?.sha256) {
    return { state: 'archived', detail: `sha256 ${asset.archivedSnapshot.sha256.slice(0, 12)}…` };
  }
  const urls = Array.isArray(asset.sourceUrl) ? asset.sourceUrl : [asset.sourceUrl].filter(Boolean);
  const snapshot = String(asset.snapshot ?? '');
  const dated = snapshot && urls.some((u) => String(u).includes(snapshot));
  if (dated) return { state: 'upstream-dated', detail: 'the exact file is still named by its url' };
  return { state: 'UNREPRODUCIBLE', detail: 'undated source url and no archived copy' };
}

/**
 * Reads every registered asset and reports age, conferred recency and
 * provenance. Missing or undated assets are returned rather than thrown on —
 * the caller decides whether that is a failure or a fact to publish.
 */
export function surveyAssets(now = Date.now(), dir = path.join(process.cwd(), 'public', 'data')) {
  return ASSETS.map((a) => {
    const p = path.join(dir, a.file);
    if (!fs.existsSync(p)) return { ...a, present: false };

    const asset = JSON.parse(fs.readFileSync(p, 'utf8'));
    const snapshot = asset.snapshot ?? asset.retrievedAt;
    if (!snapshot || Number.isNaN(Date.parse(snapshot))) {
      return { ...a, present: true, dated: false };
    }

    const ageDays = Math.max(0, (now - Date.parse(snapshot)) / 86_400_000);
    return {
      ...a,
      present: true,
      dated: true,
      snapshot: String(snapshot),
      ageDays,
      recency: Math.pow(0.5, ageDays / HALF_LIFE_DAYS),
      stale: ageDays > a.maxAgeDays,
      overdue: ageDays > a.cadenceDays * 3,
      retention: retention(asset),
    };
  });
}

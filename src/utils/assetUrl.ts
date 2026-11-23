/**
 * Resolve a path to a static asset that ships with the build.
 *
 * ─── WHY AN ABSOLUTE PATH IS NOT SAFE HERE ─────────────────────────────────
 *
 * `fetch('/borders.geojson')` works when the app is served from the root of a
 * domain and fails everywhere else. Under an IPFS gateway the app lives at
 * `/ipfs/<cid>/`, so a leading slash resolves to the GATEWAY's root — a path
 * that belongs to no particular site and returns 404.
 *
 * That was found by serving the `build:ipfs` output under a simulated gateway
 * prefix: the page and all seventeen of its referenced assets loaded correctly,
 * because Vite rewrites those. The runtime `fetch` calls it cannot see were the
 * failure, and the geopolitical layers are the ones that would have gone
 * missing — silently, since a failed borders fetch produces an emptier globe
 * rather than an error anyone notices.
 *
 * `import.meta.env.BASE_URL` is whatever `base` the build was configured with:
 * `/` for the hosted build and `./` for IPFS. Using it means one build works in
 * both places, which is the point — a bundle that only runs from one origin is
 * not much of an escape hatch.
 */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL ?? '/';
  const clean = path.replace(/^\/+/, '');
  return base.endsWith('/') ? `${base}${clean}` : `${base}/${clean}`;
}

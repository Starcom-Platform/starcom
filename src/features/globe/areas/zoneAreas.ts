/**
 * The Zones as areas, from the partition Starcom serves (decision D-ZR; the owner's rule CR6: nothing coded in).
 *
 * Under ZSP 2.0 each Terra, Mare and Zone is an area a report names by its own id (`zone:<slug>`, `terra:<slug>`),
 * its outline its container document's. Each id the manifest retires stays an area, drawn as the Zones that cover
 * it, so a report or a link that named a first Zone still finds where it was. `npm run bake:areas` writes
 * zoneAreas.json from the served manifest (list-areas.ts) before the shapes are baked. Since the swap (ZR8) no Zone
 * is coded in areaRegistry.ts.
 */
import type { AreaDef, AreaSource } from './areaRegistry';

export interface ZoneAreas {
  zones: AreaDef[];
  retired: AreaDef[];
}

const NONE: ZoneAreas = { zones: [], retired: [] };
/** Where a place without a cited page of its own is taken from: the manifest Starcom serves. */
export const SERVED_ZONES_MANIFEST = 'https://starcom.app/geopolitical/zones/manifest.json';
/** An id as the ZSP reader takes one (zsp.ts): its kind, then a slug of letters, digits and hyphens. */
const ID = /^(terra|mare|zone):[a-z0-9-]+$/;
const LEVELS = new Set(['terra', 'mare', 'zone']);

type Entry = { id?: unknown; file?: unknown; sha256?: unknown };
type Doc = { features?: Array<{ properties?: Record<string, unknown> }> };

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** The areas a served manifest makes, reading each container's document through `docOf`; none for anything but 2.0. */
export function zoneAreasFrom(manifest: unknown, docOf: (file: string) => unknown): ZoneAreas {
  const m = manifest as { zsp?: unknown; generated?: unknown; containers?: unknown; retired?: unknown } | null | undefined;
  if (m?.zsp !== '2.0' || !Array.isArray(m.containers)) return NONE;
  const generated = text(m.generated);
  const read = generated && /^\d{4}-\d{2}-\d{2}/.test(generated) ? generated.slice(0, 10) : '';
  // Every area cites a page (areaRegistry): the place's own first source with a web page, else the manifest served.
  const source = (name: string, sources?: unknown): AreaSource => {
    const cited = (Array.isArray(sources) ? sources : []).find((x): x is { url: string } => /^https:\/\//.test(String((x as { url?: unknown })?.url ?? '')));
    return { name: `Zone and Sector Protocol 2.0: ${name}`, url: cited?.url ?? SERVED_ZONES_MANIFEST, read };
  };
  const zones: AreaDef[] = [];
  for (const entry of m.containers as Entry[]) {
    const file = text(entry?.file);
    const sha256 = text(entry?.sha256);
    if (!file || !sha256) continue;
    const doc = docOf(file) as Doc | null;
    for (const feature of doc?.features ?? []) {
      const p = feature.properties ?? {};
      const code = text(p.id);
      if (!code || !ID.test(code) || !LEVELS.has(String(p.level))) continue;
      const name = text(p.name) ?? code;
      const principle = text(p.principle);
      // Its kind is its prefix, as every area's is: a Terra `terra`, a Mare `mare`, a Zone `zone`.
      const kind = code.split(':')[0] as 'terra' | 'mare' | 'zone';
      // A Zone takes "the" in running text (about the Sahel Zone); a Terra or a Mare does not (about Terra Africana).
      zones.push({
        code, kind, name, ...(kind === 'zone' ? { the: true as const } : {}), from: 'zsp', file, sha256, source: source(name, p.sources),
        ...(principle ? { note: principle } : {}),
      });
    }
  }
  const nameOf = new Map(zones.map((z) => [z.code, z.name]));
  const retired: AreaDef[] = (Array.isArray(m.retired) ? (m.retired as Array<Record<string, unknown>>) : []).flatMap((r) => {
    const code = text(r?.id);
    if (!code || !ID.test(code) || nameOf.has(code)) return [];
    const coveredBy = (Array.isArray(r.covered_by) ? r.covered_by : []).filter((c): c is string => typeof c === 'string' && nameOf.has(c));
    if (coveredBy.length === 0) return [];
    const name = text(r.name) ?? code;
    const now = coveredBy.map((c) => nameOf.get(c)!);
    // Each name with "the"; semicolons between them when a name holds its own "and" or comma (Shan Plateau and the Tenasserim).
    const and = (names: string[]) => {
      const the = names.map((n) => `the ${n}`);
      if (the.length === 1) return the[0];
      const sep = names.some((n) => /,| and /.test(n)) ? '; ' : ', ';
      return `${the.slice(0, -1).join(sep)}${sep === ', ' ? ' and ' : '; and '}${the[the.length - 1]}`;
    };
    // The manifest lists the covering Zones largest first; past four, the note names the first three and counts the rest.
    const list = now.length <= 4 ? and(now) : `${now.length} Zones, among them ${and(now.slice(0, 3))}`;
    return [{ code, kind: 'zone' as const, name, the: true as const, from: 'covered' as const, coveredBy, source: source(name), note: `Retired from the first Zones; now ${list}.` }];
  });
  return { zones, retired };
}

/** The registry's areas with the served partition's: its Terrae, Maria and Zones, then its retired ids. */
export function mergeZoneAreas(areas: readonly AreaDef[], zoneAreas: ZoneAreas): AreaDef[] {
  return [...areas, ...zoneAreas.zones, ...zoneAreas.retired];
}

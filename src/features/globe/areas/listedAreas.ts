/**
 * Spheres and Organisations from Mecha Jono's lists, as areas (decision D-ZR, ZR10; the owner's rule CR6: nothing
 * coded in). `npm run bake:areas` reads public/geopolitical/spheres/manifest.json and organisations/manifest.json
 * (memberships.ts reads them) into listedAreas.json, and the registry merges what it holds over what is coded:
 *
 * - Spheres listed: they are the Spheres, and the coded ones stand down.
 * - A body listed: it replaces the coded body with its code (`union:eu`); a new one joins.
 *
 * Until a list lands nothing changes, and the definitions, and so their hash, are what they were.
 */
import type { AreaDef } from './areaRegistry';
import { drawnMembers, drawnSphereMembers, organisationsFrom, spheresFrom, type Organisation, type Sphere } from '../memberships/memberships';

export interface ListedAreas {
  spheres: AreaDef[];
  unions: AreaDef[];
}

/** A Sphere's family, in the registry's word for what reaches its states. */
const INFLUENCE = { language: 'semantic', civilisation: 'cultural', political: 'political' } as const;

const sourceOf = (sources: Array<{ name: string; url?: string }>, read: string | undefined, fallback: string) => ({
  name: sources[0]?.name ?? fallback,
  url: sources[0]?.url ?? '',
  read: read ?? '',
});

/** An item's "the" and note, carried as the list says them. */
const saidOf = (item: Sphere | Organisation): { the?: true; note?: string } =>
  ({ ...(item.the ? { the: true as const } : {}), ...(item.note ? { note: item.note } : {}) });

function sphereArea(s: Sphere, generated: string | undefined): AreaDef {
  const listedOnly = s.members.filter((m) => m.drawn === false).map((m) => ({ code: m.code, status: 'listed' }));
  return {
    code: s.id, kind: 'sphere', influence: INFLUENCE[s.family], name: s.name, ...saidOf(s), from: 'members',
    members: drawnSphereMembers(s),
    ...(listedOnly.length ? { others: listedOnly } : {}),
    source: sourceOf(s.sources, s.read ?? generated, 'Zone and Sector Protocol 2.0: the Spheres list'),
  };
}

function unionArea(o: Organisation, generated: string | undefined): AreaDef {
  const others = o.members.filter((m) => m.status !== 'member').map((m) => ({ code: m.code, status: m.status, ...(m.since ? { since: m.since } : {}) }));
  return {
    code: o.id, kind: 'union', name: o.name, ...saidOf(o), from: 'members',
    members: drawnMembers(o),
    ...(others.length ? { others } : {}),
    source: sourceOf(o.sources, o.read ?? generated, 'Zone and Sector Protocol 2.0: the Organisations list'),
  };
}

const dayOf = (manifest: unknown): string | undefined => {
  const g = (manifest as { generated?: unknown } | null | undefined)?.generated;
  return typeof g === 'string' && /^\d{4}-\d{2}-\d{2}/.test(g) ? g.slice(0, 10) : undefined;
};

/** The areas two lists make, each in its list's order; none for a list that is not there or not one. */
export function listedAreasFrom(spheresManifest: unknown, organisationsManifest: unknown): ListedAreas {
  const spheres = spheresFrom(spheresManifest)?.items ?? [];
  const unions = organisationsFrom(organisationsManifest)?.items ?? [];
  return {
    spheres: spheres.map((s) => sphereArea(s, dayOf(spheresManifest))),
    unions: unions.map((o) => unionArea(o, dayOf(organisationsManifest))),
  };
}

/** The registry's areas with the listed ones over them: listed Spheres in place of the coded, a listed body over its code. */
export function mergeListed(coded: readonly AreaDef[], listed: ListedAreas): AreaDef[] {
  const listedUnions = new Map(listed.unions.map((u) => [u.code, u]));
  const kept = coded.flatMap((a) => {
    if (a.kind === 'sphere' && listed.spheres.length > 0) return [];
    const over = a.kind === 'union' ? listedUnions.get(a.code) : undefined;
    if (over) { listedUnions.delete(a.code); return [over]; }
    return [a];
  });
  return [...kept, ...listed.spheres, ...listedUnions.values()];
}

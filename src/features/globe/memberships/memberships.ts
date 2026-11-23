/**
 * Spheres and Organisations as Mecha Jono publishes them (decision D-ZR, ZR10, part 2 of the handoff): cited
 * membership lists, no geometry. A member is a country by its ISO 3166-1 alpha-2 code, drawn from Starcom's own
 * country shapes. Nothing here is coded into Starcom (the owner's rule CR6): the lists are data, read from
 * public/geopolitical/spheres/ and public/geopolitical/organisations/.
 *
 * A Sphere is a domain of influence: a language's, a civilisation's or a political community's. Spheres overlap.
 * An Organisation is a body with members, each with a status and the date it began (a partner is not a member, and
 * a suspended member is not drawn as one). It goes by the code reports already name it by, `union:<slug>` (BA17),
 * whatever its kind: `union:eu`, and `union:brics` too.
 *
 * Part 2's lists add, to each: `the` where English runs its name with the article ("the Francophonie", but "BRICS"),
 * and a `note` saying what the list holds; and to a Sphere's member `drawn: false`, a membership the list counts but
 * the map does not draw (an associate, an observer, a language official only in a region): listed, not drawn.
 */

export const MEMBERSHIP_LISTS_EDITION = '1.0';

export type SphereFamily = 'language' | 'civilisation' | 'political';
export type OrganisationKind = 'union' | 'alliance' | 'bloc' | 'forum' | 'treaty';
/** `potential-candidate`: the EU's word for a country promised the prospect of joining but not yet a candidate (Kosovo). */
export type MemberStatus = 'member' | 'partner' | 'observer' | 'candidate' | 'potential-candidate' | 'suspended';

export interface ListSource {
  name: string;
  url?: string;
  licence?: string;
}

export interface SphereMember {
  /** ISO 3166-1 alpha-2, lower case. */
  code: string;
  /** Where the list says this country is in the Sphere. */
  source?: string;
  /** Listed, not drawn: the list counts it, the map does not draw it as the Sphere's. */
  drawn?: false;
}

export interface Sphere {
  id: string;
  name: string;
  /** Its name takes "the" in running text. */
  the?: true;
  /** What the list says of itself, shown as it says it. */
  note?: string;
  family: SphereFamily;
  members: SphereMember[];
  /** Where the source divides the Sphere further, each group by its members' codes. */
  groups: Array<{ id: string; name: string; members: string[] }>;
  sources: ListSource[];
  /** When the lists were read, YYYY-MM-DD. */
  read?: string;
}

export interface OrganisationMember {
  code: string;
  status: MemberStatus;
  /** The day it began, YYYY-MM-DD, as precise as the source says. */
  since?: string;
  source?: string;
}

export interface Organisation {
  id: string;
  name: string;
  /** Its name takes "the" in running text. */
  the?: true;
  /** What the list says of itself, shown as it says it. */
  note?: string;
  kind: OrganisationKind;
  founded?: string;
  members: OrganisationMember[];
  sources: ListSource[];
  read?: string;
}

export interface MembershipLists<T> {
  items: T[];
  /** Entries the file carried that this build could not read, counted rather than dropped unsaid. */
  unread: number;
  licence?: string;
}

const FAMILIES = new Set<SphereFamily>(['language', 'civilisation', 'political']);
const KINDS = new Set<OrganisationKind>(['union', 'alliance', 'bloc', 'forum', 'treaty']);
const STATUSES = new Set<MemberStatus>(['member', 'partner', 'observer', 'candidate', 'potential-candidate', 'suspended']);
const CODE = /^[a-z]{2}$/;
const DAY = /^\d{4}(-\d{2}(-\d{2})?)?$/;

const text = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const day = (v: unknown): string | undefined => { const d = text(v); return d && DAY.test(d) ? d : undefined; };
const sourcesOf = (v: unknown): ListSource[] => (Array.isArray(v) ? v : []).flatMap((s: Record<string, unknown>) =>
  (text(s?.name) ? [{ name: text(s.name)!, url: text(s.url), licence: text(s.licence) }] : []));

/** A list item's "the" (only when true) and its note (only when it says something). */
const said = (raw: Record<string, unknown>): { the?: true; note?: string } => {
  const note = text(raw.note);
  return { ...(raw.the === true ? { the: true as const } : {}), ...(note ? { note } : {}) };
};

function sphereFrom(raw: Record<string, unknown>): Sphere | null {
  const id = text(raw?.id);
  const name = text(raw?.name);
  const family = raw?.family as SphereFamily;
  if (!id || !/^sphere:[a-z0-9-]+$/.test(id) || !name || !FAMILIES.has(family) || !Array.isArray(raw.members)) return null;
  const members = (raw.members as Array<Record<string, unknown>>).flatMap((m) => {
    const code = text(m?.code)?.toLowerCase();
    return code && CODE.test(code) ? [{ code, source: text(m.source), ...(m.drawn === false ? { drawn: false as const } : {}) }] : [];
  });
  if (members.length === 0) return null;
  const codes = new Set(members.map((m) => m.code));
  const groups = (Array.isArray(raw.groups) ? raw.groups : []).flatMap((g: Record<string, unknown>) => {
    const gid = text(g?.id);
    const gname = text(g?.name);
    const gm = (Array.isArray(g?.members) ? g.members : []).filter((c: unknown): c is string => typeof c === 'string' && codes.has(c.toLowerCase())).map((c: string) => c.toLowerCase());
    return gid && gname && gm.length > 0 ? [{ id: gid, name: gname, members: gm }] : [];
  });
  return { id, name, ...said(raw), family, members, groups, sources: sourcesOf(raw.sources), read: day(raw.read) };
}

function organisationFrom(raw: Record<string, unknown>): Organisation | null {
  const id = text(raw?.id);
  const name = text(raw?.name);
  const kind = raw?.kind as OrganisationKind;
  if (!id || !/^union:[a-z0-9-]+$/.test(id) || !name || !KINDS.has(kind) || !Array.isArray(raw.members)) return null;
  const members = (raw.members as Array<Record<string, unknown>>).flatMap((m) => {
    const code = text(m?.code)?.toLowerCase();
    const status = m?.status as MemberStatus;
    return code && CODE.test(code) && STATUSES.has(status) ? [{ code, status, since: day(m.since), source: text(m.source) }] : [];
  });
  if (members.length === 0) return null;
  return { id, name, ...said(raw), kind, founded: day(raw.founded), members, sources: sourcesOf(raw.sources), read: day(raw.read) };
}

function listsFrom<T>(manifest: unknown, key: 'spheres' | 'organisations', read: (raw: Record<string, unknown>) => T | null): MembershipLists<T> | null {
  const m = manifest as Record<string, unknown> | null | undefined;
  if (m?.lists !== MEMBERSHIP_LISTS_EDITION || !Array.isArray(m[key])) return null;
  const items: T[] = [];
  let unread = 0;
  const seen = new Set<string>();
  for (const raw of m[key] as Array<Record<string, unknown>>) {
    const item = read(raw);
    const id = (item as { id?: string } | null)?.id;
    if (item && id && !seen.has(id)) { items.push(item); seen.add(id); } else unread += 1;
  }
  return { items, unread, licence: text(m.licence) };
}

/** A spheres manifest as Starcom reads it, or null when it is not one. */
export const spheresFrom = (manifest: unknown): MembershipLists<Sphere> | null => listsFrom(manifest, 'spheres', sphereFrom);

/** An organisations manifest as Starcom reads it, or null when it is not one. */
export const organisationsFrom = (manifest: unknown): MembershipLists<Organisation> | null => listsFrom(manifest, 'organisations', organisationFrom);

/** The countries a Sphere is drawn over: its members, never those listed but not drawn. */
export const drawnSphereMembers = (sphere: Sphere): string[] => sphere.members.filter((m) => m.drawn !== false).map((m) => m.code);

/** The countries an Organisation is drawn over: its members, never its partners, observers, candidates or the suspended. */
export const drawnMembers = (org: Organisation): string[] => org.members.filter((m) => m.status === 'member').map((m) => m.code);

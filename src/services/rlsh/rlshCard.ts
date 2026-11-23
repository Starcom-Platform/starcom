/**
 * An RLSH profile is NavCom's card (D-RF, RF1; navcom-app docs/spec/signals.spec.md §10911, read 10 Nov 2026).
 *
 * Kind 10911, replaceable, signed by a contact key of its own, never the person's own key (§10911: a card is safe to
 * publish only because its key receives nothing else). Its content is `callsign`, `region` and `doing` and nothing
 * else: a reader refuses a card carrying any other field, so anything Starcom adds goes in tags. Starcom writes
 * `region: "earth"` (a card naming no city, and no `d` tag), its Zone as `["area", "zone", id, name]`, up to three of
 * NavCom's activity terms as `t` tags, and `l starcom:rlsh` for Starcom's list (RF6), with `l navcom:public` when the
 * hero chooses navcom.app too (RF7). No team on a card (RF2).
 *
 * The activity terms are NavCom's own list as it stands (RF4, RF5): copied here by id, label and meaning, and kept
 * to it; a term this build does not know is dropped from a card, never shown raw, as NavCom's readers do.
 */
export const KIND_CARD = 10911;
export const KIND_DELETION = 5;
export const RLSH_LABEL = 'starcom:rlsh';
export const NAVCOM_PUBLIC_LABEL = 'navcom:public';
/** The fields a card's content may hold (§10911); one more and the card is refused whole. */
export const CARD_FIELDS = ['callsign', 'region', 'doing', 'lightning'] as const;
export const CALLSIGN_MAX = 40;
/** NavCom's DOING_MAX. */
export const DOING_MAX = 140;
/** NavCom's DOES_MAX: "three is enough to describe somebody and few enough that choosing is an act". */
export const DOES_MAX = 3;

/** NavCom's activity terms (packages/core/src/events/profile.ts, DOES): an activity, never a qualification. */
export const DOES: ReadonlyArray<{ id: string; label: string; means: string }> = [
  { id: 'patrol', label: 'Patrol', means: 'Walks or drives an area.' },
  { id: 'supplies', label: 'Supplies', means: 'Carries and hands out water, socks, food.' },
  { id: 'firstaid', label: 'Carries a kit', means: 'Has first aid on them. Not a claim of training.' },
  { id: 'transport', label: 'Transport', means: 'Gives rides, moves goods.' },
  { id: 'comms', label: 'Comms', means: 'Radio, relays, coordination.' },
  { id: 'search', label: 'Search', means: 'Helps look for somebody missing.' },
  { id: 'observe', label: 'Legal observer', means: 'Witnesses and records.' },
  { id: 'welfare', label: 'Welfare checks', means: 'Checks on people who asked to be checked on.' },
  { id: 'answers', label: 'Answers questions', means: 'Answers questions from what they know, without holding a board.' },
  { id: 'station', label: 'Keeps a station', means: 'Runs and maintains a Watchtower box.' },
  { id: 'teaches', label: 'Teaches', means: 'Shows other people how to do the work. Not a claim of qualification.' },
  { id: 'gear', label: 'Makes or repairs gear', means: 'Builds, fixes or modifies equipment. Not a claim about how well any of it works.' },
  { id: 'crew', label: 'A crew', means: 'This card is a group rather than one person.' },
];
const DOES_IDS = new Set(DOES.map((d) => d.id));

/** Who can find a card (RF7): Starcom's RLSH list, navcom.app as well, or only by its address. */
export type Finding = 'starcom' | 'public' | 'address';
export const FINDINGS: readonly Finding[] = ['starcom', 'public', 'address'];

export interface CardZone {
  /** A ZSP 2.0 Zone id: `zone:atlas`. */
  id: string;
  name: string;
}

export interface RlshCardDraft {
  callsign: string;
  doing: string;
  zone: CardZone | null;
  does: string[];
  finding: Finding;
}

export interface CardTemplate {
  kind: number;
  tags: string[][];
  content: string;
}

/** A card as it will be signed: the content's three fields at most, the rest in tags. */
export function cardTemplate(draft: RlshCardDraft): CardTemplate {
  const callsign = draft.callsign.trim().slice(0, CALLSIGN_MAX);
  if (!callsign) throw new Error('A card needs an alias.');
  const doing = draft.doing.trim().slice(0, DOING_MAX);
  const content = JSON.stringify({ callsign, region: 'earth', ...(doing ? { doing } : {}) });
  const does = [...new Set(draft.does.filter((id) => DOES_IDS.has(id)))].slice(0, DOES_MAX);
  const tags: string[][] = [
    ...(draft.zone ? [['area', 'zone', draft.zone.id, draft.zone.name]] : []),
    ...does.map((id) => ['t', id]),
    ...(draft.finding !== 'address' ? [['l', RLSH_LABEL]] : []),
    ...(draft.finding === 'public' ? [['l', NAVCOM_PUBLIC_LABEL]] : []),
  ];
  return { kind: KIND_CARD, tags, content };
}

/** The deletion of a key's card (NIP-09), as NavCom asks for one: `a` the card's address, `k` its kind. */
export const deletionTemplate = (pubkey: string): CardTemplate => ({
  kind: KIND_DELETION, tags: [['a', `${KIND_CARD}:${pubkey}:`], ['k', String(KIND_CARD)]], content: '',
});

export interface ReadCard {
  pubkey: string;
  callsign: string;
  doing: string | null;
  zone: CardZone | null;
  does: string[];
  labels: string[];
  /** It says it is an AI agent's (MX14). */
  agent: boolean;
  /** When it was signed, unix seconds. */
  at: number;
}

const isPubkey = (k: unknown): k is string => typeof k === 'string' && /^[0-9a-f]{64}$/.test(k);

/** A card as NavCom reads one: refused whole when its content holds any other field; unknown tags dropped. */
export function readCard(event: { kind: number; pubkey: string; content: string; tags: string[][]; created_at: number }): ReadCard | null {
  if (event.kind !== KIND_CARD || !isPubkey(event.pubkey)) return null;
  let content: Record<string, unknown>;
  try { content = JSON.parse(event.content) as Record<string, unknown>; } catch { return null; }
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  if (Object.keys(content).some((k) => !(CARD_FIELDS as readonly string[]).includes(k))) return null;
  const callsign = typeof content.callsign === 'string' ? content.callsign.trim() : '';
  if (!callsign) return null;
  const doing = typeof content.doing === 'string' && content.doing.trim() ? content.doing.trim().slice(0, DOING_MAX) : null;
  const zoneTag = event.tags.find((t) => t[0] === 'area' && t[1] === 'zone' && typeof t[2] === 'string' && t[2].startsWith('zone:'));
  return {
    pubkey: event.pubkey,
    callsign: callsign.slice(0, CALLSIGN_MAX),
    doing,
    zone: zoneTag ? { id: zoneTag[2], name: typeof zoneTag[3] === 'string' && zoneTag[3] ? zoneTag[3] : zoneTag[2] } : null,
    does: [...new Set(event.tags.filter((t) => t[0] === 't' && DOES_IDS.has(t[1])).map((t) => t[1]))].slice(0, DOES_MAX),
    labels: event.tags.filter((t) => t[0] === 'l' && typeof t[1] === 'string').map((t) => t[1]),
    agent: event.tags.some((t) => t[0] === 'agent'),
    at: event.created_at,
  };
}

/** A key's print, as NavCom shows one beside a callsign: its first sixteen hex characters, in fours. */
export function keyPrint(pubkey: string): string | null {
  if (!isPubkey(pubkey)) return null;
  return (pubkey.slice(0, 16).match(/.{4}/g) as string[]).join(' ');
}

export const doesLabel = (id: string): string => DOES.find((d) => d.id === id)?.label ?? id;

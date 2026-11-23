/**
 * What a report rests on, and how it goes out (decision D-MX: MX3, MX19, MX22,
 * MX24).
 *
 * A citation is an event id, and a relay that held it as a hint for whoever
 * fetches it. Published, each is one tag on the event that publishes the
 * report or package, rev 11's wire text: `["e", <id>, <relay>, "cites"]`, the
 * relay empty when none is known. The manifest does not carry them (MX22).
 *
 * A package cites what its linked reports rest on, but only for a report whose
 * own distribution reaches as far as the package goes (MX24). A Public package
 * cites only what Public reports rest on, and a report nobody has decided goes
 * nowhere, its citations with it: a report's basis never leaves through a
 * package its author did not send it in.
 */
import type { ReportCitation } from '../../types/intel/IntelReportUI';
import type { InformationVisibility } from '../../types/intel/IntelItemUI';

const EVENT_ID = /^[0-9a-f]{64}$/;
const RELAY = /^wss?:\/\/\S+$/;

/** A citation, if this is one: an event id, with its relay only when that is a relay. */
function readCitation(value: unknown): ReportCitation | null {
  if (!value || typeof value !== 'object') return null;
  const { eventId, relay } = value as { eventId?: unknown; relay?: unknown };
  if (typeof eventId !== 'string' || !EVENT_ID.test(eventId)) return null;
  return typeof relay === 'string' && RELAY.test(relay) ? { eventId, relay } : { eventId };
}

/** What these rest on together: each event once, in the order first cited, with the first relay given for it. */
export function citationsOf(sources: ReadonlyArray<{ cites?: unknown }>): ReportCitation[] {
  const byId = new Map<string, ReportCitation>();
  for (const source of sources) {
    if (!Array.isArray(source.cites)) continue;
    for (const value of source.cites) {
      const cite = readCitation(value);
      if (!cite) continue;
      const held = byId.get(cite.eventId);
      if (!held) byId.set(cite.eventId, cite);
      else if (!held.relay && cite.relay) byId.set(cite.eventId, { ...held, relay: cite.relay });
    }
  }
  return [...byId.values()];
}

/** How far each distribution reaches. Undecided reaches nowhere. */
const REACH: Record<InformationVisibility, number> = { private: 0, limited: 1, public: 2 };

/**
 * What a package going `to` cites of these reports: the citations of those whose
 * distribution reaches as far, and how many reports were held back for not
 * reaching it (MX24).
 */
export function packageCitations(
  reports: ReadonlyArray<{ visibility?: InformationVisibility; cites?: unknown }>,
  to: InformationVisibility | undefined,
): { cites: ReportCitation[]; heldBack: number } {
  const resting = reports.filter((r) => citationsOf([r]).length > 0);
  const going = resting.filter((r) => to !== undefined && r.visibility !== undefined && REACH[r.visibility] >= REACH[to]);
  return { cites: citationsOf(going), heldBack: resting.length - going.length };
}

/**
 * What a received event cites (MX23): its `["e", id, relay, "cites"]` tags,
 * read back. A tag of another marker, or that is not a citation, is no
 * citation; an event's tags are its author's to write, and are read, never
 * trusted.
 */
export function citationsFromTags(tags: unknown): ReportCitation[] {
  if (!Array.isArray(tags)) return [];
  const cites = tags
    .filter((t): t is unknown[] => Array.isArray(t) && t[0] === 'e' && t[3] === 'cites')
    .map((t) => ({ eventId: t[1], relay: t[2] }));
  return citationsOf([{ cites }]);
}

/** A note's or a mission package's address: kind 30023 or 30079, publisher key and `d` tag (NIP-01). */
const NAMED_ADDRESS = /^(?:30023|30079):[0-9a-f]{64}:[A-Za-z0-9._:~-]{1,200}$/;

/**
 * The note and mission package addresses among these, each once, in order (decision D-IW, IW1 and IW7):
 * what a received note names in its `a` tags, or what storage held of it. Anything else is no reference;
 * both are read, never trusted.
 */
export function namedAddresses(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((v): v is string => typeof v === 'string' && NAMED_ADDRESS.test(v)))];
}

/** One `["e", id, relay, "cites"]` tag per citation, the relay empty when none is known. */
export function citeTags(cites: readonly ReportCitation[]): string[][] {
  return citationsOf([{ cites }]).map((c) => ['e', c.eventId, c.relay ?? '', 'cites']);
}

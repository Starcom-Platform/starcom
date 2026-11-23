/**
 * How a reply names the Mission Package it answers.
 *
 * ─── THE THING THAT BLOCKED A PEER ─────────────────────────────────────────
 *
 * Mecha Jono's board report of 2026-09-20 put this first: "How does a reply
 * thread to a package in your client? We assumed a kind-1 referencing the
 * addressable `a` tag. We accept four conventions and record which one people
 * actually use, but we are guessing."
 *
 * They were guessing because the interchange spec has no return path in it at
 * all, and because the honest answer was that no reply threaded anywhere —
 * Starcom read kind 30079, showed it, and published and subscribed to nothing
 * in response. Their guess was right, and this makes it the convention rather
 * than a guess: a reply is a kind-1 event carrying an `a` tag whose value is
 * the addressable coordinate of the package.
 *
 * ─── WHY THE COORDINATE AND NOT THE EVENT ID ───────────────────────────────
 *
 * Kind 30079 is parameterized-replaceable, so its event id changes every time
 * the package is republished while the package stays the same thing. An `e` tag
 * would pin one revision and fall off the moment the publisher corrected a
 * typo; the coordinate `30079:<pubkey>:<d>` survives that, which is what NIP-01
 * defines addressable events for.
 *
 * That only works if the `d` tag holds still. Until 2026-09-20 it did not —
 * `manifest.id` was minted from the clock on every compose — so this module and
 * the stable id landed together. See MissionPackageBuilder.stableId.test.ts.
 *
 * ─── LIBERAL IN WHAT IT ACCEPTS ────────────────────────────────────────────
 *
 * A reply is matched on the `a` tag alone. It does not have to carry the `t`
 * tags, it does not have to be from a known pubkey, and the content is not
 * parsed. A peer told us they accept four conventions and watch which one gets
 * used; refusing anything well-formed here would make that measurement read
 * our strictness instead of their usage.
 */

/**
 * The kind a Mission Package is published under.
 *
 * Defined here, in the protocol module, and re-exported by
 * MissionPackageBroadcastService for the callers that already import it from
 * there. It was declared in the broadcaster and duplicated here when this file
 * was written, which is exactly the divergence the `d` tag note below warns
 * about — two constants that must agree and nothing making them.
 */
export const MISSION_PACKAGE_KIND = 30079;
/** The prefix the broadcaster puts before a package id in its `d` tag. */
const PACKAGE_D_PREFIX = 'starcom_mission_package_';

/** The `d` tag value for a package id. */
export function packageIdentifier(packageId: string): string {
  return `${PACKAGE_D_PREFIX}${packageId}`;
}

/**
 * The addressable coordinate, `30079:<pubkey>:<d>` — what a reply's `a` tag
 * carries and what a subscription filters on.
 *
 * Takes an identifier rather than a package id, because the broadcaster reads
 * the `d` tag back off the event it just signed instead of rebuilding it from
 * the manifest and hoping the two agree.
 */
export function coordinateFor(pubkey: string, identifier: string): string {
  return `${MISSION_PACKAGE_KIND}:${pubkey}:${identifier}`;
}

export interface ParsedCoordinate {
  kind: number;
  pubkey: string;
  identifier: string;
  /** The package id, with the `d` prefix stripped. Null when it carries none. */
  packageId: string | null;
}

/**
 * Read a coordinate back. Returns null for anything that is not a Mission
 * Package coordinate, INCLUDING another kind's — a reply to someone's long-form
 * post is not a reply to a package and must not be counted as one.
 */
export function parsePackageCoordinate(value: string): ParsedCoordinate | null {
  // Split on the first two colons only: a `d` tag may legally contain them.
  const first = value.indexOf(':');
  if (first < 0) return null;
  const second = value.indexOf(':', first + 1);
  if (second < 0) return null;

  const kind = Number(value.slice(0, first));
  if (!Number.isInteger(kind) || kind !== MISSION_PACKAGE_KIND) return null;

  const pubkey = value.slice(first + 1, second);
  if (!pubkey) return null;

  const identifier = value.slice(second + 1);
  if (!identifier) return null;

  return {
    kind,
    pubkey,
    identifier,
    packageId: identifier.startsWith(PACKAGE_D_PREFIX)
      ? identifier.slice(PACKAGE_D_PREFIX.length) || null
      : null,
  };
}

interface TaggedEvent { tags?: string[][] }

/**
 * Every package coordinate an event's `a` tags name, or its `A` tags: a NIP-22
 * comment names the package it is about as its root (plan item 5.1).
 */
export function repliedCoordinates(event: TaggedEvent): string[] {
  const seen = new Set<string>();
  for (const tag of event.tags ?? []) {
    if ((tag?.[0] !== 'a' && tag?.[0] !== 'A') || typeof tag[1] !== 'string') continue;
    if (parsePackageCoordinate(tag[1])) seen.add(tag[1]);
  }
  return [...seen];
}

/*
 * A `replyTags(coordinate)` helper and an `isReplyTo` predicate were here, for
 * the writing half of this path. Nothing writes replies yet, and the orphan-
 * export guard is right that a capability living only in its own tests is not
 * a capability. They come back with the code that sends a reply.
 */

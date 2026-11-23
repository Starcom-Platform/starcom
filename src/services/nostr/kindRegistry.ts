/**
 * Every Nostr event kind this application uses, in one place.
 *
 * ─── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 *
 * Kind allocation was previously tracked in a comment. `publishTeamStateUpdate`
 * carried a careful one — "Dedicated kind — do not reuse 30078 (PQC prekeys),
 * 30079 (Mission Package), 30082 (Findings), or 30000 (already double-claimed by
 * two unrelated stub subsystems)" — and then chose 30083, the one kind it did
 * not list, which `refutation.ts` already owned and which the PUBLISHED
 * specification reserves for refutations.
 *
 * A comment enumerating four of the five taken kinds is not a registry. It is a
 * snapshot of what one author happened to remember, and it went stale the moment
 * anything else claimed a number. The uniqueness test beside this file is the
 * part that could not have gone stale, which is why the registry rather than a
 * better comment is the fix.
 *
 * ─── RANGES, WHICH ARE NOT COSMETIC ────────────────────────────────────────
 *
 * NIP-01 decides an event's storage semantics from its kind NUMBER, not from
 * anything the event or its author says:
 *
 *     1000–9999      regular       relays keep every one
 *     10000–19999    replaceable   one per (pubkey, kind)
 *     20000–29999    ephemeral     not stored at all
 *     30000–39999    addressable   one per (pubkey, kind, d-tag)
 *
 * So an event's kind silently determines whether publishing a second one keeps
 * or destroys the first. Choosing a number is choosing a retention policy.
 */

/**
 * Reserved for the Attested Claims protocol. These are specified publicly and
 * other nodes build against them, so they are NOT ours to reallocate — a change
 * here breaks peers rather than breaking us.
 */
export const PROTOCOL_KINDS = {
  /** NIP-43: the relay's member list, signed by its own key (NIP-11 `self`). */
  NIP43_MEMBER_LIST: 13534,
  /** NIP-43: a request to join a relay, carrying a claim (an invite code). */
  NIP43_JOIN_REQUEST: 28934,
  /** NIP-98: HTTP authorization, here for NIP-86 relay management calls. */
  NIP98_HTTP_AUTH: 27235,
  /** NIP-59: a seal, the sender's signed and encrypted envelope inside a gift wrap. */
  NIP59_SEAL: 13,
  /** NIP-59: a gift wrap, signed by a key used once and addressed only by a p tag. */
  NIP59_GIFT_WRAP: 1059,
  /** NIP-22: a comment on an item, scoped to it by A/E/K/P tags (plan item 5.1). */
  NIP22_COMMENT: 1111,
  /** NIP-32: a label; a review verdict in the starcom.review namespace (plan item 5.1). */
  NIP32_LABEL: 1985,
  /** Attested Claim. Addressable: one live claim per (author, subject:attribute). */
  ATTESTED_CLAIM: 30082,
  /**
   * Refutation.
   *
   * DEFECT REPORTED 2026-08-26, RESOLVED 2026-08-28. The specification called
   * this a "regular" event and 30083 is addressable, so relays would have
   * replaced on (pubkey, kind, d-tag) — and no d-tag was specified, meaning
   * every refutation an author published overwrote their previous one.
   *
   * Confirmed independently by Mecha Jono against NIP-01's ranges rather than
   * against nostr-tools, whose own relay config had inherited 30083 from the
   * spec text without the contradiction being caught there either.
   *
   * Both implementers chose to keep the kind and specify the d-tag rather than
   * relocate into the regular range; both had zero migration cost, because
   * nobody had published a refutation. See refutationIdentifier() in
   * services/intel/findings/refutation.ts for the derivation, and the spec's
   * Refutation section for why addressable is the correct semantics rather
   * than a compromise.
   */
  REFUTATION: 30083,
  /** Mission Package. Deliberately not merged with ATTESTED_CLAIM. */
  MISSION_PACKAGE: 30079,
  /**
   * A roster item: a larger kind of work (a Directive, an Epic, a Quest, …), specified in the interchange spec's
   * roster section. Missing from this registry until the EIN transition audit of 21 Nov 2026 (finding 2), though
   * `rosterItem.ts` published it and the node descriptor listed it.
   */
  ROSTER_ITEM: 30084,
  /**
   * Dispatch Capability — a signed, delegable grant of authority to publish
   * one Mission Package.
   *
   * In the PROTOCOL block, not the app block, because it is published in the
   * interchange spec and a peer verifying a dispatch has to subscribe to it.
   * Reallocating it breaks them, not just us.
   *
   * Registered late: this kind shipped defined only in its own service, which
   * is the exact arrangement the file header calls "a snapshot of what one
   * author happened to remember". The uniqueness test cannot protect a number
   * it has never been told about.
   */
  DISPATCH_CAPABILITY: 30081,
} as const;

/**
 * Starcom's own kinds. Reallocating one of these breaks only us, which is the
 * whole reason they are kept out of the protocol block above.
 */
export const APP_KINDS = {
  /**
   * Team state broadcast.
   *
   * MOVED off 30083, where it collided with REFUTATION. A peer subscribing to
   * 30083 for refutations — as the published spec instructs — was receiving
   * Starcom team names, member counts and statuses instead.
   *
   * Placed at 30090 rather than 30084 to leave the protocol block room to grow
   * without walking into app kinds again.
   *
   * NO LONGER PUBLISHED (plan item 0.2, 2026-09-26). It went out every two
   * minutes, naming each team, and nothing ever read it. Still allocated,
   * because events of this kind already sit on public relays under Starcom
   * keys, and a new use of the number would give those a meaning they never had.
   */
  TEAM_STATE: 30090,
  /**
   * Team discovery announcement.
   *
   * Moved off 30000, which is NIP-51's follow sets — a kind every list-aware
   * Nostr client already reads. Nothing was ever actually published there (see
   * below), so this is closing a trapdoor rather than fixing a live
   * collision: the moment anyone wired the publish up, our team announcements
   * would have arrived in strangers' follow lists.
   *
   * Adjacent to TEAM_STATE because they are the same subsystem.
   */
  TEAM_ANNOUNCEMENT: 30091,
  /**
   * A team invite link's signature (plan item 2.3): signed by whoever invites,
   * carried in the link, never published. Ephemeral on purpose: the invite
   * code it replaces signed a kind 1 note, so anyone holding a code could
   * publish the inviter's signature to relays as a note; a relay keeps no
   * ephemeral event.
   */
  TEAM_INVITE: 20091,
  /**
   * A request to join a team's relay, from someone with no invite yet (plan
   * item 2.3): signed by the person asking and sent to an admin however they
   * already talk, never published. Ephemeral for the reason TEAM_INVITE is.
   */
  TEAM_ACCESS_REQUEST: 20092,
  /**
   * A bundle's manifest (plan item 2.4): the hashes of the records it carries
   * and the links between them, ML-DSA-signed, in an event signed by the
   * sender. Sent inside a gift wrap or a file, never published in the clear.
   */
  RECORD_BUNDLE: 20093,
  /**
   * One part of a bundle sent over a relay (plan item 2.4): the manifest, or
   * some of its envelopes. Only ever the rumor inside a gift wrap.
   */
  RECORD_BUNDLE_PART: 20094,
  /**
   * A chat message sealed to one person (plan item 2.7): the ML-KEM envelope
   * for them, or text sealed with NIP-44 when they have published no
   * post-quantum key. Only ever the rumor inside a gift wrap.
   */
  CHAT_MESSAGE: 20095,
  /**
   * What the relay conformance check sends, signed by a throwaway key, to see
   * whether a relay takes writes from someone it should not (plan item 2.3a).
   * Ephemeral, so a relay that wrongly takes it keeps nothing.
   */
  RELAY_PROBE: 20096,
  /**
   * An evidence capture's custody record (decision D-EX, E2, W8; EX15): what was captured, from where,
   * when, and each file's SHA-256, signed by whoever captured it. Kept in this browser beside the
   * case, never published: ephemeral, as TEAM_INVITE is, so a relay it ever reached would keep nothing.
   */
  EVIDENCE_CUSTODY: 20097,
  /**
   * A portfolio's attestation (decision D-EX, EX12, EX29): the SHA-256 of a portfolio's exact text, signed
   * by the key whose work it lists, so an advisor can check it is that person's and unchanged. Carried in
   * the portfolio's own files, never published: ephemeral, as EVIDENCE_CUSTODY is.
   */
  PORTFOLIO_ATTESTATION: 20098,
  /** Post-quantum prekey publication. */
  PQC_PREKEY: 30078,
  /** Long-form intel note (NIP-23). Not ours to choose; NIP-23 defines it. */
  LONGFORM_INTEL: 30023,
} as const;

/**
 * Kinds Starcom uses that a NIP or a peer defines (the EIN transition audit, 21 Nov 2026, finding 2). Not ours to
 * allocate; listed so that this registry holds every kind the application touches, and the node descriptor can say
 * so.
 */
export const BORROWED_KINDS = {
  /** NIP-01 profile metadata. */
  PROFILE_METADATA: 0,
  /** NIP-09 deletion request. */
  NIP09_DELETION: 5,
  /** NIP-28 public channel: creation, metadata, message, hidden message, muted user. Plain text. */
  NIP28_CHANNEL_CREATE: 40,
  NIP28_CHANNEL_METADATA: 41,
  NIP28_CHANNEL_MESSAGE: 42,
  NIP28_HIDE_MESSAGE: 43,
  NIP28_MUTE_USER: 44,
  /** NavCom's field observation, which a report cites (D-MX). */
  NAVCOM_OBSERVATION: 1911,
  /** NavCom's mission report, sealed to a mission's signer inside a gift wrap (D-MX, MX28). */
  NAVCOM_MISSION_REPORT: 1912,
  /** NIP-17 inbox relay list. */
  NIP17_INBOX_RELAYS: 10050,
  /** NavCom's RLSH card (D-RF), signed by a contact key of its own. */
  RLSH_CARD: 10911,
  /** NIP-42 relay sign-in: sent to a relay, never stored. */
  NIP42_AUTH: 22242,
  /** NIP-52 time-based calendar event: the windows of Mecha Jono's Psi Watch and Raver Watch. */
  NIP52_TIME_EVENT: 31923,
} as const;

/**
 * Kinds in use that this registry does not govern, recorded so the uniqueness
 * test can see them and so nobody "discovers" them again later.
 *
 * 30000 was double-claimed by PublicInfrastructureService.announceTeamCreation
 * and UnifiedIPFSNostrService.searchDistributedContent. The latter is gone —
 * it was part of the legacy RelayNode IPFS layer, deleted once the shipped
 * relay node turned out to integrate over Nostr/IPFS directly rather than
 * through that abstraction.
 *
 * announceTeamCreation now uses APP_KINDS.TEAM_ANNOUNCEMENT. Nothing claims
 * 30000 any more, and nothing ever published on it — that path builds an event
 * and puts it in a local Map. Worth keeping the history: the collision was
 * latent rather than live, and a latent collision in a kind every list-aware
 * client reads is the kind that activates the day someone finishes the
 * feature and sees no reason to question the number already sitting there.
 */
export const UNGOVERNED_KINDS = {
  /** NIP-04 encrypted direct message. */
  ENCRYPTED_DM: 4,
  /** Short text note; also used for local invite-code signing. */
  TEXT_NOTE: 1,
  /** DOUBLE-CLAIMED by two unrelated stubs. Do not add a third. */
  LEGACY_APP_DATA: 30000,
} as const;

/** Every allocation, for the uniqueness test and for anyone taking a new kind. */
export const ALL_KIND_ALLOCATIONS: ReadonlyArray<readonly [string, number]> = [
  ...Object.entries(PROTOCOL_KINDS),
  ...Object.entries(APP_KINDS),
  ...Object.entries(BORROWED_KINDS),
  ...Object.entries(UNGOVERNED_KINDS),
];

/**
 * What Starcom does with each kind, in a reader's words (the EIN transition audit, 21 Nov 2026, findings 1 and 2).
 * `publishes`: sent to relays. `reads`: asked of relays. `signs`: signed and carried in a link or a file, never sent
 * to a relay. The node descriptor's lists are built from this, and a test fails when a kind number in the code is
 * missing here.
 */
export interface KindUse {
  name: string;
  publishes?: string;
  reads?: string;
  signs?: string;
}

export const KIND_USE: Readonly<Record<number, KindUse>> = {
  0: { name: 'Profile metadata (NIP-01)', reads: 'The profile of a key that signed a mission or a note, for its name.' },
  1: { name: 'Text note (NIP-01)', reads: 'Globe intel notes tagged starcom_intel; replies to Mission Packages; the notes a NavCom operator cites.', signs: 'Invite codes, in the link that carries them.' },
  4: { name: 'Encrypted direct message (NIP-04)', publishes: 'Direct messages through the older chat adapter.', reads: 'Direct messages addressed to this key, in that adapter.' },
  5: { name: 'Deletion request (NIP-09)', publishes: 'The deletion of a report its author withdrew (D-RP, RP7), and of a withdrawn RLSH card.', reads: 'Deletions of RLSH cards.' },
  13: { name: 'Seal (NIP-59)', publishes: 'Inside a gift wrap only.', reads: 'Opened inside gift wraps addressed to this key.' },
  40: { name: 'Public channel creation (NIP-28)', publishes: 'A team channel in the older chat adapter. Plain text.' },
  41: { name: 'Public channel metadata (NIP-28)', publishes: 'A channel\'s name and description in the older chat adapter.' },
  42: { name: 'Public channel message (NIP-28)', publishes: 'Messages through the older chat adapter. Plain text; direct and team messages are sealed instead (plan item 2.7).', reads: 'Messages in such a channel.' },
  43: { name: 'Hidden channel message (NIP-28)', publishes: 'A moderator hiding a message in the older chat adapter.' },
  44: { name: 'Muted channel user (NIP-28)', publishes: 'A moderator muting a key in the older chat adapter.' },
  1059: { name: 'Gift wrap (NIP-59)', publishes: 'Sealed mission reports, bundle parts, direct and team chat, and sealed roster items, each to its recipients only.', reads: 'Gift wraps addressed to this key.' },
  1111: { name: 'Comment (NIP-22)', publishes: 'Comments on Mission Packages, claims and reports (plan item 5.1).', reads: 'Comments on what is shown here, and replies to this key\'s Mission Packages.' },
  1911: { name: 'Field observation (NavCom)', reads: 'NavCom\'s observations, which reports cite (D-MX).' },
  1912: { name: 'Mission report (NavCom)', publishes: 'A report on a mission, sealed to its signer (MX28).', reads: 'Reports sealed to this key on missions it published.' },
  1985: { name: 'Label (NIP-32)', publishes: 'Review verdicts, settlements of mission reports, and steps taken on a team\'s work.', reads: 'The same, on what is shown here.' },
  10050: { name: 'Inbox relay list (NIP-17)', publishes: 'Where this key receives sealed reports, with a mission that asks for them.', reads: 'Another key\'s inbox list, to seal to it.' },
  10911: { name: 'RLSH card (NavCom)', publishes: 'The person\'s RLSH card, signed by its own contact key (D-RF).', reads: 'RLSH cards, for the RLSH list.' },
  13534: { name: 'Relay member list (NIP-43)', reads: 'A team relay\'s list of members.' },
  20091: { name: 'Team invite', signs: 'A team invitation, carried in its link.' },
  20092: { name: 'Team access request', signs: 'A request to join a team, carried to its lead.' },
  20093: { name: 'Record bundle', signs: 'A bundle of records, carried in its file.' },
  20094: { name: 'Record bundle part', publishes: 'Inside a gift wrap only.', reads: 'Opened inside gift wraps addressed to this key.' },
  20095: { name: 'Sealed chat message', publishes: 'Inside a gift wrap only.', reads: 'Opened inside gift wraps addressed to this key.' },
  20096: { name: 'Relay probe', publishes: 'Only to a relay being checked, signed by a key used once.' },
  20097: { name: 'Evidence custody record', signs: 'Carried with captured evidence, in its file.' },
  20098: { name: 'Portfolio attestation', signs: 'Carried in a portfolio\'s file.' },
  22242: { name: 'Relay sign-in (NIP-42)', publishes: 'Sign-in to a team relay or an internal relay the person joined; never stored.' },
  27235: { name: 'HTTP authorization (NIP-98)', signs: 'An HTTP header, for a team relay\'s management calls.' },
  28934: { name: 'Relay join request (NIP-43)', publishes: 'A request to join a team relay, with the invite\'s claim.' },
  30023: { name: 'Long-form note (NIP-23)', publishes: 'People\'s reports and their withdrawals (D-RP); Psi Watch calls, on a team relay; the Exchange\'s and NetRunner\'s announcements.', reads: 'Globe intel; Mecha Jono\'s desks (Raver, Hero, AI and Psi Watch, Civil Unrest, War & Conflict, RLSH recurrence, the Exchange\'s feeds); mission totals.' },
  30078: { name: 'Application data (NIP-78)', publishes: 'Post-quantum prekey bundles, for sealed chat.', reads: 'A contact\'s prekey bundle.' },
  30079: { name: 'Mission Package', publishes: 'Mission Packages.', reads: 'Mission Packages from any author, and Mecha Jono\'s field missions.' },
  30081: { name: 'Dispatch Capability', publishes: 'A delegated or revoked right to dispatch a mission.', reads: 'Capability chains, to check a dispatch.' },
  30082: { name: 'Attested Claim', publishes: 'Findings, with their method.', reads: 'Findings from any author, weighed by method.' },
  30083: { name: 'Refutation', publishes: 'Refutations of findings.', reads: 'Refutations of findings held here.' },
  30084: { name: 'Roster Item', publishes: 'Roster items: in public, on a team relay, or sealed to invitees.', reads: 'Public roster items.' },
  31923: { name: 'Calendar event (NIP-52)', reads: 'The windows of Mecha Jono\'s Psi Watch and Raver Watch.' },
};

/**
 * Allocated and used by nothing (the audit's finding 2): kept, because events of 30090 and 30091 already sit on
 * public relays under Starcom keys, and a new use of a number would give those a meaning they never had.
 */
export const UNUSED_KINDS: ReadonlySet<number> = new Set([30000, 30090, 30091]);

/** NIP-01 storage semantics for a kind. See the range table above. */
export function retentionOf(kind: number): 'regular' | 'replaceable' | 'ephemeral' | 'addressable' | 'other' {
  if (kind >= 1000 && kind <= 9999) return 'regular';
  if (kind >= 10000 && kind <= 19999) return 'replaceable';
  if (kind >= 20000 && kind <= 29999) return 'ephemeral';
  if (kind >= 30000 && kind <= 39999) return 'addressable';
  return 'other';
}

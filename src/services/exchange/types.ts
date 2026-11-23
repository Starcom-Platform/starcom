// MarketExchange v0 types
import type { ReportCitation } from '../../types/intel/IntelReportUI';

export type LicenseType = 'CC-BY' | 'CC0' | 'PROPRIETARY' | 'OPEN';

/**
 * One piece of work a package asks for, as an outsider receives it.
 *
 * ─── WHY THIS IS ITS OWN FIELD AND NOT REPORT CONTENT ──────────────────────
 *
 * The asks used to be rendered into a synthesized report's body, and
 * `reports` cross only as `{id, title, checksum}` — so every one of them left
 * this node as a 32-bit hash while the builder's own comment claimed they
 * crossed. A Mission Package reached a peer as a title, a briefing and a
 * count, which is not enough for anyone to decide whether they could do the
 * work. It lives beside `reports` precisely so the body-content rule does not
 * swallow it.
 *
 * Covered by the manifest's ML-DSA-65 signature, which is a stronger integrity
 * claim than the 32-bit checksum it replaces.
 *
 * ─── WHAT IT DELIBERATELY HAS NO ROOM FOR ──────────────────────────────────
 *
 * The record an objective rests on, and whoever here has taken it. Locked
 * Decision #7 bars a Starcom-internal record id and an operator identity, and
 * there is no field for either — absent by construction, not by filtering.
 */
export interface ObjectiveAsk {
  /**
   * Stable within the package, so one ask can be answered rather than the
   * package as a whole. A peer asked whether a claim should name a thread or
   * a single ask; neither is answerable while an ask has no name on the wire.
   */
  id: string;
  /** What is being asked for. */
  ask: string;
  /** What the doer hands back. Absent means nobody said. */
  handsBack?: string;
  /** Whole minutes. Absent means nobody estimated it. */
  effortMinutes?: number;
  /** Who the work is for. Absent means unstated. */
  for?: string;
  /** What the doer must not do. Absent means no limit was stated. */
  limits?: string[];
  /** Whether it is already finished. */
  done: boolean;
}

export interface PackageManifest {
  id: string;
  name: string;
  version: string; // semver
  description: string;
  /**
   * Who may receive this package.
   *
   * ─── THIS WAS A FOUR-TIER `classification` ────────────────────────────────
   *
   * Navcom-facing, so the change carries a coordination cost and a change note
   * under docs/interchange/. Two things make it safe on this side:
   *
   *   Already-signed packages still verify. manifestDigest stableStringify's
   *   the manifest AS RECEIVED, walking whatever keys are present — so a
   *   manifest signed with `classification` in it hashes the same after this
   *   type changes. Asserted in signing.legacyManifest.test.ts, not assumed.
   *
   *   `visibility` is OPTIONAL where the tier was required. A receiver that
   *   does not understand it is no worse off than one reading a label that
   *   never constrained anything: the tier crossed the wire in plaintext next
   *   to the content it claimed to protect.
   *
   * Read-tolerance for the legacy key lives in the schema, not here.
   */
  visibility?: 'public' | 'limited' | 'private';
  createdAt: string; // ISO
  author: string;
  license: LicenseType;
  reports: Array<{ id: string; title: string; checksum: string; path?: string }>; 
  intel: Array<{ id: string; title?: string; checksum: string; path?: string }>; 
  assets: Array<{ filename: string; checksum: string; size: number }>; 
  /**
   * The work this package asks for. Absent when the mission stated none —
   * "we published no asks" and "there are none" are the same fact, and an
   * absent field says it without a shape to parse.
   */
  objectives?: ObjectiveAsk[];
  /** What NavCom reads of it beside its content. Absent on a package from before rev 11. */
  profile?: PackageProfile;
  metadata: Record<string, unknown>;
}

/**
 * What NavCom reads of a package beside its content (interchange spec rev 11;
 * decision D-MX: MX2, MX11, MX13, MX14). The event carries it as tags, where
 * NavCom reads it; the manifest carries the same values, so the manifest's
 * signature covers them and a receiver can hold the tags to them.
 */
export interface PackageProfile {
  /** Whether anybody is behind it. `claimed` only with `claims: 'one'`. */
  missionState: 'open' | 'closed' | 'claimed';
  /** A task one person takes, or a campaign anybody joins. Absent means many. */
  claims?: 'one' | 'many';
  /**
   * Field work, which NavCom draws on its map: where, as a country's or a
   * state's code and never finer (`us`, `us-ca`), and when it stops applying,
   * in unix seconds.
   */
  fieldWork?: { jurisdiction: string; validUntil: number };
  /** Posted by an agent, under this name. It says who posted; it limits nothing. */
  agent?: string;
}

export interface ComposeInput {
  /**
   * A stable identity for this package, when the caller has one.
   *
   * It becomes `manifest.id` and therefore the `d` tag, which is what makes
   * kind 30079 parameterized-replaceable actually replace: relays keep one
   * event per (kind, pubkey, `d`). Without it the id is minted from the clock,
   * so every republish opened a NEW slot beside the old one and a peer's reply
   * addressed a coordinate this node would never publish into again.
   *
   * Pass the id of the record the package is a publication OF. Callers with no
   * such record may omit it and get a minted one.
   */
  id?: string;
  name: string;
  description: string;
  visibility?: PackageManifest['visibility'];
  license: LicenseType;
  author: string;
  reports: Array<{ id: string; title: string; content: string }>;
  intel: Array<{ id: string; title?: string; content: string }>;
  /**
   * Asks to carry across. Redacted here like `description` rather than like a
   * title: this is free text that genuinely crosses into the manifest, so it
   * takes the full mask including the name heuristic.
   */
  objectives?: ObjectiveAsk[];
  /** Carried as given: it holds codes and numbers, never free text. */
  profile?: PackageProfile;
  assets?: Array<{ filename: string; content: string | Uint8Array }>;
  analysisDeepLink?: string; // optional provenance
  /** Extra manifest metadata beyond analysisDeepLink (e.g. Mission Package's objective/status counts). Merged into PackageManifest.metadata. */
  metadata?: Record<string, unknown>;
  redaction?: {
    stripDeepLink?: boolean;
    maskEmails?: boolean;
    maskNumbers?: boolean; // mask sequences of digits (>= 9)
    /**
     * Best-effort heuristic only, not a guarantee: masks capitalized two-word
     * sequences ("Firstname Lastname"-shaped) in any CASED script — Latin with
     * diacritics, Cyrillic and Greek included.
     *
     * Real false negatives (a lone first name, an ALL-CAPS name, anything not
     * fitting that two-word pattern) and real false positives (any other
     * capitalized two-word phrase — "New York", "United Nations") are both
     * expected. No general-purpose named-entity recognition exists in this app
     * to do better; stated as a limitation, not silently oversold as real
     * redaction.
     *
     * ─── THE LIMIT THAT CANNOT BE FIXED BY IMPROVING THE PATTERN ───────────
     *
     * In scripts with NO CASE — Chinese, Japanese, Korean, Arabic, Hebrew,
     * Thai — this detects nothing at all, and cannot. The whole heuristic is
     * "a capital letter followed by lowercase ones", and those writing systems
     * have no such distinction to key on. 李明 and محمد علي pass through in
     * full, and no widening of the character classes changes that.
     *
     * So: do not rely on this option for a package whose content carries names
     * in an uncased script. It will report nothing was found and be wrong.
     * This was previously true of French, Icelandic, Russian, Greek and Polish
     * names as well — the pattern was ASCII-only while the description was not
     * — which is fixed; the uncased-script limit is not fixable here.
     */
    maskNames?: boolean;
  };
  signing?: {
    enabled: boolean;
    privateKeyHex?: string; // user-provided for local signing
  };
  /**
   * What its report rests on, cited on the event that announces the package
   * (decision D-MX: MX3, MX22). Carried beside the manifest, never in it.
   */
  cites?: ReportCitation[];
}

export interface ComposeResult {
  manifest: PackageManifest;
  blob: Blob; // zipped package (future); for now, JSON blob of manifest
  /** What the announcement cites, beside the manifest (MX22). Absent when it rests on nothing. */
  cites?: ReportCitation[];
}

/**
 * The protocol between Starcom and Starcom Uplink, its browser extension (decision D-EX,
 * docs/missions/01-architecture-decisions/browser-extension.md). One file, imported by both, so a
 * change breaks the build on both sides at once.
 *
 * The app and the extension meet through a bridge script the extension runs only on starcom.app: the
 * page posts a message to its own window, the bridge carries it to the extension, and the answer
 * comes back the same way. It works alike in every browser (Firefox has no `externally_connectable`)
 * and keeps the extension's ID out of the app. Only starcom.app's own page can reach it, as with
 * `externally_connectable`.
 *
 * Every request names its capability and its purpose in words: a stated purpose for every run, as
 * NetRunner's rules ask. An answer is a result, or a refusal of one kind with its reason: "declined",
 * "not granted", "could not reach" and "found nothing" are never the same answer.
 *
 * Pure: no browser APIs here, so both sides and their tests import it as it is.
 */
import { uplinkEn } from '../i18n/uplink/en';

/** Bumped on any change a peer must know of. A newer side answers an older one as it asked. */
export const UPLINK_PROTOCOL = 1;

/** The tag every message on the bridge carries, so the page's other messages are never read as ours. */
export const BRIDGE_CHANNEL = 'starcom-uplink';

/** What the extension can be asked to do; each phase adds its own (E0, then E2's captures). */
export const CAPABILITIES = [
  'activity.read', 'permissions.status', 'permissions.request', 'captures.read', 'captures.kept', 'captures.file', 'inbox.count', 'site.fetch',
  'signer.status', 'signer.import', 'signer.sign', 'signer.encrypt', 'signer.decrypt',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** What each capability is for, in words: the install path and the status chip say these. */
export const CAPABILITY_MEANS: Record<Capability, string> = {
  'activity.read': 'Read the activity log: what Uplink was asked to do, why, and what came of it',
  'permissions.status': 'Say which sites Uplink may reach',
  'permissions.request': 'Ask you to let Uplink reach a site, saying why',
  'captures.read': 'Hand Starcom what you sent it while browsing, to keep in your cases',
  'captures.kept': 'Let go of what you sent, once Starcom has kept it',
  'captures.file': 'Hand Starcom one file of an evidence capture, to keep beside the case',
  'inbox.count': 'Show on its icon how many of your captures wait to be filed',
  'site.fetch': 'Read a site you allowed, for NetRunner: its answer and headers, without your cookies',
  'signer.status': 'Say whether Uplink holds your key, and whether it is unlocked',
  'signer.import': 'Take your key from Starcom into Uplink, sealed under a passphrase you set in Uplink',
  'signer.sign': 'Sign as you: asking first for anything public, quietly for chat and private records',
  'signer.encrypt': 'Seal a message for someone with your key (NIP-44)',
  'signer.decrypt': 'Open a message sealed for you (NIP-44)',
};

/** The kinds of "no", each its own answer. */
export const REFUSALS = ['declined', 'not-granted', 'unreachable', 'not-found', 'refused', 'unsupported'] as const;
export type Refusal = (typeof REFUSALS)[number];

/** Each refusal in words, as the app shows it. */
export const REFUSAL_WORDS: Record<Refusal, string> = uplinkEn.refusals;

export interface CapabilityState {
  id: Capability;
  /** Whether it can be used now, without asking. */
  ready: boolean;
  /** Why not, when it cannot. */
  note?: string;
}

export interface Hello {
  kind: 'hello';
  id: string;
  protocol: number;
  /** The language the page shows (D-ML, ML8): Uplink's own pages follow it. */
  language?: string;
}

export interface HelloAnswer {
  kind: 'hello';
  id: string;
  extensionVersion: string;
  protocol: number;
  capabilities: CapabilityState[];
  /** Captures waiting for Starcom (E2): a page that missed the bridge's notice takes them on hello. */
  waiting?: number;
  /** The count on Uplink's icon now (W7), so Starcom says a count only when it differs from what Uplink shows. */
  inbox?: number;
}

/** What a right-click on "Send to Starcom" sends (E2), and a page captured as evidence (W8). */
export const CAPTURE_KINDS = ['selection', 'link', 'image', 'page', 'evidence'] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

/**
 * Something the person sent to Starcom while browsing (E2): kept by Uplink, on their device, until
 * Starcom takes it into their cases (EX14, EX16).
 */
export interface Capture {
  /** Made by Uplink when it was captured. */
  id: string;
  kind: CaptureKind;
  /** When it was captured, UTC, ISO 8601 ending Z. */
  at: string;
  /** The page it came from, and its title when the browser said it. */
  page: { url: string; title?: string };
  /** The words selected. */
  text?: string;
  /** The selection was longer than Uplink keeps whole, and was cut. */
  cut?: boolean;
  /** A link's address. */
  link?: string;
  /** An image's address. */
  image?: string;
  /** An evidence capture's files, each with its size and SHA-256 (W8). */
  files?: EvidenceFile[];
  /** The width its picture was scaled to (EX22). */
  scaledTo?: number;
  /** Its files' OpenTimestamps proofs, pending until Bitcoin confirms them (W8c, EX18). */
  timestamps?: EvidenceTimestamps;
  /** Why it has none, when it has none. */
  timestampNote?: string;
}

/** An evidence capture's timestamps: which calendars answered, when, and each file's proof as a detached .ots file. */
export interface EvidenceTimestamps {
  calendars: string[];
  /** When the calendars were asked, UTC, ISO 8601 ending Z. */
  at: string;
  /** Base64 of each file's .ots proof, by file. */
  proofs: Partial<Record<EvidenceFileName, string>>;
}

/** The files an evidence capture holds (EX21): its picture, the page's HTML, and its text. */
export const EVIDENCE_FILE_NAMES = ['screenshot.png', 'page.html', 'text.txt'] as const;
export type EvidenceFileName = (typeof EVIDENCE_FILE_NAMES)[number];

export interface EvidenceFile {
  name: EvidenceFileName;
  type: string;
  size: number;
  /** Lowercase hex. */
  sha256: string;
}

/** A site read for NetRunner (W10a, EX32): one public page, GET or HEAD, within Uplink's limits. */
export interface SiteFetchArgs {
  url: string;
  method?: 'GET' | 'HEAD';
  /** The Accept header, the only one a request may set. */
  accept?: string;
  timeoutMs?: number;
  maxBytes?: number;
}

/** What the site answered, as it answered it. */
export interface SiteFetched {
  status: number;
  statusText: string;
  /** The site's own headers, but Set-Cookie, which the browser keeps to itself. */
  headers: Record<string, string>;
  /** The body as UTF-8 text, up to the cap. */
  body: string;
  /** Where the request ended. A browser follows redirects without saying through where. */
  finalUrl: string;
  redirected: boolean;
  elapsedMs: number;
  /** Bytes kept: the whole body, or up to the cap when `truncated`. */
  bytes: number;
  truncated: boolean;
  /** SHA-256 of the bytes kept, lowercase hex. */
  sha256: string;
}

/** An event for Uplink to sign (E3): Uplink adds the pubkey, the id and the signature. */
export interface EventToSign {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}

/** A signed Nostr event, as Uplink returns it. */
export interface SignedEvent extends EventToSign {
  id: string;
  pubkey: string;
  sig: string;
}

export interface ArgsOf {
  'activity.read': { limit?: number };
  'permissions.status': { origins?: string[] };
  'permissions.request': { origins: string[] };
  'captures.read': Record<string, never>;
  'captures.kept': { ids: string[] };
  'captures.file': { id: string; name: EvidenceFileName };
  'inbox.count': { count: number };
  'site.fetch': SiteFetchArgs;
  'signer.status': Record<string, never>;
  /** The key as nsec or hex: the person's own, moving from Starcom's page into Uplink. */
  'signer.import': { nsec: string };
  'signer.sign': { event: EventToSign };
  'signer.encrypt': { peer: string; plaintext: string };
  'signer.decrypt': { peer: string; ciphertext: string };
}

export interface ResultOf {
  'activity.read': { entries: ActivityEntry[] };
  'permissions.status': { granted: string[]; allSites: boolean };
  'permissions.request': { granted: string[] };
  'captures.read': { captures: Capture[] };
  'captures.kept': { released: number };
  'captures.file': { base64: string };
  'inbox.count': Record<string, never>;
  'site.fetch': SiteFetched;
  /** Whether Uplink holds a key, whose, and whether it waits for its passphrase. */
  'signer.status': { held: boolean; pubkey?: string; locked: boolean };
  'signer.import': { pubkey: string };
  'signer.sign': { event: SignedEvent };
  'signer.encrypt': { ciphertext: string };
  'signer.decrypt': { plaintext: string };
}

export interface UplinkRequest<C extends Capability = Capability> {
  kind: 'request';
  id: string;
  capability: C;
  /** Why, in the person's or the app's words: shown in prompts and kept in the activity log. */
  purpose: string;
  /** The same purpose in English, when it is said in another language: shown beneath it where Uplink asks (D-ML, ML9). */
  purposeInEnglish?: string;
  args: ArgsOf[C];
}

export type UplinkAnswer<C extends Capability = Capability> =
  | { kind: 'answer'; id: string; ok: true; result: ResultOf[C] }
  | { kind: 'answer'; id: string; ok: false; refusal: Refusal; reason: string };

/** What a line of the activity log records: something Starcom asked for, something the person sent, or a timestamp asked of the calendars. */
export type ActivityAction = Capability | 'capture' | 'timestamp';

/** One line of the activity log: the person's record of what Uplink did. */
export interface ActivityEntry {
  /** Milliseconds since the epoch: the latest, when it happened more than once. */
  at: number;
  /** How many times in a row it happened, within a minute, when more than once: one line, not many. */
  times?: number;
  capability: ActivityAction;
  purpose: string;
  /** What it touched, where there was something: a site, a page. */
  target?: string;
  outcome: 'ok' | Refusal;
  detail?: string;
}

/**
 * The bridge saying it has arrived: posted when it starts in a page, so a Starcom page that was open
 * when Uplink was installed notices without a reload.
 */
export interface Present {
  kind: 'present';
  id: 'present';
}

/** The bridge saying captures are waiting for Starcom, and how many (E2): the page takes them when it can. */
export interface Captured {
  kind: 'captured';
  id: 'captured';
  waiting: number;
}

export type ToUplink = Hello | UplinkRequest;
export type FromUplink = HelloAnswer | UplinkAnswer | Present | Captured;

export interface BridgeMessage<D extends 'to-uplink' | 'from-uplink' = 'to-uplink' | 'from-uplink'> {
  channel: typeof BRIDGE_CHANNEL;
  direction: D;
  body: D extends 'to-uplink' ? ToUplink : FromUplink;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

/** A purpose is said, short, and plain: 8 to 200 characters, no markup. Null when it will do, else why not. */
export function purposeProblem(purpose: unknown): string | null {
  if (typeof purpose !== 'string') return 'a request must say why it is made';
  const said = purpose.trim();
  if (said.length < 8) return 'the purpose is too short to say why';
  if (said.length > 200) return 'the purpose is longer than 200 characters';
  if (/[<>]/.test(said)) return 'the purpose is plain words, without markup';
  return null;
}

/** A message on the bridge going `direction`, well formed; anything else on the window is not ours. */
export function isBridgeMessage<D extends 'to-uplink' | 'from-uplink'>(x: unknown, direction: D): x is BridgeMessage<D> {
  if (!isObject(x) || x.channel !== BRIDGE_CHANNEL || x.direction !== direction || !isObject(x.body)) return false;
  const body = x.body;
  if (typeof body.id !== 'string' || body.id.length === 0 || body.id.length > 64) return false;
  if (direction === 'to-uplink') {
    if (body.kind === 'hello') {
      return typeof body.protocol === 'number' && (body.language === undefined || (typeof body.language === 'string' && body.language.length <= 16));
    }
    return body.kind === 'request'
      && (CAPABILITIES as readonly string[]).includes(String(body.capability))
      && purposeProblem(body.purpose) === null
      && (body.purposeInEnglish === undefined || purposeProblem(body.purposeInEnglish) === null)
      && isObject(body.args);
  }
  if (body.kind === 'present') return body.id === 'present';
  if (body.kind === 'captured') return body.id === 'captured' && Number.isInteger(body.waiting) && (body.waiting as number) >= 0;
  if (body.kind === 'hello') return typeof body.extensionVersion === 'string' && typeof body.protocol === 'number' && Array.isArray(body.capabilities);
  if (body.kind !== 'answer' || typeof body.ok !== 'boolean') return false;
  return body.ok ? 'result' in body : (REFUSALS as readonly string[]).includes(String(body.refusal)) && typeof body.reason === 'string';
}

/** A refusal as an answer to `id`. */
export const refusal = (id: string, kind: Refusal, reason: string): UplinkAnswer =>
  ({ kind: 'answer', id, ok: false, refusal: kind, reason });

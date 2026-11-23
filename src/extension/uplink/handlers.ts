/**
 * What Starcom Uplink does with a message from the app (decision D-EX, E0): the extension's own
 * decisions, pure, with the browser handed in as a `host`, so they are tested here with the app's
 * tests and the extension's background script only wires the browser to them.
 *
 * It answers only starcom.app's own page (and localhost while developing). Every request is written
 * to the activity log with its purpose and what came of it, refusals included.
 */
import { isLanguage, type LanguageId } from '../../i18n/app/languages';
import {
  BRIDGE_CHANNEL, CAPABILITIES, UPLINK_PROTOCOL, isBridgeMessage, refusal,
  EVIDENCE_FILE_NAMES, type ActivityEntry, type Capability, type CapabilityState, type Capture, type EvidenceFileName, type FromUplink, type HelloAnswer,
  type ResultOf, type SiteFetched, type UplinkAnswer, type UplinkRequest,
} from '../protocol';
import { CAPTURES_WAITING } from './captures';
import { describeFetched, fetchProblem, siteAllowed, type SiteFetchRequest } from './siteFetch';
import { openKey, passphraseProblem, sealKey, secretFromNsec, SEAL_COST, type StoredKey } from './keyStore';
import { asksFirst, kindWords, unsignedProblem } from './signerRules';
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import * as nip44 from 'nostr-tools/nip44';
import { interpolate } from '../../i18n/messages';
import type { UplinkMessages } from '../../i18n/uplink/en';

/** What the extension gives these decisions: the browser, behind a small face of its own. */
export interface UplinkHost {
  version: string;
  now(): number;
  readActivity(): Promise<ActivityEntry[]>;
  appendActivity(entry: ActivityEntry): Promise<void>;
  /** The site patterns Uplink may reach now. */
  grantedOrigins(): Promise<string[]>;
  /** Shows the person the purpose and the sites, and asks; their click is the browser's user gesture. */
  askToGrant(origins: string[], purpose: string, purposeInEnglish?: string): Promise<'granted' | 'declined'>;
  /** What the person sent to Starcom that Starcom has not yet kept (E2). */
  readCaptures(): Promise<Capture[]>;
  /** Lets go of the captures Starcom kept; how many went. */
  releaseCaptures(ids: string[]): Promise<number>;
  /** How many captures wait to be filed in Starcom, for the toolbar icon (W7). */
  setInboxCount(count: number): Promise<void>;
  /** The count the icon shows now. */
  readInboxCount(): Promise<number>;
  /** Keeps the language a Starcom page shows, for Uplink's own pages (D-ML, ML8). */
  rememberLanguage(language: LanguageId): Promise<void>;
  /** Uplink's words in that language: the reasons it gives the person are said in them. */
  words(): Promise<UplinkMessages>;
  /** One file of an evidence capture, as base64, or null when Uplink holds no such file (W8). */
  readCaptureFile(captureId: string, name: EvidenceFileName): Promise<string | null>;
  /** Reads a site the person allowed, as checked here (W10a): its answer, or why it could not be reached. */
  fetchSite(request: SiteFetchRequest): Promise<{ fetched: SiteFetched } | { failed: string }>;
  /** The person's key, sealed, or null when Uplink holds none (E3). */
  readStoredKey(): Promise<StoredKey | null>;
  saveStoredKey(key: StoredKey): Promise<void>;
  /** The key opened for this browser session, or null while it is locked. */
  readUnlocked(): Promise<Uint8Array | null>;
  rememberUnlocked(secret: Uint8Array | null): Promise<void>;
  /**
   * Asks in Uplink's own window: a new passphrase ('set', typed twice), or the one that opens the key
   * ('unlock'). Null when the person closes or cancels. Starcom's page never sees it.
   */
  askPassphrase(mode: 'set' | 'unlock', purpose: string, pubkey: string, note?: string, purposeInEnglish?: string): Promise<string | null>;
  /** Shows what is to be signed, and why, in Uplink's own window; the person's answer. */
  askToSign(summary: SignSummary, purpose: string, purposeInEnglish?: string): Promise<'sign' | 'declined'>;
  /** scrypt's cost for sealing: NIP-49's 16 unless a test asks for less. */
  sealCost?: number;
}

/** What Uplink shows before it signs something public (EX41). */
export interface SignSummary {
  /** The kind in words: "an intel report". */
  what: string;
  kind: number;
  /** Its title, when it has one. */
  title?: string;
  /** The first of its words, as text. */
  words: string;
}

const isHex64 = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{64}$/.test(x);
const MAX_SEALED = 256 * 1024;

/** The key opened, asking for the passphrase in Uplink's window when it is locked: three tries, then no. */
async function openedKey(host: UplinkHost, purpose: string, purposeInEnglish?: string): Promise<Uint8Array | { refusal: 'declined' | 'not-found'; reason: string }> {
  const stored = await host.readStoredKey();
  const why = (await host.words()).reasons;
  if (!stored) return { refusal: 'not-found', reason: why.noKey };
  const unlocked = await host.readUnlocked();
  if (unlocked && getPublicKey(unlocked) === stored.pubkey) return unlocked;
  let note: string | undefined;
  for (let tries = 0; tries < 3; tries++) {
    const passphrase = await host.askPassphrase('unlock', purpose, stored.pubkey, note, purposeInEnglish);
    if (passphrase === null) return { refusal: 'declined', reason: why.didNotUnlock };
    try {
      const secret = openKey(stored, passphrase);
      await host.rememberUnlocked(secret);
      return secret;
    } catch (e) {
      note = e instanceof Error ? e.message : 'That passphrase does not open this key.';
    }
  }
  return { refusal: 'declined', reason: why.passphraseFailed };
}

/** The pages Uplink answers: Starcom, and Starcom running locally while it is developed. */
export function isStarcomPage(url: string | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol === 'https:' && (parsed.hostname === 'starcom.app' || parsed.hostname === 'www.starcom.app')) return true;
  return parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
}

/**
 * The Starcom page a message came from, or undefined when it is not Starcom asking. The frame's own page
 * must be Starcom's, and its tab's top page Starcom's too, or Uplink's own page (its side panel page,
 * opened as a tab), or there is no tab (the side panel itself). Starcom framed by any other site is
 * not Starcom asking: starcom.app lets only Uplink frame it, and this holds even if that slipped.
 */
export function starcomSenderUrl(sender: { url?: string; tabUrl?: string }, uplinkOrigin: string): string | undefined {
  const { url, tabUrl } = sender;
  if (!isStarcomPage(url)) return undefined;
  if (tabUrl === undefined || isStarcomPage(tabUrl) || tabUrl.startsWith(uplinkOrigin)) return url;
  return undefined;
}

/** The patterns of Starcom's own pages, which the bridge runs on: never counted as a site Uplink may reach. */
const STARCOM_PATTERNS = ['https://starcom.app/*', 'https://www.starcom.app/*', 'http://localhost/*', 'http://127.0.0.1/*'];
export const isStarcomPattern = (pattern: string) => STARCOM_PATTERNS.includes(pattern);

/** Every site at once: power mode (EX3), asked for only as itself. */
export const ALL_SITES = ['https://*/*', 'http://*/*'] as const;

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0|\[?::1\]?|\[?f[cd][0-9a-f]{2}:)/i;

/**
 * Why a site pattern may not be asked for, or null when it may: one real site (`https://example.com/*`,
 * subdomains as `https://*.example.com/*`), never the person's own network, never a bare wildcard.
 */
export function originProblem(pattern: string): string | null {
  const m = /^(https?):\/\/(\*\.)?([^/*]+)\/\*$/.exec(pattern);
  if (!m) return `"${pattern}" is not one site`;
  const host = m[3].toLowerCase();
  if (PRIVATE_HOST.test(host)) return `${host} is on a private network, which Uplink never reaches`;
  if (!host.includes('.')) return `${host} is not a site on the internet`;
  return null;
}

export function capabilityStates(): CapabilityState[] {
  return CAPABILITIES.map((id) => ({ id, ready: true }));
}

const isPowerMode = (origins: string[]) =>
  origins.length === ALL_SITES.length && ALL_SITES.every((o) => origins.includes(o));

async function answer<C extends Capability>(request: UplinkRequest<C>, host: UplinkHost): Promise<{ answer: UplinkAnswer; target?: string; detail?: string }> {
  const ok = (result: ResultOf[C]): UplinkAnswer => ({ kind: 'answer', id: request.id, ok: true, result } as UplinkAnswer);
  switch (request.capability) {
    case 'activity.read': {
      const { limit = 200 } = request.args as { limit?: number };
      const entries = (await host.readActivity()).slice(-Math.max(1, Math.min(limit, 1000)));
      return { answer: ok({ entries } as ResultOf[C]) };
    }
    case 'permissions.status': {
      // Sites the person allowed; Starcom's own pages, which the bridge runs on, are not among them.
      const granted = (await host.grantedOrigins()).filter((g) => !isStarcomPattern(g));
      return { answer: ok({ granted, allSites: isPowerMode(granted.filter((g) => (ALL_SITES as readonly string[]).includes(g))) } as ResultOf[C]) };
    }
    case 'permissions.request': {
      const { origins } = request.args as { origins: string[] };
      if (!Array.isArray(origins) || origins.length === 0) return { answer: refusal(request.id, 'refused', 'no site was named') };
      if (!isPowerMode(origins)) {
        const problem = origins.map(originProblem).find(Boolean);
        if (problem) return { answer: refusal(request.id, 'refused', problem), target: origins.join(' ') };
      }
      const said = await host.askToGrant(origins, request.purpose, request.purposeInEnglish);
      if (said === 'declined') return { answer: refusal(request.id, 'declined', (await host.words()).reasons.didNotAllow), target: origins.join(' ') };
      const granted = await host.grantedOrigins();
      return { answer: ok({ granted: origins.filter((o) => granted.includes(o)) } as ResultOf[C]), target: origins.join(' ') };
    }
    case 'captures.read': {
      const captures = await host.readCaptures();
      return { answer: ok({ captures } as ResultOf[C]), detail: `${captures.length} capture${captures.length === 1 ? '' : 's'}` };
    }
    case 'captures.kept': {
      const { ids } = request.args as { ids?: unknown };
      if (!Array.isArray(ids) || ids.length > CAPTURES_WAITING || !ids.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 64)) {
        return { answer: refusal(request.id, 'refused', 'captures are let go by a list of their ids') };
      }
      const released = await host.releaseCaptures(ids as string[]);
      return { answer: ok({ released } as ResultOf[C]), detail: `${released} kept by Starcom` };
    }
    case 'captures.file': {
      const { id, name } = request.args as { id?: unknown; name?: unknown };
      if (typeof id !== 'string' || id.length === 0 || id.length > 64 || !(EVIDENCE_FILE_NAMES as readonly unknown[]).includes(name)) {
        return { answer: refusal(request.id, 'refused', 'a file is asked for by its capture and one of its names') };
      }
      const target = `${id} ${name as string}`;
      const base64 = await host.readCaptureFile(id, name as EvidenceFileName);
      if (base64 === null) return { answer: refusal(request.id, 'not-found', (await host.words()).reasons.noSuchFile), target };
      return { answer: ok({ base64 } as ResultOf[C]), target };
    }
    case 'inbox.count': {
      const { count } = request.args as { count?: unknown };
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > 1_000_000) {
        return { answer: refusal(request.id, 'refused', 'the count is a whole number of captures') };
      }
      await host.setInboxCount(count);
      return { answer: ok({} as ResultOf[C]), detail: `${count} to file` };
    }
    case 'site.fetch': {
      const asked = (request.args as { url?: unknown }).url;
      const target = typeof asked === 'string' ? asked.slice(0, 300) : undefined;
      const checked = fetchProblem(request.args);
      if ('problem' in checked) return { answer: refusal(request.id, 'refused', checked.problem), target };
      // Asked at first use by the app, in the grant window (EX3); never by a read.
      if (!siteAllowed(checked.request.url, await host.grantedOrigins())) {
        return { answer: refusal(request.id, 'not-granted', interpolate((await host.words()).reasons.siteNotAllowed, { site: new URL(checked.request.url).hostname })), target };
      }
      const got = await host.fetchSite(checked.request);
      if ('failed' in got) return { answer: refusal(request.id, 'unreachable', got.failed), target };
      return { answer: ok(got.fetched as ResultOf[C]), target, detail: describeFetched(got.fetched) };
    }
    case 'signer.status': {
      const stored = await host.readStoredKey();
      const unlocked = stored ? await host.readUnlocked() : null;
      return {
        answer: ok((stored
          ? { held: true, pubkey: stored.pubkey, locked: !(unlocked && getPublicKey(unlocked) === stored.pubkey) }
          : { held: false, locked: false }) as ResultOf[C]),
      };
    }
    case 'signer.import': {
      const { nsec } = request.args as { nsec?: unknown };
      let secret: Uint8Array;
      try { secret = secretFromNsec(String(nsec ?? '')); } catch (e) { return { answer: refusal(request.id, 'refused', e instanceof Error ? e.message : 'That is not a Nostr secret key.') }; }
      const pubkey = getPublicKey(secret);
      const held = await host.readStoredKey();
      if (held && held.pubkey !== pubkey) return { answer: refusal(request.id, 'refused', (await host.words()).reasons.anotherKey), target: pubkey };
      if (held) return { answer: ok({ pubkey } as ResultOf[C]), target: pubkey, detail: 'already held' };
      const passphrase = await host.askPassphrase('set', request.purpose, pubkey, undefined, request.purposeInEnglish);
      if (passphrase === null) return { answer: refusal(request.id, 'declined', (await host.words()).reasons.didNotSetPassphrase), target: pubkey };
      const problem = passphraseProblem(passphrase);
      if (problem) return { answer: refusal(request.id, 'refused', problem), target: pubkey };
      await host.saveStoredKey(sealKey(secret, passphrase, new Date(host.now()), host.sealCost ?? SEAL_COST));
      await host.rememberUnlocked(secret);
      return { answer: ok({ pubkey } as ResultOf[C]), target: pubkey, detail: 'sealed under your passphrase' };
    }
    case 'signer.sign': {
      const { event } = request.args as { event?: unknown };
      const problem = unsignedProblem(event);
      if (problem) return { answer: refusal(request.id, 'refused', problem) };
      const e = event as { kind: number; created_at: number; tags: string[][]; content: string };
      const what = kindWords(e.kind);
      const secret = await openedKey(host, request.purpose, request.purposeInEnglish);
      if (!(secret instanceof Uint8Array)) return { answer: refusal(request.id, secret.refusal, secret.reason), target: what };
      const asked = asksFirst(e.kind);
      if (asked) {
        const title = e.tags.find((t) => t[0] === 'title')?.[1];
        const said = await host.askToSign({ what, kind: e.kind, ...(title ? { title } : {}), words: e.content.slice(0, 600) }, request.purpose, request.purposeInEnglish);
        if (said !== 'sign') return { answer: refusal(request.id, 'declined', (await host.words()).reasons.didNotSign), target: what };
      }
      const signed = finalizeEvent({ kind: e.kind, created_at: e.created_at, tags: e.tags, content: e.content }, secret);
      const plain = { id: signed.id, pubkey: signed.pubkey, sig: signed.sig, kind: signed.kind, created_at: signed.created_at, tags: signed.tags, content: signed.content };
      return { answer: ok({ event: plain } as ResultOf[C]), target: what, detail: asked ? 'you agreed' : 'quietly: private' };
    }
    case 'signer.encrypt':
    case 'signer.decrypt': {
      const { peer, plaintext, ciphertext } = request.args as { peer?: unknown; plaintext?: unknown; ciphertext?: unknown };
      const text = request.capability === 'signer.encrypt' ? plaintext : ciphertext;
      if (!isHex64(peer) || typeof text !== 'string' || text.length > MAX_SEALED) {
        return { answer: refusal(request.id, 'refused', 'a message is sealed or opened with one person\'s key, and is under 256 KB') };
      }
      const secret = await openedKey(host, request.purpose, request.purposeInEnglish);
      if (!(secret instanceof Uint8Array)) return { answer: refusal(request.id, secret.refusal, secret.reason) };
      const conversation = nip44.getConversationKey(secret, peer);
      if (request.capability === 'signer.encrypt') return { answer: ok({ ciphertext: nip44.encrypt(text, conversation) } as ResultOf[C]) };
      try {
        return { answer: ok({ plaintext: nip44.decrypt(text, conversation) } as ResultOf[C]) };
      } catch {
        return { answer: refusal(request.id, 'refused', (await host.words()).reasons.notSealedForYou) };
      }
    }
    default:
      return { answer: refusal((request as UplinkRequest).id, 'unsupported', 'this version of Uplink does not do that') };
  }
}

/**
 * A message from the bridge, from the page at `senderUrl`. Null for anything that is not ours (the
 * bridge passes only our channel's, but this is checked again here, where it matters).
 */
export async function handleToUplink(received: unknown, senderUrl: string | undefined, host: UplinkHost): Promise<FromUplink | null> {
  const message: unknown = { channel: BRIDGE_CHANNEL, direction: 'to-uplink', body: received };
  if (!isBridgeMessage(message, 'to-uplink')) return null;
  const body = message.body;
  if (!isStarcomPage(senderUrl)) return refusal(body.id, 'refused', 'Uplink answers only starcom.app');
  if (body.kind === 'hello') {
    // Only a language Starcom has, and only from Starcom's own pages (checked above).
    if (isLanguage(body.language)) await host.rememberLanguage(body.language);
    const waiting = (await host.readCaptures()).length;
    const hello: HelloAnswer = {
      kind: 'hello', id: body.id, extensionVersion: host.version, protocol: UPLINK_PROTOCOL, capabilities: capabilityStates(), waiting,
      inbox: await host.readInboxCount(),
    };
    return hello;
  }
  const { answer: said, target, detail } = await answer(body, host);
  const entry: ActivityEntry = { at: host.now(), capability: body.capability, purpose: body.purpose, ...(target ? { target } : {}), outcome: 'ok', ...(detail ? { detail } : {}) };
  if (said.ok === false) {
    entry.outcome = said.refusal;
    entry.detail = said.reason;
  }
  await host.appendActivity(entry);
  return said;
}

/** How many lines the activity log keeps: the oldest go first. */
export const ACTIVITY_KEPT = 2000;

/** How close the same use must follow itself to share its line. */
const SAME_RUN_MS = 60_000;

/**
 * The log with one more line, the oldest dropped past ACTIVITY_KEPT. The same use again within a minute
 * (same capability, purpose, target, outcome and detail) is counted on the last line rather than written
 * again: a chat opening a hundred messages is one line, "×100", not a hundred.
 */
export function withEntry(log: readonly ActivityEntry[], entry: ActivityEntry): ActivityEntry[] {
  const last = log[log.length - 1];
  const same = last && entry.at - last.at <= SAME_RUN_MS
    && last.capability === entry.capability && last.purpose === entry.purpose && last.target === entry.target
    && last.outcome === entry.outcome && last.detail === entry.detail;
  if (same) return [...log.slice(0, -1), { ...last, at: entry.at, times: (last.times ?? 1) + 1 }];
  return [...log, entry].slice(-ACTIVITY_KEPT);
}

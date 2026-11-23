/**
 * Whether a relay keeps what a team sends it to the team (plan item 2.3a),
 * checked before Starcom trusts it as a team's relay.
 *
 * A team's Limited work and its members' sign-ins go to its relay, so a relay
 * that lets anyone read makes that work public, and one that lets anyone
 * write lets anyone speak there. Six things are checked, each from outside:
 *
 *   describes-itself       it answers NIP-11, so its own key can be read;
 *   asks-who-signs-in      it sends a NIP-42 challenge;
 *   reads-need-sign-in     it serves nothing to someone not signed in;
 *   writes-need-sign-in    it takes nothing from someone not signed in;
 *   outsiders-cannot-read  a key that is not a member, signed in, reads nothing;
 *   outsiders-cannot-write and writes nothing.
 *
 * The check signs in only with a key made for it and thrown away, never the
 * person's: a sign-in says who is signing in. What it writes is an ephemeral
 * event (APP_KINDS.RELAY_PROBE), so a relay that wrongly takes it keeps
 * nothing. What a member can be sent, gift wraps included, needs a member's
 * key to see, and is not checked here. `npm run relay:check` runs these six
 * from outside, for whoever runs a relay.
 */
import { AbstractRelay } from 'nostr-tools/abstract-relay';
import { finalizeEvent, generateSecretKey, verifyEvent, type EventTemplate, type VerifiedEvent } from 'nostr-tools';
import { readRelayInfo, type RelayInfo } from './relayInfo';
import { APP_KINDS } from './kindRegistry';

export type ConformanceCheck =
  | 'describes-itself'
  | 'asks-who-signs-in'
  | 'reads-need-sign-in'
  | 'writes-need-sign-in'
  | 'outsiders-cannot-read'
  | 'outsiders-cannot-write';

/** `unknown` is its own answer: a check that could not be made is not one that passed. */
export type Outcome = 'holds' | 'fails' | 'unknown';

export interface CheckResult {
  check: ConformanceCheck;
  outcome: Outcome;
  /** What it means, for a person. */
  says: string;
  /** What the relay answered, word for word, when it answered. */
  relaySaid?: string;
}

export interface ConformanceReport {
  url: string;
  info?: RelayInfo;
  results: CheckResult[];
  /** Every check holds. Anything less, and Starcom does not use it for a team. */
  keepsItToMembers: boolean;
}

/**
 * A refusal for want of a sign-in or of membership (NIP-01 machine-readable
 * prefixes). Not "blocked": The Record answered the probe "blocked: kind 20096
 * not accepted", which is about the kind, and says nothing of who may write.
 */
const REFUSED = /^(auth-required|restricted):/;

type Answer = { kind: 'refused' | 'other'; said: string } | { kind: 'served' } | { kind: 'silent' };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A key made for one check and thrown away. */
function throwaway() {
  const secret = generateSecretKey();
  return {
    sign: (template: EventTemplate) => Promise.resolve(finalizeEvent(template, secret) as VerifiedEvent),
    probe: () => finalizeEvent({ kind: APP_KINDS.RELAY_PROBE, created_at: Math.floor(Date.now() / 1000), tags: [], content: 'Starcom relay check' }, secret),
  };
}

/**
 * A WebSocket whose close() can be called again while it is closing. In Node,
 * where the operator's check runs, closing a socket still connecting fires
 * `error` at once, nostr-tools answers that by closing it again, and the two
 * recurse until the stack runs out: a relay that could not be reached crashed
 * the check instead of being reported. A browser never re-enters, so nothing
 * changes there.
 */
const ClosesOnce = typeof globalThis.WebSocket === 'undefined' ? undefined : class extends globalThis.WebSocket {
  private closing = false;
  close(code?: number, reason?: string): void {
    if (this.closing) return;
    this.closing = true;
    super.close(code, reason);
  }
};

/** A connection to a relay, as every check makes one. */
async function openRelay(url: string, timeoutMs: number): Promise<AbstractRelay> {
  const relay = new AbstractRelay(url, { verifyEvent, websocketImplementation: ClosesOnce as typeof WebSocket });
  relay.publishTimeout = timeoutMs;
  await relay.connect({ timeout: timeoutMs });
  return relay;
}

/** Whether the relay sends a challenge within the time given. */
async function hearsChallenge(relay: AbstractRelay, timeoutMs: number): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if ((relay as unknown as { challenge?: string }).challenge) return true;
    await sleep(25);
  }
  return false;
}

/** Asks for anything, and hears whether it is served, refused, or not answered. */
function read(relay: AbstractRelay, timeoutMs: number): Promise<Answer> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (answer: Answer) => { if (!settled) { settled = true; clearTimeout(timer); resolve(answer); } };
    // Settled before closing: closing calls onclose, which would answer first.
    const sub = relay.subscribe([{ limit: 1 }], {
      oneose: () => { done({ kind: 'served' }); sub.close(); },
      onevent: () => { done({ kind: 'served' }); sub.close(); },
      onclose: (reason) => done(REFUSED.test(reason) ? { kind: 'refused', said: reason } : { kind: 'other', said: reason }),
    });
    const timer = setTimeout(() => { done({ kind: 'silent' }); sub.close(); }, timeoutMs);
  });
}

async function write(relay: AbstractRelay, event: ReturnType<ReturnType<typeof throwaway>['probe']>): Promise<Answer> {
  try {
    await relay.publish(event);
    return { kind: 'served' };
  } catch (e) {
    const said = e instanceof Error ? e.message : String(e);
    if (/timed out/.test(said)) return { kind: 'silent' };
    return REFUSED.test(said) ? { kind: 'refused', said } : { kind: 'other', said };
  }
}

const unknown = (check: ConformanceCheck, why: string, relaySaid?: string): CheckResult =>
  ({ check, outcome: 'unknown', says: `Could not tell: ${why}`, ...(relaySaid ? { relaySaid } : {}) });

/** One answer as a result, with the words for each way it can go. */
function judge(check: ConformanceCheck, answer: Answer, words: { holds: string; fails: string }): CheckResult {
  switch (answer.kind) {
    case 'refused': return { check, outcome: 'holds', says: words.holds, relaySaid: answer.said };
    case 'served': return { check, outcome: 'fails', says: words.fails };
    case 'other': return unknown(check, 'it refused, but not for want of a sign-in.', answer.said);
    case 'silent': return unknown(check, 'it did not answer in time.');
  }
}

export async function checkRelayConformance(url: string, options: { timeoutMs?: number } = {}): Promise<ConformanceReport> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const results: CheckResult[] = [];

  let info: RelayInfo | undefined;
  try {
    info = await readRelayInfo(url, timeoutMs);
    results.push({
      check: 'describes-itself', outcome: 'holds',
      says: `It describes itself${info.name ? ` as "${info.name}"` : ''}${info.relayPubkey ? ', with its own key' : ', without its own key'}.`,
    });
  } catch (e) {
    results.push({ check: 'describes-itself', outcome: 'fails', says: e instanceof Error ? e.message : String(e) });
  }

  // Someone not signed in: is anything read to them, or taken from them?
  let anonymous: AbstractRelay | null = null;
  let asked: boolean | null = null;
  try {
    anonymous = await openRelay(url, timeoutMs);
    asked = await hearsChallenge(anonymous, timeoutMs);
    results.push(asked
      ? { check: 'asks-who-signs-in', outcome: 'holds', says: 'It asks who is signing in (NIP-42).' }
      : { check: 'asks-who-signs-in', outcome: 'fails', says: 'It never asks who is signing in, so it cannot tell members from anyone else.' });
    results.push(judge('reads-need-sign-in', await read(anonymous, timeoutMs), {
      holds: 'It reads nothing to someone not signed in.',
      fails: 'It serves what it holds to anyone, signed in or not.',
    }));
    results.push(judge('writes-need-sign-in', await write(anonymous, throwaway().probe()), {
      holds: 'It takes nothing from someone not signed in.',
      fails: 'It takes events from anyone, signed in or not.',
    }));
  } catch (e) {
    const why = `it could not be reached (${e instanceof Error ? e.message : String(e)}).`;
    for (const check of ['asks-who-signs-in', 'reads-need-sign-in', 'writes-need-sign-in'] as const) {
      if (!results.some((r) => r.check === check)) results.push(unknown(check, why));
    }
  } finally {
    anonymous?.close();
  }

  // Someone signed in who is not a member.
  let outsider: AbstractRelay | null = null;
  const stranger = throwaway();
  try {
    // A relay that did not ask the first time is not waited on again.
    if (asked === false) throw new Error('it never asked who is signing in');
    outsider = await openRelay(url, timeoutMs);
    if (!(await hearsChallenge(outsider, timeoutMs))) {
      for (const check of ['outsiders-cannot-read', 'outsiders-cannot-write'] as const) results.push(unknown(check, 'it never asked who is signing in.'));
    } else {
      let turnedAway: string | null = null;
      try {
        await outsider.auth(stranger.sign);
      } catch (e) {
        turnedAway = e instanceof Error ? e.message : String(e);
      }
      if (turnedAway !== null) {
        const says = 'It turns away a key that is not a member at sign-in.';
        results.push({ check: 'outsiders-cannot-read', outcome: 'holds', says, relaySaid: turnedAway });
        results.push({ check: 'outsiders-cannot-write', outcome: 'holds', says, relaySaid: turnedAway });
      } else {
        results.push(judge('outsiders-cannot-read', await read(outsider, timeoutMs), {
          holds: 'A key that is not a member, signed in, reads nothing.',
          fails: 'Any key that signs in can read it: signing in is not membership here.',
        }));
        results.push(judge('outsiders-cannot-write', await write(outsider, stranger.probe()), {
          holds: 'A key that is not a member, signed in, can write nothing.',
          fails: 'Any key that signs in can write to it: signing in is not membership here.',
        }));
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const why = asked === false ? `${message}.` : `it could not be reached (${message}).`;
    for (const check of ['outsiders-cannot-read', 'outsiders-cannot-write'] as const) {
      if (!results.some((r) => r.check === check)) results.push(unknown(check, why));
    }
  } finally {
    outsider?.close();
  }

  return { url, info, results, keepsItToMembers: results.every((r) => r.outcome === 'holds') };
}

/**
 * Why Starcom does not use a relay for a team, in one sentence for a person:
 * the first check that did not hold. Null when every check holds.
 */
export function whyNotTrusted(report: ConformanceReport): string | null {
  const first = report.results.find((r) => r.outcome !== 'holds');
  return first ? `Starcom will not use ${report.url} for a team. ${first.says}` : null;
}

/**
 * The protocol between Starcom and Starcom Uplink (decision D-EX): what may cross the bridge, a stated
 * purpose on every request, and refusals that keep "declined", "not granted", "could not reach" and
 * "found nothing" apart.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  BRIDGE_CHANNEL, CAPABILITIES, CAPABILITY_MEANS, REFUSALS, REFUSAL_WORDS, UPLINK_PROTOCOL,
  isBridgeMessage, purposeProblem, refusal,
} from '../protocol';

const toUplink = (body: object) => ({ channel: BRIDGE_CHANNEL, direction: 'to-uplink', body });
const fromUplink = (body: object) => ({ channel: BRIDGE_CHANNEL, direction: 'from-uplink', body });
const PURPOSE = 'Show which sites NetRunner may scan';

describe('the bridge', () => {
  it('carries a hello and a request with its purpose to Uplink', () => {
    expect(UPLINK_PROTOCOL).toBe(1);
    expect(isBridgeMessage(toUplink({ kind: 'hello', id: 'h1', protocol: 1 }), 'to-uplink')).toBe(true);
    expect(isBridgeMessage(toUplink({ kind: 'request', id: 'r1', capability: 'permissions.status', purpose: PURPOSE, args: {} }), 'to-uplink')).toBe(true);
  });

  it('reads nothing else on the window as ours', () => {
    expect(isBridgeMessage({ channel: 'someone-else', direction: 'to-uplink', body: { kind: 'hello', id: 'h', protocol: 1 } }, 'to-uplink')).toBe(false);
    expect(isBridgeMessage(toUplink({ kind: 'hello', id: 'h', protocol: 1 }), 'from-uplink')).toBe(false);
    expect(isBridgeMessage('hello', 'to-uplink')).toBe(false);
    expect(isBridgeMessage(toUplink({ kind: 'hello', id: '', protocol: 1 }), 'to-uplink')).toBe(false);
    expect(isBridgeMessage(toUplink({ kind: 'hello', id: 'x'.repeat(65), protocol: 1 }), 'to-uplink')).toBe(false);
  });

  it('refuses a request for a capability Uplink does not have, or with no purpose', () => {
    expect(isBridgeMessage(toUplink({ kind: 'request', id: 'r', capability: 'cookies.read', purpose: PURPOSE, args: {} }), 'to-uplink')).toBe(false);
    expect(isBridgeMessage(toUplink({ kind: 'request', id: 'r', capability: 'activity.read', args: {} }), 'to-uplink')).toBe(false);
    expect(isBridgeMessage(toUplink({ kind: 'request', id: 'r', capability: 'activity.read', purpose: 'why', args: {} }), 'to-uplink')).toBe(false);
  });

  it('carries the bridge\'s announcement that it has arrived, so an open page notices an install', () => {
    expect(isBridgeMessage(fromUplink({ kind: 'present', id: 'present' }), 'from-uplink')).toBe(true);
    expect(isBridgeMessage(toUplink({ kind: 'present', id: 'present' }), 'to-uplink')).toBe(false);
  });

  it('carries the bridge\'s word that captures are waiting, and how many (E2)', () => {
    expect(isBridgeMessage(fromUplink({ kind: 'captured', id: 'captured', waiting: 3 }), 'from-uplink')).toBe(true);
    expect(isBridgeMessage(fromUplink({ kind: 'captured', id: 'captured', waiting: -1 }), 'from-uplink')).toBe(false);
    expect(isBridgeMessage(fromUplink({ kind: 'captured', id: 'captured' }), 'from-uplink')).toBe(false);
    expect(isBridgeMessage(toUplink({ kind: 'captured', id: 'captured', waiting: 3 }), 'to-uplink')).toBe(false);
  });

  it('carries answers back: a hello, a result, or a refusal of a known kind', () => {
    expect(isBridgeMessage(fromUplink({ kind: 'hello', id: 'h1', extensionVersion: '0.1.0', protocol: 1, capabilities: [] }), 'from-uplink')).toBe(true);
    expect(isBridgeMessage(fromUplink({ kind: 'answer', id: 'r1', ok: true, result: { granted: [], allSites: false } }), 'from-uplink')).toBe(true);
    expect(isBridgeMessage(fromUplink(refusal('r1', 'not-granted', 'example.com was not allowed')), 'from-uplink')).toBe(true);
    expect(isBridgeMessage(fromUplink({ kind: 'answer', id: 'r1', ok: false, refusal: 'maybe', reason: 'x' }), 'from-uplink')).toBe(false);
  });
});

describe('purposes', () => {
  it('are said, short, and plain', () => {
    expect(purposeProblem(PURPOSE)).toBeNull();
    expect(purposeProblem(undefined)).toBe('a request must say why it is made');
    expect(purposeProblem('  why  ')).toBe('the purpose is too short to say why');
    expect(purposeProblem('x'.repeat(201))).toBe('the purpose is longer than 200 characters');
    expect(purposeProblem('Scan <script> please')).toBe('the purpose is plain words, without markup');
  });
});

describe('words', () => {
  it('says every capability and every refusal in words, and keeps the four "no"s apart', () => {
    for (const c of CAPABILITIES) expect(CAPABILITY_MEANS[c].length).toBeGreaterThan(10);
    for (const r of REFUSALS) expect(REFUSAL_WORDS[r].length).toBeGreaterThan(5);
    const four = ['declined', 'not-granted', 'unreachable', 'not-found'] as const;
    expect(new Set(four.map((r) => REFUSAL_WORDS[r])).size).toBe(4);
  });
});

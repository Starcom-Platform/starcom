/**
 * Reports sealed to this person on the missions they published (MX32), read as NavCom reads one (§5.2) and kept by
 * the id inside the seal.
 *
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const ME = 'a'.repeat(64);
vi.mock('../../../identity/NostrIdentityService', () => ({ nostrIdentityService: { signerPubkey: () => 'a'.repeat(64), getPubkey: () => null } }));

import { keepReceivedReport, readReceivedReport, reportsOn, resetReceivedReports } from '../receivedReports';

const MISSION = `30079:${ME}:starcom_mission_package_m1`;
const content = (over: Record<string, unknown> = {}) => JSON.stringify({ callsign: 'Kestrel', date: '2026-10-22', counts: [{ line: 'Kits placed: a count', n: 4 }], salt: 'f'.repeat(32), ...over });
const opened = (over: { id?: string; tags?: string[][]; content?: string; kind?: number; at?: number } = {}) => ({
  sender: 'b'.repeat(64),
  rumor: { id: over.id ?? 'r'.repeat(64), kind: over.kind ?? 1912, pubkey: 'b'.repeat(64), created_at: over.at ?? 1_792_627_200, tags: over.tags ?? [['a', MISSION]], content: over.content ?? content() },
});

beforeEach(() => { resetReceivedReports(); });

describe('readReceivedReport', () => {
  it('reads a report on one of this person\'s missions: its counts, day, callsign and who sealed it', () => {
    expect(readReceivedReport(opened(), ME)).toEqual({
      id: 'r'.repeat(64), coordinate: MISSION, from: 'b'.repeat(64), callsign: 'Kestrel', day: '2026-10-22',
      counts: [{ line: 'Kits placed: a count', n: 4 }], at: 1_792_627_200,
    });
  });

  it('keeps nothing that is not a sealed report on this person\'s mission, as NavCom would', () => {
    expect(readReceivedReport(opened({ kind: 14 }), ME)).toBeNull();
    expect(readReceivedReport(opened({ tags: [['a', `30079:${'c'.repeat(64)}:theirs`]] }), ME)).toBeNull();
    expect(readReceivedReport(opened({ tags: [['a', `30084:${ME}:an-adventure`]] }), ME)).toBeNull();
    expect(readReceivedReport(opened({ content: content({ salt: undefined }) }), ME)).toBeNull();
    expect(readReceivedReport(opened({ content: content({ date: '22 Oct' }) }), ME)).toBeNull();
    expect(readReceivedReport(opened({ content: content({ counts: [{ line: 'x', n: -1 }, { line: 'y', n: 1.5 }] }) }), ME)).toBeNull();
    expect(readReceivedReport(opened({ content: 'not json' }), ME)).toBeNull();
    expect(readReceivedReport(opened(), null)).toBeNull();
  });
});

describe('keepReceivedReport', () => {
  it('keeps each once, newest day first, by the mission it is on', () => {
    keepReceivedReport(opened({ id: '1'.repeat(64), at: 1_792_540_800 }));
    keepReceivedReport(opened({ id: '2'.repeat(64), at: 1_792_627_200 }));
    keepReceivedReport(opened({ id: '2'.repeat(64), at: 1_792_627_200 }));
    expect(reportsOn(MISSION).map((r) => r.id)).toEqual(['2'.repeat(64), '1'.repeat(64)]);
    expect(reportsOn(`30079:${ME}:another`)).toEqual([]);
  });
});

describe('a return from an adventure this person called (RS41)', () => {
  const ADVENTURE = `30084:${ME}:adventure-aurora-mn`;
  it('is kept with whether its sender saw it, counts or none', () => {
    const read = readReceivedReport(opened({ tags: [['a', ADVENTURE]], content: content({ seen: true, counts: [] }) }), ME);
    expect(read).toMatchObject({ coordinate: ADVENTURE, seen: true, counts: [] });
    expect(readReceivedReport(opened({ tags: [['a', ADVENTURE]], content: content({ seen: false }) }), ME)).toMatchObject({ seen: false, counts: [{ line: 'Kits placed: a count', n: 4 }] });
  });

  it('is not one without saying whether it was seen, and a mission report still counts something', () => {
    expect(readReceivedReport(opened({ tags: [['a', ADVENTURE]], content: content() }), ME)).toBeNull();
    expect(readReceivedReport(opened({ content: content({ counts: [] }) }), ME)).toBeNull();
    expect(readReceivedReport(opened({ content: content({ seen: true }) }), ME)).not.toHaveProperty('seen');
  });
});


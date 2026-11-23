/**
 * Where AI Watch's notes are drawn, and how each is said (decision D-AW, AW3 and AW4): a point where the
 * note gives one, else its country; the rest listed; the stance as a word and a shape. Read against the 26
 * records of 12 October.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Event } from 'nostr-tools';
import { readAiWatchNote, type AiWatchItem } from '../aiWatch';
import { aiWatchByPlace, byPoint, countryPill, pointTooltip, sourceNameOf, stanceShape, stanceWords, tooltipFor, drawnFor } from '../aiWatchPlaces';

const LIVE: Event[] = JSON.parse(readFileSync(resolve(__dirname, '../../../../docs/missions/01-architecture-decisions/ai-watch/terminator_watch_live_2026-10-12.json'), 'utf8'));
const all = LIVE.map((e) => readAiWatchNote(e)).filter((r): r is AiWatchItem & { retracted: boolean } => !('refused' in r));
const KNOWN = new Set(['in', 'au', 'br', 'md', 'us', 'ua']);
const outline = (code: string) => (KNOWN.has(code) ? { code } : null);
const ALL_ON = { AiIncidents: true, AiFrontier: true, AiWar: true, AiSafety: true };

describe('aiWatchByPlace', () => {
  it('draws a note at its point, else at its country, and lists the rest (AW3)', () => {
    const placed = aiWatchByPlace(all, outline);
    expect(placed.points).toHaveLength(3);
    expect(placed.countries.reduce((n, c) => n + c.notes.length, 0)).toBe(6);
    expect(placed.unplaced).toHaveLength(17);
    expect(placed.countries.map((c) => c.code).sort()).toEqual(['au', 'br', 'in', 'md', 'ua', 'us']);
  });

  it('lists a note whose country has no outline here, rather than placing it elsewhere', () => {
    const placed = aiWatchByPlace(all, (code) => (code === 'ua' ? null : outline(code)));
    expect(placed.countries.map((c) => c.code)).not.toContain('ua');
    expect(placed.unplaced).toHaveLength(18);
  });
});

describe('byPoint', () => {
  it('draws notes sharing a point as one mark, its hover naming each', () => {
    const groups = byPoint(aiWatchByPlace(all, outline).points);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
    const said = pointTooltip(groups[0]).split('\n');
    expect(said[0]).toBe('AI Watch · 3 notes at this point');
    expect(said).toHaveLength(4);
    expect(pointTooltip([groups[0][0]])).toBe(tooltipFor(groups[0][0]));
  });
});

describe('drawnFor', () => {
  it('keeps the notes in a section that is on, each once however many of its sections are', () => {
    expect(drawnFor(all, ALL_ON)).toHaveLength(26);
    expect(drawnFor(all, { ...ALL_ON, AiFrontier: false, AiWar: false, AiSafety: false })).toHaveLength(12);
    expect(drawnFor(all, { AiIncidents: false, AiFrontier: false, AiWar: false, AiSafety: false })).toHaveLength(0);
  });
});

describe('the words', () => {
  it('says a stance as a word and a shape, and says when none is stated (AW4)', () => {
    expect(stanceWords('ugly')).toBe('◆ ugly');
    expect(stanceWords('good')).toBe('▲ good');
    expect(stanceWords('bad')).toBe('▼ bad');
    expect(stanceWords(undefined)).toBe('no stance stated');
    expect(stanceShape(undefined)).toBeNull();
  });

  it("names a source as Mecha Jono's summary names it, else by its id", () => {
    const qbit = all.find((i) => i.source === 'qbitai')!;
    expect(sourceNameOf(qbit)).toBe('QbitAI (量子位)');
    expect(sourceNameOf({ ...qbit, summary: undefined })).toBe('qbitai');
  });

  it("counts a country's notes in its pill", () => {
    const placed = aiWatchByPlace(all, outline);
    const india = placed.countries.find((c) => c.code === 'in')!;
    expect(countryPill(india, 'India')).toBe('India · 1 AI note');
    expect(countryPill({ code: 'xx', notes: [all[0], all[1]] }, 'Somewhere')).toBe('Somewhere · 2 AI notes');
  });

  it('says in its hover its sections, stance, title, source and date', () => {
    const qbit = all.find((i) => i.source === 'qbitai')!;
    expect(tooltipFor(qbit)).toBe('AI Watch · Frontier AI · ◆ ugly\nChinese report on frontier AI\nQbitAI (量子位), 12 Oct 2026');
  });
});

/**
 * The jump keys (decision D-PW, PW63) and the brushed span (PW50): N and P land on the next or previous moment that
 * stands out, an eclipse searched either way; a planet's station found where its motion turns in the drawn sky; a
 * span kept in order and asked whether a time touches it.
 *
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ASTRO_BODIES } from '../../astro/sky';
import { skyColumns } from '../skyColumns';
import { eclipseNear, jumpFrom, jumpTargets, stationsIn } from '../jumps';
import { getBrush, inBrush, setBrush } from '../brush';

const DAY = 86_400_000;
const day = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString().slice(0, 10));

describe('the jump keys', () => {
  it('finds Mercury turning direct in the drawn sky, as the kit\'s station note has it (13 Nov 2026)', () => {
    const view = { startMs: Date.UTC(2026, 10, 1), spanMs: 30 * DAY };
    const stations = stationsIn(skyColumns(view, 240, ASTRO_BODIES, 'galactic'), view);
    expect(stations.some((ms) => Math.abs(ms - Date.UTC(2026, 10, 13, 16)) < DAY)).toBe(true);
  });

  it('searches the eclipses both ways: the total solar eclipse of 12 August 2026', () => {
    expect(day(eclipseNear(Date.UTC(2026, 7, 1), 1))).toBe('2026-08-12');
    expect(day(eclipseNear(Date.UTC(2026, 7, 20), -1))).toBe('2026-08-12');
  });

  it('lands on the nearest target either way, an eclipse among them, and never where it stands', () => {
    const marks = [Date.UTC(2026, 7, 5), Date.UTC(2026, 7, 20)];
    const targets = jumpTargets({ items: [], marks, busiestMs: Date.UTC(2026, 7, 7) });
    expect(targets).toEqual([Date.UTC(2026, 7, 5), Date.UTC(2026, 7, 7), Date.UTC(2026, 7, 20)]);
    expect(jumpFrom(Date.UTC(2026, 7, 5), 1, targets)).toBe(Date.UTC(2026, 7, 7));
    expect(day(jumpFrom(Date.UTC(2026, 7, 7), 1, targets))).toBe('2026-08-12');
    expect(jumpFrom(Date.UTC(2026, 7, 7), -1, targets)).toBe(Date.UTC(2026, 7, 5));
  });
});

describe('the brushed span', () => {
  afterEach(() => setBrush(null));
  it('keeps its ends in order and says what touches it; nothing brushed, everything does', () => {
    setBrush({ fromMs: 50, untilMs: 10 });
    expect(getBrush()).toEqual({ fromMs: 10, untilMs: 50 });
    expect([inBrush(getBrush(), 0, 9), inBrush(getBrush(), 0, 10), inBrush(getBrush(), 40, 90)]).toEqual([false, true, true]);
    expect(inBrush(null, 0, 1)).toBe(true);
  });
});

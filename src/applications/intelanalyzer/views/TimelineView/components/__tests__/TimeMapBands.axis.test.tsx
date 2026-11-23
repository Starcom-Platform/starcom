/**
 * The analyzer's event bands label their time axis the way D-E says times are shown.
 *
 * Decision D-E (docs/missions/01-architecture-decisions/time-model.md). Each tick
 * carried a full `%Y-%m-%d %H:%M` stamp, and in the running app on 2026-09-14 the
 * stamps ran into one another under the chart. Seeded events there fall within a few
 * seconds of each other, so a short span has to label its ticks too.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import TimeMapBands from '../TimeMapBands';

const DAY = 86_400_000;
const MONTHS = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;

/** The axis labels: the bands' category names are right-aligned, the ticks centred. */
const axisLabels = (domain: [number, number]) => {
  const { container } = render(
    <TimeMapBands
      events={[
        { id: 'a', title: 'A', timestamp: new Date(domain[0]).toISOString(), category: 'intelligence', severity: 'low' },
        { id: 'b', title: 'B', timestamp: new Date(domain[1]).toISOString(), category: 'operation', severity: 'high' },
      ] as never}
      domain={domain}
      currentRange={domain}
    />,
  );
  return [...container.querySelectorAll('svg text[text-anchor="middle"]')].map((t) => t.textContent ?? '');
};

describe('TimeMapBands time axis', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('labels a two-month span with dates, not full stamps', () => {
    const start = Date.UTC(2026, 6, 9);
    const labels = axisLabels([start, start + 69 * DAY]);

    expect(labels.length).toBeGreaterThanOrEqual(3);
    expect(labels.some((t) => /\d{4}-\d{2}-\d{2}/.test(t))).toBe(false);
    expect(labels.some((t) => /^\d{2}:\d{2}(:\d{2})?Z?$/.test(t))).toBe(false);
    expect(labels.filter((t) => MONTHS.test(t)).length).toBe(labels.length);
  });

  it('labels a span of seconds with the seconds', () => {
    const start = Date.UTC(2026, 8, 14, 5, 12, 1, 400);
    const labels = axisLabels([start, start + 8_000]);

    expect(labels.length).toBeGreaterThanOrEqual(3);
    for (const label of labels) expect(label).toMatch(/^\d{2}:\d{2}:\d{2}Z$/);
  });
});

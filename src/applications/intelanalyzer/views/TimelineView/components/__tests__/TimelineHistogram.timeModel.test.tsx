/**
 * time model: the analyzer's histogram labels a long range with dates.
 *
 * Decision D-E (docs/missions/01-architecture-decisions/time-model.md): a time
 * shown in a view that spans more than a day carries its date. Today the axis is
 * formatted `%H:%M` whatever the range, the same fault as the HUD timeline.
 *
 * `today:` asserts what happens now; `it.fails('D-E: …')` asserts what D-E
 * requires and fails once it is true. Then delete `today:` and use `it`.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import TimelineHistogram from '../TimelineHistogram';

const DAY = 86_400_000;
const first = Date.UTC(2026, 6, 9);
const last = first + 69 * DAY;
const MONTHS = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;

const axisLabels = () => {
  const { container } = render(
    <TimelineHistogram
      timestamps={[first, first + 10 * DAY, first + 40 * DAY, last]}
      domain={[first, last]}
      range={[first, last]}
      onChange={() => {}}
      onCommit={() => {}}
    />,
  );
  return [...container.querySelectorAll('svg text')].map((t) => t.textContent ?? '');
};

describe('time model: TimelineHistogram', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('D-E: labels a two-month range with dates', () => {
    const labels = axisLabels();
    expect(labels.some((t) => /^\d{2}:\d{2}Z?$/.test(t))).toBe(false);
    expect(labels.filter((t) => MONTHS.test(t) || /\b\d{2}-\d{2}\b/.test(t)).length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * TimeScrubber must not invent a data range, and must not loop.
 *
 * Found by loading the app: React logged "Maximum update depth exceeded" from
 * TimeScrubber on the CyberCommand front door. The chain was:
 *
 *   `timelineData?.items ?? []` allocated a new array every render
 *     → the range useMemo (keyed on it) recomputed every render
 *     → its empty branch read Date.now(), so the range CHANGED every render
 *     → the effect published it via setDataRange
 *     → setDataRange always allocated a new object, re-rendering consumers
 *     → back to the top, without end.
 *
 * The invented value is the interesting part. With zero events the component
 * claimed the intel spanned the previous sixty days — a fabricated range that
 * every time-aware service then filtered against — and that fabrication is
 * exactly what made the loop unbounded, because it was never twice the same.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

const timeline = vi.hoisted(() => ({ items: undefined as unknown }));

vi.mock('../../../../core/intel', () => ({
  useTimelineData: () => ({ timelineData: { items: timeline.items } }),
}));

import TimeScrubber from '../TimeScrubber';
import { TemporalProvider, useTemporalStateOptional } from '../../../../context/TemporalContext';

/** Reports the published range, and how many times this tree has rendered. */
let renderCount = 0;
const Probe: React.FC = () => {
  const ctx = useTemporalStateOptional();
  renderCount++;
  return <span data-testid="range">{ctx?.dataRange ? `${ctx.dataRange.start}-${ctx.dataRange.end}` : 'none'}</span>;
};

const mount = () =>
  render(
    <TemporalProvider>
      <TimeScrubber />
      <Probe />
    </TemporalProvider>
  );

describe('TimeScrubber data range', () => {
  beforeEach(() => { renderCount = 0; timeline.items = undefined; });

  it('publishes no range when there are no events', () => {
    mount();
    // Not "the last sixty days" — there is no range, and saying so is the only
    // honest answer a downstream filter can act on.
    expect(screen.getByTestId('range').textContent).toBe('none');
  });

  it('settles instead of re-rendering without bound', () => {
    mount();
    // Before the fix this climbed until React aborted with "Maximum update
    // depth exceeded"; a handful of renders is normal, dozens is the loop.
    expect(renderCount).toBeLessThan(10);
  });

  it('publishes the real bounds once events exist', () => {
    const day = 86400000;
    timeline.items = [
      { startTime: new Date(1_700_000_000_000) },
      { startTime: new Date(1_700_000_000_000 + 10 * day) },
    ];
    mount();
    const shown = screen.getByTestId('range').textContent ?? '';
    expect(shown).not.toBe('none');
    const [start, end] = shown.split('-').map(Number);
    expect(start).toBeLessThan(1_700_000_000_000);          // padded below the first
    expect(end).toBeGreaterThan(1_700_000_000_000 + 10 * day); // and above the last
  });
});

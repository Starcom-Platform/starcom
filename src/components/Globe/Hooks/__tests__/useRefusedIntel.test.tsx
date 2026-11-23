/**
 * The mapping from the ingest's counters to what a reader is told.
 *
 * Worth its own test because it is the part that breaks silently: rename or
 * repurpose `droppedNoGeo` and this keeps compiling, keeps rendering, and
 * quietly stops reporting refusals — which is the state it was written to end.
 *
 * It caught exactly that on 2026-09-20. `droppedNoGeo` was repurposed: an event
 * with no place is now KEPT, so the counter stopped meaning "refused for having
 * no location" and came to mean "claimed a position that could not be parsed".
 * The wording here moved with it. Had these assertions been loosened to match
 * whatever the hook emitted, the globe would have gone on reporting placeless
 * desk work as intel it turned away.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const metrics = vi.hoisted(() => ({
  value: { droppedNoGeo: 0, droppedInvalid: 0 } as Record<string, number>,
  listeners: new Set<() => void>(),
}));

vi.mock('../../../../services/intel/NostrStarcomIntelIngest', () => ({
  nostrStarcomIntelIngest: {
    getMetrics: () => metrics.value,
    onChange: (listener: () => void) => {
      metrics.listeners.add(listener);
      return () => metrics.listeners.delete(listener);
    },
  },
}));

import { useRefusedIntel } from '../useRefusedIntel';

const Probe: React.FC = () => {
  const refused = useRefusedIntel();
  return <div data-testid="out">{JSON.stringify(refused)}</div>;
};

const out = () => JSON.parse(screen.getByTestId('out').textContent || '{}');

beforeEach(() => {
  metrics.value = { droppedNoGeo: 0, droppedInvalid: 0 };
  metrics.listeners.clear();
});

describe('useRefusedIntel', () => {
  it('reports nothing when nothing was refused', () => {
    render(<Probe />);
    expect(out()).toEqual({ count: 0, reasons: {} });
  });

  it("names the cause in the reader's words, not the counter's", () => {
    metrics.value = { droppedNoGeo: 2, droppedInvalid: 0 };
    render(<Probe />);
    expect(out()).toEqual({ count: 2, reasons: { 'with an unreadable position': 2 } });
  });

  it('counts the two causes separately', () => {
    metrics.value = { droppedNoGeo: 2, droppedInvalid: 3 };
    render(<Probe />);
    expect(out()).toEqual({
      count: 5,
      reasons: { 'with an unreadable position': 2, 'that could not be read': 3 },
    });
  });

  it('follows the ingest rather than waiting to be asked', () => {
    render(<Probe />);
    expect(out().count).toBe(0);
    // A refusal happening after the globe mounted still reaches it.
    metrics.value = { droppedNoGeo: 1, droppedInvalid: 0 };
    act(() => { metrics.listeners.forEach((l) => l()); });
    expect(out()).toEqual({ count: 1, reasons: { 'with an unreadable position': 1 } });
  });

  it('reads once on mount, for refusals that happened before it existed', () => {
    // The ingest starts at boot; the globe subscribes later. Everything refused
    // in that gap would otherwise never be mentioned, because no further change
    // signal is owed for something already counted.
    metrics.value = { droppedNoGeo: 4, droppedInvalid: 0 };
    render(<Probe />);
    expect(out().count).toBe(4);
  });
});

/**
 * An event whose time cannot be read shows the value as it was stored (decision
 * D-E, settled 2026-09-14 for step 9). It printed "Invalid Date".
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import type { Event } from '../../../adapters/eventsAdapter';

vi.mock('../../../state/BoardsContext', () => ({
  useBoards: () => ({ addWatchTag: vi.fn(), addWatchEntity: vi.fn() }),
}));

import EventDetails from '../EventDetails';

describe('EventDetails: a time it cannot read', () => {
  it('shows the stored value, not a date it cannot know', () => {
    const event = {
      id: 'evt-bad', title: 'Garbled import', timestamp: 'not a time', category: 'GENERAL', tags: [],
      sourceType: 'REPORT', sourceId: 'r1', entityRefs: [],
    } as unknown as Event;
    render(<EventDetails event={event} />);

    expect(screen.getByText('not a time')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });
});

describe('EventDetails: where an observation is', () => {
  it('gives its position at the precision its source gave, and says the precision', () => {
    const event = {
      id: 'navcom-1', title: 'alpha: alpha_one', timestamp: '2026-09-01T12:00:00.000Z', category: 'GENERAL', tags: [],
      sourceType: 'OBSERVATION', sourceId: 'navcom-1', entityRefs: [], lat: 38.627_134, lon: -90.199_403, geoPrecisionM: 20_000,
    } as unknown as Event;
    render(<EventDetails event={event} />);

    const where = screen.getByTestId('event-location').textContent ?? '';
    expect(where).toMatch(/±20 km$/);
    // A ±20 km cell printed to four decimals claimed about ten metres.
    expect(where).not.toMatch(/38\.6271/);
  });
});

/**
 * An event's details say which time placed it (decision D-E).
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

const event = (over: Partial<Event>): Event => ({
  id: 'evt-1', title: 'Substation fire', timestamp: '2026-07-27T00:00:00.000Z', category: 'GENERAL', tags: [],
  sourceType: 'REPORT', sourceId: 'r1', entityRefs: [], ...over,
} as Event);

describe('EventDetails: which time placed the event', () => {
  it('says when the event happened, as closely as it is known', () => {
    render(<EventDetails event={event({ timeBasis: 'event', timePrecisionMs: 86_400_000 })} />);
    expect(screen.getByText('Happened')).toBeInTheDocument();
    expect(screen.getByText('27 Jul 2026')).toBeInTheDocument();
  });

  it('says when the record was written, and that no event time was stated', () => {
    render(<EventDetails event={event({ timeBasis: 'written', timestamp: '2026-09-14T09:05:00.000Z' })} />);
    expect(screen.getByText('Written')).toBeInTheDocument();
    expect(screen.getByText('14 Sep 2026 09:05Z (no stated event time)')).toBeInTheDocument();
  });
});

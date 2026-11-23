/**
 * What the Intelligence Timeline says about what it has.
 *
 * It used to say "NO INTEL EVENTS — INGEST DATA TO POPULATE TIMELINE" when the
 * read had failed (the adapter swallowed the error and returned an empty list),
 * guess that an empty timeline meant nothing had been ingested, and call itself
 * "TIMELINE LIVE" although it read once and again only when SYNC was pressed.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { couldNotRead, namedForRoom, nothingDated } from '../../../../services/epistemic/epistemicLanguage';

const timeline = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('../../../../core/intel/hooks/useTimelineData', () => ({
  useTimelineData: () => timeline.value,
}));
vi.mock('../../../../hooks/useUnifiedGlobalCommand', () => ({
  useGlobalCommand: () => ({ state: { enhanced: {} } }),
}));
vi.mock('../../../../context/TemporalContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../context/TemporalContext')>()),
  useTemporalStateOptional: () => null,
}));

import TimelineView from '../TimelineView';

const noStats = { totalEvents: 0, eventsByType: {}, eventsByMonth: {}, eventsImportance: { high: 0, medium: 0, low: 0 } };

const hookResult = (over: Record<string, unknown>) => ({
  timelineData: { items: [], groups: [] },
  stats: noStats,
  loading: false,
  error: null,
  refreshData: vi.fn(),
  ...over,
});

/** Every string the canvas was asked to draw, and where. */
const drawn: string[] = [];
const drawnAt: Array<{ text: string; x: number; y: number }> = [];
/** A monospace stand-in: every character 6px wide. */
const CHAR_PX = 6;

beforeEach(() => {
  drawn.length = 0;
  drawnAt.length = 0;
  const ctx: Record<string | symbol, unknown> = new Proxy({}, {
    get: (_t, prop) => {
      if (prop === 'fillText') {
        return (text: unknown, x: unknown, y: unknown) => {
          drawn.push(String(text));
          drawnAt.push({ text: String(text), x: Number(x), y: Number(y) });
        };
      }
      if (prop === 'measureText') return (text: unknown) => ({ width: String(text).length * CHAR_PX });
      return () => ctx;
    },
    set: () => true,
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
});

describe('TimelineView says what it has', () => {
  it('reports a failed read as a failed read, not as an empty timeline', () => {
    timeline.value = hookResult({ error: 'storage unavailable' });
    render(<TimelineView />);

    expect(drawn).toContain(couldNotRead('intel items').text.toUpperCase());
    expect(drawn.join('\n')).not.toMatch(/NO INTEL EVENTS|INGEST|EVENT DATE/);
    expect(screen.getAllByText('READ FAILED').length).toBeGreaterThan(0);
    // A count of zero is a claim about what is there; after a failed read nobody knows.
    expect(screen.queryByText(/Events: 0/)).not.toBeInTheDocument();
    expect(screen.queryByText(/EVENTS: 0/)).not.toBeInTheDocument();
  });

  it('explains an empty timeline by its rule, not by a guess about ingestion', () => {
    timeline.value = hookResult({});
    render(<TimelineView />);

    expect(drawn).toContain(nothingDated().text.toUpperCase());
    expect(drawn.join('\n')).not.toMatch(/INGEST|COULD NOT BE READ/);
    expect(screen.queryByText(/AWAITING/)).not.toBeInTheDocument();
  });

  it('says when it was read instead of calling itself live', async () => {
    timeline.value = hookResult({
      timelineData: { items: [{ id: 'e1', title: 'Event', type: 'intel', startTime: new Date('2026-09-01T10:00:00Z') }], groups: [] },
      stats: { ...noStats, totalEvents: 1 },
    });
    render(<TimelineView />);

    // In UTC like every other readout. It read "AS OF 09:29 AM" beside a corner
    // clock reading 14:29:04Z.
    const readAt = await screen.findByText(/^AS OF \d{2}:\d{2}Z$/);
    expect(readAt).toHaveAttribute('title', expect.stringMatching(/^Local: /));
    expect(screen.queryByText(/LIVE/)).not.toBeInTheDocument();
    expect(drawn.join('\n')).not.toMatch(/EVENT DATE|COULD NOT BE READ/);
  });

  it('says it is loading while it loads, and claims no read time yet', () => {
    timeline.value = hookResult({ loading: true });
    render(<TimelineView />);

    expect(screen.getByText('LOADING...')).toBeInTheDocument();
    expect(screen.queryByText(/AS OF/)).not.toBeInTheDocument();
  });

  it('prints only the names that have room, and says how many it left off', () => {
    const t0 = Date.UTC(2026, 8, 1);
    const items = Array.from({ length: 40 }, (_, i) => ({
      id: `e${i}`, title: `Event number ${i}`, type: 'intel', importance: i % 5, startTime: new Date(t0 + i * 60_000),
    }));
    timeline.value = hookResult({ timelineData: { items, groups: [] }, stats: { ...noStats, totalEvents: 40 } });
    render(<TimelineView />);

    const names = drawnAt.filter((d) => /^Event number/.test(d.text));
    expect(names.length).toBeGreaterThan(0);
    expect(names.length).toBeLessThan(40);
    for (const a of names) {
      for (const b of names) {
        if (a === b || a.y !== b.y) continue;
        // Two names on one row never overlap.
        expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(((a.text.length + b.text.length) * CHAR_PX) / 2);
      }
    }
    expect(drawn).toContain(namedForRoom(names.length, 40).text);
  });

  it('names every event when all the names fit, and says nothing about it', () => {
    const items = [0, 1, 2].map((i) => ({
      id: `e${i}`, title: `Far ${i}`, type: 'intel', importance: 1, startTime: new Date(Date.UTC(2026, 8, 1 + i * 10)),
    }));
    timeline.value = hookResult({ timelineData: { items, groups: [] }, stats: { ...noStats, totalEvents: 3 } });
    render(<TimelineView />);

    expect(drawnAt.filter((d) => /^Far /.test(d.text))).toHaveLength(3);
    expect(drawn.join('\n')).not.toMatch(/events named/);
  });

  it('inside a panel, leaves its title to the panel and keeps its controls', () => {
    timeline.value = hookResult({});
    const { rerender } = render(<TimelineView />);
    expect(screen.getByRole('heading', { name: /Intelligence Timeline/ })).toBeInTheDocument();
    expect(drawn).toContain('INTELLIGENCE TIMELINE');

    drawn.length = 0;
    rerender(<TimelineView framed />);
    expect(screen.queryByRole('heading', { name: /Intelligence Timeline/ })).not.toBeInTheDocument();
    expect(drawn).not.toContain('INTELLIGENCE TIMELINE');
    expect(screen.getByRole('button', { name: 'SYNC' })).toBeInTheDocument();
  });
});

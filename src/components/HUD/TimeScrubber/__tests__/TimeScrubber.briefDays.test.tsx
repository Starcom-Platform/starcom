/**
 * The War & Conflict Brief's days on the timeline (theatre-lens.md, TL8): a block a
 * day read, at that day's place on the axis, in its worst war's colour, its words in
 * its name; a click picks the day. Drawn only while the globe publishes them.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, act, fireEvent } from '@testing-library/react';

const first = Date.UTC(2026, 6, 1);
const last = Date.UTC(2026, 7, 31);

vi.mock('../../../../core/intel', () => ({
  useTimelineData: () => ({ timelineData: { items: [{ startTime: new Date(Date.UTC(2026, 6, 1)) }, { startTime: new Date(Date.UTC(2026, 7, 31)) }] } }),
}));

import TimeScrubber from '../TimeScrubber';
import { TemporalProvider } from '../../../../context/TemporalContext';
import { publishBriefCalendar } from '../../../../services/warConflict/briefCalendar';

// The scrubber's range: the events plus a tenth of their span each side (timelineSpan).
const pad = (last - first) * 0.1;
const rangeStart = first - pad;
const rangeSpan = last - first + 2 * pad;
const leftOf = (day: string) => ((Date.parse(`${day}T00:00:00Z`) - rangeStart) / rangeSpan) * 100;

const mount = () => render(<TemporalProvider><TimeScrubber /></TemporalProvider>);
/** A block's width, in percent of the axis, a pixel short of it as drawn: `calc(<n>% - 1px)`. */
const widthOf = (el: HTMLElement) => {
  const m = el.style.width.match(/^calc\(([0-9.]+)% - 1px\)$/);
  if (!m) throw new Error(`width ${el.style.width}`);
  return Number(m[1]);
};
afterEach(() => { act(() => publishBriefCalendar(null)); localStorage.clear(); });

describe('TimeScrubber: the brief\'s days', () => {
  const days = [
    { day: '2026-08-20', color: '#ff5555', title: 'War & Conflict Brief, 20 Aug 2026: 12 items; worst, Russia–Ukraine war, a major war' },
    { day: '2026-08-19', color: null, title: 'War & Conflict Brief, 19 Aug 2026: 1 item; on no war\'s list' },
    // Before the axis begins: not drawn.
    { day: '2026-06-01', color: '#ff5555', title: 'War & Conflict Brief, 1 Jun 2026: 3 items; worst, Russia–Ukraine war, a major war' },
  ];

  it('draws a block a day on the axis, in its colour, named in words, the day shown pressed', () => {
    mount();
    act(() => publishBriefCalendar({ days, chosen: '2026-08-20', pick: vi.fn() }));
    const group = screen.getByRole('group', { name: 'War & Conflict Brief days' });
    const blocks = [...group.querySelectorAll('button')];
    // Oldest first, as the axis runs.
    expect(blocks.map((b) => b.getAttribute('aria-label'))).toEqual([days[1].title, days[0].title]);
    expect(blocks[1]).toHaveAttribute('aria-pressed', 'true');
    expect(blocks[0]).toHaveAttribute('aria-pressed', 'false');
    expect(parseFloat(blocks[1].style.left)).toBeCloseTo(leftOf('2026-08-20'), 3);
    expect(widthOf(blocks[1])).toBeCloseTo((86_400_000 / rangeSpan) * 100, 3);
    expect(blocks[1].style.background).not.toBe('');
    expect(blocks[0].style.background).toBe('');
    expect(blocks[1]).toHaveAttribute('title', days[0].title);
  });

  it('cuts a day at the end of the axis', () => {
    mount();
    // The axis ends a tenth of the events' span after the last, part way through 6 Sep.
    const end = rangeStart + rangeSpan;
    const lastDay = new Date(end).toISOString().slice(0, 10);
    act(() => publishBriefCalendar({ days: [{ day: lastDay, color: '#ff5555', title: 'the last day' }], chosen: lastDay, pick: vi.fn() }));
    const block = screen.getByRole('button', { name: 'the last day' });
    expect(parseFloat(block.style.left) + widthOf(block)).toBeCloseTo(100, 3);
  });

  it('picks the day clicked', () => {
    const pick = vi.fn();
    mount();
    act(() => publishBriefCalendar({ days, chosen: '2026-08-20', pick }));
    fireEvent.click(screen.getByRole('button', { name: days[1].title }));
    expect(pick).toHaveBeenCalledWith('2026-08-19');
  });

  it('draws nothing while the globe publishes no brief', () => {
    mount();
    expect(screen.queryByRole('group', { name: 'War & Conflict Brief days' })).toBeNull();
  });
});

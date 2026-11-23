/**
 * The War & Conflict Brief panel (WC3): the day's items under each theatre,
 * worst war first, each led by what happened, where, and the casualties as
 * reported; a theatre picked lights up its war and its events on the globe.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('../../Dock/Docked', () => ({
  Docked: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { WarConflictBriefPanel } from '../WarConflictBriefPanel';
import type { ConflictItem } from '../../../services/warConflict/warConflict';
import type { WarConflictBrief } from '../../../services/warConflict/warConflictBrief';
import { TIER_COLOR } from '../Hooks/useGlobeWarConflict';

const UKRAINE = { slug: 'russo-ukrainian-war', name: 'Russo-Ukrainian War', region: 'europe' };
const SUDAN = { slug: 'sudanese-civil-war', name: 'Sudanese civil war', region: 'africa' };
const item = (id: string, over: Partial<ConflictItem>): ConflictItem => ({
  family: 'item', id, pubkey: 'pk', d: id, eventId: 'e', createdAt: 0, title: `Headline ${id}`, reportedAt: 0, content: '',
  events: [{ id: 'airstrike', label: 'Airstrike' }], casualties: [], fatal: false, actors: [], ...over,
});
const items = [
  item('a', { theatre: UKRAINE, place: { words: 'Kharkiv', precision: 'city' }, casualties: [{ kind: 'killed', count: 3, qualifier: 'at least', words: '' }] }),
  item('b', { theatre: SUDAN, events: [{ id: 'clash', label: 'Armed clash' }], jurisdiction: 'sd', casualties: [] }),
  item('c', { theatre: UKRAINE, events: [{ id: 'drone', label: 'Drone strike' }], place: { words: 'Odesa', precision: 'city' } }),
  item('d', { events: [{ id: 'sanctions', label: 'Sanctions' }], jurisdiction: 'ir' }),
];
const brief: WarConflictBrief = {
  day: '2026-10-05', count: 4, noTheatre: 1, ids: ['a', 'b', 'c', 'd'], title: 'War & Conflict Brief · 5 Oct 2026', lines: [],
  theatres: [
    { slug: UKRAINE.slug, name: UKRAINE.name, count: 2, tier: 'major_war' },
    { slug: SUDAN.slug, name: SUDAN.name, count: 1, tier: 'minor_war' },
  ],
};
const regionName = (code: string) => ({ sd: 'Sudan', ir: 'Iran' } as Record<string, string>)[code] ?? null;

const setup = (over: Partial<React.ComponentProps<typeof WarConflictBriefPanel>> = {}) => {
  const onDay = vi.fn();
  const onTheatre = vi.fn();
  render(<WarConflictBriefPanel brief={brief} items={items} days={['2026-10-05', '2026-10-04']} day={null} onDay={onDay} theatre={null} onTheatre={onTheatre} regionName={regionName} {...over} />);
  return { onDay, onTheatre };
};
const open = () => fireEvent.click(screen.getByTestId('war-brief-toggle'));

describe('WarConflictBriefPanel', () => {
  it('starts folded to the day, its count and its theatres', () => {
    setup();
    const toggle = screen.getByTestId('war-brief-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain('5 Oct 2026');
    expect(toggle.textContent).toContain('4 items');
    expect(toggle.textContent).toContain('2 theatres');
  });

  it('lists the items under each theatre, worst war first, then those naming no war', () => {
    setup();
    open();
    const groups = screen.getAllByTestId('war-brief-group');
    expect(groups.map((g) => g.getAttribute('data-theatre'))).toEqual([UKRAINE.slug, SUDAN.slug, 'none']);
    expect(within(groups[0]).getAllByRole('listitem')).toHaveLength(2);
  });

  it('leads each line with what happened, where, and the casualties as reported', () => {
    setup();
    open();
    const [kharkiv] = within(screen.getAllByTestId('war-brief-group')[0]).getAllByRole('listitem');
    expect(kharkiv.textContent).toBe('Airstrike · Kharkiv · at least 3 killed');
    expect(kharkiv.getAttribute('title')).toBe('Headline a');
    const [sudan] = within(screen.getAllByTestId('war-brief-group')[1]).getAllByRole('listitem');
    expect(sudan.textContent).toBe('Armed clash · Sudan');
  });

  // On The Record, 5 Oct 2026: a Yemen item named no event, and its line read only "Yemen".
  it('leads with the headline when the item names no event', () => {
    setup({ items: items.map((it) => (it.id === 'b' ? { ...it, events: [] } : it)) });
    open();
    const [sudan] = within(screen.getAllByTestId('war-brief-group')[1]).getAllByRole('listitem');
    expect(sudan.textContent).toBe('Headline b · Sudan');
  });

  it('picks a theatre, which keeps only its lines, and All, which clears it', () => {
    const { onTheatre } = setup();
    open();
    fireEvent.click(screen.getByRole('button', { name: /Sudanese civil war/ }));
    expect(onTheatre).toHaveBeenLastCalledWith(SUDAN.slug);
    fireEvent.click(screen.getByRole('button', { name: /^All/ }));
    expect(onTheatre).toHaveBeenLastCalledWith(null);
  });

  it('shows only the picked theatre, its chip pressed', () => {
    setup({ theatre: SUDAN.slug });
    open();
    expect(screen.getAllByTestId('war-brief-group').map((g) => g.getAttribute('data-theatre'))).toEqual([SUDAN.slug]);
    expect(screen.getByRole('button', { name: /Sudanese civil war/ }).getAttribute('aria-pressed')).toBe('true');
  });

  it('steps to an earlier day and back, and no further than the days read', () => {
    const { onDay } = setup();
    open();
    expect((screen.getByRole('button', { name: 'Later day' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Earlier day' }));
    expect(onDay).toHaveBeenLastCalledWith('2026-10-04');
  });

  it('says so when the day has nothing', () => {
    setup({ brief: null, items: [] });
    expect(screen.getByTestId('war-brief-toggle').textContent).toContain('no items');
  });
});

/*
 * Each theatre's items a day on its chip (theatre-lens.md, TL7): a bar a day, the
 * brief's day at full strength, nothing for a day not read; the numbers in its hover.
 */
describe('a theatre chip\'s sparkline', () => {
  const ukraineDays = [
    { day: '2026-10-01', count: null }, { day: '2026-10-02', count: 3 }, { day: '2026-10-03', count: 0 },
    { day: '2026-10-04', count: 5 }, { day: '2026-10-05', count: 2 },
  ];
  const series = new Map([[UKRAINE.slug, ukraineDays]]);

  it('draws a bar a day read, in its tier\'s colour, the brief\'s day strongest, and says the numbers in words', () => {
    setup({ series });
    open();
    const chip = screen.getByRole('button', { name: /Russo-Ukrainian War 2/ });
    const spark = within(chip).getByTestId('war-brief-spark');
    const bars = spark.querySelectorAll('rect');
    // A day not read draws nothing; a day with none, a stub on the baseline.
    expect(bars).toHaveLength(4);
    const heights = [...bars].map((b) => Number(b.getAttribute('height')));
    expect(heights[2]).toBeGreaterThan(heights[0]);
    expect(heights[1]).toBeLessThan(heights[3]);
    expect(heights[1]).toBeGreaterThan(0);
    // Its own busiest day is as tall as the sparkline.
    expect(Math.max(...heights)).toBe(Number(spark.getAttribute('height')));
    expect([...bars].every((b) => b.getAttribute('fill') === TIER_COLOR.major_war)).toBe(true);
    expect(bars[3].getAttribute('opacity')).toBe('1');
    expect(Number(bars[0].getAttribute('opacity'))).toBeLessThan(1);
    expect(chip.getAttribute('title')).toBe('Russo-Ukrainian War, items a day (UTC): 2 Oct 3 · 3 Oct 0 · 4 Oct 5 · 5 Oct 2');
    expect(spark.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws none for a theatre with no days counted, and keeps the chip\'s name as it was', () => {
    setup({ series });
    open();
    const sudan = screen.getByRole('button', { name: 'Sudanese civil war 1' });
    expect(within(sudan).queryByTestId('war-brief-spark')).toBeNull();
    expect(sudan.getAttribute('title')).toBeNull();
  });
});

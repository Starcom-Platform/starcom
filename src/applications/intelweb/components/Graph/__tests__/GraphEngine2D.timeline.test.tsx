/**
 * The Timeline drawn (decision D-IW, step 5): each note at its place, the rows named, the axis marked
 * in the reader's dates, and the column of notes stating no time named too.
 */
import React, { useRef } from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphEngine2D, type GraphTimeline } from '../GraphEngine2D';
import { timelineLayout } from '../timelineLayout';
import type { IntelNode } from '../IntelGraph';

const physics = { charge: -300, linkDistance: 80, linkStrength: 0.1, friction: 0.9, alpha: 1, alphaDecay: 0.0228, gravity: 0.1, theta: 0.8 };
const note = (id: string, at?: string): IntelNode =>
  ({ id, type: 'report', confidence: 0.8, title: id, tags: [], metadata: {}, ...(at ? { timestamp: new Date(at), timeBasis: 'event' as const } : {}) });

const Harness: React.FC<{ nodes: IntelNode[]; timeline: GraphTimeline }> = ({ nodes, timeline }) => {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref}>
      <GraphEngine2D containerRef={ref} data={{ nodes, edges: [] }} physics={physics as never} selectedNodes={[]} timeline={timeline} />
    </div>
  );
};

describe('GraphEngine2D: the Timeline', () => {
  const sized: Array<[string, PropertyDescriptor | undefined]> = [];
  beforeEach(() => {
    for (const [prop, value] of [['clientWidth', 1000], ['clientHeight', 600]] as const) {
      sized.push([prop, Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop)]);
      Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value });
    }
  });
  afterEach(() => {
    for (const [prop, descriptor] of sized.splice(0)) if (descriptor) Object.defineProperty(HTMLElement.prototype, prop, descriptor);
  });

  const nodes = [note('a', '2026-10-01T00:00:00Z'), note('b', '2026-10-12T00:00:00Z'), note('c')];
  const rowOf = new Map([['a', 'ye'], ['b', 'sa'], ['c', 'ye']]);
  const timeline: GraphTimeline = {
    layout: timelineLayout(nodes, rowOf, 1000, 600),
    rowNames: new Map([['ye', 'Yemen'], ['sa', 'Saudi Arabia']]),
    formatTime: (ms, withTime) => new Date(ms).toISOString().slice(5, withTime ? 16 : 10),
    untimedLabel: 'No time stated',
  };

  it('starts each note at its place', () => {
    render(<Harness nodes={nodes} timeline={timeline} />);
    for (const n of nodes) {
      const place = timeline.layout.places.get(n.id)!;
      expect(Math.hypot(n.x! - place.x, n.y! - place.y)).toBeLessThan(12);
    }
  });

  it('names the rows, marks the axis in the dates given, and names the column of notes with no time', () => {
    const { container } = render(<Harness nodes={nodes} timeline={timeline} />);
    expect([...container.querySelectorAll('text.timeline-row')].map((t) => t.textContent)).toEqual(['Yemen', 'Saudi Arabia']);
    const ticks = [...container.querySelectorAll('text.timeline-tick')].map((t) => t.textContent);
    expect(ticks.length).toBeGreaterThan(1);
    expect(ticks[0]).toMatch(/^10-\d\d$/);
    expect(container.querySelector('text.timeline-untimed')?.textContent).toBe('No time stated');
  });

  it('draws no cluster names on a Timeline', () => {
    const { container } = render(<Harness nodes={nodes} timeline={timeline} />);
    expect(container.querySelectorAll('text.cluster-label')).toHaveLength(0);
  });

  /*
   * On the build, notes of the last two weeks drew at the middle of an axis running from March: the
   * engine's pull of the whole graph to the pane's middle moved every note off its date.
   */
  it('keeps notes on their dates, not pulled together to the middle of the pane', async () => {
    const recent = ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-12', '2026-10-12'].map((d, i) => note(`n${i}`, `${d}T00:00:00Z`));
    const all = [note('early', '2026-03-01T00:00:00Z'), ...recent];
    const rows = new Map(all.map((n) => [n.id, 'ye']));
    const t: GraphTimeline = { ...timeline, layout: timelineLayout(all, rows, 1000, 600) };
    render(<Harness nodes={all} timeline={t} />);
    await new Promise((settled) => setTimeout(settled, 1500));
    for (const n of recent) expect(Math.abs(n.x! - t.layout.places.get(n.id)!.x)).toBeLessThan(40);
  });

  it('names the column of notes far earlier than the rest', () => {
    const october = Array.from({ length: 9 }, (_, i) => note(`oct${i}`, `2026-10-0${i + 1}T00:00:00Z`));
    const all = [note('march', '2026-03-01T00:00:00Z'), ...october];
    const t: GraphTimeline = { ...timeline, layout: timelineLayout(all, new Map(all.map((n) => [n.id, 'ye'])), 1000, 600), earlierLabel: (ms) => `Earlier, to ${new Date(ms).toISOString().slice(5, 10)}` };
    const { container } = render(<Harness nodes={all} timeline={t} />);
    expect(container.querySelector('text.timeline-earlier')?.textContent).toBe('Earlier, to 03-01');
  });

  // On the build, three days' ticks every twelve hours read "11 Oct, 11 Oct, 12 Oct, 12 Oct".
  it('marks the axis with times as well as dates over a few days, so no two marks read alike', () => {
    const days = ['2026-10-10T00:00:00Z', '2026-10-11T06:00:00Z', '2026-10-12T18:00:00Z'].map((at, i) => note(`d${i}`, at));
    const t: GraphTimeline = { ...timeline, layout: timelineLayout(days, new Map(days.map((n) => [n.id, 'ye'])), 1000, 600) };
    const { container } = render(<Harness nodes={days} timeline={t} />);
    const ticks = [...container.querySelectorAll('text.timeline-tick')].map((x) => x.textContent);
    expect(new Set(ticks).size).toBe(ticks.length);
    expect(ticks[0]).toMatch(/T\d\d:\d\d$/);
  });
});


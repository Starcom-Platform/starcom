/**
 * IntelWeb's 2D graph dims nodes outside the time window by overlap, placed by
 * their event time where their record states one (decision D-E).
 */
import React, { useRef } from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GraphEngine2D } from '../GraphEngine2D';
import type { IntelNode } from '../IntelGraph';

const DAY = 86_400_000;
const physics = { charge: -300, linkDistance: 80, linkStrength: 0.1, friction: 0.9, alpha: 1, alphaDecay: 0.0228, gravity: 0.1, theta: 0.8 };

const node = (id: string, over: Partial<IntelNode>): IntelNode => ({
  id, type: 'report', confidence: 0.8, title: id, tags: [], metadata: {}, ...over,
});

const Harness: React.FC<{ nodes: IntelNode[]; timeRange: [Date, Date] }> = ({ nodes, timeRange }) => {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} style={{ width: 400, height: 300 }}>
      <GraphEngine2D containerRef={ref} data={{ nodes, edges: [] }} physics={physics as never} selectedNodes={[]} timeRange={timeRange} />
    </div>
  );
};

describe('GraphEngine2D: time window dimming', () => {
  it('keeps a span that meets the window lit, though it starts before it, and dims a node written outside it', () => {
    const { container } = render(
      <Harness
        timeRange={[new Date('2026-07-05T00:00:00Z'), new Date('2026-07-05T12:00:00Z')]}
        nodes={[
          node('outage', { timestamp: new Date('2026-07-01T00:00:00Z'), timeBasis: 'event', timeEndMs: Date.parse('2026-07-10T00:00:00Z'), timePrecisionMs: DAY }),
          node('note', { timestamp: new Date('2026-09-12T08:00:00Z'), timeBasis: 'written' }),
        ]}
      />
    );

    const opacities = [...container.querySelectorAll('circle')]
      .map((c) => c.getAttribute('fill-opacity'))
      .filter((o) => o !== null);
    expect(opacities).toEqual(['1', '0.15']);
  });
});

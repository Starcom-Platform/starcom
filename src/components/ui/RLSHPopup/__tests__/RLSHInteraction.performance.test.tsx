import React from 'react';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { IntelReportTooltip } from '../../IntelReportTooltip/IntelReportTooltip';
import { RLSHPopup } from '../RLSHPopup';
import { vi } from 'vitest';

const p95 = (samples: number[]): number => {
  if (!samples.length) {
    return 0;
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1));
  return sorted[index];
};

describe('RLSH interaction performance budget', () => {
  afterEach(() => {
    cleanup();
  });

  it('keeps synthetic hover tooltip render p95 within 80ms target', () => {
    const samples: number[] = [];
    const iterations = 200;

    const report = {
      pubkey: 'rlsh-perf',
      title: 'Night Beacon',
      content: 'Placeholder',
      tags: ['RLSH', 'CITY'],
      latitude: 40.7128,
      longitude: -74.006,
      timestamp: Math.floor(Date.now() / 1000),
      author: 'primary_wiki'
    };

    for (let index = 0; index < iterations; index += 1) {
      const start = performance.now();
      const view = render(
        <IntelReportTooltip
          report={report}
          position={{ x: 180, y: 180 }}
          visible={true}
          entityLabel="RLSH Entity"
          showConfidenceTag={true}
        />
      );
      samples.push(performance.now() - start);
      view.unmount();
    }

    const measuredP95 = p95(samples);
    console.info(`[RLSH][Perf] synthetic hover-tooltip p95=${measuredP95.toFixed(2)}ms over ${iterations} iterations`);
    expect(measuredP95).toBeLessThan(80);
  });

  it('keeps synthetic popup-open render p95 within 150ms target', () => {
    const samples: number[] = [];
    const iterations = 100;

    const marker = {
      schemaVersion: '1.0.0',
      id: 'rlsh-perf-popup',
      displayName: 'Night Beacon',
      summary: 'Community patrol and aid.',
      canonicalUrl: 'https://example.org/rlsh/night-beacon',
      latitude: 40.7128,
      longitude: -74.006,
      updatedAt: new Date().toISOString(),
      source: { provider: 'primary_wiki', sourceId: 'night-beacon' },
      geoConfidence: 'city' as const,
      tags: ['RLSH']
    };

    for (let index = 0; index < iterations; index += 1) {
      const start = performance.now();
      const view = render(
        <RLSHPopup
          marker={marker}
          visible={true}
          onClose={vi.fn()}
        />
      );
      samples.push(performance.now() - start);
      view.unmount();
    }

    const measuredP95 = p95(samples);
    console.info(`[RLSH][Perf] synthetic popup-open p95=${measuredP95.toFixed(2)}ms over ${iterations} iterations`);
    expect(measuredP95).toBeLessThan(150);
  });
});

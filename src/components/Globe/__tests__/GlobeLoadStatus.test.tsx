/**
 * The globe's loading status (decision D-LS, LS1, LS2, LS4): while a shown layer loads, each feed by name with the
 * time waited; a feed that failed, and why; a layer that drew nothing once its feeds were in, in their own words,
 * until the person changes layer or dismisses it. Nothing when every shown layer drew.
 */
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { GlobeLoadStatus } from '../GlobeLoadStatus';
import { publishLegend, resetLegendsForTest } from '../../../services/globe/globeLegendStore';
import type { FeedProvenance } from '../../../features/globe/capture/shareCardProvenance';
import { jobs } from '../../../services/jobs/jobRegistry';

const cables = (over: Partial<FeedProvenance> = {}): FeedProvenance => ({
  name: 'Submarine cable map', layer: 'CommHubs', lastUpdated: null, loading: true, ...over,
});
const nameOf = (id: string) => ({ CommHubs: 'Comm Hubs', SceneIncidents: 'Scene incidents', AiIncidents: 'Incidents' }[id] ?? id);

describe('GlobeLoadStatus', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.parse('2026-10-16T22:00:00Z')); resetLegendsForTest(); });
  afterEach(() => { vi.useRealTimers(); resetLegendsForTest(); jobs.clearForTest(); });

  it('says each feed it waits on, and counts the seconds from when it was first seen loading', () => {
    render(<GlobeLoadStatus shown={['CommHubs']} feeds={[cables()]} layerName={nameOf} />);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Acquiring');
    expect(status.textContent).toContain('Comm Hubs');
    expect(status.textContent).toContain('Submarine cable map');
    act(() => { vi.advanceTimersByTime(12_000); });
    expect(screen.getByTestId('load-status-wait-CommHubs#0').textContent).toBe('12 s');
  });

  it('keeps the seconds, and one job, when a feed is renamed while it loads', () => {
    const named = (name: string): FeedProvenance => ({ name, layer: 'SceneIncidents', lastUpdated: null, loading: true });
    const { rerender } = render(<GlobeLoadStatus shown={['SceneIncidents']} feeds={[named('Scene incidents, via Mecha Jono')]} layerName={nameOf} />);
    act(() => { vi.advanceTimersByTime(5_000); });
    rerender(<GlobeLoadStatus shown={['SceneIncidents']} feeds={[named('Scene incidents from Mixmag Asia, via Mecha Jono')]} layerName={nameOf} />);
    expect(screen.getByTestId('load-status-wait-SceneIncidents#0').textContent).toBe('5 s');
    expect(jobs.snapshot().filter((j) => j.kind === 'layer-load').map((j) => [j.label, j.state]))
      .toEqual([['Scene incidents: Scene incidents from Mixmag Asia, via Mecha Jono', 'running']]);
  });

  it('shows the progress a layer counts, rather than the seconds', () => {
    render(<GlobeLoadStatus shown={['OpenMissions']} feeds={[{ name: 'Mission Packages', layer: 'OpenMissions', lastUpdated: null, loading: true, progress: { done: 14, total: 68 } }]} layerName={nameOf} />);
    expect(screen.getByTestId('load-status-wait-OpenMissions#0').textContent).toBe('14 of 68');
  });

  it('goes when the marks land', () => {
    const { rerender } = render(<GlobeLoadStatus shown={['CommHubs']} feeds={[cables()]} layerName={nameOf} />);
    act(() => { publishLegend('CommHubs', { layerId: 'CommHubs', layer: 'Comm Hubs', swatches: [] }); });
    rerender(<GlobeLoadStatus shown={['CommHubs']} feeds={[cables({ loading: false, timestamped: false })]} layerName={nameOf} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says a feed did not load, and why, until dismissed', () => {
    render(<GlobeLoadStatus shown={['CommHubs']} feeds={[cables({ loading: false, error: 'HTTP 503' })]} layerName={nameOf} />);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Did not load');
    expect(status.textContent).toContain('Submarine cable map: HTTP 503');
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByRole('status')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('says a layer drew nothing once its feeds are in, in their own words', () => {
    render(<GlobeLoadStatus
      shown={['SceneIncidents']}
      feeds={[{ name: 'Scene incidents via Mecha Jono (1 past its end, not drawn; 2 naming no place, listed)', layer: 'SceneIncidents', lastUpdated: '2026-10-16T21:00:00Z' }]}
      layerName={nameOf}
    />);
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Nothing drawn');
    expect(status.textContent).toContain('Scene incidents');
    expect(status.textContent).toContain('1 past its end, not drawn; 2 naming no place, listed');
  });

  it('never calls a layer empty that does not say what it drew', () => {
    render(<GlobeLoadStatus shown={['RLSH']} feeds={[{ name: 'RLSH registry', layer: 'RLSH', lastUpdated: '2026-03-02T15:15:00Z' }]} layerName={nameOf} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows a dismissed outcome again when the layers shown change', () => {
    const failed = [cables({ loading: false, error: 'HTTP 503' })];
    const { rerender } = render(<GlobeLoadStatus shown={['CommHubs']} feeds={failed} layerName={nameOf} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    rerender(<GlobeLoadStatus shown={['CommHubs', 'CyberThreats']} feeds={failed} layerName={nameOf} />);
    expect(screen.getByRole('status').textContent).toContain('Did not load');
  });

  it('reads the AI Watch layers under the feed they share', () => {
    render(<GlobeLoadStatus shown={['AiIncidents']} feeds={[{ name: "AI Watch: Mecha Jono's Terminator Watch", layer: 'AIWatch', lastUpdated: null, loading: true }]} layerName={nameOf} />);
    expect(screen.getByRole('status').textContent).toContain("AI Watch: Mecha Jono's Terminator Watch");
  });

  /* Each load a tile in the job rail too (LS1), with its real progress, gone when the marks land. */
  describe('in the job rail', () => {
    const layerJobs = () => jobs.snapshot().filter((j) => j.kind === 'layer-load');

    it('puts each feed it waits on in the rail, and marks it done when it is in', () => {
      const { rerender } = render(<GlobeLoadStatus shown={['CommHubs']} feeds={[cables()]} layerName={nameOf} />);
      expect(layerJobs().map((j) => [j.label, j.state])).toEqual([['Comm Hubs: Submarine cable map', 'running']]);
      rerender(<GlobeLoadStatus shown={['CommHubs']} feeds={[cables({ loading: false, timestamped: false })]} layerName={nameOf} />);
      expect(layerJobs().map((j) => j.state)).toEqual(['done']);
    });

    it('carries the progress a layer counts', () => {
      const missions = (done: number): FeedProvenance => ({ name: 'Mission Packages', layer: 'OpenMissions', lastUpdated: null, loading: true, progress: { done, total: 68 } });
      const { rerender } = render(<GlobeLoadStatus shown={['OpenMissions']} feeds={[missions(14)]} layerName={nameOf} />);
      expect(layerJobs()[0].progress).toEqual({ done: 14, total: 68 });
      rerender(<GlobeLoadStatus shown={['OpenMissions']} feeds={[missions(40)]} layerName={nameOf} />);
      expect(layerJobs()[0].progress).toEqual({ done: 40, total: 68 });
    });

    it('marks it failed, with why, when the feed fails', () => {
      const { rerender } = render(<GlobeLoadStatus shown={['CommHubs']} feeds={[cables()]} layerName={nameOf} />);
      rerender(<GlobeLoadStatus shown={['CommHubs']} feeds={[cables({ loading: false, error: 'HTTP 503' })]} layerName={nameOf} />);
      expect(layerJobs().map((j) => [j.state, j.detail])).toEqual([['failed', 'HTTP 503']]);
    });

    it('ends its jobs when the layer is no longer shown', () => {
      const { rerender } = render(<GlobeLoadStatus shown={['CommHubs']} feeds={[cables()]} layerName={nameOf} />);
      rerender(<GlobeLoadStatus shown={['Satellites']} feeds={[cables()]} layerName={nameOf} />);
      expect(layerJobs().map((j) => j.state)).toEqual(['done']);
    });
  });

  /* A sweep over the globe's disc while it loads (LS3): beside the canvas, never in it, so never in a card. */
  describe('the sweep', () => {
    const rig = () => {
      const container = document.createElement('div');
      const canvas = document.createElement('canvas');
      container.appendChild(canvas);
      document.body.appendChild(container);
      return { container, canvas, sweep: { container: { current: container }, bounds: () => ({ x: 300, y: 120, size: 460 }) } };
    };

    it('sweeps the disc while a layer loads, beside the canvas, and goes when it is in', () => {
      const r = rig();
      const { rerender } = render(<GlobeLoadStatus shown={['CommHubs']} feeds={[cables()]} layerName={nameOf} sweep={r.sweep} />);
      act(() => { vi.advanceTimersByTime(250); });
      const sweep = r.container.querySelector('[data-testid="globe-load-sweep"]') as HTMLElement;
      expect(sweep).toBeTruthy();
      expect(sweep.parentElement).toBe(r.container);
      expect(r.canvas.contains(sweep)).toBe(false);
      expect([sweep.style.left, sweep.style.top, sweep.style.width, sweep.style.height]).toEqual(['300px', '120px', '460px', '460px']);
      expect(sweep.getAttribute('aria-hidden')).toBe('true');
      rerender(<GlobeLoadStatus shown={['CommHubs']} feeds={[cables({ loading: false, error: 'HTTP 503' })]} layerName={nameOf} sweep={r.sweep} />);
      expect(r.container.querySelector('[data-testid="globe-load-sweep"]')).toBeNull();
      r.container.remove();
    });

    it('stops once the layer has drawn, while the line goes on saying what is still read', () => {
      const r = rig();
      render(<GlobeLoadStatus shown={['OpenMissions']} feeds={[{ name: 'Missions', layer: 'OpenMissions', lastUpdated: null, loading: true }]} layerName={nameOf} sweep={r.sweep} />);
      act(() => { vi.advanceTimersByTime(250); });
      expect(r.container.querySelector('[data-testid="globe-load-sweep"]')).toBeTruthy();
      act(() => { publishLegend('OpenMissions', { layerId: 'OpenMissions', layer: 'Missions', swatches: [] }); });
      act(() => { vi.advanceTimersByTime(250); });
      expect(r.container.querySelector('[data-testid="globe-load-sweep"]')).toBeNull();
      // Not "Acquiring" over marks already drawn: what is left is the rest of the read.
      expect(screen.getByRole('status').textContent).toContain('Still reading');
      expect(screen.getByRole('status').textContent).not.toContain('Acquiring');
      r.container.remove();
    });

    it('takes the layer\'s colour where the tokens give it one', () => {
      const r = rig();
      render(<GlobeLoadStatus shown={['AiIncidents']} feeds={[{ name: 'AI Watch', layer: 'AIWatch', lastUpdated: null, loading: true }]} layerName={nameOf} sweep={r.sweep} />);
      act(() => { vi.advanceTimersByTime(250); });
      const sweep = r.container.querySelector('[data-testid="globe-load-sweep"]') as HTMLElement;
      expect(sweep.style.getPropertyValue('--sweep').toUpperCase()).toBe('#F040C8');
      r.container.remove();
    });

    it('draws nothing where the globe has no disc yet', () => {
      const r = rig();
      render(<GlobeLoadStatus shown={['CommHubs']} feeds={[cables()]} layerName={nameOf} sweep={{ ...r.sweep, bounds: () => null }} />);
      act(() => { vi.advanceTimersByTime(250); });
      expect(r.container.querySelector('[data-testid="globe-load-sweep"]')).toBeNull();
      r.container.remove();
    });
  });
});

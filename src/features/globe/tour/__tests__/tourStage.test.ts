/**
 * A playlist's layers and moment shown, and put back (record
 * docs/missions/01-architecture-decisions/briefing-playlists.md, BP5, BP9).
 *
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest';
import { PLAYLIST_STAGES, showPlaylist, type StageControls } from '../tourStage';

const NOW = Date.UTC(2026, 9, 9, 18);

function controls(over: Partial<StageControls> = {}) {
  const temporal = {
    isLive: true,
    currentTime: NOW,
    timeWindow: null as { start: Date; end: Date } | null,
    setIsLive: vi.fn(),
    setCurrentTime: vi.fn(),
    setTimeWindow: vi.fn(),
  };
  const c: StageControls = {
    layers: [
      { id: 'IntelReports', category: 'CyberCommand', isPinned: false },
      { id: 'WarConflict', category: 'GeoPolitical', isPinned: false },
      { id: 'SceneEvents', category: 'RaverWatch', isPinned: false },
      { id: 'DrugCheckAlerts', category: 'RaverWatch', isPinned: true },
      { id: 'SceneIncidents', category: 'RaverWatch', isPinned: false },
      { id: 'HeatRisk', category: 'RaverWatch', isPinned: false },
    ],
    visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' },
    setVisualizationMode: vi.fn(),
    pinLayer: vi.fn(),
    unpinLayer: vi.fn(),
    temporal,
    nowMs: NOW,
    ...over,
  };
  return { c, temporal };
}

describe('a playlist shown', () => {
  it('War & Conflict: its layer in front, live', () => {
    const { c, temporal } = controls({ temporal: { ...controls().temporal, isLive: false } });
    showPlaylist('war', c);
    expect(c.setVisualizationMode).toHaveBeenCalledWith({ mode: 'GeoPolitical', subMode: 'WarConflict' });
    expect(c.pinLayer).not.toHaveBeenCalled();
    expect(c.temporal!.setIsLive).toHaveBeenCalledWith(true);
    void temporal;
  });

  it('raves: scene events in front, the warnings beside them, tonight as the panel\'s Tonight chooses it', () => {
    const { c, temporal } = controls();
    showPlaylist('raves', c);
    expect(c.setVisualizationMode).toHaveBeenCalledWith({ mode: 'RaverWatch', subMode: 'SceneEvents' });
    // Drug-check alerts were pinned already: only what was not is pinned.
    expect(c.pinLayer).toHaveBeenCalledTimes(1);
    expect(c.pinLayer).toHaveBeenCalledWith('SceneIncidents');
    expect(temporal.setTimeWindow).toHaveBeenCalledWith(NOW, NOW + 12 * 3_600_000);
  });

  it('heat: HeatRisk in front, tonight', () => {
    const { c, temporal } = controls();
    showPlaylist('heat', c);
    expect(c.setVisualizationMode).toHaveBeenCalledWith({ mode: 'RaverWatch', subMode: 'HeatRisk' });
    expect(temporal.setTimeWindow).toHaveBeenCalledWith(NOW, NOW + 12 * 3_600_000);
    expect(PLAYLIST_STAGES.heat.pins).toEqual([]);
  });
});

describe('put back as it was (BP9)', () => {
  it('the layer in front, and only the pins the tour added', () => {
    const { c } = controls();
    const restore = showPlaylist('raves', c);
    restore();
    expect(c.setVisualizationMode).toHaveBeenLastCalledWith({ mode: 'CyberCommand', subMode: 'IntelReports' });
    expect(c.unpinLayer).toHaveBeenCalledTimes(1);
    expect(c.unpinLayer).toHaveBeenCalledWith('SceneIncidents');
  });

  it('live, when it was live', () => {
    const { c, temporal } = controls();
    showPlaylist('heat', c)();
    expect(temporal.setIsLive).toHaveBeenLastCalledWith(true);
  });

  it('a chosen window, when one was chosen', () => {
    const { c, temporal } = controls({
      temporal: { ...controls().temporal, isLive: false, currentTime: NOW - 3_600_000, timeWindow: { start: new Date(NOW - 7_200_000), end: new Date(NOW - 3_600_000) } },
    });
    showPlaylist('raves', c)();
    expect(c.temporal!.setTimeWindow).toHaveBeenLastCalledWith(NOW - 7_200_000, NOW - 3_600_000);
  });

  it('a paused moment, when it was paused at one', () => {
    const { c } = controls({ temporal: { ...controls().temporal, isLive: false, currentTime: NOW - 60_000, timeWindow: null } });
    showPlaylist('war', c)();
    expect(c.temporal!.setCurrentTime).toHaveBeenLastCalledWith(NOW - 60_000);
  });

  it('leaves the moment alone where there is no timeline', () => {
    const { c } = controls({ temporal: null });
    expect(() => showPlaylist('raves', c)()).not.toThrow();
  });
});

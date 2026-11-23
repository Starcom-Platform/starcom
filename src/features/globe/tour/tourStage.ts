/**
 * A playlist's layers and moment, shown for its tour and put back after it
 * (record docs/missions/01-architecture-decisions/briefing-playlists.md, BP5, BP9).
 *
 * The layer a playlist is about goes in front, the layers beside it are pinned,
 * and the moment is set as its brief reads: War & Conflict live, raves and heat
 * tonight, as the Raver Watch panel's Tonight sets it. Put back means as the
 * person had it: the layer in front, only the pins the tour added taken away,
 * and the moment live, a chosen window, or a paused moment, whichever it was.
 */
import type { GlobeLayerCategory, GlobeLayerId } from '../../../components/Globe/Hooks/useGlobeLayerControl';
import type { VisualizationMode } from '../../../context/VisualizationModeContext';
import { tonight } from '../../../services/raverWatch/raverWatchWindows';
import type { PlaylistId } from './briefingPlaylist';

/** What each playlist shows. */
export const PLAYLIST_STAGES: Readonly<Record<PlaylistId, { primary: GlobeLayerId; pins: readonly GlobeLayerId[]; moment: 'live' | 'tonight' }>> = {
  war: { primary: 'WarConflict', pins: [], moment: 'live' },
  raves: { primary: 'SceneEvents', pins: ['DrugCheckAlerts', 'SceneIncidents'], moment: 'tonight' },
  heat: { primary: 'HeatRisk', pins: [], moment: 'tonight' },
  // Relief, with Field missions beside it, as they stand now (HW13).
  heroes: { primary: 'Relief', pins: ['FieldMissions'], moment: 'live' },
};

/** The shared moment, as the timeline holds it. */
export interface StageTemporal {
  isLive: boolean;
  currentTime: number;
  timeWindow: { start: Date; end: Date } | null;
  setIsLive(live: boolean): void;
  setCurrentTime(time: number): void;
  setTimeWindow(start: number, end: number): void;
}

/** What showing a playlist reads and moves. */
export interface StageControls {
  layers: ReadonlyArray<{ id: GlobeLayerId; category: GlobeLayerCategory; isPinned: boolean }>;
  visualizationMode: VisualizationMode;
  setVisualizationMode(mode: VisualizationMode): void;
  pinLayer(id: GlobeLayerId): void;
  unpinLayer(id: GlobeLayerId): void;
  /** Null where the page has no timeline. */
  temporal: StageTemporal | null;
  nowMs: number;
}

/** Shows a playlist's layers and moment; returns how to put back what it changed. */
export function showPlaylist(id: PlaylistId, c: StageControls): () => void {
  const stage = PLAYLIST_STAGES[id];
  const temporal = c.temporal;
  const was = {
    mode: c.visualizationMode,
    live: temporal?.isLive ?? true,
    at: temporal?.currentTime ?? c.nowMs,
    window: temporal?.timeWindow ?? null,
  };

  const front = c.layers.find((layer) => layer.id === stage.primary);
  if (front) c.setVisualizationMode({ mode: front.category, subMode: stage.primary } as VisualizationMode);
  const added = stage.pins.filter((pin) => !c.layers.find((layer) => layer.id === pin)?.isPinned);
  for (const pin of added) c.pinLayer(pin);
  if (temporal) {
    if (stage.moment === 'live') {
      if (!temporal.isLive) temporal.setIsLive(true);
    } else {
      const window = tonight(c.nowMs);
      temporal.setTimeWindow(window.start, window.end);
    }
  }

  return () => {
    c.setVisualizationMode(was.mode);
    for (const pin of added) c.unpinLayer(pin);
    if (!temporal) return;
    if (was.live) temporal.setIsLive(true);
    else if (was.window && was.window.end.getTime() === was.at) temporal.setTimeWindow(was.window.start.getTime(), was.window.end.getTime());
    else temporal.setCurrentTime(was.at);
  };
}

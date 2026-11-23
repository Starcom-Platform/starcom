/**
 * The globe's loading status (decision D-LS, critique C4): a compact line under the mode bar while a shown
 * layer loads, naming each feed it waits on with the time waited or the progress its layer counts (LS1, LS2);
 * then, if a feed failed or a layer drew nothing, that outcome, until the person changes layer or dismisses it
 * (LS4). Comm Hubs measured 22 s of an empty globe with nothing but the key's small "loading…".
 *
 * It reads the feeds the key and a card read (shareFeeds, each tagged with its layer), through the same
 * feedState, so the three never disagree. What a layer drew it reads from the legend each publishes when it
 * draws; a layer that publishes none is never called empty.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Docked } from '../Dock/Docked';
import { subscribeLegends, type LayerLegend } from '../../services/globe/globeLegendStore';
import type { FeedProvenance } from '../../features/globe/capture/shareCardProvenance';
import { feedKeys, isWaiting, layerLoadStatus } from '../../features/globe/loadStatus/layerLoadStatus';
import { jobs, type JobHandle } from '../../services/jobs/jobRegistry';
import { DATA_SCALES } from '../../styles/tokens';
import styles from './GlobeLoadStatus.module.css';

/** The AI Watch layers share one feed and one legend, under this id. */
const AI_WATCH_LAYERS = new Set(['AiIncidents', 'AiFrontier', 'AiWar', 'AiSafety']);
const feedLayerOf = (shown: string): string => (AI_WATCH_LAYERS.has(shown) ? 'AIWatch' : shown);

/**
 * The layers that publish a legend when, and only when, they draw: for these alone "no legend" means "drew
 * nothing". Conflict Zones publishes a bare line when no war event is drawn, so it is never called empty, which
 * errs the safe way. RLSH, Resource Zones and Space Weather are not here.
 */
const LEGEND_WHEN_DRAWN = new Set([
  'EcologicalDisasters', 'Satellites', 'CyberThreats', 'CommHubs', 'EarthWeather', 'ConflictZones', 'DiplomaticEvents',
  'WarConflict', 'DrugCheckAlerts', 'SceneIncidents', 'SceneEvents', 'HeatRisk', 'Lifeboats', 'Relief', 'FieldMissions',
  'RaverMissions', 'AIWatch', 'OpenMissions', 'CampaignsOperations', 'CivilUnrest',
  // It draws nothing in this build, so publishes no legend: its feed says why (LS7).
  'HarmReductionSites',
]);

const waited = (ms: number) => `${Math.round(ms / 1000)} s`;

/** A layer's colour where the tokens give it one hue; the accent otherwise (LS3). */
const SWEEP_COLOUR: Record<string, string> = {
  AIWatch: DATA_SCALES.aiWatch,
  OpenMissions: DATA_SCALES.missions,
  Lifeboats: DATA_SCALES.heroWatch, Relief: DATA_SCALES.heroWatch, FieldMissions: DATA_SCALES.heroWatch, RaverMissions: DATA_SCALES.heroWatch,
};

/** Where the globe's disc is, in the container's CSS pixels, or null before there is one. */
export type SweepBounds = () => { x: number; y: number; size: number } | null;

/** How often the sweep follows the disc while the camera moves. */
const SWEEP_FOLLOW_MS = 200;

/**
 * A slow sweep across the globe's disc while a layer loads (LS3), portalled into the globe's container beside the
 * canvas: never drawn into it, so never in a card or a clip, and nothing in it could be read as data.
 */
const LoadSweep: React.FC<{ container: React.RefObject<HTMLElement>; bounds: SweepBounds; colour: string }> = ({ container, bounds, colour }) => {
  const [disc, setDisc] = useState<ReturnType<SweepBounds>>(null);
  useEffect(() => {
    const follow = () => setDisc((was) => {
      const now = bounds();
      return was && now && was.x === now.x && was.y === now.y && was.size === now.size ? was : now;
    });
    follow();
    const id = setInterval(follow, SWEEP_FOLLOW_MS);
    return () => clearInterval(id);
  }, [bounds]);
  const host = container.current;
  if (!host || !disc) return null;
  return createPortal(
    <div
      className={styles.sweep}
      data-testid="globe-load-sweep"
      aria-hidden="true"
      style={{ left: `${disc.x}px`, top: `${disc.y}px`, width: `${disc.size}px`, height: `${disc.size}px`, ['--sweep' as string]: colour }}
    />,
    host,
  );
};

export const GlobeLoadStatus: React.FC<{
  /** The layers shown, primary and pinned, by the layer catalogue's id. */
  shown: readonly string[];
  feeds: readonly FeedProvenance[];
  /** A layer's name as the catalogue gives it. */
  layerName: (id: string) => string;
  /** Where to sweep while loading: the globe's container, and its disc in it (LS3). */
  sweep?: { container: React.RefObject<HTMLElement>; bounds: SweepBounds };
}> = ({ shown, feeds, layerName, sweep }) => {
  // As the key reads them: the store hands each subscriber its snapshot, a new array a change.
  const [legends, setLegends] = useState<LayerLegend[]>([]);
  useEffect(() => subscribeLegends(setLegends), []);
  const layers = useMemo(() => [...new Set(shown.map(feedLayerOf))], [shown]);
  const firstLoadingAt = useRef(new Map<string, number>());
  const [now, setNow] = useState(() => Date.now());

  // When each feed was first seen loading, for the seconds waited; forgotten once it is in.
  useEffect(() => {
    const at = Date.now();
    const seen = firstLoadingAt.current;
    const waiting = new Set<string>();
    const keys = feedKeys(feeds);
    for (const [i, f] of feeds.entries()) {
      if (!isWaiting(f, at)) continue;
      const key = keys[i];
      waiting.add(key);
      if (!seen.has(key)) seen.set(key, at);
    }
    for (const key of [...seen.keys()]) if (!waiting.has(key)) seen.delete(key);
    setNow(at);
  }, [feeds]);

  const drew = (layer: string): boolean | null =>
    (LEGEND_WHEN_DRAWN.has(layer) ? legends.some((l) => l.layerId === layer || l.layerId.startsWith(`${layer}:`)) : null);
  const status = layerLoadStatus({ shown: layers, feeds, drew, firstLoadingAt: firstLoadingAt.current, now });
  const loading = (status?.loading.length ?? 0) > 0;

  // The seconds tick while anything loads, and only then.
  useEffect(() => {
    if (!loading) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [loading]);

  const nameOf = (layer: string) => (layer === 'AIWatch' ? 'AI Watch' : layerName(layer));

  // Each feed waited on is a tile in the job rail too, with its real progress (LS1): done when it is in, failed
  // with why, and done when its layer is no longer shown.
  const handles = useRef(new Map<string, JobHandle>());
  const jobsKey = JSON.stringify([
    status?.loading.map((f) => [f.key, f.name, f.shortName, f.progress?.done, f.progress?.total]) ?? [],
    status?.failed.map((f) => [f.key, f.error]) ?? [],
  ]);
  useEffect(() => {
    const open = handles.current;
    const waiting = new Set<string>();
    for (const f of status?.loading ?? []) {
      waiting.add(f.key);
      const label = `${nameOf(f.layer)}: ${f.shortName ?? f.name}`;
      let handle = open.get(f.key);
      if (!handle) {
        handle = jobs.start({ id: `layer-load:${f.key}`, kind: 'layer-load', label });
        open.set(f.key, handle);
      } else {
        handle.update({ label });
      }
      if (f.progress) handle.update({ progress: f.progress });
    }
    for (const [key, handle] of [...open]) {
      if (waiting.has(key)) continue;
      const failure = status?.failed.find((f) => f.key === key);
      if (failure) handle.fail(failure.error);
      else handle.done();
      open.delete(key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jobsKey stands for the loading and failed lists it reads.
  }, [jobsKey]);
  useEffect(() => () => {
    for (const handle of handles.current.values()) handle.done();
    handles.current.clear();
  }, []);

  // An outcome stays until dismissed, or until the layers shown change (LS4).
  const outcome = status && !loading
    ? `${layers.join(',')}|${status.failed.map((f) => f.key).join(',')}|${status.empty.map((e) => e.layer).join(',')}`
    : null;
  const [dismissed, setDismissed] = useState<string | null>(null);
  // Only over a globe still empty of what it waits for: once every layer waited on has drawn, the sweep stops and
  // the line says "Still reading", not "Acquiring", for the rest of the read (LS1, LS3). Missions, War & Conflict
  // and Raver Watch read The Record on for up to 30 s after their first marks (measured 2026-10-17).
  const sweepFor = status?.loading.find((f) => drew(f.layer) !== true);
  const sweeping = loading && sweep && sweepFor
    ? <LoadSweep container={sweep.container} bounds={sweep.bounds} colour={SWEEP_COLOUR[sweepFor.layer] ?? 'var(--sc-accent)'} />
    : null;
  if (!status || (outcome !== null && dismissed === outcome)) return null;

  const phase = loading ? 'loading' : status.failed.length ? 'failed' : 'empty';

  return (
    <>
    {sweeping}
    <Docked slot="globeLoadStatus">
      <section className={styles.status} data-phase={phase} role="status" aria-live="polite" data-testid="globe-load-status">
        <header className={styles.head}>
          <span className={styles.mark} aria-hidden="true" />
          <span className={styles.word}>{loading ? (sweepFor ? 'Acquiring' : 'Still reading') : status.failed.length ? 'Did not load' : 'Nothing drawn'}</span>
          {!loading && (
            <button type="button" className={styles.dismiss} aria-label="Dismiss" title="Dismiss" onClick={() => setDismissed(outcome)}>
              <X size={12} aria-hidden="true" />
            </button>
          )}
        </header>
        <ul className={styles.lines}>
          {status.loading.map((f) => (
            <li key={`w-${f.key}`} className={styles.line}>
              <span className={styles.layer}>{nameOf(f.layer)}</span>
              <span className={styles.feed}>{f.shortName ?? f.name}</span>
              <span className={styles.count} data-testid={`load-status-wait-${f.key}`}>
                {f.progress ? `${f.progress.done} of ${f.progress.total}` : waited(f.waitedMs)}
              </span>
            </li>
          ))}
          {status.failed.map((f) => (
            <li key={`f-${f.key}`} className={`${styles.line} ${styles.failed}`}>
              <span className={styles.layer}>{nameOf(f.layer)}</span>
              <span className={styles.feed}>{`${f.name}: ${f.error}`}</span>
            </li>
          ))}
          {!loading && !status.failed.length && status.empty.map((e) => (
            <li key={`e-${e.layer}`} className={`${styles.line} ${styles.empty}`}>
              <span className={styles.layer}>{nameOf(e.layer)}</span>
              <span className={styles.feed}>{e.feeds.join('; ')}</span>
            </li>
          ))}
        </ul>
      </section>
    </Docked>
    </>
  );
};

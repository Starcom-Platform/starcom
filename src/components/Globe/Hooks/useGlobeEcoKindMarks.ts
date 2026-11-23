/**
 * Eco Disasters' events as kind marks (critique-2026-11-01, O7, OR2, OR3, OR29; plan B2): Icon, Pin or Spike, the
 * rail's choice (Dot keeps the screen points, useGlobeEcoDisasterMarks), with each quake's depth as a line down when
 * the rail has it on. Drawn from a group of its own in the scene's frame that rides the shell, as Conflict Zones'
 * events are (useConflictEventMarks).
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ridesShell } from '../../../globe-engine/shellLift';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { bakeBadgeAtlas } from '../intelReportSprites';
import { publishLegend, type LegendSwatch } from '../../../services/globe/globeLegendStore';
import { kindAtlas, kindColour, kindEntry, type KindAtlas } from '../../../features/globe/marks/kindAtlas';
import { buildKindMarks, disposeKindMarks, type MarkStyle } from '../../../features/globe/marks/kindMarks';
import { ecoKindItems, type EcoKindInput } from '../../../features/globe/marks/ecoKindMarks';
import { buildQuakeDepthLines, type QuakeDepth } from '../../../features/globe/marks/quakeDepthLines';
import {
  bakeFlagAtlas, buildQuakeFlags, DEPTH_UNKNOWN, depthColour, MAGNITUDE_UNKNOWN, magnitudeColour, RING_FROM_MAGNITUDE, shakingColour,
  type QuakeColourBy, type QuakeFlagItem,
} from '../../../features/globe/marks/quakeFlags';
import { buildQuakeRipples, RIPPLE_FROM_MAGNITUDE } from '../../../features/globe/marks/quakeRipples';
import { buildQuakeBursts } from '../../../features/globe/marks/quakeBursts';
import { clipQuakeReplay, decayWords, quakeReplayNow } from '../../../features/globe/timebar/playClock';
import { fetchShakeContours, mmiRoman, mmiWords, type ShakeContour } from '../../../services/ShakeMapService';
import { DATA_SCALES, GUNMETAL } from '../../../styles/tokens';
import { formatCount } from '@utils/formatCount';
import { thenOf, useLayerRoot } from '../../../globe-engine/compareLayers';

export const ECO_KIND_MARKS_TYPE = 'ecoKindMarks';
export const ECO_KIND_LEGEND_ID = 'EcologicalDisasters:kinds';
/** The quakes' own key entry, when they are drawn as Earthquake 3D's flags (D-EQ, EQ10). */
export const ECO_QUAKE_LEGEND_ID = 'EcologicalDisasters:quakes';

/** The most ShakeMaps read for the quakes shown: the strongest quakes' (D-EQ, EQ11). */
export const SHAKEMAP_LIMIT = 30;

/** The quakes' flags as last built: drawn at all, and the replay they were built for ("4:3600000"), if any. */
let flagsBuilt: { active: boolean; replay: string | null } = { active: false, replay: null };
const replayKeyOf = (decayS: number, msPerSecond: number) => `${decayS}:${msPerSecond}`;
/**
 * What whenReady asks of a clip's replay (EQ21): with the quakes drawn as flags, they are built for the replay the
 * clip set, so its first frame draws each quake from the replay's moment, not the window's whole.
 */
export function quakeReplayReadiness(): { ready: boolean; why?: string } {
  const asked = clipQuakeReplay();
  if (!asked || !flagsBuilt.active) return { ready: true };
  return flagsBuilt.replay === replayKeyOf(asked.decayS, asked.msPerSecond)
    ? { ready: true }
    : { ready: false, why: "The quakes had not been drawn for the clip's replay" };
}

let shakeReadiness: { ready: boolean; why?: string } = { ready: true };
/** What whenReady asks of the quakes: false while USGS's ShakeMaps for those shown are being read (EQ11). */
export function quakeShakingReadiness(): { ready: boolean; why?: string } {
  return shakeReadiness;
}

const NO_BANDS: readonly (string | null)[] = [null, null];

/** A magnitude band's words, for the key. */
function magnitudeWords(lower: number): string {
  const bands = DATA_SCALES.quakeMagnitude.map(([from]) => from as number);
  const next = bands[bands.indexOf(lower) + 1];
  if (lower === bands[0]) return `magnitude under ${next}`;
  return next === undefined ? `magnitude ${lower} and over` : `magnitude ${lower} to ${next}`;
}

/** A depth band's words, for the key: USGS's bands, km. */
export function depthWords(lower: number): string {
  const bands = DATA_SCALES.quakeDepthKm.map(([from]) => from as number);
  const next = bands[bands.indexOf(lower) + 1];
  return next === undefined ? `${lower} km deep or deeper` : `${lower} to ${next} km deep`;
}

export interface UseGlobeEcoKindMarksParams {
  scene: THREE.Scene | null;
  /** On while Eco Disasters is drawn and its rail chose Icon, Pin or Spike. */
  active: boolean;
  /** With pins, what the quakes are coloured by (EQ5); magnitude by default. */
  colourBy?: QuakeColourBy;
  /** The quakes' window and sources, in words ("the last 7 days, every magnitude, from USGS and EMSC"; EQ14). */
  windowWords?: string | null;
  /** The magnitudes and depths the rail left the quakes to, in words, each null while every band is drawn (EQ6). */
  bandsWords?: readonly [string | null, string | null] | readonly (string | null)[];
  events: readonly (EcoKindInput & { depthKm?: number | null })[];
  style: Exclude<MarkStyle, 'dot'>;
  /** Each quake's depth as a line down (OR29). */
  depth: boolean;
  /**
   * While the time bar plays, with pins (EQ7, EQ17, EQ18): each quake drawn from the play clock, rising and bursting at
   * its moment and fading over the decay, in place of the rings, ShakeMaps and ripples; the decay's seconds and the rate.
   */
  replay?: { decayS: number; msPerSecond: number; by?: 'play' | 'clip' } | null;
  /**
   * The quakes of a comparison's other moment (D-CM, CM4): a copy of its own, named `EcologicalDisasters@then` for the
   * split; no ShakeMaps read, and the key, the waits and the replay left to the main one.
   */
  instance?: 'main' | 'then';
}

export function useGlobeEcoKindMarks({ scene, active, events, style, depth, colourBy = 'magnitude', bandsWords = NO_BANDS, windowWords = null, replay = null, instance = 'main' }: UseGlobeEcoKindMarksParams): { drawn: number } {
  const main = instance === 'main';
  const marksType = main ? ECO_KIND_MARKS_TYPE : `${ECO_KIND_MARKS_TYPE}:then`;
  // The key and the module's own waits are the main one's to write; a copy's would overwrite them.
  const publish: typeof publishLegend = main ? publishLegend : () => {};
  const replayDecayS = replay?.decayS ?? null;
  const replayRate = replay?.msPerSecond ?? null;
  const replayBy = replay?.by ?? 'play';
  const replaying = replayDecayS !== null && replayRate !== null;
  const [magnitudesWords, depthsWords] = bandsWords;
  const groupRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.userData = { type: instance === 'main' ? ECO_KIND_MARKS_TYPE : `${ECO_KIND_MARKS_TYPE}:then` };
    return group;
  })());
  const [atlas, setAtlas] = useState<KindAtlas | null>(null);
  const [badges, setBadges] = useState<THREE.Texture | null>(null);
  const [flagAtlas, setFlagAtlas] = useState<THREE.Texture | null>(null);
  const [shaking, setShaking] = useState<ReadonlyMap<string, readonly ShakeContour[]>>(new Map());
  const [drawn, setDrawn] = useState(0);
  // Its objects, for a comparison side by side (D-CM, CM1).
  useLayerRoot(main ? 'EcologicalDisasters' : thenOf('EcologicalDisasters'), groupRef.current);
  useEffect(() => registerTooltipGroup(groupRef.current), []);
  useEffect(() => {
    if (!scene) return undefined;
    const group = groupRef.current;
    scene.add(group);
    return () => { scene.remove(group); };
  }, [scene]);
  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    void bakeBadgeAtlas().then((t) => { if (live) setBadges(t); });
    void bakeFlagAtlas().then((t) => { if (live) setFlagAtlas(t); });
    return () => { live = false; };
  }, [active]);

  // With pins, each quake as Earthquake 3D draws it, sharper (D-EQ, EQ10): a line up to a flag saying its magnitude.
  // An atlas quake NOAA's record gives no magnitude gets a flag too, saying "?", so its badge is drawn with it.
  const flagged = active && style === 'pin'
    ? events.filter((e) => e.hazardType === 'earthquake' && (typeof e.magnitude === 'number' || !!e.atlas) && Number.isFinite(e.lat) && Number.isFinite(e.lng))
    : [];
  const flaggedIds = new Set(flagged.map((e) => e.id));
  // USGS's ShakeMaps for the strongest quakes shown that have one, read together, so the marks are built once.
  // None in a replay: its bursts stand for the area, and a stretch read every few seconds would read them again each time.
  const shakeWanted = (replaying || !main ? [] : flagged)
    .filter((e) => e.shakeMapDetailUrl && (e.magnitude as number) >= RING_FROM_MAGNITUDE)
    .sort((a, b) => (b.magnitude as number) - (a.magnitude as number))
    .slice(0, SHAKEMAP_LIMIT)
    .map((e) => [e.id, e.shakeMapDetailUrl as string] as const);
  const shakeKey = shakeWanted.map(([id, url]) => `${id} ${url}`).join('|');
  useEffect(() => {
    // A copy reads none, and never clears the main one's wait.
    if (!shakeKey) { if (main) shakeReadiness = { ready: true }; return undefined; }
    let live = true;
    const wanted = shakeKey.split('|').map((pair) => pair.split(' ') as [string, string]);
    shakeReadiness = { ready: false, why: `USGS's ShakeMaps for ${wanted.length} quake${wanted.length === 1 ? '' : 's'} had not been read` };
    void Promise.all(wanted.map(async ([id, url]) => [id, await fetchShakeContours(url)] as const)).then((read) => {
      if (!live) return;
      setShaking(new Map(read.filter((pair): pair is readonly [string, ShakeContour[]] => (pair[1]?.length ?? 0) > 0)));
      shakeReadiness = { ready: true };
    });
    return () => { live = false; shakeReadiness = { ready: true }; };
  }, [shakeKey, main]);
  const items = active ? ecoKindItems(events.filter((e) => !flaggedIds.has(e.id))) : [];
  const kindsKey = [...new Set(items.map((it) => it.kind))].sort().join('|');
  useEffect(() => {
    if (!active || !kindsKey) return undefined;
    let live = true;
    void kindAtlas(kindsKey.split('|')).then((a) => { if (live) setAtlas(a); });
    return () => { live = false; };
  }, [active, kindsKey]);

  useEffect(() => {
    const group = groupRef.current;
    if (!active) {
      if (main) flagsBuilt = { active: false, replay: null };
      setDrawn(0);
      publish(ECO_KIND_LEGEND_ID, null);
      publish(ECO_QUAKE_LEGEND_ID, null);
      return undefined;
    }
    const quakeItems: QuakeFlagItem[] = flagged.map((e) => {
      const t = e.timestamp ? Date.parse(e.timestamp) : NaN;
      return {
        id: e.id, lat: e.lat, lng: e.lng, magnitude: typeof e.magnitude === 'number' ? e.magnitude : null, tooltip: e.tooltip, opens: e.opens ?? null,
        // None in a replay: ShakeMaps read before play began would stand for quakes play has not reached.
        timeMs: Number.isFinite(t) ? t : null, shaking: replaying ? null : shaking.get(e.id) ?? null,
        depthKm: typeof e.depthKm === 'number' ? e.depthKm : null,
        atlas: e.atlas ?? null,
      };
    });
    const flagMarks = buildQuakeFlags(quakeItems, flagAtlas, {
      type: `${marksType}:quakes`, label: 'Eco Disasters', colourBy,
      ...(replaying ? { replay: quakeReplayNow, rings: false } : {}),
    });
    const byDepth = colourBy === 'depth';
    // Ripples and bursts are sized by a magnitude: a quake of none recorded has neither, its flag alone.
    const measured = quakeItems.filter((it): it is QuakeFlagItem & { magnitude: number } => typeof it.magnitude === 'number');
    const ripples = replaying ? null : buildQuakeRipples(measured, { type: `${marksType}:quakes:ripples` });
    if (ripples) flagMarks.group.add(ripples);
    const colourOfItem = (it: { magnitude: number; depthKm?: number | null }) => (byDepth ? depthColour(it.depthKm) : magnitudeColour(it.magnitude));
    const bursts = replaying
      ? buildQuakeBursts(measured, { type: `${marksType}:quakes:bursts`, colourOf: colourOfItem, replay: quakeReplayNow })
      : null;
    if (bursts) flagMarks.group.add(bursts);
    if (main) flagsBuilt = { active: style === 'pin' && quakeItems.length > 0, replay: replaying ? replayKeyOf(replayDecayS as number, replayRate as number) : null };
    group.add(flagMarks.group);
    publish(ECO_QUAKE_LEGEND_ID, quakeItems.length ? {
      layerId: ECO_QUAKE_LEGEND_ID,
      layer: 'Earthquakes',
      shapeMeans: [
        `a line up from each quake to a flag with its magnitude${flagMarks.magnitudeUnknown ? ', "?" where NOAA\'s record gives none' : ''}; where quakes crowd, their flags stack, the strongest on top, the rest counted on a chip`,
        ripples ? `one of magnitude ${RIPPLE_FROM_MAGNITUDE} or more ripples, for the eye only` : null,
        replaying ? `${replayBy === 'clip' ? 'in the replay' : 'on play'}, each quake's flag rises as it happens and a ring bursts from it, for the eye only; ${decayWords(replayDecayS as number, replayRate as number, replayBy)}` : null,
        windowWords ? `drawn: ${windowWords}` : null,
        magnitudesWords ? `only magnitudes ${magnitudesWords}` : null,
        depthsWords ? `only depths ${depthsWords}` : null,
        flagMarks.badges ? `beside a significant quake's flag, NOAA NCEI's record: \u2020 its deaths, to the least power of ten they reach (the count in its note), \u2248 a tsunami came of it` : null,
      ].filter(Boolean).join('; '),
      colorMeans: byDepth
        ? 'how deep a quake began, in USGS\'s depth bands; its ripple, if any, stays its magnitude\'s'
        : 'a quake\'s magnitude, a colour each whole step',
      ...(flagMarks.rings || flagMarks.shaken ? { areaMeans: [
        flagMarks.shaken ? 'USGS\'s ShakeMap where USGS made one: lines of how strongly the ground shook, coloured as USGS colours them' : null,
        flagMarks.rings ? `${flagMarks.shaken ? 'elsewhere ' : ''}a dashed ring round a quake of magnitude ${RING_FROM_MAGNITUDE} or more: how far it was likely felt, an indication from its magnitude, not a measured area` : null,
      ].filter(Boolean).join('; ') } : {}),
      swatches: [
        ...(byDepth
          ? flagMarks.bandsDrawn.map((lower) => ({ color: depthColour(lower), label: depthWords(lower) }))
          : flagMarks.bandsDrawn.map((lower) => ({ color: magnitudeColour(lower), label: magnitudeWords(lower) }))),
        ...(flagMarks.depthUnknown ? [{ color: DEPTH_UNKNOWN, label: 'depth not stated' }] : []),
        ...(flagMarks.magnitudeUnknown ? [{ color: MAGNITUDE_UNKNOWN, label: 'magnitude not recorded' }] : []),
        ...flagMarks.mmiDrawn.map((mmi) => ({ color: shakingColour(mmi), label: `shaking ${mmiRoman(mmi)}, ${mmiWords(mmi)}`, shape: 'line' })),
        ...(flagMarks.rings ? [{ color: byDepth ? GUNMETAL[300] : magnitudeColour(RING_FROM_MAGNITUDE), label: 'likely felt, an indication', shape: 'dashed ring' }] : []),
      ],
    } : null);
    const built = buildKindMarks(items, { style, atlas, type: `${marksType}:${style}`, label: 'Eco Disasters', badges });
    group.add(built.group);
    // The quakes' stacks keep clear of the other hazards' marks.
    flagMarks.avoid(built.sprites);
    // A quake's depth, down from its place (OR29): with pins, where the stalk rises from the same point.
    // Not in a replay: a line for every quake read would stand for those play has not reached.
    const quakes: QuakeDepth[] = depth && !replaying
      ? events.filter((e) => e.hazardType === 'earthquake' && typeof e.depthKm === 'number').map((e) => ({ id: e.id, lat: e.lat, lng: e.lng, depthKm: e.depthKm as number }))
      : [];
    const lines = buildQuakeDepthLines(quakes);
    if (lines) built.group.add(lines);
    setDrawn(items.length + quakeItems.length);
    const swatches: LegendSwatch[] = built.kindsDrawn.map((kind) => ({ color: kindColour(kind), label: kindEntry(kind).meaning.replace(/\.$/, '') }));
    publish(ECO_KIND_LEGEND_ID, items.length ? {
      layerId: ECO_KIND_LEGEND_ID,
      layer: 'Eco Disasters',
      shapeMeans: style === 'spike'
        ? 'a spike is an event where it happened; its height, a quake\'s magnitude or a fire\'s acres (log scale)'
        : style === 'pin'
          ? 'a pin stands on each event, its icon what happened; a number counts the events crowded under it'
          : 'the icon is what happened; a number counts the events crowded under it',
      colorMeans: 'natural hazards, brighter the more severe',
      ...(lines ? { sizeMeans: 'a line down from a quake: how deep it began' } : {}),
      ...(built.scale?.length ? { sizeMeans: `${built.scale.map((s) => formatCount(s.value)).join(', ')} at the heights drawn` } : {}),
      swatches,
    } : null);
    return () => {
      group.remove(built.group);
      disposeKindMarks(built.group);
      group.remove(flagMarks.group);
      disposeKindMarks(flagMarks.group);
      publish(ECO_KIND_LEGEND_ID, null);
      publish(ECO_QUAKE_LEGEND_ID, null);
    };
    // items stands for events while active; kindsKey for the kinds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, events, style, depth, atlas, badges, flagAtlas, shaking, colourBy, magnitudesWords, depthsWords, windowWords, replayDecayS, replayRate, replayBy]);

  return { drawn };
}

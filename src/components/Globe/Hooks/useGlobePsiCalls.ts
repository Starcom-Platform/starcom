/**
 * Calls on the globe (decision D-PW, PW40, PW44, PW72, PW76): the operative's own sealed call's Zone waits as a faint
 * dotted outline before its window opens and lights, its edge bright, while the window is open, in the ground's
 * violet; once revealed or kept, it lights again whenever the cursor is back inside its window. A teammate's call
 * shows only once revealed (PW44), lit inside its window, its tooltip naming the team alone (PW76).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildLineBatches, type LineLook } from '../../../geopolitical/geometry/lineBatches';
import { GLOBE_SCENE_COUNTER_OFFSET_RAD } from '../../../utils/globeCoordinates';
import { ridesShell } from '../../../globe-engine/shellLift';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { splitGroup, type SplitSide } from '../../../globe-engine/splitView';
import { DATA_SCALES } from '../../../styles/tokens';
import { fill, useMessages } from '../../../i18n/app/i18n';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { loadAreaShapes, type AreaShapes } from '../../../features/globe/areas/areaShapes';
import { callState, useCalls, windowMs, type CallText } from '../../../services/psiWatch/calls';
import { useTeamCalls } from '../../../services/psiWatch/teamCalls';
import { useQuakeLinks, type LinkedQuake } from '../../../services/psiWatch/callLinks';
import type { PolygonGeometry } from '../../../services/geoint/pointInPolygon';
import { ringPaths } from './useGlobePsiZones';

/** How this layer's group is found by a probe or a test. */
export const PSI_CALLS_TYPE = 'psiCalls';
const GROUND = parseInt(DATA_SCALES.psiGround.slice(1), 16);
export const CALL_LOOKS: Record<'waiting' | 'open' | 'quake', LineLook> = {
  waiting: { opacity: 0.55, linewidth: 1.5, dashed: true, dashSize: 0.6, gapSize: 0.8, dashScale: 1, renderOrder: 118 },
  open: { opacity: 1, linewidth: 3, dashed: false, dashSize: 1, gapSize: 1, dashScale: 1, renderOrder: 121 },
  quake: { opacity: 1, linewidth: 2, dashed: false, dashSize: 1, gapSize: 1, dashScale: 1, renderOrder: 122 },
};
/** A linked quake's ring, degrees of arc across. */
const QUAKE_RING_DEG = 0.6;

/** A small ring about a quake, as a polygon the lines' shell takes. */
function ringAbout({ lat, lon }: LinkedQuake): PolygonGeometry {
  const ring: [number, number][] = [];
  const stretch = 1 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * 2 * Math.PI;
    ring.push([lon + QUAKE_RING_DEG * stretch * Math.cos(a), lat + QUAKE_RING_DEG * Math.sin(a)]);
  }
  return { type: 'Polygon', coordinates: [ring] };
}

function clear(group: THREE.Group): void {
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    for (const m of material ? (Array.isArray(material) ? material : [material]) : []) m.dispose();
  });
  group.clear();
}

export function useGlobePsiCalls({ scene, active, cursorMs, split }: { scene: THREE.Scene | null; active: boolean; cursorMs: number; split?: SplitSide | null }): void {
  const { m } = useMessages();
  const w = m.psiWatch.timestream;
  const calls = useCalls();
  const teamCalls = useTeamCalls(active);
  const [shapes, setShapes] = useState<AreaShapes | undefined>(undefined);
  // The calls waiting or open at the cursor, each with its look: the operative's own, and a teammate's once revealed
  // (PW44, PW76), lit whenever the cursor is inside its window, named by its team.
  const shown = useMemo(() => {
    if (!active) return [];
    const inside = (text: CallText) => { const { fromMs, untilMs } = windowMs(text); return cursorMs >= fromMs && cursorMs <= untilMs; };
    type Shown = { key: string; text: CallText; look: 'waiting' | 'open'; from?: { team: string; revealedAt: number } };
    const own = calls.flatMap((c): Shown[] => {
      const state = callState(c, cursorMs);
      if (state === 'sealed') return [{ key: c.id, text: c.text, look: 'waiting' }];
      return state === 'open' || ((state === 'revealed' || state === 'private') && inside(c.text)) ? [{ key: c.id, text: c.text, look: 'open' }] : [];
    });
    const theirs = teamCalls.filter((c) => inside(c.text))
      .map((c): Shown => ({ key: `team:${c.key}`, text: c.text, look: 'open', from: { team: c.team, revealedAt: c.revealedAt } }));
    return [...own, ...theirs];
  }, [active, calls, teamCalls, cursorMs]);
  // A lit call whose window has closed: the quakes that fell in it, in its Zone (PW40, PW74).
  const closedQuakeCalls = useMemo(() => shown.filter((s) => s.look === 'open' && s.text.expects.kind === 'quakes'), [shown]);
  const quakeLinks = useQuakeLinks(closedQuakeCalls, Date.now(), active);
  const quakesShown = closedQuakeCalls.flatMap((s) => { const links = quakeLinks.get(s.key); return links?.state === 'done' ? links.quakes : []; });
  const shownKey = [...shown.map((s) => `${s.key}|${s.look}`), ...quakesShown.map((q) => q.id)].join('\n');
  useEffect(() => {
    if (!shown.length || shapes) return undefined;
    let live = true;
    void loadAreaShapes().then((loaded) => { if (live && loaded) setShapes(loaded); });
    return () => { live = false; };
  }, [shown.length, shapes]);

  const groupRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
    group.userData = { type: PSI_CALLS_TYPE };
    return group;
  })());
  useEffect(() => registerTooltipGroup(groupRef.current), []);
  // Side by side (PW73): drawn in its half while the globe is split.
  useEffect(() => splitGroup(groupRef.current, split ?? null), [split]);
  useEffect(() => {
    if (!scene) return undefined;
    const group = groupRef.current;
    scene.add(group);
    return () => { scene.remove(group); };
  }, [scene]);

  useEffect(() => {
    const group = groupRef.current;
    clear(group);
    if (!shapes || !shown.length) return undefined;
    const lines = shown.flatMap(({ key, text, look, from }) => {
      const outline = shapes.get(text.place.zone);
      if (!outline) return [];
      const title = fill(w.callTitle, { kind: w.callKinds[text.expects.kind], zone: text.place.name });
      const tooltip = from ? `${title} · ${fill(w.callFrom, { team: from.team, time: formatUtcDateTime(from.revealedAt, { year: true }) })}` : title;
      return ringPaths(outline.geometry).map((positions, i) => ({ id: `psi-call:${key}:${i}`, positions, color: GROUND, look: CALL_LOOKS[look], tooltip }));
    });
    for (const q of quakesShown) {
      const tooltip = fill(w.callQuake, { mag: q.mag.toFixed(1), time: formatUtcDateTime(q.ms, { year: true }), place: q.place });
      lines.push(...ringPaths(ringAbout(q)).map((positions, i) => ({ id: `psi-call-quake:${q.id}:${i}`, positions, color: GROUND, look: CALL_LOOKS.quake, tooltip })));
    }
    if (lines.length) group.add(buildLineBatches(lines));
    return () => { clear(group); };
    // shownKey stands for shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey, shapes, w]);
}

/**
 * The plate boundaries beside the quakes (D-EQ, EQ8): PB2002's boundaries, drawn while Eco Disasters is and its rail's
 * Plates is on, the subduction zones apart (quakePlates.ts). From a group of its own in the scene's frame that rides
 * the shell, as the quakes' marks do (useGlobeEcoKindMarks). The key names both kinds, and whenReady waits for the
 * file while they are asked for.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ridesShell } from '../../../globe-engine/shellLift';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import { disposeKindMarks } from '../../../features/globe/marks/kindMarks';
import { buildPlateBoundaries, loadPlateBoundaries, PLATE_COLOURS, type PlatesFile } from '../../../features/globe/marks/quakePlates';
import { useLayerRoot } from '../../../globe-engine/compareLayers';

export const QUAKE_PLATES_TYPE = 'quakePlates';
export const QUAKE_PLATES_LEGEND_ID = 'EcologicalDisasters:plates';

let readiness: { ready: boolean; why?: string } = { ready: true };
/** What whenReady asks of the plates: false while they are asked for and not yet read. */
export function quakePlatesReadiness(): { ready: boolean; why?: string } {
  return readiness;
}

export function useGlobeQuakePlates({ scene, active }: { scene: THREE.Scene | null; active: boolean }): { drawn: boolean } {
  const groupRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.userData = { type: QUAKE_PLATES_TYPE };
    return group;
  })());
  const [file, setFile] = useState<PlatesFile | null>(null);
  // Its objects, for a comparison side by side (D-CM, CM1).
  useLayerRoot('EcologicalDisasters', groupRef.current, { timeless: true });
  useEffect(() => registerTooltipGroup(groupRef.current), []);
  useEffect(() => {
    if (!scene) return undefined;
    const group = groupRef.current;
    scene.add(group);
    return () => { scene.remove(group); };
  }, [scene]);

  useEffect(() => {
    if (!active || file) { readiness = { ready: true }; return undefined; }
    let live = true;
    readiness = { ready: false, why: 'The plate boundaries had not been read' };
    void loadPlateBoundaries().then((read) => {
      if (!live) return;
      readiness = { ready: true };
      if (read) setFile(read);
    });
    return () => { live = false; readiness = { ready: true }; };
  }, [active, file]);

  const drawn = active && !!file;
  useEffect(() => {
    if (!drawn || !file) return undefined;
    const group = groupRef.current;
    const lines = buildPlateBoundaries(file, { type: `${QUAKE_PLATES_TYPE}:lines` });
    group.add(lines);
    publishLegend(QUAKE_PLATES_LEGEND_ID, {
      layerId: QUAKE_PLATES_LEGEND_ID,
      layer: 'Plate boundaries',
      colorMeans: 'the kind of boundary, as PB2002 (Bird 2003) gives it',
      swatches: [
        { color: PLATE_COLOURS.subduction, label: 'a subduction zone, where the greatest quakes come', shape: 'line' },
        { color: PLATE_COLOURS.boundary, label: 'another plate boundary', shape: 'line' },
      ],
    });
    return () => {
      group.remove(lines);
      disposeKindMarks(lines);
      publishLegend(QUAKE_PLATES_LEGEND_ID, null);
    };
  }, [drawn, file]);

  return { drawn };
}

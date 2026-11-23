/**
 * The Finder's place control on the globe (decision D-PW, PW61, PW70): while "a Zone on a plate boundary" is open,
 * every ZSP 2.0 Zone filled by its resonance with it, the share of its area within 150 km of a plate boundary, its
 * share and its earthquakes in the hover. Drawn only in Psi Watch.
 */
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLOBE_SCENE_COUNTER_OFFSET_RAD } from '../../../utils/globeCoordinates';
import { ridesShell } from '../../../globe-engine/shellLift';
import { registerTooltipGroup } from '../pointTooltipRegistry';
import { publishLegend } from '../../../services/globe/globeLegendStore';
import { DATA_SCALES } from '../../../styles/tokens';
import { fill, numbered, useMessages } from '../../../i18n/app/i18n';
import { loadAreaShapes, type AreaShapes } from '../../../features/globe/areas/areaShapes';
import { useFinderOpen } from '../../../services/psiWatch/finder';
import { useFinderPlates } from '../../PsiWatch/useFinderPlates';
import { psiZoneFills } from './psiZoneFills';

/** How this layer's group is found by a probe or a test. */
export const PSI_FINDER_TYPE = 'psiFinder';
/** A Zone's fill with no share near a boundary, and with all of it. */
const LEAST = 0.04;
const MOST = 0.62;

function clear(group: THREE.Group): void {
  group.traverse((child) => {
    const mesh = child as THREE.Mesh;
    // The fills' geometry is GeometryFactory's, cached; their materials are this layer's own copies.
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    for (const m of material ? (Array.isArray(material) ? material : [material]) : []) m.dispose();
  });
  group.clear();
}

export function useGlobePsiFinder({ scene, active }: { scene: THREE.Scene | null; active: boolean }): void {
  const { m } = useMessages();
  const words = m.psiWatch.places;
  const open = useFinderOpen();
  const shown = active && open === 'plates';
  const plates = useFinderPlates(shown);
  const [shapes, setShapes] = useState<AreaShapes | undefined>(undefined);
  useEffect(() => {
    if (!shown || shapes) return undefined;
    let live = true;
    void loadAreaShapes().then((loaded) => { if (live && loaded) setShapes(loaded); });
    return () => { live = false; };
  }, [shown, shapes]);

  const groupRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
    group.userData = { type: PSI_FINDER_TYPE };
    return group;
  })());
  useEffect(() => registerTooltipGroup(groupRef.current), []);
  useEffect(() => {
    if (!scene) return undefined;
    const group = groupRef.current;
    scene.add(group);
    return () => { scene.remove(group); };
  }, [scene]);

  useEffect(() => {
    const group = groupRef.current;
    clear(group);
    if (!shown || !plates || !shapes) return undefined;
    group.add(psiZoneFills(shapes, plates.zones.map((z) => ({
      code: z.code,
      opacity: LEAST + (MOST - LEAST) * z.share,
      tooltip: fill(words.finderZone, { place: shapes.get(z.code)?.name ?? z.code, share: numbered(Math.round(z.share * 100)), km: plates.withinKm, quakes: numbered(z.quakes) }),
    })), 'psiFinderZone'));
    return () => { clear(group); };
  }, [shown, plates, shapes, words]);

  useEffect(() => {
    if (!shown) return undefined;
    publishLegend('PsiFinder', {
      layerId: 'PsiFinder', layer: words.legendFinder, shapeMeans: words.legendFinderMeans,
      swatches: [{ color: DATA_SCALES.psiGround, label: words.swatchFinder, shape: 'area' }],
    });
    return () => publishLegend('PsiFinder', null);
  }, [shown, words]);
}

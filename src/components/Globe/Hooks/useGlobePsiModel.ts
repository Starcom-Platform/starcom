/**
 * The ψ field on the globe (decision D-PW, PW57, PW78–PW80): the experiment's steady state at the cursor's minute,
 * the core's null-flux line at its year, computed in a worker (usePsiField) and drawn as one shell in the looks the
 * panel chooses (psiFieldShell.ts). The cursor's copy keys the layer and answers whenReady; side by side, now's copy
 * draws in the left half.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ridesShell } from '../../../globe-engine/shellLift';
import { splitGroup, type SplitSide } from '../../../globe-engine/splitView';
import { cssColorOf, publishLegend } from '../../../services/globe/globeLegendStore';
import { TERRITORY_FILLS_ORDER } from '../../../geopolitical/theme/applyTerritoryLook';
import { DATA_SCALES, GUNMETAL } from '../../../styles/tokens';
import { fill, useMessages } from '../../../i18n/app/i18n';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { WEATHER_FIELDS } from '../globeAltitudes';
import { createPsiFieldShell, psiRgb, type PsiFieldShell } from '../psiWatch/psiFieldShell';
import { usePsiField, type PsiFieldState } from '../../../services/psiWatch/psiField/usePsiField';
import { usePsiFieldLooks } from '../../../services/psiWatch/psiField/psiFieldLooks';

/** How this layer's group is found by a probe or a test. */
export const PSI_MODEL_TYPE = 'psiModel';
const RADIUS = 100 * WEATHER_FIELDS;
/** The heat's colour at a value, as the key draws it. */
const heatCss = (psi: number) => cssColorOf(psiRgb(psi).reduce((n, byte) => n * 256 + byte, 0));

let readiness: { ready: boolean; why?: string } = { ready: true };
/** What whenReady asks of the ψ field: false while it is on and the cursor's moment has not been drawn. */
export function psiModelReadiness(): { ready: boolean; why?: string } {
  return readiness;
}

export interface UseGlobePsiModelOptions {
  scene: THREE.Scene | null;
  active: boolean;
  /** The shared cursor, ms. */
  cursorMs: number;
  /** Side by side (PW73): the half this copy draws in; absent or null, the whole globe. */
  split?: SplitSide | null;
}

export function useGlobePsiModel({ scene, active, cursorMs, split }: UseGlobePsiModelOptions): PsiFieldState {
  const { m } = useMessages();
  const words = m.psiWatch.psiModel;
  const looks = usePsiFieldLooks();
  const state = usePsiField(active, cursorMs, split === 'now' ? 'now' : 'cursor');
  const { at, current, failed } = state;
  // The cursor's copy answers for the layer; a failed read is ready, with nothing to wait for.
  const waiting = active && !current && !failed && split !== 'now';
  useEffect(() => {
    if (split === 'now') return undefined;
    readiness = waiting ? { ready: false, why: 'the ψ field was still being computed' } : { ready: true };
    return () => { readiness = { ready: true }; };
  }, [waiting, split]);

  const groupRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.renderOrder = TERRITORY_FILLS_ORDER + 1;
    group.userData = { type: PSI_MODEL_TYPE };
    return group;
  })());
  const shellRef = useRef<PsiFieldShell | null>(null);
  useEffect(() => splitGroup(groupRef.current, split ?? null), [split]);
  useEffect(() => {
    if (!scene) return undefined;
    const group = groupRef.current;
    scene.add(group);
    return () => { scene.remove(group); };
  }, [scene]);
  useEffect(() => () => {
    shellRef.current?.dispose();
    shellRef.current = null;
  }, []);

  useEffect(() => {
    const group = groupRef.current;
    if (!at) {
      if (shellRef.current) { group.remove(shellRef.current.mesh); shellRef.current.dispose(); shellRef.current = null; }
      return;
    }
    if (shellRef.current) shellRef.current.setField(at);
    else {
      shellRef.current = createPsiFieldShell(at, { radius: RADIUS, looks });
      group.add(shellRef.current.mesh);
    }
    // The looks follow in their own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);
  useEffect(() => { shellRef.current?.setLooks(looks); }, [looks, at]);

  const eclipseDay = !!at?.eclipse;
  useEffect(() => {
    // Side by side: the cursor's half keys the layer, as the card draws it.
    if (!at || split === 'now') return undefined;
    const when = fill(eclipseDay ? words.whenEclipse : words.when, { time: formatUtcDateTime(at.timeMs, { year: true }), year: at.year });
    publishLegend('PsiModel', {
      layerId: 'PsiModel',
      layer: words.legendLayer,
      when,
      shapeMeans: words.legendMeans,
      swatches: [
        ...(looks.heat ? [
          { color: heatCss(0.2), label: words.swatchFaint },
          { color: heatCss(0.65), label: words.swatchCondensed },
        ] : []),
        ...(looks.contours ? [{ color: DATA_SCALES.psiField[DATA_SCALES.psiField.length - 1][1], label: words.swatchContours, shape: 'line' }] : []),
        ...(looks.relief ? [{ color: GUNMETAL[200], label: words.swatchRelief }] : []),
        ...(looks.flow ? [
          { color: DATA_SCALES.psiWatch, label: words.swatchRaised },
          { color: DATA_SCALES.psiGround, label: words.swatchLowered },
        ] : []),
      ],
    });
    return () => publishLegend('PsiModel', null);
    // The key changes with the minute drawn, the year and the looks, not the field's every value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at?.timeMs, at?.year, eclipseDay, looks, words, split]);

  return state;
}

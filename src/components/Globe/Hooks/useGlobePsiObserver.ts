/**
 * The Timestream's observer on the globe (decision D-PW, PW43, PW65): a crosshair where its angles are cast, the
 * globe's centre as it turns, or a pinned place, which carries a dot. White on a dark rim, a tool's mark and no data's
 * colour, so it never reads as a Psi place (PW66). A tool's mark is the screen's alone: no card or clip draws it (PW62).
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLOBE_SCENE_COUNTER_OFFSET_RAD } from '../../../utils/globeCoordinates';
import { ridesShell } from '../../../globe-engine/shellLift';
import { bakeSvgAtlas } from '../intelReportSprites';
import { GUNMETAL } from '../../../styles/tokens';
import { useObserverState } from '../../../services/psiWatch/timestream/observer';
import { toScene } from './useGlobePsiLines';
import { onStill } from '../../../globe-engine/captureClock';

/** How this layer's group is found by a probe or a test. */
export const PSI_OBSERVER_TYPE = 'psiObserver';
/** The mark's height on screen, as a share of the view's height. */
const MARK_SCREEN_HEIGHT = 0.035;

/** The crosshair, and for a pinned place a dot at its middle, as a standalone SVG for the atlas. */
export function observerMarkSvg(pinned: boolean): string {
  const arms = [[32, 4, 32, 15], [32, 49, 32, 60], [4, 32, 15, 32], [49, 32, 60, 32]];
  const drawn = (stroke: string, width: number) => `<g fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round">`
    + '<circle cx="32" cy="32" r="13"/>'
    + arms.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`).join('')
    + '</g>';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">'
    + drawn(GUNMETAL[950], 6) + drawn(GUNMETAL[100], 2.5)
    + (pinned ? `<circle cx="32" cy="32" r="4.5" fill="${GUNMETAL[100]}" stroke="${GUNMETAL[950]}" stroke-width="2"/>` : '')
    + '</svg>';
}

const marks = new Map<boolean, Promise<THREE.Texture | null>>();
const markOf = (pinned: boolean): Promise<THREE.Texture | null> => {
  let mark = marks.get(pinned);
  if (!mark) {
    mark = bakeSvgAtlas([[observerMarkSvg(pinned)]]).then((texture) => {
      // The atlas is unflipped for point sprites, whose texture origin is the top row; a Sprite's is the bottom.
      if (texture) { texture.flipY = true; texture.needsUpdate = true; }
      return texture;
    });
    marks.set(pinned, mark);
  }
  return mark;
};

function clear(group: THREE.Group): void {
  for (const child of group.children) ((child as THREE.Sprite).material as THREE.Material | undefined)?.dispose();
  group.clear();
}

export interface UseGlobePsiObserverOptions {
  scene: THREE.Scene | null;
  /** Psi Watch is the globe's mode. */
  active: boolean;
}

export function useGlobePsiObserver({ scene, active }: UseGlobePsiObserverOptions): void {
  const { observer, pinned } = useObserverState();
  const groupRef = useRef<THREE.Group>((() => {
    const group = ridesShell(new THREE.Group());
    group.rotation.y = GLOBE_SCENE_COUNTER_OFFSET_RAD;
    group.userData = { type: PSI_OBSERVER_TYPE };
    return group;
  })());
  useEffect(() => {
    if (!scene) return undefined;
    const group = groupRef.current;
    scene.add(group);
    return () => { scene.remove(group); };
  }, [scene]);
  // Hidden for each capture's own render, shown again after it.
  useEffect(() => onStill({ still: () => { groupRef.current.visible = false; }, release: () => { groupRef.current.visible = true; } }), []);

  const lat = observer?.lat;
  const lon = observer?.lon;
  useEffect(() => {
    const group = groupRef.current;
    clear(group);
    if (!active || lat === undefined || lon === undefined) return undefined;
    let live = true;
    void markOf(pinned).then((texture) => {
      if (!live || !texture) return;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, sizeAttenuation: false }));
      sprite.scale.set(MARK_SCREEN_HEIGHT, MARK_SCREEN_HEIGHT, 1);
      sprite.renderOrder = 123;
      sprite.position.copy(toScene(lat, lon));
      sprite.userData = { type: 'psiObserverMark', pinned };
      group.add(sprite);
    });
    return () => { live = false; clear(group); };
  }, [active, lat, lon, pinned]);
}

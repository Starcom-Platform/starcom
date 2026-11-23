/**
 * A territories style's look, put on what is already built (decision K5,
 * territoryStyles.ts): the fills' one-colour switch, opacity, height and
 * shading, the selection halo's height with them, and the borders' colours,
 * widths, opacity and dash length. In place, with nothing rebuilt, because it runs at the start of a
 * render whenever the style drawn changes: a card drawn in another style than the
 * screen's, and the live frame after it (useNationalTerritories3D).
 */
import * as THREE from 'three';
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import type { GeoPoliticalConfig } from '../../hooks/useGeoPoliticalSettings';
import { lineBatchData, recolourLineBatch } from '../geometry/lineBatches';
import { territoryFillScale } from '../services/NationalTerritoriesService';
import { resolveBorderMaterialConfig, TERRITORY_FILL_COLOR, type BorderClassification } from './materialTheme';
import { isTerritoryFillMaterial, setTerritoryMaterialOneColour, setTerritoryMaterialOpacity, setTerritoryMaterialShading } from './territoryFillMaterial';
import { borderColourOf, type TerritoryLook, type TerritoryStyle } from './territoryStyles';
import { RAISED_SHELL_ORDER, liftForHeight } from '../../globe-engine/shellLift';

/** The fills' draw order on the ground, as the layer registry gives it (useNationalTerritories3D). */
export const TERRITORY_FILLS_ORDER = 95;

export interface TerritoryGroups {
  fills: THREE.Group | null;
  borders: THREE.Group | null;
  maritime: THREE.Group | null;
  /** The selected territory's halo, a sibling of the fills drawn at their scale. */
  halo: THREE.Group | null;
}

export function applyTerritoryLook(
  groups: TerritoryGroups,
  style: TerritoryStyle,
  look: TerritoryLook,
  config: GeoPoliticalConfig['nationalTerritories'],
): void {
  const { fills, halo } = groups;
  if (fills) {
    const scale = territoryFillScale(look.height);
    fills.scale.setScalar(scale);
    fills.userData.territoryRadiusScale = scale;
    // Raised, the shell draws before every mark it carries (globe-engine/shellLift.ts).
    fills.renderOrder = liftForHeight(look.height) > 1 ? RAISED_SHELL_ORDER : TERRITORY_FILLS_ORDER;
    fills.updateMatrixWorld(true);
    if (halo) {
      halo.scale.copy(fills.scale);
      halo.updateMatrixWorld(true);
    }
    fills.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !isTerritoryFillMaterial(child.material)) return;
      setTerritoryMaterialOneColour(child.material, style === 'quiet' ? TERRITORY_FILL_COLOR : null);
      setTerritoryMaterialOpacity(child.material, look.fillOpacity / 100);
      setTerritoryMaterialShading(child.material, look.shading / 100);
    });
  }
  // A batch holds borders of one look, so its first border's style is the batch's.
  const lookConfig = { ...config, borderVisibility: look.borderVisibility, borderThickness: look.borderThickness };
  for (const group of [groups.borders, groups.maritime]) {
    for (const child of group?.children ?? []) {
      const first = lineBatchData(child)?.lines[0];
      if (!first) continue;
      const params = resolveBorderMaterialConfig(lookConfig, first.id, (first.classification ?? 'international') as BorderClassification);
      const material = (child as LineSegments2).material as THREE.Material & { opacity: number; linewidth: number; dashed: boolean; dashScale: number };
      material.opacity = params.opacity;
      material.linewidth = Math.max(1, params.thickness);
      // A longer dash is a slower count along the line: today's at 100%.
      if (material.dashed) material.dashScale = params.dashScale * (100 / look.dashLength);
      recolourLineBatch(child as LineSegments2, (line) =>
        borderColourOf(style, (line.classification ?? 'international') as BorderClassification, look));
    }
  }
}

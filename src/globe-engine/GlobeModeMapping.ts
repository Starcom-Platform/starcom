// GlobeModeMapping.ts
// AI-NOTE: See globe-mode-mapping-reference.artifact for mapping logic.

import type { GlobeSkin } from '../services/globe/globeAppearance';

/**
 * GlobeModeMapping: Maps Starcom visualization modes to globe rendering modes, shaders, and overlays.
 * The `shader` is the skin a mode gets when the viewer has not chosen one themselves
 * (globeAppearance.ts's 'auto').
 * - See globe-mode-mapping-reference.artifact and globe-modes.artifact for mapping logic and extension.
 */

export class GlobeModeMapping {
  /**
   * Get render config for a given mode (see globe-mode-mapping-reference.artifact)
   */
  static getRenderConfigForMode(mode: string) {
    // AI-NOTE: See globe-mode-mapping-reference.artifact and globe-modes.artifact for mapping logic.
    // Expanded mapping with rationale and overlays
    const mapping: Record<string, { shader: GlobeSkin; overlays: string[]; texture: string; rationale: string }> = {
      CyberCommand: {
        shader: 'cyberEarth',
        overlays: ['alerts'],
        texture: 'earthDark',
        rationale: 'CyberCommand reads as an instrument, not a photograph: the Cyber-Earth skin. Overlays highlight cyber alerts.'
      },
      EcoNatural: {
        shader: 'dayNight',
        overlays: ['weather', 'naturalEvents'],
        texture: 'earthDay',
        rationale: 'EcoNatural uses day/night shading to visualize real-world environmental data and events.'
      },
      GeoPolitical: {
        shader: 'blueMarble',
        overlays: ['borders', 'territories'],
        texture: 'blueMarble',
        rationale: 'GeoPolitical uses the blue marble texture for clarity and overlays for borders and territories.'
      },
    };
    return mapping[mode] || mapping['EcoNatural']; // fallback
  }
}

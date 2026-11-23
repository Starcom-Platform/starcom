/**
 * CyberThreats honours a chosen style on its INDICATORS, and on nothing else
 * (decision D-F, step 6.3).
 *
 * ─── WHY ONLY ONE OF ITS FOUR SUB-LAYERS ───────────────────────────────────
 *
 * This layer is the reason markerStyles.ts states the rule at all. It draws
 * four things from one cluster set:
 *
 *   density      bloom, 3x size     crowded regions brighten
 *   newHalo      bloom, 2.2x size   new since the last snapshot read
 *   indicators   the primary mark   <- the choice governs this
 *   enrichment   ring, +10px        OTX-corroborated
 *
 * The blooms are additive light drawn BEHIND the indicators, and the added
 * brightness IS what they encode: redraw them as discs and the layer stops
 * saying "crowded" and "new". The enrichment ring is a separate claim about a
 * country, not another way of drawing the indicator. So a choice made here
 * moves the indicator and leaves the other three where they are.
 *
 * Tested through the hook rather than the builder, for the reason
 * useCommHubs3D.markerStyle.test.ts sets out: Satellites' builder honours a
 * style and a mutation deleting it from the hook's call survived every test.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { useCyberAttacks3D, CYBER_MARKER_LAYERS } from '../useCyberAttacks3D';
import type { CyberAttackData } from '../../types/CyberAttacks';
import type { OTXEnrichment } from '../../types/ThreatIntelOTX';
import { MARKER_STYLES, DEFAULT_MARKER_STYLES, type MarkerStyleChoices } from '../../components/Globe/markerStyles';
import { getLegends, resetLegendsForTest } from '../../services/globe/globeLegendStore';

function makeAttack(overrides: Partial<CyberAttackData> = {}): CyberAttackData {
  return {
    id: 'attack-1',
    type: 'CyberAttacks',
    attack_type: 'DDoS',
    severity: 4,
    // isNew drives the newHalo bloom; realIp lets the mocked OTX enrichment below
    // raise enrichedCount, which draws the enrichment ring. Both set so all four
    // sub-layers actually draw and the test can assert on each of them.
    metadata: { source: 'Test Source', confidence: 0.85, isNew: true, realIp: '1.2.3.4' },
    trajectory: {
      source: { latitude: 10, longitude: 20, countryCode: 'USA', confidence: 0.85 },
      target: { latitude: 10, longitude: 20, countryCode: 'USA', organization: 'Unknown', sector: 'Other', criticality: 0 }
    },
    ...overrides
  } as unknown as CyberAttackData;
}

const getDataMock = vi.fn();
const disposeMock = vi.fn();
const enrichWithOTXMock = vi.fn<() => Promise<Map<string, OTXEnrichment>>>();

vi.mock('../../services/CyberAttacks/RealTimeAttackService', () => ({
  RealTimeAttackService: vi.fn()
}));

// The ring as it would be drawn once LevelBlue permits OTX (D-CS, CS9): permitted here.
vi.mock('../../services/CyberAttacks/OTXEnrichmentService', () => ({
  enrichWithOTX: (...args: unknown[]) => enrichWithOTXMock(...args),
  otxPermitted: () => true,
}));

import { RealTimeAttackService } from '../../services/CyberAttacks/RealTimeAttackService';

const objectOf = (group: THREE.Group, type: string) =>
  group.children.find((c) => c.userData.type === type) as THREE.Points | undefined;

const definesOf = (group: THREE.Group, type: string) => {
  const points = objectOf(group, type);
  return points ? { ...((points.material as THREE.ShaderMaterial).defines ?? {}) } : undefined;
};

/** Every sub-layer drawn, so a style can only be asked for once. */
const ALL_ON = { indicators: true, density: true, enrichment: true, knownGroups: false };

const drawWith = async (markerStyles?: MarkerStyleChoices) => {
  const scene = new THREE.Scene();
  const { result, unmount } = renderHook(() =>
    useCyberAttacks3D(true, scene, null, { updateInterval: 999999, layerTypes: ALL_ON, markerStyles })
  );
  await waitFor(() => expect(objectOf(result.current.attacksGroup, CYBER_MARKER_LAYERS.indicators)).toBeDefined());
  const group = result.current.attacksGroup;
  const snap = {
    indicators: definesOf(group, CYBER_MARKER_LAYERS.indicators),
    density: definesOf(group, CYBER_MARKER_LAYERS.density),
    newHalo: definesOf(group, CYBER_MARKER_LAYERS.newHalo),
    enrichment: definesOf(group, CYBER_MARKER_LAYERS.enrichment),
  };
  unmount();
  return snap;
};

describe('useCyberAttacks3D — the style chosen for the layer', () => {
  beforeEach(() => {
    getDataMock.mockReset().mockResolvedValue([makeAttack()]);
    disposeMock.mockClear();
    resetLegendsForTest();
    // One corroborated address, so the enrichment ring is genuinely drawn.
    enrichWithOTXMock.mockReset().mockResolvedValue(new Map([
      ['1.2.3.4', { malwareFamilies: ['Test'], pulseCount: 1 } as unknown as OTXEnrichment],
    ]));
    vi.mocked(RealTimeAttackService).mockImplementation(function () { return ({
      getData: getDataMock,
      dispose: disposeMock
    }) as unknown as RealTimeAttackService; });
  });

  it('draws a disc when nothing was chosen, exactly as before', async () => {
    const drawn = await drawWith(undefined);

    expect(DEFAULT_MARKER_STYLES.CyberThreats).toBe('disc');
    expect(drawn.indicators).not.toHaveProperty('STYLE_RING');
    expect(drawn.indicators).not.toHaveProperty('STYLE_GLOW');
  });

  it('moves the indicator to the chosen style', async () => {
    expect((await drawWith({ CyberThreats: 'ring' })).indicators).toHaveProperty('STYLE_RING');
    expect((await drawWith({ CyberThreats: 'glow' })).indicators).toHaveProperty('STYLE_GLOW');
  });

  /*
   * The point of the whole rule. A per-layer override applied to every draw call
   * would turn the density bloom into discs and delete what it encodes.
   */
  it('leaves the two blooms additive whatever is chosen', async () => {
    for (const style of MARKER_STYLES) {
      const drawn = await drawWith({ CyberThreats: style });

      expect(drawn.density).toHaveProperty('STYLE_BLOOM');
      expect(drawn.newHalo).toHaveProperty('STYLE_BLOOM');
    }
  });

  /*
   * The enrichment ring is a claim about a country — OTX corroborated it — not
   * another way of drawing the indicator. It stays a ring even when the
   * indicator becomes one: the two are then told apart by colour and size, and
   * the legend carries a swatch for the cyan.
   */
  it('leaves the enrichment ring a ring, including when rings were chosen', async () => {
    expect((await drawWith({ CyberThreats: 'glow' })).enrichment).toHaveProperty('STYLE_RING');
    expect((await drawWith({ CyberThreats: 'ring' })).enrichment).toHaveProperty('STYLE_RING');
  });

  it('ignores a style chosen for some other layer', async () => {
    expect((await drawWith({ SpaceWeather: 'ring' })).indicators).not.toHaveProperty('STYLE_RING');
  });

  it('can be asked for every style a person can pick', async () => {
    for (const style of MARKER_STYLES) {
      const drawn = await drawWith({ CyberThreats: style });
      const reached = Object.keys(drawn.indicators ?? {}).find((k) => k.startsWith('STYLE_')) ?? 'STYLE_DISC';
      expect(reached).toBe(`STYLE_${style.toUpperCase()}`);
    }
  });

  it('tells the card which shape the indicators were drawn with', async () => {
    await drawWith({ CyberThreats: 'ring' });

    expect(getLegends().find((l) => l.layerId === 'CyberThreats')?.shapeMeans).toBe('ring');
  });

  /*
   * With the indicators toggled off, the choice reaches nothing on the globe —
   * the blooms and the enrichment ring are all that remain and none of them
   * follows it. Naming a shape then would describe a mark that is not drawn.
   */
  it('says nothing about shape when the indicators are off', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() =>
      useCyberAttacks3D(true, scene, null, {
        updateInterval: 999999,
        layerTypes: { indicators: false, density: true, enrichment: false, knownGroups: false },
        markerStyles: { CyberThreats: 'ring' },
      })
    );
    await waitFor(() => expect(getLegends().find((l) => l.layerId === 'CyberThreats')).toBeDefined());

    expect(getLegends().find((l) => l.layerId === 'CyberThreats')?.shapeMeans).toBeUndefined();
  });

  /*
   * Changing the choice on a globe already drawn — the whole feature, and the
   * case every test above misses by mounting fresh. A mutation removing the key
   * from the draw effect's dependencies survived all of them: first paint would
   * be right and the switcher would then do nothing.
   */
  it('redraws the indicators when the choice changes', async () => {
    const scene = new THREE.Scene();
    const { result, rerender } = renderHook(
      ({ markerStyles }) => useCyberAttacks3D(true, scene, null, { updateInterval: 999999, layerTypes: ALL_ON, markerStyles }),
      { initialProps: { markerStyles: { CyberThreats: 'disc' } as MarkerStyleChoices } },
    );
    await waitFor(() => expect(objectOf(result.current.attacksGroup, CYBER_MARKER_LAYERS.indicators)).toBeDefined());
    expect(definesOf(result.current.attacksGroup, CYBER_MARKER_LAYERS.indicators)).not.toHaveProperty('STYLE_RING');

    rerender({ markerStyles: { CyberThreats: 'ring' } });

    await waitFor(() =>
      expect(definesOf(result.current.attacksGroup, CYBER_MARKER_LAYERS.indicators)).toHaveProperty('STYLE_RING'));
    // And the blooms it should never have touched are still additive.
    expect(definesOf(result.current.attacksGroup, CYBER_MARKER_LAYERS.density)).toHaveProperty('STYLE_BLOOM');
  });
});

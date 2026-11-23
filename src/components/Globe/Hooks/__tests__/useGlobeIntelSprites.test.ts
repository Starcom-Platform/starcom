/**
 * The Intel Report sprite layer on the globe (decision D-F, step 6, part 4).
 *
 * The atlas is stubbed because jsdom has no 2D canvas — the real bake returns
 * null there, which is correct and is tested in intelReportSprites.test.ts.
 * What is checked here is everything between the reports and the layer: one
 * batched object, a variant per report, tooltips that can answer a hover, and
 * the layer coming and going with the reports and the mode.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, cleanup, waitFor } from '@testing-library/react';
import * as THREE from 'three';

vi.mock('../../intelReportSprites', async () => {
  const actual = await vi.importActual<typeof import('../../intelReportSprites')>('../../intelReportSprites');
  return {
    ...actual,
    bakeIntelSpriteAtlas: vi.fn(async () => new THREE.Texture()),
    bakeBadgeAtlas: vi.fn(async () => new THREE.Texture()),
    bakeEmblemAtlas: vi.fn(async () => new THREE.Texture()),
  };
});

import { useGlobeIntelSprites, resetIntelSpriteAtlasForTests } from '../useGlobeIntelSprites';
import { INTEL_SPRITE_TYPE, atlasCellOf } from '../../intelReportSprites';
import type { IntelReportOverlayMarker } from '../../../../interfaces/IntelReportOverlay';

const report = (over: Partial<IntelReportOverlayMarker> = {}): IntelReportOverlayMarker => ({
  pubkey: 'p', title: 'A report', content: '', tags: [], latitude: 32.7, longitude: -117.1,
  timestamp: 0, author: 'a', ...over,
});

const drawn = (scene: THREE.Scene) => {
  let found: THREE.Points | undefined;
  scene.traverse((o) => { if (o.userData.type === INTEL_SPRITE_TYPE) found = o as THREE.Points; });
  return found;
};

beforeEach(() => resetIntelSpriteAtlasForTests());
afterEach(() => cleanup());

const render = (props: { enabled?: boolean; reports?: IntelReportOverlayMarker[]; scene: THREE.Scene }) =>
  renderHook(
    ({ enabled, reports, scene }) => useGlobeIntelSprites({ scene, enabled, reports }),
    { initialProps: { enabled: props.enabled ?? true, reports: props.reports ?? [report()], scene: props.scene } },
  );

describe('useGlobeIntelSprites', () => {
  it('draws every report in one object', async () => {
    const scene = new THREE.Scene();
    render({ scene, reports: [report(), report({ latitude: 10, longitude: 20 }), report({ latitude: -5, longitude: 5 })] });

    await waitFor(() => expect(drawn(scene)).toBeDefined());
    expect(drawn(scene)!.geometry.getAttribute('position').count).toBe(3);
  });

  /*
   * The point of four variants: the layer has to carry each report's own, not
   * one for the batch.
   */
  it('gives each report the variant its tags earn', async () => {
    const scene = new THREE.Scene();
    render({ scene, reports: [
      report({ tags: ['nostr'] }),                    // nobody assessed it
      report({ tags: ['critical'], latitude: 1 }),
      report({ tags: ['actionable'], latitude: 2 }),
    ] });

    await waitFor(() => expect(drawn(scene)).toBeDefined());
    const cell = drawn(scene)!.geometry.getAttribute('atlasCell');
    expect(cell.getX(0)).toBe(atlasCellOf('raw'));
    expect(cell.getX(1)).toBe(atlasCellOf('critical'));
    expect(cell.getX(2)).toBe(atlasCellOf('actionable'));
  });

  it('answers a hover with the report title', async () => {
    const scene = new THREE.Scene();
    render({ scene, reports: [report({ title: 'Cable cut near Suez' })] });

    await waitFor(() => expect(drawn(scene)).toBeDefined());
    expect((drawn(scene)!.userData as { tooltips: string[] }).tooltips[0]).toBe('Cable cut near Suez');
  });

  it('draws nothing while the layer is off', async () => {
    const scene = new THREE.Scene();
    render({ scene, enabled: false });

    await waitFor(() => expect(drawn(scene)).toBeUndefined());
  });

  it('draws nothing when there are no reports', async () => {
    const scene = new THREE.Scene();
    render({ scene, reports: [] });

    await waitFor(() => expect(drawn(scene)).toBeUndefined());
  });

  /*
   * The layer has to go away with the mode, or an Intel Reports mark would sit
   * on top of Space Weather.
   */
  it('takes the layer away when the mode turns it off', async () => {
    const scene = new THREE.Scene();
    const { rerender } = render({ scene });
    await waitFor(() => expect(drawn(scene)).toBeDefined());

    rerender({ enabled: false, reports: [report()], scene });

    expect(drawn(scene)).toBeUndefined();
  });

  it('puts nothing in a scene it was given none of', async () => {
    const { result } = renderHook(() => useGlobeIntelSprites({
      scene: null, enabled: true, reports: [report()],
    }));

    await waitFor(() => expect(result.current.groupRef.current.parent).toBeNull());
  });
});

/*
 * What happens when the glyphs cannot be rasterised: the same layer draws plain
 * shapes, and they are picked as the glyphs are. 3D models drew the marks in this
 * case before, fetched for it alone; they were retired on 2026-10-08.
 */
describe('whether the glyphs could be rasterised', () => {
  it('says unavailable when the bake fails, and still draws every report, as plain shapes, to hover and click', async () => {
    const sprites = await import('../../intelReportSprites');
    vi.mocked(sprites.bakeIntelSpriteAtlas).mockResolvedValueOnce(null);
    resetIntelSpriteAtlasForTests();

    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobeIntelSprites({
      scene, enabled: true, reports: [report()],
    }));

    await waitFor(() => expect(result.current.atlasState).toBe('unavailable'));
    const points = drawn(scene);
    expect(points).toBeDefined();
    expect((points!.material as THREE.ShaderMaterial).defines).toHaveProperty('DRAW_SHAPES');
    expect(result.current.pickLayer).not.toBeNull();
    expect(result.current.reportAt(0)?.pubkey).toBe(report().pubkey);
    // The key says what the shapes mean: there is no document drawn to name.
    expect(getLegends().find((l) => l.layerId === 'IntelReports:marks')?.shapeMeans).toBe('how the report was assessed');
  });

  it('draws nothing, and offers nothing to pick, while the bake is still deciding', () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobeIntelSprites({
      scene, enabled: true, reports: [report()],
    }));
    expect(result.current.atlasState).toBe('pending');
    expect(drawn(scene)).toBeUndefined();
    expect(result.current.pickLayer).toBeNull();
  });

  it('says ready once the atlas is there', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobeIntelSprites({
      scene, enabled: true, reports: [report()],
    }));

    await waitFor(() => expect(result.current.atlasState).toBe('ready'));
    expect(result.current.pickLayer).not.toBeNull();
  });

  /*
   * Nothing is drawn and nothing is fetched while the answer is unknown. A
   * caller that treated pending as unavailable would download the GLB on every
   * visit.
   */
  it('starts pending, offering nothing to pick', () => {
    const { result } = renderHook(() => useGlobeIntelSprites({
      scene: new THREE.Scene(), enabled: true, reports: [report()],
    }));

    expect(result.current.atlasState).toBe('pending');
    expect(result.current.pickLayer).toBeNull();
  });
});

/*
 * This layer is what a person clicks now, so it has to answer two questions
 * the interaction layer asks: which report a picked index is, and where to put
 * the popup.
 */
describe('what the interaction layer asks it', () => {
  it('says which report a picked index means', async () => {
    const scene = new THREE.Scene();
    const reports = [report({ pubkey: 'a' }), report({ pubkey: 'b', latitude: 10 })];
    const { result } = renderHook(() => useGlobeIntelSprites({ scene, enabled: true, reports }));

    await waitFor(() => expect(result.current.atlasState).toBe('ready'));
    expect(result.current.reportAt(0)?.pubkey).toBe('a');
    expect(result.current.reportAt(1)?.pubkey).toBe('b');
  });

  /*
   * An out-of-range index must not resolve to a report. It would open the wrong
   * one, or throw inside a mousemove handler.
   */
  it('says nothing for an index it did not draw', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobeIntelSprites({ scene, enabled: true, reports: [report()] }));

    await waitFor(() => expect(result.current.atlasState).toBe('ready'));
    expect(result.current.reportAt(7)).toBeNull();
    expect(result.current.reportAt(-1)).toBeNull();
  });

  /*
   * A transform node per report, for useModelScreenProjection to place a popup
   * against — no geometry, no material, nothing drawn. That is what is left of
   * "a mesh, a raycast target and a draw call each".
   */
  it('offers a bare transform node per report to position a popup against', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobeIntelSprites({ scene, enabled: true, reports: [report(), report({ latitude: 5 })] }));

    await waitFor(() => expect(result.current.atlasState).toBe('ready'));
    expect(result.current.marks).toHaveLength(2);
    for (const mark of result.current.marks) {
      expect(mark.mesh).toBeInstanceOf(THREE.Object3D);
      expect((mark.mesh as THREE.Mesh).geometry).toBeUndefined();
      expect(mark.mesh.position.length()).toBeGreaterThan(0);
      expect(mark.report).toBeDefined();
    }
  });

  it('offers nothing to position against while nothing is drawn', () => {
    const { result } = renderHook(() => useGlobeIntelSprites({
      scene: new THREE.Scene(), enabled: false, reports: [report()],
    }));

    expect(result.current.marks).toHaveLength(0);
  });

  /*
   * Hover has to be a uniform write, not a rebuild: it runs from a mousemove.
   */
  it('grows the hovered report without rebuilding the layer', async () => {
    const scene = new THREE.Scene();
    const reports = [report({ pubkey: 'a' }), report({ pubkey: 'b', latitude: 10 })];
    const { rerender } = renderHook(
      ({ hoveredReportId }) => useGlobeIntelSprites({ scene, enabled: true, reports, hoveredReportId }),
      { initialProps: { hoveredReportId: null as string | null } },
    );
    await waitFor(() => expect(drawn(scene)).toBeDefined());
    const before = drawn(scene)!;
    const uniforms = () => (drawn(scene)!.material as THREE.ShaderMaterial).uniforms.hoveredIndex.value;
    expect(uniforms()).toBe(-1);

    rerender({ hoveredReportId: 'b' });

    expect(uniforms()).toBe(1);
    expect(drawn(scene)).toBe(before);
  });

  it('forgets a hover on a report it is not drawing', async () => {
    const scene = new THREE.Scene();
    const { rerender } = renderHook(
      ({ hoveredReportId }) => useGlobeIntelSprites({ scene, enabled: true, reports: [report({ pubkey: 'a' })], hoveredReportId }),
      { initialProps: { hoveredReportId: 'a' as string | null } },
    );
    await waitFor(() => expect(drawn(scene)).toBeDefined());

    rerender({ hoveredReportId: 'gone' });

    expect((drawn(scene)!.material as THREE.ShaderMaterial).uniforms.hoveredIndex.value).toBe(-1);
  });
});

/*
 * Intel Reports only, not everything intel-LIKE.
 *
 * Callers pass `activeIntelLikeReports`, which carries RLSH entities as well —
 * they shared the GLB models, so they shared its glyph. A document glyph says
 * someone filed a report here, which an RLSH person is not, and 44 of them read
 * as 44 blank reports stacked down the limb.
 */
describe('what shape each intel-like mark gets', () => {
  const both = [
    report({ pubkey: 'intel-1', title: 'A report' }),
    report({ pubkey: 'hero-1', title: 'A hero', kind: 'rlsh', latitude: 10 }),
    report({ pubkey: 'intel-2', title: 'Critical', tags: ['critical'], latitude: 20 }),
  ];

  /*
   * Both kinds are drawn, because RLSH has no other mark: useGlobeRLSH fetches
   * them and draws nothing, and this layer is what the interaction layer picks.
   * Leaving RLSH out took away its glyph AND its click — found by clicking one
   * and getting nothing back.
   */
  it('draws RLSH entities too, since nothing else does', async () => {
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobeIntelSprites({ scene, enabled: true, reports: both }));

    await waitFor(() => expect(drawn(scene)).toBeDefined());
    expect(drawn(scene)!.geometry.getAttribute('position').count).toBe(3);
    expect(result.current.reportAt(1)?.pubkey).toBe('hero-1');
  });

  /*
   * And the SHAPE is what separates them, not the layer. An intel-report
   * document asserts that someone filed a report here; an RLSH person is not
   * that.
   */
  it('draws a person for an RLSH entity and a document for a report', async () => {
    const scene = new THREE.Scene();
    renderHook(() => useGlobeIntelSprites({ scene, enabled: true, reports: both }));

    await waitFor(() => expect(drawn(scene)).toBeDefined());
    const cell = drawn(scene)!.geometry.getAttribute('atlasCell');
    expect(cell.getX(0)).toBe(atlasCellOf('raw'));
    expect(cell.getX(1)).toBe(atlasCellOf('rlsh'));
    expect(cell.getX(2)).toBe(atlasCellOf('critical'));
  });

  /*
   * The trap markerKind exists for: absent means intel, so a bare
   * `kind === 'rlsh'` is safe but a bare `kind === 'intel'` is not.
   */
  it('treats a marker that states no kind as a report, not a person', async () => {
    const scene = new THREE.Scene();
    const legacy = { ...report({ pubkey: 'legacy' }) };
    delete (legacy as Record<string, unknown>).kind;
    renderHook(() => useGlobeIntelSprites({ scene, enabled: true, reports: [legacy] }));

    await waitFor(() => expect(drawn(scene)).toBeDefined());
    expect(drawn(scene)!.geometry.getAttribute('atlasCell').getX(0)).toBe(atlasCellOf('raw'));
  });
});

/*
 * Which marks came from storage rather than from this session
 * (decision D-F, step 4.4).
 *
 * Derived from the report's own receipt time against when the page loaded, so
 * there is no flag to plumb and no flag to keep in step: when the same report
 * arrives live, importReport appends a fresh IMPORTED entry, the marker is
 * rebuilt with the newer time, and the mark stops being faded by itself.
 */
describe('marks drawn from the last session', () => {
  const SESSION = Date.parse('2026-09-17T20:00:00.000Z');
  const HOUR = 60 * 60 * 1000;
  const opacities = (scene: THREE.Scene) => {
    const attr = drawn(scene)!.geometry.getAttribute('markOpacity');
    return Array.from({ length: attr.count }, (_, i) => attr.getX(i));
  };

  it('fades a report received before this session began', async () => {
    const scene = new THREE.Scene();
    renderHook(() => useGlobeIntelSprites({
      scene, enabled: true, sessionStartedAtMs: SESSION,
      reports: [report({ receivedAtMs: SESSION - 6 * HOUR })],
    }));

    await waitFor(() => expect(drawn(scene)).toBeDefined());
    expect(opacities(scene)[0]).toBeLessThan(1);
  });

  it('draws a report received during this session solid', async () => {
    const scene = new THREE.Scene();
    renderHook(() => useGlobeIntelSprites({
      scene, enabled: true, sessionStartedAtMs: SESSION,
      reports: [report({ receivedAtMs: SESSION + 2000 })],
    }));

    await waitFor(() => expect(drawn(scene)).toBeDefined());
    expect(opacities(scene)[0]).toBe(1);
  });

  /*
   * Unmeasured is not the same claim as measured. A report whose producer could
   * not say when we received it must not be asserted to be stale.
   */
  it('does not fade a report whose receipt time is unknown', async () => {
    const scene = new THREE.Scene();
    renderHook(() => useGlobeIntelSprites({
      scene, enabled: true, sessionStartedAtMs: SESSION,
      reports: [report({ receivedAtMs: undefined })],
    }));

    await waitFor(() => expect(drawn(scene)).toBeDefined());
    expect(opacities(scene)[0]).toBe(1);
  });

  it('fades some and not others in the one batched object', async () => {
    const scene = new THREE.Scene();
    renderHook(() => useGlobeIntelSprites({
      scene, enabled: true, sessionStartedAtMs: SESSION,
      reports: [
        report({ pubkey: 'old', receivedAtMs: SESSION - HOUR }),
        report({ pubkey: 'new', receivedAtMs: SESSION + 1000, latitude: 10 }),
      ],
    }));

    await waitFor(() => expect(drawn(scene)).toBeDefined());
    const [first, second] = opacities(scene);
    expect(first).toBeLessThan(1);
    expect(second).toBe(1);
  });
});

/**
 * The card must describe the mark a reader can actually see.
 *
 * Reported by Mecha Jono, 2026-09-25: every Intel Report on a card was a grey
 * document glyph, and the same card's legend said `shape: disc` with a purple
 * `#9d7bff` swatch. Both were true of SOMETHING — the legend came from the
 * small anchor dots then drawn at each place (since retired), which sat
 * underneath the glyphs — and this layer, which draws the glyphs, published no
 * legend at all. So the image contradicted its own key, and the most visible
 * mark on the globe was never explained.
 *
 * The grey was correct: every report on the relays is unassessed, and
 * unassessed is drawn as Raw. What was missing was the key saying so.
 */
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';
import { spriteGlyphFill } from '../../intelReportSprites';

describe('useGlobeIntelSprites — the legend', () => {
  beforeEach(() => resetLegendsForTest());

  const marksLegend = () => getLegends().find((l) => l.layerId === 'IntelReports:marks');

  it('publishes a legend for the glyphs it draws', async () => {
    const scene = new THREE.Scene();
    render({ scene, reports: [report({ tags: ['nostr'] })] });

    await waitFor(() => expect(marksLegend()).toBeDefined());
    expect(marksLegend()!.layer).toBe('Intel Reports');
    expect(marksLegend()!.shapeMeans).toBe('document');
  });

  it('keys each variant it drew by the colour it drew it in', async () => {
    const scene = new THREE.Scene();
    render({ scene, reports: [report({ tags: ['nostr'] }), report({ tags: ['critical'], latitude: 1 })] });

    await waitFor(() => expect(marksLegend()?.swatches).toHaveLength(2));
    const byColour = Object.fromEntries(marksLegend()!.swatches.map((s) => [s.color, s.label]));
    // Colour from the same table the artwork is baked from, so the key cannot
    // drift from the picture.
    expect(byColour[spriteGlyphFill('raw')]).toMatch(/not assessed/i);
    expect(byColour[spriteGlyphFill('critical')]).toMatch(/critical/i);
  });

  it('keys only the variants actually on the globe', async () => {
    // A swatch for a kind of mark not drawn is a claim about the image that
    // the image does not bear out — the rule every other legend here keeps.
    const scene = new THREE.Scene();
    render({ scene, reports: [report({ tags: ['nostr'] })] });

    await waitFor(() => expect(marksLegend()).toBeDefined());
    expect(marksLegend()!.swatches.map((s) => s.color)).toEqual([spriteGlyphFill('raw')]);
  });

  it('withdraws the legend when nothing is drawn', async () => {
    const scene = new THREE.Scene();
    const { rerender } = render({ scene, reports: [report()] });
    await waitFor(() => expect(marksLegend()).toBeDefined());

    rerender({ enabled: false, reports: [report()], scene });

    await waitFor(() => expect(marksLegend()).toBeUndefined());
  });
});

/*
 * One glyph per place, in its layer's style, with a count beside it
 * (decision D-F, section 18, items 1.1 and 1.2).
 */
import { INTEL_BADGE_TYPE, BADGE_LABELS, atlasRowOf } from '../../intelReportSprites';
import { REPORT_SPRITE_PX } from '../useGlobeIntelSprites';

describe('useGlobeIntelSprites — places, styles and counts', () => {
  beforeEach(() => resetLegendsForTest());

  const badgesIn = (scene: THREE.Scene) => {
    let found: THREE.Points | undefined;
    scene.traverse((o) => { if (o.userData.type === INTEL_BADGE_TYPE) found = o as THREE.Points; });
    return found;
  };
  const marksLegend = () => getLegends().find((l) => l.layerId === 'IntelReports:marks');
  const crowd = [
    report({ pubkey: 'raw', tags: [] }),
    report({ pubkey: 'crit', tags: ['critical'] }),
    report({ pubkey: 'act', tags: ['actionable'] }),
    report({ pubkey: 'alone', latitude: 10 }),
  ];

  it('draws one glyph for reports at one place, as the most severe of them', async () => {
    const scene = new THREE.Scene();
    const { result } = render({ scene, reports: crowd });

    await waitFor(() => expect(drawn(scene)).toBeDefined());
    const cell = drawn(scene)!.geometry.getAttribute('atlasCell');
    expect(cell.count).toBe(2);
    expect(cell.getX(0)).toBe(atlasCellOf('critical'));
    // A click on the place opens the report it is drawn as.
    expect(result.current.reportAt(0)?.pubkey).toBe('crit');
    expect(result.current.reportAt(1)?.pubkey).toBe('alone');
  });

  it('says how many are there, in the hover and beside the glyph', async () => {
    const scene = new THREE.Scene();
    render({ scene, reports: crowd });

    await waitFor(() => expect(badgesIn(scene)).toBeDefined());
    expect((drawn(scene)!.userData as { tooltips: string[] }).tooltips[0]).toBe('A report and 2 more here');
    const badges = badgesIn(scene)!.geometry.getAttribute('badgeCell');
    // One badge: the lone report needs none.
    expect(badges.count).toBe(1);
    expect(BADGE_LABELS[badges.getX(0)]).toBe('3');
    expect(marksLegend()!.badgeMeans).toBe('how many reports share the place');
  });

  it('draws no badge, and keys none, when no place is crowded', async () => {
    const scene = new THREE.Scene();
    render({ scene, reports: [report(), report({ latitude: 10 })] });

    await waitFor(() => expect(marksLegend()).toBeDefined());
    expect(badgesIn(scene)).toBeUndefined();
    expect(marksLegend()!.badgeMeans).toBeUndefined();
  });

  it('hovers the place holding the hovered report', async () => {
    const scene = new THREE.Scene();
    const { rerender } = renderHook(
      ({ hoveredReportId }) => useGlobeIntelSprites({ scene, enabled: true, reports: crowd, hoveredReportId }),
      { initialProps: { hoveredReportId: null as string | null } },
    );
    await waitFor(() => expect(drawn(scene)).toBeDefined());

    rerender({ hoveredReportId: 'raw' });
    expect((drawn(scene)!.material as THREE.ShaderMaterial).uniforms.hoveredIndex.value).toBe(0);
    rerender({ hoveredReportId: 'alone' });
    expect((drawn(scene)!.material as THREE.ShaderMaterial).uniforms.hoveredIndex.value).toBe(1);
  });

  it('draws a place solid when any report there arrived this session', async () => {
    const SESSION = Date.parse('2026-09-25T20:00:00.000Z');
    const scene = new THREE.Scene();
    renderHook(() => useGlobeIntelSprites({
      scene, enabled: true, sessionStartedAtMs: SESSION,
      reports: [report({ pubkey: 'old', receivedAtMs: SESSION - 60_000 }), report({ pubkey: 'new', receivedAtMs: SESSION + 1000 })],
    }));

    await waitFor(() => expect(drawn(scene)).toBeDefined());
    expect(drawn(scene)!.geometry.getAttribute('markOpacity').getX(0)).toBe(1);
  });

  /*
   * Mecha Jono's first ask, 2026-09-25: setMarkerStyle('IntelReports', …)
   * returned normally and the image did not change.
   */
  it('draws the Intel Reports glyphs in the style chosen for Intel Reports', async () => {
    const scene = new THREE.Scene();
    const { rerender } = renderHook(
      ({ markerStyles }) => useGlobeIntelSprites({ scene, enabled: true, reports: [report()], markerStyles }),
      { initialProps: { markerStyles: {} as Record<string, 'disc' | 'glow' | 'ring'> } },
    );
    await waitFor(() => expect(drawn(scene)).toBeDefined());
    const row = () => drawn(scene)!.geometry.getAttribute('atlasRow').getX(0);
    // Nothing chosen: the default, a halo disc (plan H4).
    expect(row()).toBe(atlasRowOf('glow'));

    rerender({ markerStyles: { IntelReports: 'ring' } });
    await waitFor(() => expect(row()).toBe(atlasRowOf('ring')));
    expect(marksLegend()!.swatches[0].style).toBe('ring');
  });

  it('keeps a choice for Intel Reports off the RLSH figures, and the other way round', async () => {
    const scene = new THREE.Scene();
    renderHook(() => useGlobeIntelSprites({
      scene, enabled: true,
      reports: [report({ pubkey: 'r' }), report({ pubkey: 'h', kind: 'rlsh', latitude: 10 })],
      markerStyles: { IntelReports: 'glow', RLSH: 'ring' },
    }));

    await waitFor(() => expect(drawn(scene)).toBeDefined());
    const row = drawn(scene)!.geometry.getAttribute('atlasRow');
    expect(row.getX(0)).toBe(atlasRowOf('glow'));
    expect(row.getX(1)).toBe(atlasRowOf('ring'));
  });

  it('draws the mark large enough that the glyph inside keeps its 26 px', async () => {
    const scene = new THREE.Scene();
    render({ scene, reports: [report()] });

    await waitFor(() => expect(drawn(scene)).toBeDefined());
    expect(REPORT_SPRITE_PX).toBe(35);
    expect(drawn(scene)!.geometry.getAttribute('pointSize').getX(0)).toBe(REPORT_SPRITE_PX);
  });
});

/*
 * One report featured for a post (decision D-F, section 18, item 2): its place
 * drawn larger, everything else dimmed, so the image says which mark it is about
 * even where the label is cropped away.
 */
import { FEATURED_SCALE, FEATURED_OTHERS_OPACITY } from '../useGlobeIntelSprites';

describe('useGlobeIntelSprites — a featured report', () => {
  const reports = [
    report({ pubkey: 'a' }),
    report({ pubkey: 'b' }),
    report({ pubkey: 'c', latitude: 10 }),
  ];
  const attr = (scene: THREE.Scene, name: string) => {
    const a = drawn(scene)!.geometry.getAttribute(name);
    return Array.from({ length: a.count }, (_, i) => a.getX(i));
  };

  it('draws the featured place larger and dims the others', async () => {
    const scene = new THREE.Scene();
    renderHook(() => useGlobeIntelSprites({ scene, enabled: true, reports, featuredReportId: 'b' }));
    await waitFor(() => expect(drawn(scene)).toBeDefined());

    // 'b' shares its place with 'a', so that place is the featured one.
    expect(attr(scene, 'pointSize')).toEqual([REPORT_SPRITE_PX * FEATURED_SCALE, REPORT_SPRITE_PX]);
    const [featured, other] = attr(scene, 'markOpacity');
    expect(featured).toBe(1);
    expect(other).toBeCloseTo(FEATURED_OTHERS_OPACITY, 5);
  });

  it('dims nothing when the featured report is not drawn', async () => {
    const scene = new THREE.Scene();
    renderHook(() => useGlobeIntelSprites({ scene, enabled: true, reports, featuredReportId: 'gone' }));
    await waitFor(() => expect(drawn(scene)).toBeDefined());

    expect(attr(scene, 'pointSize')).toEqual([REPORT_SPRITE_PX, REPORT_SPRITE_PX]);
    expect(attr(scene, 'markOpacity')).toEqual([1, 1]);
  });

  it('dims every place, enlarging none, while the featured report is drawn as its territory (BA3)', async () => {
    // A report about Ohio as a whole has no glyph: its territory is lit, and the
    // glyphs over it would hide it at full strength.
    const scene = new THREE.Scene();
    renderHook(() => useGlobeIntelSprites({ scene, enabled: true, reports, featuredReportId: 'about-ohio', featuredElsewhere: true }));
    await waitFor(() => expect(drawn(scene)).toBeDefined());

    expect(attr(scene, 'pointSize')).toEqual([REPORT_SPRITE_PX, REPORT_SPRITE_PX]);
    for (const opacity of attr(scene, 'markOpacity')) expect(opacity).toBeCloseTo(FEATURED_OTHERS_OPACITY, 5);
  });

  it('a glyph of its own featured wins over a territory said to be featured', async () => {
    const scene = new THREE.Scene();
    renderHook(() => useGlobeIntelSprites({ scene, enabled: true, reports, featuredReportId: 'b', featuredElsewhere: true }));
    await waitFor(() => expect(drawn(scene)).toBeDefined());
    expect(attr(scene, 'pointSize')).toEqual([REPORT_SPRITE_PX * FEATURED_SCALE, REPORT_SPRITE_PX]);
    expect(attr(scene, 'markOpacity')[0]).toBe(1);
  });

  it('undims when the territory is no longer featured', async () => {
    const scene = new THREE.Scene();
    const { rerender } = renderHook((props: { elsewhere: boolean }) => useGlobeIntelSprites({
      scene, enabled: true, reports, featuredReportId: props.elsewhere ? 'about-ohio' : null, featuredElsewhere: props.elsewhere,
    }), { initialProps: { elsewhere: true } });
    await waitFor(() => expect(drawn(scene)).toBeDefined());
    rerender({ elsewhere: false });
    await waitFor(() => expect(attr(scene, 'markOpacity')).toEqual([1, 1]));
  });

  it('dims once the territory can be lit, the report featured all along: a state\'s lines load after it is chosen', async () => {
    const scene = new THREE.Scene();
    const { rerender } = renderHook((props: { elsewhere: boolean }) => useGlobeIntelSprites({
      scene, enabled: true, reports, featuredReportId: 'about-ohio', featuredElsewhere: props.elsewhere,
    }), { initialProps: { elsewhere: false } });
    await waitFor(() => expect(drawn(scene)).toBeDefined());
    expect(attr(scene, 'markOpacity')).toEqual([1, 1]);
    rerender({ elsewhere: true });
    await waitFor(() => expect(attr(scene, 'markOpacity')[0]).toBeCloseTo(FEATURED_OTHERS_OPACITY, 5));
  });

  it('is told by the globe when the featured report is a territory\'s, lit by the region marks', async () => {
    // The flag is only as good as its wiring: read where the globe calls this hook.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const globe = fs.readFileSync(path.resolve(__dirname, '../../Globe.tsx'), 'utf8');
    const call = globe.slice(globe.indexOf('useGlobeIntelSprites({'), globe.indexOf('});', globe.indexOf('useGlobeIntelSprites({')));
    expect(call).toMatch(/featuredElsewhere: regionMarks\.featured !== null/);
  });

  it('never features an RLSH entity', async () => {
    const scene = new THREE.Scene();
    renderHook(() => useGlobeIntelSprites({
      scene, enabled: true, featuredReportId: 'hero',
      reports: [report({ pubkey: 'r' }), report({ pubkey: 'hero', kind: 'rlsh', latitude: 10 })],
    }));
    await waitFor(() => expect(drawn(scene)).toBeDefined());
    expect(attr(scene, 'markOpacity')).toEqual([1, 1]);
  });
});

/*
 * A roughly placed report is drawn with the area it could be in
 * (decision D-F, section 18, item 3).
 */
import { INTEL_AREA_TYPE } from '../../precisionAreas';

describe('useGlobeIntelSprites — how precisely each report was placed', () => {
  beforeEach(() => resetLegendsForTest());
  const areasIn = (scene: THREE.Scene) => {
    let found: THREE.Object3D | undefined;
    scene.traverse((o) => { if (o.userData.type === INTEL_AREA_TYPE) found = o; });
    return found;
  };
  const marksLegend = () => getLegends().find((l) => l.layerId === 'IntelReports:marks');

  it('draws an area for a report placed only to its county, and says what it means', async () => {
    const scene = new THREE.Scene();
    render({ scene, reports: [report({ geoPrecisionM: 30_000 }), report({ pubkey: 'x', latitude: 10 })] });

    await waitFor(() => expect(areasIn(scene)).toBeDefined());
    expect(areasIn(scene)!.userData.areas).toBe(1);
    expect(marksLegend()!.areaMeans).toBe('how precisely it was placed');
  });

  it('draws no area, and keys none, when every report was placed finely or said nothing', async () => {
    const scene = new THREE.Scene();
    render({ scene, reports: [report({ geoPrecisionM: 50 }), report({ pubkey: 'x', latitude: 10 })] });

    await waitFor(() => expect(marksLegend()).toBeDefined());
    expect(areasIn(scene)).toBeUndefined();
    expect(marksLegend()!.areaMeans).toBeUndefined();
  });

  it('draws the coarsest precision at a place, not the finest', async () => {
    const scene = new THREE.Scene();
    render({ scene, reports: [report({ pubkey: 'a', geoPrecisionM: 100 }), report({ pubkey: 'b', geoPrecisionM: 250_000 })] });
    await waitFor(() => expect(areasIn(scene)).toBeDefined());
  });
});

/*
 * describeView reads which of the glyphs are reports and which are people from
 * the layer itself (decision D-F, section 18, item 6): an RLSH figure is never
 * described, and one batched object draws both.
 */
describe('useGlobeIntelSprites — what describeView can tell apart', () => {
  it('names each point as a report or as RLSH', async () => {
    const scene = new THREE.Scene();
    renderHook(() => useGlobeIntelSprites({
      scene, enabled: true,
      reports: [report({ pubkey: 'r' }), report({ pubkey: 'h', kind: 'rlsh', latitude: 10 })],
    }));
    await waitFor(() => expect(drawn(scene)).toBeDefined());
    expect(drawn(scene)!.userData.layers).toEqual(['Intel Reports', 'RLSH']);
  });
});

/*
 * When each place appears in a replay (decision D-F, section 18, item 5): at its
 * earliest report's time. An RLSH figure is not a report and has no report time;
 * it is shown throughout.
 */
describe('useGlobeIntelSprites — times for a replay', () => {
  it('gives a place its earliest report\'s time, and RLSH none', async () => {
    const scene = new THREE.Scene();
    renderHook(() => useGlobeIntelSprites({
      scene, enabled: true,
      reports: [
        report({ pubkey: 'late', timestamp: 7_200_000 }),
        report({ pubkey: 'early', timestamp: 3_600_000 }),
        report({ pubkey: 'elsewhere', latitude: 10, timestamp: 10_800_000 }),
        // Earlier than every report: if RLSH were timed it would become the base.
        report({ pubkey: 'hero', kind: 'rlsh', latitude: 20, timestamp: 1_000 }),
      ],
    }));
    await waitFor(() => expect(drawn(scene)).toBeDefined());
    const t = drawn(scene)!.geometry.getAttribute('markTime');
    // Base is the earliest timed place: 3,600,000 ms.
    expect(t.getX(0)).toBe(0);
    expect(t.getX(1)).toBe(7200);
    expect(t.getX(2)).toBeLessThan(-1e8);
  });
});

/*
 * A category's emblem on each glyph (BA12–BA15; plan block J, item 5): the
 * place's lead report's stated category, while the setting is on.
 */
import { emblemCellOf, emblemPageCellOf } from '../../intelReportSprites';
import { INTEL_CATEGORY_SYMBOLS, GENERIC_CATEGORY_SYMBOL } from '../../../../symbols/symbolRegistry';

describe('useGlobeIntelSprites — category emblems', () => {
  const reports = [
    report({ pubkey: 'war', tags: ['category:conflict', 'category:conflict.wars'] }),
    report({ pubkey: 'odd', tags: ['category:weather'], latitude: 10 }),
    report({ pubkey: 'none', latitude: 20 }),
    report({ pubkey: 'hero', kind: 'rlsh', latitude: 30, tags: ['category:charity'] }),
  ];
  const attr = (scene: THREE.Scene, name: string) => {
    const a = drawn(scene)!.geometry.getAttribute(name);
    return Array.from({ length: a.count }, (_, i) => a.getX(i));
  };

  it('each place wears its lead report\'s category: its own, the generic one, none; a person none', async () => {
    const scene = new THREE.Scene();
    renderHook(() => useGlobeIntelSprites({ scene, enabled: true, reports, categoryEmblems: true }));
    await waitFor(() => expect(attr(scene, 'emblemCell').some((cell) => cell >= 0)).toBe(true));
    expect(attr(scene, 'emblemCell')).toEqual([
      emblemCellOf(INTEL_CATEGORY_SYMBOLS.conflict), emblemCellOf(GENERIC_CATEGORY_SYMBOL), -1, -1,
    ]);
    expect(attr(scene, 'atlasCell')).toEqual([emblemPageCellOf('raw'), emblemPageCellOf('raw'), atlasCellOf('raw'), atlasCellOf('rlsh')]);
  });

  it('none while the setting is off, and the emblems are never baked for it', async () => {
    const sprites = await import('../../intelReportSprites');
    vi.mocked(sprites.bakeEmblemAtlas).mockClear();
    resetIntelSpriteAtlasForTests();
    const scene = new THREE.Scene();
    renderHook(() => useGlobeIntelSprites({ scene, enabled: true, reports }));
    await waitFor(() => expect(drawn(scene)).toBeDefined());
    expect(attr(scene, 'emblemCell')).toEqual([-1, -1, -1, -1]);
    expect(sprites.bakeEmblemAtlas).not.toHaveBeenCalled();
  });

  it('the key says what an emblem means and which were drawn, most worn first; nothing of them while off', async () => {
    const { getLegends, resetLegendsForTest } = await import('../../../../services/globe/globeLegendStore');
    resetLegendsForTest();
    const scene = new THREE.Scene();
    const many = [...reports, report({ pubkey: 'war2', tags: ['category:conflict'], latitude: 40 })];
    const { rerender } = renderHook((props: { on: boolean }) => useGlobeIntelSprites({ scene, enabled: true, reports: many, categoryEmblems: props.on }), { initialProps: { on: true } });
    const marksKey = () => getLegends().find((l) => l.layerId === 'IntelReports:marks');
    await waitFor(() => expect(marksKey()?.emblems).toBeDefined());
    expect(marksKey()!.emblemMeans).toBe('what it is about');
    expect(marksKey()!.emblems).toEqual([
      { id: 'intel-category:conflict', meaning: 'conflict and war', icon: 'swords' },
      { id: 'intel-category:other', meaning: 'another category', icon: 'tag' },
    ]);
    rerender({ on: false });
    await waitFor(() => expect(marksKey()?.emblems).toBeUndefined());
    expect(marksKey()!.emblemMeans).toBeUndefined();
  });

  it('turned on and off again, the glyphs follow', async () => {
    const scene = new THREE.Scene();
    const { rerender } = renderHook((props: { on: boolean }) => useGlobeIntelSprites({ scene, enabled: true, reports, categoryEmblems: props.on }), { initialProps: { on: true } });
    await waitFor(() => expect(attr(scene, 'emblemCell')[0]).toBe(emblemCellOf(INTEL_CATEGORY_SYMBOLS.conflict)));
    rerender({ on: false });
    await waitFor(() => expect(attr(scene, 'emblemCell')[0]).toBe(-1));
  });
});


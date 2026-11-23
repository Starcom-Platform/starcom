/**
 * A replay's quakes as they happen (D-EQ, EQ7, EQ17, EQ18): each flag's look by its age, rising with a glow, sinking and
 * fading over the decay, and the burst on the ground at its moment, sized by its magnitude, drawn only while it bursts.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BURST_MIN_KM, BURST_S, buildQuakeBursts, burstLengthMs, burstMinPx, burstReachKm } from '../quakeBursts';
import { GLOW_S, indicativeRingKm, replayLook, RISE_S } from '../quakeFlags';
import { decayWords, playSpanWords } from '../../timebar/playClock';

const HOUR = 3_600_000;
// 4 s of play at an hour a second.
const MOMENT = { atMs: 0, decayMs: 4 * HOUR, msPerSecond: HOUR };

describe('a flag in a replay (EQ18)', () => {
  it('is not there before its quake happens, nor once the decay has passed', () => {
    expect(replayLook(-1, MOMENT)).toBeNull();
    expect(replayLook(4 * HOUR, MOMENT)).toBeNull();
    expect(replayLook(Number.NaN, MOMENT)).toBeNull();
  });

  it('rises up its line with a glow as it happens', () => {
    const born = replayLook(0, MOMENT)!;
    expect(born.height).toBe(0);
    expect(born.glow).toBe(1);
    expect(born.opacity).toBe(1);
    const risen = replayLook(RISE_S * HOUR, MOMENT)!;
    expect(risen.height).toBeCloseTo(1, 6);
    expect(risen.glow).toBeGreaterThan(0);
    expect(replayLook(GLOW_S * HOUR, MOMENT)!.glow).toBe(0);
  });

  it('sinks and fades as it decays, nearly gone at the end', () => {
    const half = replayLook(2 * HOUR, MOMENT)!;
    const late = replayLook(3.6 * HOUR, MOMENT)!;
    expect(half.opacity).toBeGreaterThan(late.opacity);
    expect(half.height).toBeGreaterThan(late.height);
    expect(late.opacity).toBeLessThan(0.2);
  });

  it('rises in no more than a share of a short decay', () => {
    // 1 s of decay at a year a second: the rise is still under a third of it.
    const YEAR = 365 * 24 * HOUR;
    const look = replayLook(0.3 * YEAR, { atMs: 0, decayMs: YEAR, msPerSecond: YEAR })!;
    expect(look.height).toBeCloseTo(1, 1);
  });
});

describe('a quake\'s burst (EQ18)', () => {
  it('reaches half again its likely-felt ring, never less than a small quake is seen at', () => {
    expect(burstReachKm(7)).toBeCloseTo(1.5 * indicativeRingKm(7), 6);
    expect(burstReachKm(1)).toBe(BURST_MIN_KM);
  });

  it('is never smaller on screen than its magnitude asks, so it reads from the whole globe\'s view', () => {
    expect(burstMinPx(3)).toBe(13);
    expect(burstMinPx(6)).toBe(28);
    expect(burstMinPx(1)).toBe(8);
    expect(burstMinPx(12)).toBe(48);
  });

  it('lasts a set time of play, never most of the decay', () => {
    expect(burstLengthMs(MOMENT)).toBe(BURST_S * HOUR);
    expect(burstLengthMs({ ...MOMENT, decayMs: HOUR })).toBe(0.8 * HOUR);
  });

  it('is one square on the ground for each quake with a time, drawn as the replay reaches it', () => {
    let moment: typeof MOMENT | null = null;
    const t0 = Date.parse('2026-11-01T00:00:00Z');
    const mesh = buildQuakeBursts(
      [{ lat: 10, lng: 20, magnitude: 5, timeMs: t0 }, { lat: -5, lng: 120, magnitude: 6, timeMs: t0 + HOUR }, { lat: 0, lng: 0, magnitude: 4, timeMs: null }],
      { type: 'b', colourOf: () => '#ffaa00', replay: () => moment },
    ) as THREE.Mesh;
    expect(mesh.geometry.getAttribute('position').count).toBe(8);
    // Each square's corners stand at its quake; the shader spreads them on screen.
    const at = mesh.geometry.getAttribute('position');
    expect([at.getX(1), at.getY(1), at.getZ(1)]).toEqual([at.getX(0), at.getY(0), at.getZ(0)]);
    expect(mesh.geometry.getAttribute('burstMinPx').getX(4)).toBe(burstMinPx(6));
    // Seconds from the earliest, so float32 keeps them apart.
    expect(Array.from(mesh.geometry.getAttribute('burstAt').array as Float32Array)).toEqual([0, 0, 0, 0, 3600, 3600, 3600, 3600]);
    const material = mesh.material as THREE.ShaderMaterial;
    mesh.onBeforeRender({} as THREE.WebGLRenderer, new THREE.Scene(), new THREE.PerspectiveCamera(), mesh.geometry, material, {} as THREE.Group);
    expect(material.uniforms.uOpacity.value).toBe(0);
    moment = { ...MOMENT, atMs: t0 + HOUR / 2 };
    mesh.onBeforeRender({} as THREE.WebGLRenderer, new THREE.Scene(), new THREE.PerspectiveCamera(), mesh.geometry, material, {} as THREE.Group);
    expect(material.uniforms.uOpacity.value).toBeGreaterThan(0);
    expect(material.uniforms.uNow.value).toBe(1800);
    expect(material.uniforms.uLength.value).toBe(BURST_S * 3600);
    mesh.geometry.dispose();
    material.dispose();
    expect(buildQuakeBursts([{ lat: 0, lng: 0, magnitude: 4 }], { type: 'b', colourOf: () => '#fff', replay: () => null })).toBeNull();
  });
});

describe('the key\'s words for the decay (EQ17)', () => {
  it('in the bar\'s own short words', () => {
    expect(decayWords(4, 4 * HOUR)).toBe('each quake fades over 4 s of play, 16 h at 4 h/s');
    expect(playSpanWords(10 * 24 * HOUR)).toBe('10 d');
    expect(playSpanWords(4 * 30 * 24 * HOUR)).toBe('4 mo');
    expect(playSpanWords(10 * 365 * 24 * HOUR)).toBe('10 y');
    expect(playSpanWords(60 * HOUR)).toBe('2.5 d');
  });
});

describe('the flags drawn in a replay, frame by frame (EQ7, EQ18)', () => {
  it('shows each quake from its moment, risen and glowing, then fading, and leaves out one play has not reached', async () => {
    const { buildQuakeFlags } = await import('../quakeFlags');
    const { latLngToGlobeWorld } = await import('../../../../utils/globeCoordinates');
    const t0 = Date.parse('2026-11-01T00:00:00Z');
    let moment: { atMs: number; decayMs: number; msPerSecond: number } | null = null;
    const items = [
      { id: 'a', lat: 0, lng: 0, magnitude: 5.2, timeMs: t0 },
      { id: 'b', lat: 0, lng: 40, magnitude: 4.1, timeMs: t0 + 2 * HOUR },
    ];
    const built = buildQuakeFlags(items, null, { type: 'q', label: 'Q', replay: () => moment, rings: false });
    const flags = built.flags as THREE.Points;
    const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 10_000);
    camera.position.copy(latLngToGlobeWorld(0, 20, 400));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    built.group.updateMatrixWorld(true);
    let frame = 0;
    const renderer = { getPixelRatio: () => 1, getSize: (v: THREE.Vector2) => v.set(800, 600), info: { render: { get frame() { return frame; } } } } as unknown as THREE.WebGLRenderer;
    const draw = () => {
      frame += 1;
      flags.onBeforeRender(renderer, new THREE.Scene(), camera, flags.geometry, flags.material as THREE.Material, {} as THREE.Group);
    };
    const shown = flags.geometry.getAttribute('markShown');
    const opacity = flags.geometry.getAttribute('markOpacity');
    const tint = flags.geometry.getAttribute('markTint');
    // Half an hour after the first: it stands, the second not yet.
    moment = { atMs: t0 + HOUR / 2, decayMs: 4 * HOUR, msPerSecond: HOUR };
    draw();
    expect([shown.getX(0), shown.getX(1)]).toEqual([1, 0]);
    expect(opacity.getX(0)).toBe(1);
    // As the second happens: it glows toward white.
    moment = { ...moment, atMs: t0 + 2 * HOUR };
    draw();
    expect(shown.getX(1)).toBe(1);
    expect(tint.getX(1)).toBeGreaterThan(0.9);
    // Near the end of the first's decay it has all but faded; past it, gone.
    moment = { ...moment, atMs: t0 + 3.8 * HOUR };
    draw();
    expect(opacity.getX(0)).toBeLessThan(0.1);
    moment = { ...moment, atMs: t0 + 4.1 * HOUR };
    draw();
    expect(shown.getX(0)).toBe(0);
    // With the play stopped, every flag stands again.
    moment = null;
    draw();
    expect([shown.getX(0), shown.getX(1)]).toEqual([1, 1]);
    expect(opacity.getX(0)).toBe(1);
  });
});

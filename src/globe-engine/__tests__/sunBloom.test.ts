/**
 * The glow round the Sun (decision K6, SS2; sunBloom.ts): a bloom of what is brighter
 * than white, added to the globe's own composer and switched on only while the Sun is
 * drawn, so every other view, and every card, draws as before.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { BLOOM_THRESHOLD, attachSunBloom, renderThroughBloom, type SunBloom } from '../sunBloom';
import { SUN_SURFACE_BRIGHTNESS } from '../../solar-system/sunAppearance';

const fakeComposer = () => {
  const passes: Array<{ enabled: boolean }> = [];
  return {
    passes,
    addPass: vi.fn((pass: { enabled: boolean }) => { passes.push(pass); }),
    removePass: vi.fn((pass: { enabled: boolean }) => { passes.splice(passes.indexOf(pass), 1); }),
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
  };
};
const CLEAR = new THREE.Color('#000011');
const fakeRenderer = (width = 1400, height = 900, ratio = 2) => ({
  getSize: (v: THREE.Vector2) => v.set(width, height),
  getPixelRatio: () => ratio,
  getClearColor: (c: THREE.Color) => c.copy(CLEAR),
});
const fakeScene = (): { background: THREE.Color | null } => ({ background: null });

let bloom: SunBloom | null = null;
afterEach(() => { bloom?.dispose(); bloom = null; });

describe('the Sun\'s glow', () => {
  it('adds a bloom and the pass that turns it into the screen\'s colours after the composer\'s own, both off', () => {
    const composer = fakeComposer();
    bloom = attachSunBloom(composer as never, fakeRenderer() as never, fakeScene() as never);
    expect(composer.passes).toHaveLength(2);
    expect(composer.passes.map((pass) => pass.enabled)).toEqual([false, false]);
    expect(bloom.isActive()).toBe(false);
  });

  it('takes only light brighter than white, which the Sun is and nothing else on the globe', () => {
    expect(BLOOM_THRESHOLD).toBe(1);
    expect(SUN_SURFACE_BRIGHTNESS).toBeGreaterThan(BLOOM_THRESHOLD);
    const composer = fakeComposer();
    bloom = attachSunBloom(composer as never, fakeRenderer() as never, fakeScene() as never);
    expect((composer.passes[0] as unknown as { threshold: number }).threshold).toBe(BLOOM_THRESHOLD);
  });

  it('switches both on, fitted to the renderer\'s size and pixel ratio, and off again', () => {
    const composer = fakeComposer();
    bloom = attachSunBloom(composer as never, fakeRenderer(1400, 900, 2) as never, fakeScene() as never);
    bloom.setActive(true);
    expect(composer.passes.map((pass) => pass.enabled)).toEqual([true, true]);
    expect(composer.setPixelRatio).toHaveBeenLastCalledWith(2);
    expect(composer.setSize).toHaveBeenLastCalledWith(1400, 900);
    bloom.setActive(false);
    expect(composer.passes.map((pass) => pass.enabled)).toEqual([false, false]);
  });

  it('renders a capture through the glow while it is on, and leaves it to the caller while it is off', () => {
    const composer = fakeComposer();
    bloom = attachSunBloom(composer as never, fakeRenderer() as never, fakeScene() as never);
    expect(renderThroughBloom()).toBe(false);
    bloom.setActive(true);
    expect(renderThroughBloom()).toBe(true);
    expect(composer.render).toHaveBeenCalledTimes(1);
    bloom.setActive(false);
    expect(renderThroughBloom()).toBe(false);
  });

  it('clears to the renderer\'s own colour while on, worked out for its linear buffer, and puts the background back after', () => {
    const composer = fakeComposer();
    const scene = fakeScene();
    bloom = attachSunBloom(composer as never, fakeRenderer() as never, scene as never);
    bloom.setActive(true);
    expect(scene.background?.equals(CLEAR)).toBe(true);
    bloom.setActive(false);
    expect(scene.background).toBeNull();
  });

  it('takes its passes out of the composer when it goes', () => {
    const composer = fakeComposer();
    const leaving = attachSunBloom(composer as never, fakeRenderer() as never, fakeScene() as never);
    leaving.setActive(true);
    leaving.dispose();
    expect(composer.passes).toHaveLength(0);
    expect(renderThroughBloom()).toBe(false);
  });
});

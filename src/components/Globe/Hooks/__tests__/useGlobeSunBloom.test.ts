/**
 * The glow round the Sun on the globe (useGlobeSunBloom.ts; decision K6, SS2): on while
 * the Sun is drawn and the quality step keeps it, and the governor told when the Sun is
 * drawn, since only then does dropping the glow change the picture.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import { useGlobeSunBloom } from '../useGlobeSunBloom';
import { renderThroughBloom } from '../../../../globe-engine/sunBloom';
import {
  getGlobeQuality, qualityStepOf, reportFrameWindow, resetGlobeQualityForTests,
} from '../../../../services/globe/globeQuality';

const fakeGlobe = () => {
  const passes: Array<{ enabled: boolean }> = [];
  const composer = {
    passes,
    addPass: (pass: { enabled: boolean }) => { passes.push(pass); },
    removePass: (pass: { enabled: boolean }) => { passes.splice(passes.indexOf(pass), 1); },
    setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(),
  };
  const renderer = {
    getSize: (v: THREE.Vector2) => v.set(1400, 900),
    getPixelRatio: () => 2,
    getClearColor: (c: THREE.Color) => c.setHex(0x000011),
  };
  const scene = new THREE.Scene();
  return { composer, ref: { current: { postProcessingComposer: () => composer, renderer: () => renderer, scene: () => scene } } };
};
const glowOn = (passes: Array<{ enabled: boolean }>) => passes.length === 2 && passes.every((pass) => pass.enabled);

afterEach(() => resetGlobeQualityForTests());

describe('useGlobeSunBloom', () => {
  it('glows while the Sun is drawn and the step keeps the glow', async () => {
    const globe = fakeGlobe();
    renderHook(() => useGlobeSunBloom(globe.ref, true, true));
    await waitFor(() => expect(glowOn(globe.composer.passes)).toBe(true));
    expect(renderThroughBloom()).toBe(true);
  });

  it('does not glow while no Sun is drawn, or at a step without the glow', async () => {
    const hidden = fakeGlobe();
    renderHook(() => useGlobeSunBloom(hidden.ref, true, false));
    await waitFor(() => expect(hidden.composer.passes).toHaveLength(2));
    expect(glowOn(hidden.composer.passes)).toBe(false);

    const stepped = fakeGlobe();
    renderHook(() => useGlobeSunBloom(stepped.ref, false, true));
    await waitFor(() => expect(stepped.composer.passes).toHaveLength(2));
    expect(glowOn(stepped.composer.passes)).toBe(false);
  });

  it('tells the governor the Sun is drawn, so a slow device drops the glow first', async () => {
    const globe = fakeGlobe();
    renderHook(() => useGlobeSunBloom(globe.ref, true, true));
    await waitFor(() => expect(globe.composer.passes).toHaveLength(2));
    reportFrameWindow({ medianMs: 40, frames: 60, at: 2000 }, 2);
    reportFrameWindow({ medianMs: 40, frames: 60, at: 4000 }, 2);
    expect(qualityStepOf(getGlobeQuality()).name).toBe('no glow, hatching or orbit rings');
  });

  it('takes the glow out when the globe goes', async () => {
    const globe = fakeGlobe();
    const { unmount } = renderHook(() => useGlobeSunBloom(globe.ref, true, true));
    await waitFor(() => expect(glowOn(globe.composer.passes)).toBe(true));
    unmount();
    expect(globe.composer.passes).toHaveLength(0);
    expect(renderThroughBloom()).toBe(false);
  });
});

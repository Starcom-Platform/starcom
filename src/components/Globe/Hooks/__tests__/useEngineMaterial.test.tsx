/**
 * The globe draws the material its engine has now.
 *
 * A skin change rebuilds the material once the skin's textures arrive, which
 * 33aaa278 (2026-09-25) made asynchronous to stop fetching imagery a view never
 * draws. Globe.tsx went on reading the material at once, got the old one, and
 * never heard of the new: a planet chosen in Globe Appearance was not drawn
 * until a reload. Measured on the build, 2026-10-01: the globe's mean colour
 * was (50,113,132) before choosing Blue Marble, (49,113,132) after, and
 * (47,58,70) once reloaded.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEngineMaterial } from '../useEngineMaterial';

type Handler = () => void;
function stubEngine(initial: object) {
  const handlers: Record<string, Handler[]> = {};
  let material = initial;
  return {
    getMaterial: () => material,
    on: vi.fn((event: string, fn: Handler) => { (handlers[event] ??= []).push(fn); }),
    off: vi.fn((event: string, fn: Handler) => { handlers[event] = (handlers[event] ?? []).filter((h) => h !== fn); }),
    rebuild(next: object) { material = next; (handlers.materialChanged ?? []).forEach((h) => h()); },
  };
}

describe('useEngineMaterial', () => {
  it('hands on each material the engine rebuilds', () => {
    const engine = stubEngine({ skin: 'cyberEarth' });
    const setMaterial = vi.fn();
    renderHook(() => useEngineMaterial(engine as never, setMaterial));
    const blueMarble = { skin: 'blueMarble' };
    engine.rebuild(blueMarble);
    expect(setMaterial).toHaveBeenLastCalledWith(blueMarble);
  });

  it('stops listening to an engine it no longer draws', () => {
    const engine = stubEngine({ skin: 'cyberEarth' });
    const setMaterial = vi.fn();
    const { unmount } = renderHook(() => useEngineMaterial(engine as never, setMaterial));
    unmount();
    engine.rebuild({ skin: 'terrain' });
    expect(setMaterial).not.toHaveBeenCalled();
  });

  it('does nothing without an engine', () => {
    const setMaterial = vi.fn();
    renderHook(() => useEngineMaterial(null, setMaterial));
    expect(setMaterial).not.toHaveBeenCalled();
  });
});

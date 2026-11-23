/**
 * The globe is kept mounted on purpose, so the only thing standing between an
 * idle background tab and a full-screen shader running at 60fps is this hook.
 * Its two failure modes are opposite and both bad: never pausing (the cost
 * that prompted it) and never resuming (a globe that looks dead).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGlobeRenderGate } from '../useGlobeRenderGate';

let observerCallback: (entries: Array<{ isIntersecting: boolean }>) => void;
const disconnect = vi.fn();

beforeEach(() => {
  disconnect.mockClear();
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    class {
      constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) { observerCallback = cb; }
      observe() {}
      disconnect() { disconnect(); }
    };
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
});

afterEach(() => { vi.restoreAllMocks(); });

const setHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

function setup() {
  const pauseAnimation = vi.fn();
  const resumeAnimation = vi.fn();
  const globeRef = { current: { pauseAnimation, resumeAnimation } };
  const containerRef = { current: document.createElement('div') };
  const view = renderHook(() => useGlobeRenderGate(globeRef as never, containerRef as never));
  return { pauseAnimation, resumeAnimation, view };
}

describe('useGlobeRenderGate', () => {
  it('does not pause a globe that is on screen and visible', () => {
    const { pauseAnimation } = setup();
    observerCallback([{ isIntersecting: true }]);
    expect(pauseAnimation).not.toHaveBeenCalled();
  });

  it('pauses when the tab goes to the background, and resumes when it returns', () => {
    const { pauseAnimation, resumeAnimation } = setup();
    observerCallback([{ isIntersecting: true }]);

    setHidden(true);
    expect(pauseAnimation).toHaveBeenCalledTimes(1);

    setHidden(false);
    expect(resumeAnimation).toHaveBeenCalledTimes(1);
  });

  it('pauses when the container leaves the screen — another app view taking the centre', () => {
    const { pauseAnimation, resumeAnimation } = setup();
    observerCallback([{ isIntersecting: true }]);

    observerCallback([{ isIntersecting: false }]);
    expect(pauseAnimation).toHaveBeenCalledTimes(1);

    observerCallback([{ isIntersecting: true }]);
    expect(resumeAnimation).toHaveBeenCalledTimes(1);
  });

  it('does not resume while the tab is still hidden, even if the container is on screen', () => {
    // Both conditions gate rendering; one being satisfied is not enough.
    const { resumeAnimation } = setup();
    setHidden(true);
    observerCallback([{ isIntersecting: true }]);
    expect(resumeAnimation).not.toHaveBeenCalled();
  });

  it('never leaves the globe paused on unmount', () => {
    // A later mount inheriting a stopped renderer would look like a dead globe.
    const { pauseAnimation, resumeAnimation, view } = setup();
    observerCallback([{ isIntersecting: false }]);
    expect(pauseAnimation).toHaveBeenCalled();

    view.unmount();
    expect(resumeAnimation).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
  });

  it('tolerates a globe ref that has not been populated yet', () => {
    const globeRef = { current: null };
    const containerRef = { current: document.createElement('div') };
    expect(() => {
      renderHook(() => useGlobeRenderGate(globeRef as never, containerRef as never));
      observerCallback([{ isIntersecting: false }]);
    }).not.toThrow();
  });
});

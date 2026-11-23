/**
 * A mark's hover ends when it is clicked, or when the pointer leaves the globe (critique C7): after a click on a
 * report, its tooltip stood over the popup until the popup was closed. A real three.js scene, picked as the globe
 * picks it: a point in front of the Earth, a camera looking at it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import * as THREE from 'three';
import { registerTooltipGroup } from '../../pointTooltipRegistry';
import { useGlobePointTooltips } from '../useGlobePointTooltips';
import { getGlobeNoteState, closeGlobeNotes } from '../../../../features/globe/noteDetail/globeNoteStore';

const NOTES = { heading: 'Earthquake', notes: [{ id: 'q', kind: 'Reported by USGS', title: 'M 4.2 - Greece', text: '', timeMs: null, sources: [] }] };

function globe(opens = false) {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  // On the near side of the Earth (radius 100), straight under the camera.
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 104], 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial());
  points.userData = { tooltips: ['M4.2 — Greece'], ...(opens ? { opens: [NOTES] } : {}) };
  group.add(points);
  scene.add(group);
  const unregister = registerTooltipGroup(group);
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 1, 2000);
  camera.position.set(0, 0, 300);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  scene.updateMatrixWorld(true);
  const canvas = document.createElement('canvas');
  const container = document.createElement('div');
  container.appendChild(canvas);
  document.body.appendChild(container);
  Object.defineProperty(container, 'getBoundingClientRect', { value: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0 }) });
  const globeRef = { current: { scene: () => scene, camera: () => camera, renderer: () => ({ domElement: canvas }) } };
  const containerRef = { current: container };
  return { canvas, container, unregister, globeRef, containerRef };
}

let cleanup: (() => void) | null = null;
afterEach(() => { cleanup?.(); cleanup = null; closeGlobeNotes(); vi.restoreAllMocks(); });

const hoverCentre = (container: HTMLElement) => {
  vi.spyOn(performance, 'now').mockReturnValue(10_000 + Math.random());
  act(() => { container.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 300, bubbles: true })); });
};

describe('useGlobePointTooltips, a hover that ends', () => {
  it('names the mark under the pointer', () => {
    const g = globe();
    cleanup = () => { g.unregister(); g.container.remove(); };
    const { result } = renderHook(() => useGlobePointTooltips({ globeRef: g.globeRef as never, containerRef: g.containerRef as never }));
    hoverCentre(g.container);
    expect(result.current?.text).toBe('M4.2 — Greece');
  });

  it('clears when the mark is clicked, so nothing stands over what the click opens', () => {
    const g = globe();
    cleanup = () => { g.unregister(); g.container.remove(); };
    const { result } = renderHook(() => useGlobePointTooltips({ globeRef: g.globeRef as never, containerRef: g.containerRef as never }));
    hoverCentre(g.container);
    expect(result.current).not.toBeNull();
    act(() => {
      g.canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 400, clientY: 300, button: 0, bubbles: true }));
      g.canvas.dispatchEvent(new MouseEvent('pointerup', { clientX: 400, clientY: 300, button: 0, bubbles: true }));
    });
    expect(result.current).toBeNull();
  });

  it('clears when the pointer leaves the globe, as onto a popup or a panel', () => {
    const g = globe();
    cleanup = () => { g.unregister(); g.container.remove(); };
    const { result } = renderHook(() => useGlobePointTooltips({ globeRef: g.globeRef as never, containerRef: g.containerRef as never }));
    hoverCentre(g.container);
    expect(result.current).not.toBeNull();
    act(() => { g.container.dispatchEvent(new MouseEvent('mouseleave')); });
    expect(result.current).toBeNull();
  });
});

/*
 * At the rim of a mark the hover and the click could disagree (critique C5, probed 2026-10-16): the hover read the
 * mark at whole pixels, the click a pixel further out where the pick missed, and a mark that said "Click to open"
 * opened nothing. Here one pixel is about 0.3 world units at the mark, so the pick reaches about 4.9 px from it.
 */
describe('useGlobePointTooltips, a click at the rim of what the hover named', () => {
  const hoverAt = (container: HTMLElement, x: number) => {
    vi.spyOn(performance, 'now').mockReturnValue(10_000 + Math.random());
    act(() => { container.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: 300, bubbles: true })); });
  };
  const clickAt = (canvas: HTMLCanvasElement, x: number) => act(() => {
    canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: x, clientY: 300, button: 0, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('pointerup', { clientX: x, clientY: 300, button: 0, bubbles: true }));
  });

  it('opens what the hover named, when the click lands just past where the pick reaches', () => {
    const g = globe(true);
    cleanup = () => { g.unregister(); g.container.remove(); };
    const { result } = renderHook(() => useGlobePointTooltips({ globeRef: g.globeRef as never, containerRef: g.containerRef as never }));
    hoverAt(g.container, 404);
    expect(result.current?.opens).toBe(true);
    clickAt(g.canvas, 406);
    expect(getGlobeNoteState().open?.heading).toBe('Earthquake');
  });

  it('opens nothing for a tap off the mark with no hover before it', () => {
    const g = globe(true);
    cleanup = () => { g.unregister(); g.container.remove(); };
    renderHook(() => useGlobePointTooltips({ globeRef: g.globeRef as never, containerRef: g.containerRef as never }));
    clickAt(g.canvas, 406);
    expect(getGlobeNoteState().open).toBeNull();
  });

  it('opens what the click lands on when it lands on another mark: the pick at the click wins (D-CT)', () => {
    const g = globe(true);
    cleanup = () => { g.unregister(); g.container.remove(); };
    // A second mark 10 px to the right, which opens nothing: hovered at 404 the first one answers, clicked at 407 this one.
    const scene = g.globeRef.current.scene();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([3.05, 0, 104], 3));
    const other = new THREE.Points(geometry, new THREE.PointsMaterial());
    other.userData = { tooltips: ['Olkoviy-Ozernoy Volcanic Field'] };
    const group = new THREE.Group();
    group.add(other);
    scene.add(group);
    scene.updateMatrixWorld(true);
    const unregister = registerTooltipGroup(group);
    const before = cleanup;
    cleanup = () => { unregister(); before(); };
    const { result } = renderHook(() => useGlobePointTooltips({ globeRef: g.globeRef as never, containerRef: g.containerRef as never }));
    hoverAt(g.container, 404);
    expect(result.current?.text).toBe('M4.2 — Greece');
    clickAt(g.canvas, 407);
    expect(getGlobeNoteState().open).toBeNull();
  });

  it('opens nothing when the pointer has moved away from where the hover read it', () => {
    const g = globe(true);
    cleanup = () => { g.unregister(); g.container.remove(); };
    renderHook(() => useGlobePointTooltips({ globeRef: g.globeRef as never, containerRef: g.containerRef as never }));
    hoverAt(g.container, 404);
    clickAt(g.canvas, 412);
    expect(getGlobeNoteState().open).toBeNull();
  });
});

/**
 * The globe's loader shows the work it is waiting on (plan item 8.3, decision
 * D6). It held a first visit for 3 seconds after the globe was ready, ran five
 * scripted lines ("ESTABLISHING QUANTUM ENCRYPTED CHANNELS…") on timed delays
 * that looked like stages, and drew random "matrix" characters. Now it shows the
 * two things it can see, each as it stands, with the time taken, and lets go
 * the moment both are ready.
 */
import React, { useLayoutEffect } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { GlobeLoadingProvider } from '../../../context/GlobeLoadingContext';
import GlobeLoadingManager from '../GlobeLoadingManager';

type TextureRow = { name: string; label: string; state: 'waiting' | 'loading' | 'ready' | 'failed' | 'timeout'; ms?: number };
/** An engine that reports its textures, as GlobeEngine does (plan item 8.3c). */
function stubEngine(textures: TextureRow[] = []) {
  const handlers: Record<string, Array<() => void>> = {};
  const engine = {
    textures,
    getTextureStates: () => engine.textures,
    on: (event: string, fn: () => void) => { (handlers[event] ??= []).push(fn); },
    off: (event: string, fn: () => void) => { handlers[event] = (handlers[event] ?? []).filter((h) => h !== fn); },
    retryTextures: vi.fn(async () => {}),
    change(next: TextureRow[]) { engine.textures = next; (handlers.texturesChanged ?? []).forEach((h) => h()); },
  };
  return engine;
}

const mount = (props: { material: unknown; globeEngine: unknown }) => render(
  <GlobeLoadingProvider>
    <GlobeLoadingManager {...props}>
      <div>globe content</div>
    </GlobeLoadingManager>
  </GlobeLoadingProvider>,
);
const stage = (name: string) => screen.getByTestId(`globe-load-${name}`).textContent;

describe('GlobeLoadingManager', () => {
  afterEach(() => vi.useRealTimers());

  it('shows each stage as it stands, and nothing scripted', () => {
    const { container, rerender } = mount({ material: null, globeEngine: null });
    expect(stage('engine')).toMatch(/Globe engine.*starting/i);
    expect(stage('surface')).toMatch(/surface.*waiting/i);
    expect(container.textContent).not.toMatch(/QUANTUM|INITIALIZING GLOBAL COMMAND|SATELLITE NETWORKS|THREAT DETECTION/);
    expect(container.querySelector('.matrix-rain, .code-column, .progress-bar')).toBeNull();

    rerender(<GlobeLoadingProvider><GlobeLoadingManager material={null} globeEngine={stubEngine()}><div>globe content</div></GlobeLoadingManager></GlobeLoadingProvider>);
    expect(stage('engine')).toMatch(/Globe engine.*ready/i);
    expect(stage('surface')).toMatch(/surface.*loading/i);
  });

  it('lets go as soon as both are ready, with no fixed hold', () => {
    vi.useFakeTimers();
    const { container, rerender } = mount({ material: null, globeEngine: stubEngine() });
    expect(screen.getByTestId('globe-loader')).toBeTruthy();
    rerender(<GlobeLoadingProvider><GlobeLoadingManager material={{}} globeEngine={stubEngine()}><div>globe content</div></GlobeLoadingManager></GlobeLoadingProvider>);
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.getByTestId('globe-loader')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByTestId('globe-loader')).toBeNull();
    expect(container.querySelector('.globe-content')!.className).toMatch(/\bvisible\b/);
  });

  it('starts its fade in the same render that shows the globe', () => {
    // Started from an effect, the fade landed in a later render. On the
    // production build that render waited out the globe's first frame and came
    // 7 ms before the removal, so the loader vanished with no fade at all.
    // A child's layout effect sees the DOM as the render that showed it left it.
    const seen: string[] = [];
    const Probe = () => {
      useLayoutEffect(() => {
        const loader = document.querySelector('[data-testid="globe-loader"]');
        const content = document.querySelector('.globe-content');
        seen.push(`${content?.className} | ${loader?.className}`);
      });
      return null;
    };
    // A new element on each rerender, so the probe takes part in the render
    // that sees both ready; a later render inside the loader reuses it and skips it.
    const { rerender } = render(<GlobeLoadingProvider><GlobeLoadingManager material={null} globeEngine={stubEngine()}><Probe /></GlobeLoadingManager></GlobeLoadingProvider>);
    rerender(<GlobeLoadingProvider><GlobeLoadingManager material={{}} globeEngine={stubEngine()}><Probe /></GlobeLoadingManager></GlobeLoadingProvider>);
    const shown = seen.find((s) => /\bvisible\b/.test(s));
    expect(shown).toMatch(/\| .*\bfade-out\b/);
  });

  it('says how long it has been waiting, and when that is longer than usual', () => {
    vi.useFakeTimers();
    mount({ material: null, globeEngine: stubEngine() });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getByTestId('globe-loader').textContent).toMatch(/2 s/);
    expect(screen.queryByText(/longer than usual/i)).toBeNull();
    act(() => { vi.advanceTimersByTime(9000); });
    expect(screen.getByText(/longer than usual/i)).toBeTruthy();
  });

  it('lists each texture of the surface as it stands', () => {
    const engine = stubEngine([
      { name: 'earthDark', label: 'Dark surface', state: 'ready', ms: 1200 },
      { name: 'earthWater', label: 'Oceans', state: 'loading' },
      { name: 'earthNight', label: 'City lights', state: 'waiting' },
    ]);
    mount({ material: null, globeEngine: engine });
    expect(screen.getByTestId('source-earthDark').textContent).toMatch(/Dark surface: ready · 1\.2 s/);
    expect(screen.getByTestId('source-earthWater').textContent).toMatch(/Oceans: loading/);
    act(() => engine.change([
      { name: 'earthDark', label: 'Dark surface', state: 'ready', ms: 1200 },
      { name: 'earthWater', label: 'Oceans', state: 'ready', ms: 2100 },
      { name: 'earthNight', label: 'City lights', state: 'timeout' },
    ]));
    expect(screen.getByTestId('source-earthWater').textContent).toMatch(/Oceans: ready · 2\.1 s/);
    expect(screen.getByTestId('source-earthNight').textContent).toMatch(/City lights: timed out · drawn flat/);
  });

  it('says, once the globe shows, which imagery is drawn flat, and asks for it again', async () => {
    const engine = stubEngine([
      { name: 'earthDark', label: 'Dark surface', state: 'ready', ms: 900 },
      { name: 'earthNight', label: 'City lights', state: 'timeout' },
    ]);
    mount({ material: {}, globeEngine: engine });
    const notice = screen.getByTestId('globe-surface-notice');
    expect(notice.textContent).toMatch(/City lights did not load: drawn flat\./);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(engine.retryTextures).toHaveBeenCalled();
    act(() => engine.change([
      { name: 'earthDark', label: 'Dark surface', state: 'ready', ms: 900 },
      { name: 'earthNight', label: 'City lights', state: 'ready', ms: 400 },
    ]));
    await waitFor(() => expect(screen.queryByTestId('globe-surface-notice')).toBeNull());
  });

  it('says nothing more once every texture has loaded', () => {
    mount({ material: {}, globeEngine: stubEngine([{ name: 'earthDark', label: 'Dark surface', state: 'ready', ms: 900 }]) });
    expect(screen.queryByTestId('globe-surface-notice')).toBeNull();
  });
});

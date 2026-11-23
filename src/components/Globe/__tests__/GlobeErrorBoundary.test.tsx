/**
 * The property under test is containment, not presentation.
 *
 * Before this boundary existed, three.js throwing during globe construction
 * propagated to the application-level boundary and replaced Starcom with an
 * error screen. So the assertion that matters is that a sibling still renders
 * after the globe has failed.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import GlobeErrorBoundary, { GlobeGate } from '../GlobeErrorBoundary';

/** What three.js actually throws from WebGLRenderer's constructor. */
const Exploding: React.FC = () => {
  throw new Error('Error creating WebGL context.');
};

function withoutWebgl() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
}

function withWebgl(renderer?: string) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
    getExtension: (name: string) =>
      name === 'WEBGL_debug_renderer_info'
        ? { UNMASKED_RENDERER_WEBGL: 37446 }
        : name === 'WEBGL_lose_context'
          ? { loseContext: () => {} }
          : null,
    getParameter: () => renderer,
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext);
}

describe('GlobeErrorBoundary', () => {
  beforeEach(() => {
    // React logs caught errors; the noise is expected, not a failure.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps a globe failure from taking the application with it', () => {
    withoutWebgl();
    render(
      <div>
        <GlobeErrorBoundary><Exploding /></GlobeErrorBoundary>
        <p>the rest of Starcom</p>
      </div>,
    );

    // The whole point: a sibling survives.
    expect(screen.getByText('the rest of Starcom')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('names the browser as the reason when WebGL2 is absent', () => {
    withoutWebgl();
    render(<GlobeErrorBoundary><Exploding /></GlobeErrorBoundary>);

    expect(screen.getByText(/THE GLOBE NEEDS WEBGL2/i)).toBeInTheDocument();
    expect(screen.getByText(/did not provide a WebGL2 context/i)).toBeInTheDocument();
    // Usually deliberate, and saying so is the difference between an apology
    // and information.
    expect(screen.getByText(/Tor Browser disables WebGL/i)).toBeInTheDocument();
  });

  it('says the rest of the application is unaffected, which is the point', () => {
    withoutWebgl();
    render(<GlobeErrorBoundary><Exploding /></GlobeErrorBoundary>);
    expect(screen.getByText(/intel, cases, missions and analysis are unaffected/i)).toBeInTheDocument();
  });

  it('distinguishes a globe that crashed from a browser that cannot run one', () => {
    withWebgl('Apple M1');
    render(<GlobeErrorBoundary><Exploding /></GlobeErrorBoundary>);

    // WebGL is present, so this is a real failure and must not be blamed on
    // the browser.
    expect(screen.getByText(/THE GLOBE DID NOT START/i)).toBeInTheDocument();
    expect(screen.getByText(/Error creating WebGL context/i)).toBeInTheDocument();
    expect(screen.queryByText(/Tor Browser/i)).not.toBeInTheDocument();
  });

  it('warns when WebGL is served by a software rasterizer', () => {
    withWebgl('SwiftShader Device (Subzero)');
    render(<GlobeErrorBoundary><Exploding /></GlobeErrorBoundary>);
    // A context that succeeds and runs at three frames per second is the
    // larger population, and reports no error of its own.
    expect(screen.getByText(/software rasterizer/i)).toBeInTheDocument();
  });

  it('renders children untouched when nothing throws', () => {
    render(<GlobeErrorBoundary><p>globe</p></GlobeErrorBoundary>);
    expect(screen.getByText('globe')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('GlobeGate', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => vi.restoreAllMocks());

  /*
   * Plan item 8.3, block B4 (decided 2026-10-01). The gate asked first, with a
   * WebGL context of its own, because three.js once threw outside React and a
   * boundary could not catch it. With the check made to answer yes and every
   * context refused, the boundary held in Chromium, WebKit and Firefox, and in
   * Firefox with WebGL off by preference, as Tor Browser has it. So the globe is
   * mounted at once, and the context the check cost (1.7–3.4 s on a machine that
   * draws in software) is not made.
   */
  it('mounts the globe at once, making no context of its own', () => {
    withWebgl('Apple M1');
    const probe = HTMLCanvasElement.prototype.getContext as unknown as ReturnType<typeof vi.fn>;
    render(<GlobeGate><p>globe</p></GlobeGate>);
    expect(screen.getByText('globe')).toBeInTheDocument();
    expect(probe).not.toHaveBeenCalled();
  });

  it('says why when the globe cannot start, and keeps it to the globe', () => {
    withoutWebgl();
    render(<><GlobeGate><Exploding /></GlobeGate><p>Cases</p></>);
    expect(screen.getByText(/THE GLOBE NEEDS WEBGL2/i)).toBeInTheDocument();
    expect(screen.getByText('Cases')).toBeInTheDocument();
  });

  it('honours fallback={null} as "render nothing" when the globe cannot start', () => {
    withoutWebgl();
    render(<GlobeGate fallback={null}><Exploding /></GlobeGate>);

    // `fallback ?? <Default/>` fired the default here once, because ?? treats null
    // and undefined alike: the full explanation in a 240px HUD corner beside the
    // same paragraph in the centre. Without the gate's own check, the boundary is
    // what renders it, and it showed twice again until it honoured this too.
    expect(screen.queryByText(/THE GLOBE NEEDS WEBGL2/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/DID NOT START/i)).not.toBeInTheDocument();
  });
});

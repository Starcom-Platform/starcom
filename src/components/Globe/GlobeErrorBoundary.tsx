/**
 * Keep a globe failure to the globe.
 *
 * ─── WHAT THIS PREVENTS ────────────────────────────────────────────────────
 *
 * three.js THROWS when it cannot get a context — `Error creating WebGL
 * context.` from WebGLRenderer's constructor. <Globe /> was mounted bare, and
 * the nearest boundary above it is the one wrapping the whole application. So a
 * visitor without WebGL2 did not lose the globe; they lost Starcom. Cases,
 * IntelAnalyzer, NetRunner, TeamWorkspace — every one of them replaced by an
 * error screen because a sphere could not rasterize.
 *
 * ─── WHY IT ONCE CHECKED FIRST, AND NO LONGER DOES ─────────────────────────
 *
 * Rechecked 2026-10-01 (plan item 8.3, block B4), and no longer so. three.js
 * now builds its renderer inside React's commit (react-kapsule's init), and the
 * boundary caught its failure in Chromium, WebKit and Firefox, and in Firefox
 * with WebGL off by preference, with no uncaught error and the rest of the app
 * there. The check first cost a WebGL context on every visit, so it went
 * (GlobeGate, below). What follows is why it was added; run the application
 * again before relying on either.
 *
 * A boundary alone did not work here, which running the application is the
 * only way to find out. three.js constructs its WebGLRenderer OUTSIDE React's
 * synchronous render path — react-globe.gl builds it during its own
 * initialisation — so the throw surfaces as an uncaught window error, and a
 * React error boundary structurally cannot catch those. It catches render,
 * lifecycle and constructors, and this is none of them.
 *
 * Verified in headless Chromium, which has no WebGL2: with only a boundary, a
 * visitor still lost the whole application. The isolated unit test passed
 * because it threw synchronously during render, which is not what actually
 * happens.
 *
 * So support was checked BEFORE the globe was mounted, and when it was absent the
 * globe was never constructed, with the boundary underneath for every other way
 * a globe can fail.
 *
 * ─── WHY THE MESSAGE MATTERS AS MUCH AS THE CATCH ──────────────────────────
 *
 * The people most likely to hit this are the ones this application is for:
 * Tor Browser disables WebGL above its standard security level, managed and
 * government devices disable hardware acceleration by policy, and virtual
 * machines rarely pass a GPU through. An analyst with good operational habits
 * is MORE likely to lack WebGL than a casual visitor, which inverts the usual
 * assumption.
 *
 * Telling them "something went wrong" would read as a broken application. The
 * cause is a property of their browser, usually a deliberate one, and saying so
 * is the difference between an apology and information.
 */
import React from 'react';
import { detectWebglSupport, type WebglSupport } from './webglSupport';

interface Props {
  children: React.ReactNode;
  /** Shown instead of the explanation when the globe cannot start; null for nothing. */
  fallback?: React.ReactNode;
}

interface State {
  failed: boolean;
  error?: Error;
  support?: WebglSupport;
}

export class GlobeErrorBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { failed: true, error };
  }

  componentDidCatch(error: Error): void {
    // Probed on failure rather than on mount: asking every visitor's GPU a
    // question at startup is a fingerprinting surface and a cost, and the
    // answer only matters once something has actually gone wrong.
    this.setState({ support: detectWebglSupport() });
    console.error('[Globe] contained failure:', error);
  }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    // `!== undefined`, not `??`: null means "render nothing here" (see GlobeGate).
    if (this.props.fallback !== undefined) return <>{this.props.fallback}</>;
    return <GlobeUnavailable support={this.state.support} error={this.state.error} />;
  }
}

/**
 * One rendering of "no globe", shared by the gate and the boundary, so the two
 * paths cannot drift into telling a visitor different stories.
 */
const GlobeUnavailable: React.FC<{ support?: WebglSupport; error?: Error }> = ({ support, error }) => {
    const webglMissing = support !== undefined && !support.available;

    return (
      <div
        role="status"
        style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', backgroundColor: '#0a1a29', padding: '2rem',
        }}
      >
        <div style={{ maxWidth: 560, color: '#cfe6f5', fontFamily: "var(--sc-font-data)", fontSize: '0.8rem', lineHeight: 1.6 }}>
          <div style={{ color: '#00f5ff', letterSpacing: '0.1em', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
            {webglMissing ? 'THE GLOBE NEEDS WEBGL2' : 'THE GLOBE DID NOT START'}
          </div>

          {webglMissing ? (
            <>
              <p style={{ margin: '0 0 0.75rem' }}>{support?.detail}</p>
              <p style={{ margin: '0 0 0.75rem', color: '#8fb3c7' }}>
                This is common and usually deliberate. Tor Browser disables WebGL above its standard
                security level. Managed devices often disable hardware acceleration by policy, and
                virtual machines rarely pass a GPU through. It is the browser, not a fault in Starcom.
              </p>
            </>
          ) : (
            <p style={{ margin: '0 0 0.75rem' }}>
              {error?.message ?? 'The globe failed to initialise.'}
            </p>
          )}

          {/* The point of containing it. */}
          <p style={{ margin: 0, color: '#8fb3c7' }}>
            Everything else still works — intel, cases, missions and analysis are unaffected.
          </p>

          {support?.likelySoftware && (
            <p style={{ margin: '0.75rem 0 0', color: '#ff9955' }}>
              Note: WebGL here is served by a software rasterizer ({support.renderer}), so even when
              it starts it will be slow.
            </p>
          )}
        </div>
      </div>
    );
};

/**
 * Mount the globe, and keep its failure to it.
 *
 * This asked first, with a WebGL context of its own, because three.js once
 * threw outside React and no boundary could catch it (the header). Checked
 * again on 2026-10-01 (plan item 8.3, block B4): with that check made to answer
 * yes and every WebGL context refused, the boundary held in Chromium, WebKit
 * and Firefox, and in Firefox with WebGL off by preference, as Tor Browser has
 * it. three.js now builds its renderer inside React's commit. So the globe is
 * mounted at once, and the check's context, 1.7–3.4 s on a machine that draws
 * in software, is not made. The boundary asks about WebGL only after a failure.
 *
 * `fallback` is what to show when the globe cannot start: the full explanation
 * is right for the main view and wrong for a HUD corner, and the front door
 * mounts two globes. `null` renders nothing.
 */
export const GlobeGate: React.FC<Props> = ({ children, fallback }) => (
  <GlobeErrorBoundary fallback={fallback}>{children}</GlobeErrorBoundary>
);

export default GlobeErrorBoundary;

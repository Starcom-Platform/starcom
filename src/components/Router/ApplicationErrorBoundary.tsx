/**
 * One application failing must cost that application, not Starcom.
 *
 * ─── WHY ───────────────────────────────────────────────────────────────────
 *
 * Before this, one of seven application surfaces had any containment. The
 * nearest boundary above the rest was the one wrapping the whole tree, so a
 * throw anywhere in NetRunner, Cases, IntelDashboard, IntelAnalyzer,
 * OpsCenter or MarketExchange replaced the entire application with an error
 * screen — nav included, so there was no way back except a reload.
 *
 * The globe demonstrated this the expensive way: a browser with no WebGL2 lost
 * all of Starcom because a sphere could not rasterise. That was never a globe
 * problem. It was the general case, and this is the general fix.
 *
 * ─── WHY IT IS KEYED BY APP ────────────────────────────────────────────────
 *
 * A React error boundary latches. Without a key it stays in its failed state
 * after the operator navigates elsewhere, so one bad screen would poison every
 * screen after it and look exactly like a broken application. Keying on the app
 * id means moving to another app builds a fresh boundary.
 *
 * ─── WHAT IT DOES NOT DO ───────────────────────────────────────────────────
 *
 * It cannot catch what React never sees: a throw from outside the render and
 * lifecycle path — a listener, a timer, or a renderer constructed inside a
 * third-party effect — arrives as an uncaught window error. That is exactly how
 * the globe defeated its first boundary, and why the globe ALSO checks support
 * before mounting. Containment is a floor, not a guarantee.
 */
import React from 'react';

interface Props {
  /** For the message, and for the key that resets this boundary. */
  appName: string;
  children: React.ReactNode;
}

interface State {
  error?: Error;
}

export class ApplicationErrorBoundary extends React.Component<Props, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Logged, not swallowed. A contained failure that leaves no trace is a
    // failure nobody will fix.
    console.error(`[${this.props.appName}] contained failure:`, error, info.componentStack);
  }

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '2rem', backgroundColor: '#0a1a29',
        }}
      >
        <div style={{ maxWidth: 560, color: '#cfe6f5', fontFamily: "var(--sc-font-data)", fontSize: '0.8rem', lineHeight: 1.6 }}>
          <div style={{ color: '#00f5ff', letterSpacing: '0.1em', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
            {this.props.appName.toUpperCase()} DID NOT START
          </div>
          <p style={{ margin: '0 0 0.75rem' }}>{error.message}</p>
          {/* The point of containing it: the nav is outside this boundary. */}
          <p style={{ margin: 0, color: '#8fb3c7' }}>
            Every other application is unaffected — switch to one from the bar below, or reload to try this one again.
          </p>
        </div>
      </div>
    );
  }
}

export default ApplicationErrorBoundary;

import React from 'react';

/**
 * Isolates one piece of HUD furniture so its failure is local.
 *
 * ─── WHY EACH FEATURE NEEDS ITS OWN BOUNDARY ───────────────────────────────
 *
 * Six features in this shell sat behind `!isEmbedded` — a condition every caller
 * makes false — so none of them had rendered in a long time. Turning them back
 * on means running six code paths that nothing has exercised, against contexts
 * and data shapes that have moved underneath them.
 *
 * Without a boundary, the first one that throws takes the entire HUD down to the
 * app-level error screen: no globe, no rails, no way to reach the others. That is
 * a bad trade for a status widget, and it is also how a feature gets switched off
 * "temporarily" and stays off for a year.
 *
 * With a boundary, a broken feature costs exactly itself.
 *
 * ─── WHY IT DOES NOT RENDER A FALLBACK ─────────────────────────────────────
 *
 * HUD furniture is ambient. An error card where the time scrubber should be is
 * worse than an absence: it occupies the same space, it cannot be dismissed, and
 * it tells the operator nothing they can act on. The console message is for
 * whoever is fixing it; the screen stays clean for whoever is using it.
 *
 * The one thing it must never do is retry silently. A component that throws on
 * every render would spin, so the boundary latches.
 */

interface Props {
  /** Appears in the console message. Use the component's name. */
  name: string;
  children: React.ReactNode;
}

interface State {
  failed: boolean;
}

export class HudFeature extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Deliberately console rather than a logger: this fires during a render that
    // has already failed, and the logger has its own dependencies.
    console.error(
      `[HUD] ${this.props.name} crashed and was removed from the HUD. ` +
      'The rest of the interface is unaffected.',
      error,
      info.componentStack,
    );
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default HudFeature;

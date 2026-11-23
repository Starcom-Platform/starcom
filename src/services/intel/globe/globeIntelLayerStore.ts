import { INTEL_FINDINGS_OVERLAY, type GlobeIntelLayer } from './globeIntelLayer';

/**
 * The bridge between analysis and the globe.
 *
 * These two live in different React trees. CorrelationProvider wraps only
 * AnalysisWorkbench; the globe renders under CyberCommandCenterManager. No
 * common provider contains both, which is the structural reason
 * docs/build-order.md's "Global" gap exists at all — it is not that nobody
 * wrote the code, it is that there was no path for the data to travel.
 *
 * A store outside React is the honest bridge. The alternatives are worse:
 * hoisting CorrelationProvider to the app root would run correlation for every
 * user of the app whether or not they opened the analyzer, and threading props
 * across two subtrees would couple the globe to the analyzer's internals — the
 * exact coupling the layer contract exists to prevent.
 *
 * Only plain layer data crosses. Neither side imports the other's types beyond
 * GlobeIntelLayer itself.
 */

type Listener = (layers: GlobeIntelLayer[]) => void;

/**
 * KEYED BY LAYER ID, not a single slot.
 *
 * It held one layer, despite GlobeIntelLayer carrying an `id` and the codebase
 * defining INTEL_FINDINGS_OVERLAY as though it were one of several. A second
 * publisher would have silently replaced the first, and the failure would have
 * looked like a rendering bug rather than a contract one — the layer that
 * happened to publish last simply won.
 *
 * I.A.5 asks for the layer contract to be provable by adding an unrelated
 * second source layer through the contract alone. It could not be, until this.
 */
class GlobeIntelLayerStore {
  private layers = new Map<string, GlobeIntelLayer>();
  private listeners = new Set<Listener>();

  /**
   * Publish a layer under its own id, replacing only that layer.
   *
   * Publishing an EMPTY layer means "this source ran and produced nothing".
   * To say "this source is no longer asserting anything here", call
   * withdraw(id). The two are deliberately different: a globe that kept
   * showing the last layer after its publisher went away would present a
   * stale claim as current, and one that treated "nothing found" as
   * "not running" would lose a real result.
   */
  publish(layer: GlobeIntelLayer | null, id?: string): void {
    if (!layer) {
      // Back-compat for the single-layer call shape: publish(null) withdraws
      // the findings layer, which is the only thing that ever used it.
      if (id) this.withdraw(id);
      else this.withdraw(INTEL_FINDINGS_OVERLAY);
      return;
    }
    this.layers.set(layer.id, layer);
    this.notify();
  }

  /** Remove a layer entirely — its publisher is no longer asserting anything. */
  withdraw(id: string): void {
    if (this.layers.delete(id)) this.notify();
  }

  /** Every published layer, in insertion order. */
  get(): GlobeIntelLayer[] {
    return [...this.layers.values()];
  }

  /** One layer by id, when a consumer cares about a specific source. */
  getLayer(id: string): GlobeIntelLayer | undefined {
    return this.layers.get(id);
  }

  private notify(): void {
    const snapshot = this.get();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // One bad subscriber must not stop the others being told.
      }
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    // Deliver current state immediately: a subscriber that mounts after the
    // last publish would otherwise show nothing until the next recompute, and
    // "nothing" is the value this whole layer exists to disambiguate.
    //
    // Guarded for the same reason publish() is, which this previously was not.
    // The asymmetry was a real defect: a listener that threw on its FIRST
    // delivery propagated the throw out of subscribe(), and subscribe() is
    // called from inside a useEffect during mount — so one bad subscriber took
    // down the component that mounted it, and on the globe that means the
    // whole 3D view rather than one badge. Every later delivery was already
    // protected; only the first, during mount, was not.
    try {
      listener(this.get());
    } catch {
      // Same rule as publish: one bad subscriber is its own problem.
    }
    return () => { this.listeners.delete(listener); };
  }

  /** Test seam. */
  reset(): void {
    this.layers.clear();
    this.listeners.clear();
  }
}

export const globeIntelLayerStore = new GlobeIntelLayerStore();

// Dev-only debug handle.
//
// The analyzer and the globe are separate applications and cannot be open at
// once, which makes this bridge awkward to exercise by hand — you have to
// produce findings in one view, navigate away, and inspect another. Exposing
// the store in dev lets the globe's render path be driven directly. It is also
// how the layer was first verified to render at all.
//
// Guarded on import.meta.env.DEV, so it does not exist in a production bundle.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__starcomGlobeIntelLayerStore = globeIntelLayerStore;
}

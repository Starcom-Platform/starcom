/**
 * The layers the globe draws, for what renders outside the layer control's provider.
 *
 * A popup is rendered above that provider (App.tsx, RoutedPopupLayer), so it cannot read the
 * context: the Geopolitical layers popup asked only whether a layer's overlay was on, and a layer
 * drawn from its sub-mode or a pin read as off there — no status, and no counts (D-DP, DP10). The
 * provider publishes its active set here, by the same rule the globe draws by.
 */
import { useSyncExternalStore } from 'react';
import type { GlobeLayerId } from './useGlobeLayerControl';

let drawn: ReadonlySet<GlobeLayerId> = new Set();
const listeners = new Set<() => void>();

/** The layer control's provider says which layers are drawn; nothing else should. */
export function publishDrawnGlobeLayers(layers: ReadonlySet<GlobeLayerId>): void {
  drawn = layers;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Whether the globe draws this layer, from its sub-mode or a pin. */
export function useGlobeLayerDrawn(layerId: GlobeLayerId): boolean {
  return useSyncExternalStore(subscribe, () => drawn.has(layerId), () => false);
}

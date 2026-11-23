/** The layer control as a comparison pins with it (D-CM): either layer drawn, pinned beside the other where it is not. */
import type { ComparePins } from '../../globe-engine/compareLayers';
import type { GlobeLayerId, UseGlobeLayerControlResult } from '../Globe/Hooks/useGlobeLayerControl';

export function comparePins(control: Pick<UseGlobeLayerControlResult, 'isLayerActive' | 'pinLayer' | 'unpinLayer'>): ComparePins {
  return {
    isLayerActive: (layer) => control.isLayerActive(layer as GlobeLayerId),
    pinLayer: (layer) => control.pinLayer(layer as GlobeLayerId),
    unpinLayer: (layer) => control.unpinLayer(layer as GlobeLayerId),
  };
}

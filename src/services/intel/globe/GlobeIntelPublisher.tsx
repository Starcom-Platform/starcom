import { useGlobeIntelLayer } from './useGlobeIntelLayer';

/**
 * Mounts the globe-layer publisher inside CorrelationProvider.
 *
 * Renders nothing. It exists because a hook that nobody calls does nothing,
 * and every piece of this pipeline was individually built and individually
 * tested while `useGlobeIntelLayer` was never invoked by any component —
 * the layer contract, the adapter, the cross-tree store, the globe-side
 * consumer, and the react-globe.gl rendering all worked, and the globe stayed
 * empty because the first link was missing.
 *
 * A component rather than a hook call buried in AnalysisWorkbench so the
 * dependency is visible in the tree: this must sit inside CorrelationProvider,
 * because that is where the findings it publishes come from.
 */
export const GlobeIntelPublisher: React.FC = () => {
  useGlobeIntelLayer();
  return null;
};

export default GlobeIntelPublisher;

import { useEffect } from 'react';
import { env } from '../../../config/env';
import { publishedFindingsLedger } from '../findings/PublishedFindingsLedger';
import { globeIntelLayerStore } from './globeIntelLayerStore';
import { buildPublishedClaimsLayer, PUBLISHED_CLAIMS_OVERLAY } from './publishedClaimsLayer';

/**
 * Mounts the published-claims layer.
 *
 * A separate publisher from the findings one on purpose: its source is the
 * ledger, which changes when you publish or retract, not when correlation
 * reruns. Sharing a publisher would have tied one source's refresh rate to
 * the other's for no reason.
 *
 * Republishes on an interval because the layer's weights DECAY — the marks
 * change over time even when the ledger does not. Ten minutes is far below
 * the staleness threshold and far above any rate at which a 180-day half-life
 * produces a visible difference.
 */
const REFRESH_MS = 10 * 60 * 1000;

export const GlobePublishedClaimsPublisher: React.FC = () => {
  useEffect(() => {
    if (!env.globeIntelLayer) return;

    const publish = () => {
      globeIntelLayerStore.publish(buildPublishedClaimsLayer(publishedFindingsLedger.live()));
    };
    publish();
    const timer = setInterval(publish, REFRESH_MS);
    return () => {
      clearInterval(timer);
      // Withdrawn on unmount, unlike the findings layer.
      //
      // The findings layer must NOT withdraw, because the analyzer that
      // produces it and the globe that shows it are mutually exclusive
      // applications — withdrawing would blank it exactly when it became
      // visible. This publisher has no such problem: it reads a store that is
      // always available, so it can be honest about no longer asserting
      // anything when it goes away.
      globeIntelLayerStore.withdraw(PUBLISHED_CLAIMS_OVERLAY);
    };
  }, []);

  return null;
};

export default GlobePublishedClaimsPublisher;

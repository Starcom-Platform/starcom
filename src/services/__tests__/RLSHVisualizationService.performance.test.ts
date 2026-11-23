import { RLSH_MARKER_CAPS, rlshVisualizationService } from '../RLSHVisualizationService';
import type { RLSHOverlayMarker } from '../../interfaces/RLSHOverlay';

const makeMarker = (index: number): RLSHOverlayMarker => ({
  schemaVersion: '1.0.0',
  id: `rlsh-cap-${index}`,
  displayName: `RLSH ${index}`,
  summary: 'Performance cap verification marker',
  canonicalUrl: `https://example.org/rlsh/${index}`,
  latitude: 40 + (index % 10) * 0.1,
  longitude: -74 - (index % 10) * 0.1,
  updatedAt: new Date().toISOString(),
  source: {
    provider: 'primary_wiki',
    sourceId: `perf-${index}`
  },
  geoConfidence: 'city',
  tags: ['RLSH', 'CITY'],
  // Real cache entries always get roleClass assigned during normalization (see
  // RLSHVisualizationService's curated-role-lookup step, defaulting to 'hero') — this
  // test injects the cache directly, bypassing that pipeline, so it must set it too.
  roleClass: 'hero'
});

describe('RLSHVisualizationService performance hardening', () => {
  it('enforces global and high-detail marker caps', async () => {
    const oversized = Array.from({ length: RLSH_MARKER_CAPS.global + 75 }, (_, index) => makeMarker(index));

    const serviceInternals = rlshVisualizationService as unknown as { cache: RLSHOverlayMarker[] };
    serviceInternals.cache = oversized;

    const globalLimited = await rlshVisualizationService.getMarkers();
    expect(globalLimited.length).toBe(RLSH_MARKER_CAPS.global);

    const highDetailLimited = await rlshVisualizationService.getIntelCompatibleMarkers({
      limit: RLSH_MARKER_CAPS.global
    });
    expect(highDetailLimited.length).toBe(RLSH_MARKER_CAPS.highDetail);
  });

  it('keeps snapshots/subscribers bounded over a 20-cycle stability run', async () => {
    const unsubscribers: Array<() => void> = [];

    for (let index = 0; index < 20; index += 1) {
      unsubscribers.push(rlshVisualizationService.subscribe(() => {}));
      await rlshVisualizationService.refresh();
      const unsubscribe = unsubscribers.pop();
      unsubscribe?.();
    }

    const stats = rlshVisualizationService.getDebugStats();
    expect(stats.snapshotCount).toBeLessThanOrEqual(3);
    expect(stats.subscriberCount).toBe(0);
    expect(stats.cacheSize).toBeLessThanOrEqual(RLSH_MARKER_CAPS.global);
  });
});

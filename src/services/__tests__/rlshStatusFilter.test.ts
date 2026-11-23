/**
 * Status filtering, and telling the truth about the roster's size.
 *
 * The embedded set is 40 Active, 121 Inactive, 19 Retired, 9 Unknown, 4
 * Semi-Active and 4 Deceased, and every one draws the same pin. A viewer counts
 * markers and reads the movement as five times its current size.
 *
 * 'all' stays the default because hiding 121 people is its own distortion —
 * they are the movement's history. What was missing is the ability to ask, and
 * a count.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import type { RLSHOverlayMarker } from '../../interfaces/RLSHOverlay';
import { rlshVisualizationService } from '../RLSHVisualizationService';

// The service returns placeholder markers under a test runtime, so these drive
// the predicate through the public surface it is reachable from.
const svc = rlshVisualizationService as unknown as {
  cache: RLSHOverlayMarker[];
  statusBreakdown(): Promise<{ total: number; operating: number; byStatus: Record<string, number> }>;
  getMarkers(o?: { statusFilter?: 'active' | 'all' }): Promise<RLSHOverlayMarker[]>;
};

const withStatus = (status: string, id: string): RLSHOverlayMarker => ({
  schemaVersion: '1.0.0', id, displayName: id, summary: '', canonicalUrl: '',
  latitude: 1, longitude: 1, city: 'x', region: '', countryCode: 'US',
  locationText: '', updatedAt: '', lastVerifiedAt: '', imageUrl: '', symbolImageUrl: '',
  identity: '', category: '', status, team: [], affiliates: [], foes: '', actions: '',
  equipment: '', abilities: '', fullText: '', sourceUrl: '',
  source: { provider: 'wiki.rlsh.net', sourceId: id },
  geoConfidence: 'exact', tags: [], riskFlags: [],
  // Assigned by applyCuratedRegistration in the normal flow. Without it the
  // ROLE filter excludes the marker before the status filter is consulted,
  // which is worth knowing: a marker that reaches the cache without a
  // roleClass is invisible for reasons unrelated to its status.
  roleClass: 'hero', roleLabel: 'Hero',
} as unknown as RLSHOverlayMarker);

describe('RLSH status filtering', () => {
  it('counts only positively-asserted activity as operating', async () => {
    svc.cache = [
      withStatus('Active', 'a'), withStatus('Semi-Active', 'b'),
      withStatus('Inactive', 'c'), withStatus('Retired', 'd'),
      withStatus('Deceased', 'e'), withStatus('Unknown', 'f'),
    ];
    const b = await svc.statusBreakdown();
    expect(b.total).toBe(6);
    // 'Unknown' is NOT activity: a record nobody has checked says nothing about
    // today, and treating silence as presence is how a roster inflates itself.
    expect(b.operating).toBe(2);
    expect(b.byStatus.Deceased).toBe(1);
  });

  it('survives the case variance the source is known to carry', async () => {
    // The sibling identity field holds both 'Secret' and 'secret'.
    svc.cache = [withStatus('active', 'a'), withStatus('ACTIVE', 'b'), withStatus('  Active  ', 'c')];
    expect((await svc.statusBreakdown()).operating).toBe(3);
  });

  it('returns everyone by default, because the history is not noise', async () => {
    svc.cache = [withStatus('Active', 'a'), withStatus('Retired', 'b'), withStatus('Deceased', 'c')];
    expect(await svc.getMarkers()).toHaveLength(3);
  });

  it('narrows to current members when asked', async () => {
    svc.cache = [withStatus('Active', 'a'), withStatus('Retired', 'b'), withStatus('Deceased', 'c')];
    const only = await svc.getMarkers({ statusFilter: 'active' });
    expect(only.map((m) => m.id)).toEqual(['a']);
  });

  it('names an unstated status rather than dropping it from the count', async () => {
    svc.cache = [withStatus('', 'a'), withStatus('Active', 'b')];
    const b = await svc.statusBreakdown();
    // Silently omitting it would make the parts stop summing to the whole.
    expect(b.byStatus.Unstated).toBe(1);
    expect(Object.values(b.byStatus).reduce((x, y) => x + y, 0)).toBe(b.total);
  });
});

import { rlshVisualizationService } from '../RLSHVisualizationService';
import type { RLSHOverlayMarker } from '../../interfaces/RLSHOverlay';

const makeRoleMarker = (id: string, roleClass: RLSHOverlayMarker['roleClass']): RLSHOverlayMarker => ({
  schemaVersion: '1.0.0',
  id,
  displayName: `Marker ${id}`,
  summary: 'Role filter integration test marker',
  canonicalUrl: `https://example.org/${id}`,
  latitude: 40,
  longitude: -74,
  updatedAt: new Date().toISOString(),
  source: {
    provider: 'embedded_rlsh_dataset',
    sourceId: id
  },
  geoConfidence: 'city',
  tags: ['RLSH'],
  roleClass,
  roleLabel: roleClass === 'zone_guardian'
    ? 'Zone Guardian'
    : roleClass === 'rescue_ranger'
      ? 'Rescue Ranger'
      : 'Hero'
});

describe('RLSHVisualizationService role filtering integration', () => {
  it('updates returned markers when active role filter changes', async () => {
    const internals = rlshVisualizationService as unknown as {
      cache: RLSHOverlayMarker[];
    };

    internals.cache = [
      makeRoleMarker('hero-1', 'hero'),
      makeRoleMarker('guardian-1', 'zone_guardian'),
      makeRoleMarker('ranger-1', 'rescue_ranger')
    ];

    await rlshVisualizationService.setRoleFilter('hero');
    const heroMarkers = await rlshVisualizationService.getMarkers({ limit: 100 });
    expect(heroMarkers.length).toBe(1);
    expect(heroMarkers[0].roleClass).toBe('hero');

    await rlshVisualizationService.setRoleFilter('zone_guardian');
    const guardianMarkers = await rlshVisualizationService.getMarkers({ limit: 100 });
    expect(guardianMarkers.length).toBe(1);
    expect(guardianMarkers[0].roleClass).toBe('zone_guardian');

    await rlshVisualizationService.setRoleFilter('rescue_ranger');
    const rangerMarkers = await rlshVisualizationService.getMarkers({ limit: 100 });
    expect(rangerMarkers.length).toBe(1);
    expect(rangerMarkers[0].roleClass).toBe('rescue_ranger');
  });
});

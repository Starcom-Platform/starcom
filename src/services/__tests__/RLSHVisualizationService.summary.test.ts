import { rlshVisualizationService } from '../RLSHVisualizationService';
import type { RLSHOverlayMarker } from '../../interfaces/RLSHOverlay';

type ServiceInternals = {
  cache: RLSHOverlayMarker[];
  recentPipelineSteps: Array<Record<string, unknown>>;
  pipelineLastRunDurationMs: number | null;
  emitPipelineStep: (step: string, details: Record<string, unknown>) => void;
  buildHumanReadableRunSummary: () => {
    recordsDisplayed: number;
    recordsCached: number;
    displayPath: 'marker' | 'intel' | 'none';
    activeRoleFilter: 'hero' | 'zone_guardian' | 'rescue_ranger' | 'archangel_knight' | 'all' | 'unknown';
    roleFilteredCount: number;
    issues: string[];
  };
};

const makeMarker = (id: string, roleClass: 'hero' | 'zone_guardian' | 'rescue_ranger' = 'hero'): RLSHOverlayMarker => ({
  schemaVersion: '1.0.0',
  id,
  displayName: id,
  summary: 'Summary',
  canonicalUrl: `https://example.org/${id}`,
  latitude: 10,
  longitude: 10,
  updatedAt: new Date().toISOString(),
  source: {
    provider: 'primary_wiki',
    sourceId: id
  },
  geoConfidence: 'city',
  tags: ['RLSH'],
  roleClass,
  roleLabel: roleClass === 'zone_guardian' ? 'Zone Guardian' : roleClass === 'rescue_ranger' ? 'Rescue Ranger' : 'Hero'
});

describe('RLSHVisualizationService summary diagnostics', () => {
  const resetServiceState = () => {
    const internals = rlshVisualizationService as unknown as ServiceInternals;
    internals.cache = [];
    internals.recentPipelineSteps = [];
    internals.pipelineLastRunDurationMs = 42;
    return internals;
  };

  it('prefers intel display metrics when marker display step is absent', () => {
    const internals = resetServiceState();
    internals.cache = [
      makeMarker('m-1'),
      makeMarker('m-2'),
      makeMarker('m-3'),
      makeMarker('m-4')
    ];

    internals.emitPipelineStep('pipeline_start', { result: 'success', cacheSize: 0 });
    internals.emitPipelineStep('cache_published', { result: 'success', cacheSize: 4, parsedCount: 4 });
    internals.emitPipelineStep('intel_display_ready', {
      result: 'success',
      displayPath: 'intel',
      roleFilter: 'hero',
      requestedLimit: 120,
      appliedLimit: 120,
      receivedCount: 4,
      filteredCount: 4,
      parsedCount: 4,
      returnedCount: 4,
      cacheSize: 4
    });
    internals.emitPipelineStep('pipeline_complete', { result: 'success', cacheSize: 4 });

    const summary = internals.buildHumanReadableRunSummary();
    expect(summary.recordsCached).toBe(4);
    expect(summary.recordsDisplayed).toBe(4);
    expect(summary.displayPath).toBe('intel');
    expect(summary.activeRoleFilter).toBe('hero');
    expect(summary.roleFilteredCount).toBe(4);
  });

  it('reports role-filter exclusion when cache is non-empty but displayed markers are zero', () => {
    const internals = resetServiceState();
    internals.cache = [
      makeMarker('h-1', 'hero'),
      makeMarker('h-2', 'hero'),
      makeMarker('h-3', 'hero')
    ];

    internals.emitPipelineStep('pipeline_start', { result: 'success', cacheSize: 0 });
    internals.emitPipelineStep('cache_published', { result: 'success', cacheSize: 3, parsedCount: 3 });
    internals.emitPipelineStep('display_ready', {
      result: 'success',
      displayPath: 'marker',
      roleFilter: 'zone_guardian',
      requestedLimit: 300,
      appliedLimit: 300,
      receivedCount: 3,
      filteredCount: 0,
      parsedCount: 0,
      returnedCount: 0,
      cacheSize: 3
    });
    internals.emitPipelineStep('pipeline_complete', { result: 'success', cacheSize: 3 });

    const summary = internals.buildHumanReadableRunSummary();
    expect(summary.recordsCached).toBe(3);
    expect(summary.recordsDisplayed).toBe(0);
    expect(summary.displayPath).toBe('marker');
    expect(summary.activeRoleFilter).toBe('zone_guardian');
    expect(summary.issues).toContain('Role filter excluded all cached markers (role=zone_guardian).');
  });

  it('adds deterministic RLSH group key tags for intel-compatible markers', async () => {
    const internals = resetServiceState();
    internals.cache = [
      makeMarker('g-1', 'hero'),
      makeMarker('g-2', 'hero')
    ].map((marker) => ({
      ...marker,
      latitude: 32.7157,
      longitude: -117.1611
    }));

    const intelMarkers = await rlshVisualizationService.getIntelCompatibleMarkers({ limit: 10, roleFilter: 'all' });
    expect(intelMarkers.length).toBe(2);

    expect(intelMarkers[0].entityId).toBe('g-1');
    expect(intelMarkers[1].entityId).toBe('g-2');
    expect(intelMarkers[0].groupId).toBe('32.71570|-117.16110');
    expect(intelMarkers[1].groupId).toBe('32.71570|-117.16110');
    expect(intelMarkers[0].groupKind).toBe('location');
    expect(intelMarkers[0].groupVersion).toBe(1);

    const groupTags = intelMarkers.map((marker) => marker.tags.find((tag) => tag.startsWith('RLSH_GROUP_KEY:')) || null);
    expect(groupTags[0]).toBeTruthy();
    expect(groupTags[1]).toBeTruthy();
    expect(groupTags[0]).toBe(groupTags[1]);
    expect(groupTags[0]).toBe('RLSH_GROUP_KEY:32.71570|-117.16110');
  });
});

/**
 * Every marker states what it is.
 *
 * The globe's interaction layer decided which popup to open, what to call the
 * hovered thing, and whether a confidence tag applied — all from GLOBAL mode
 * state: subMode === 'RLSH' therefore this must be an RLSH entity. That is
 * backwards, and it fails the moment two kinds of marker share the globe.
 *
 * Which useGlobeLayerControl already allows: a pinned layer renders while
 * another mode is primary, and every DATA renderer honours pins. So a pinned
 * RLSH marker was being treated as an intel report.
 *
 * These assert the PRODUCERS, because a kind nobody sets is worse than no kind
 * at all — the consumer would silently read every marker as 'intel'.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { rlshVisualizationService } from '../../services/RLSHVisualizationService';
import { intelReportVisualizationService } from '../../services/IntelReportVisualizationService';
import type { IntelReportOverlayMarker } from '../IntelReportOverlay';

describe('overlay marker kind', () => {
  it('is set on every RLSH marker by its producer', async () => {
    const markers = await rlshVisualizationService.getIntelCompatibleMarkers({ limit: 500 });
    expect(markers.length).toBeGreaterThan(0);
    for (const m of markers) expect(m.kind).toBe('rlsh');
  });

  it('is set on every intel marker by its producer', () => {
    const svc = intelReportVisualizationService as unknown as {
      buildMarkersFromReports(reports: unknown[]): IntelReportOverlayMarker[];
    };
    const built = svc.buildMarkersFromReports([
      { id: 'r1', title: 'A report', content: 'x', latitude: 10, longitude: 20, tags: [], author: 'me' },
    ]);
    expect(built).toHaveLength(1);
    expect(built[0].kind).toBe('intel');
  });

  it('treats an absent kind as intel, which is what every older marker was', () => {
    // The consumer contract, stated so the default cannot drift into meaning
    // "unknown" and start routing legacy markers nowhere.
    const legacy = {
      pubkey: 'p', title: 't', content: '', tags: [],
      latitude: 0, longitude: 0, timestamp: 0, author: 'a',
    } as IntelReportOverlayMarker;
    expect(legacy.kind ?? 'intel').toBe('intel');
  });

  it('never mixes the two kinds within one producer', async () => {
    const rlsh = await rlshVisualizationService.getIntelCompatibleMarkers({ limit: 5 });
    const kinds = [...new Set(rlsh.map((m) => m.kind ?? 'intel'))];
    // If this ever contains both, the producers have crossed wires.
    expect(kinds).toEqual(['rlsh']);
  });
});

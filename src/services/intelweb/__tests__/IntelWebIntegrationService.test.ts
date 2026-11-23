/**
 * intelReportUIToReportData — the mapping that lets IntelWeb render real,
 * published IntelReportUI records (from the canonical services/intel
 * substrate) instead of the two hardcoded demo reports it used to always
 * show regardless of what actually existed elsewhere in the app.
 */
import { describe, it, expect } from 'vitest';
import { intelReportUIToReportData, IntelWebIntegrationService } from '../IntelWebIntegrationService';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import type { IntelReportData } from '../../../models/IntelReportData';

function makeReport(overrides: Partial<IntelReportUI> = {}): IntelReportUI {
  return {
    id: 'report-1',
    title: 'Suspicious Wire Transfers',
    content: 'Multiple transfers observed to offshore accounts.',
    author: 'analyst_007',
    category: 'finance',
    tags: ['finance', 'osint'],
    visibility: 'private',
    createdAt: new Date('2026-01-15T12:00:00.000Z'),
    updatedAt: new Date('2026-01-15T12:00:00.000Z'),
    status: 'APPROVED',
    ...overrides
  };
}

// Constructs an IntelReportData directly (bypassing intelReportUIToReportData)
// so these tests exercise buildFromReports's entity-registry logic in
// isolation — separate coverage below verifies the mapper itself actually
// carries entityRefs through into this same field.
function makeReportDataWithEntities(id: string, title: string, entityNames: string[]): IntelReportData {
  return {
    id,
    title,
    content: `Report body for ${title}`,
    tags: [],
    timestamp: Date.now(),
    author: 'analyst_007',
    entities: entityNames
  };
}

describe('intelReportUIToReportData', () => {
  it('maps the core fields straight across', () => {
    const result = intelReportUIToReportData(makeReport({ latitude: 40.7128, longitude: -74.006 }));
    expect(result.id).toBe('report-1');
    expect(result.title).toBe('Suspicious Wire Transfers');
    expect(result.content).toBe('Multiple transfers observed to offshore accounts.');
    expect(result.tags).toEqual(['finance', 'osint']);
    expect(result.author).toBe('analyst_007');
    expect(result.visibility).toBe('private');
    expect(result.latitude).toBe(40.7128);
    expect(result.longitude).toBe(-74.006);
  });

  it('converts createdAt (Date) into a unix-ms timestamp (number)', () => {
    const result = intelReportUIToReportData(makeReport({ createdAt: new Date('2026-01-15T12:00:00.000Z') }));
    expect(result.timestamp).toBe(new Date('2026-01-15T12:00:00.000Z').getTime());
  });

  // This test pinned the bug. IntelReportData.confidence is 0..1 — that is what
  // reportMappers, the storage mapper, writes and reads — and this was the only
  // 0..100 producer of the field anywhere.
  it('carries confidence through unscaled, on IntelReportUI\'s 0..1 scale', () => {
    const result = intelReportUIToReportData(makeReport({ confidence: 0.82 }));
    expect(result.confidence).toBe(0.82);
  });

  it('does not turn the lowest confidence into the highest', () => {
    // 0.01 used to become Math.round(1) === 1, which then failed
    // normalizeConfidence's `v > 1` test and came back as 1.0 — maximum. It
    // then passed the [0.3, 1.0] graph filter it should have failed, and under
    // sizingMode 'confidence' drew as one of the largest nodes on the canvas.
    const result = intelReportUIToReportData(makeReport({ confidence: 0.01 }));
    expect(result.confidence).toBe(0.01);
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('leaves confidence undefined when the source report has none, rather than defaulting to 0', () => {
    const result = intelReportUIToReportData(makeReport({ confidence: undefined }));
    expect(result.confidence).toBeUndefined();
  });

  it('wraps the single "category" into the plural "categories" array IntelWeb reads tags from', () => {
    const result = intelReportUIToReportData(makeReport({ category: 'threat-assessment' }));
    expect(result.categories).toEqual(['threat-assessment']);
  });

  it('passes reliability through directly — both types share the same A-F literal union', () => {
    const result = intelReportUIToReportData(makeReport({ reliability: 'B' }));
    expect(result.reliability).toBe('B');
  });

  it('does not fabricate an "entities" list when a report has no entityRefs — still no extraction feature, still never inferred', () => {
    const result = intelReportUIToReportData(makeReport());
    expect(result.entities).toBeUndefined();
  });

  it('carries entityRefs through to entities — Phase 2: this is a real, author-tagged field now, not a permanently-empty one', () => {
    const result = intelReportUIToReportData(makeReport({ entityRefs: ['John Smith', 'Acme Corp'] }));
    expect(result.entities).toEqual(['John Smith', 'Acme Corp']);
  });
});

describe('IntelWebIntegrationService.buildFromReports — entity name normalization (Phase 1)', () => {
  it('two reports mentioning the same entity under different casing/punctuation resolve to ONE entity file, not two', async () => {
    const service = new IntelWebIntegrationService();
    const reports = [
      makeReportDataWithEntities('report-a', 'Report A', ['John Smith']),
      makeReportDataWithEntities('report-b', 'Report B', ['john smith.'])
    ];

    const result = await service.buildFromReports(reports);

    const entityFiles = result.vfs.directoryIndex.get('entities/')?.files ?? [];
    expect(entityFiles).toHaveLength(1);
  });

  it('genuinely different entities still get separate files — normalization must not over-merge', async () => {
    const service = new IntelWebIntegrationService();
    const reports = [
      makeReportDataWithEntities('report-a', 'Report A', ['John Smith']),
      makeReportDataWithEntities('report-b', 'Report B', ['Jane Doe'])
    ];

    const result = await service.buildFromReports(reports);

    const entityFiles = result.vfs.directoryIndex.get('entities/')?.files ?? [];
    expect(entityFiles).toHaveLength(2);
  });

  it('both reports\' "mentions" relationships point at the same shared entity file', async () => {
    const service = new IntelWebIntegrationService();
    const reports = [
      makeReportDataWithEntities('report-a', 'Report A', ['ACME Corp']),
      makeReportDataWithEntities('report-b', 'Report B', ['  acme corp  '])
    ];

    const result = await service.buildFromReports(reports);

    const entityFiles = result.vfs.directoryIndex.get('entities/')?.files ?? [];
    expect(entityFiles).toHaveLength(1);
    const mentionEdges = result.vfs.relationshipGraph.filter(r => r.metadata?.predicate === 'mentions');
    expect(mentionEdges).toHaveLength(2);
    expect(new Set(mentionEdges.map(e => e.target))).toEqual(new Set([entityFiles[0]]));
  });
});

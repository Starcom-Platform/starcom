/**
 * IntelWeb places a report's node by when its event happened, falling back to
 * when the report was written (decision D-E). Every node took its file's
 * modification time, and a vault built from the workspace stamps every file with
 * the moment it was built, so every workspace report sat at the same instant.
 */
import { describe, it, expect } from 'vitest';
import { intelReportUIToReportData, IntelWebIntegrationService } from '../IntelWebIntegrationService';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const written = new Date('2026-09-12T08:00:00.000Z');
const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 'r1', title: 'Substation fire', content: 'Seen from the road.', author: 'analyst', category: 'infrastructure', tags: [],
  createdAt: new Date('2026-09-10T12:00:00.000Z'), updatedAt: written, status: 'SUBMITTED', ...over,
});

const build = (r: IntelReportUI) => new IntelWebIntegrationService().buildFromReports([intelReportUIToReportData(r)]);

describe('IntelWeb: report nodes placed by when the event happened', () => {
  it('carries the event time into the vault, and places the node by it', async () => {
    const { vfs, graph } = await build(report({ startDate: new Date('2026-07-27T00:00:00.000Z'), timePrecisionMs: 86_400_000 }));

    const file = [...vfs.fileIndex.values()].find((f) => f.frontmatter?.type === 'report')!;
    expect(file.frontmatter?.startDate).toBe('2026-07-27T00:00:00.000Z');
    expect(file.frontmatter?.timePrecisionMs).toBe(86_400_000);
    expect(String(file.content)).toContain('startDate: 2026-07-27T00:00:00.000Z');

    const node = graph.nodes.find((n) => n.type === 'report')!;
    expect(node.timestamp?.toISOString()).toBe('2026-07-27T00:00:00.000Z');
    expect(node.timeBasis).toBe('event');
    expect(node.timePrecisionMs).toBe(86_400_000);
  });

  it('places a report with no event time by when it was written, not when the vault was built', async () => {
    const { graph } = await build(report());

    const node = graph.nodes.find((n) => n.type === 'report')!;
    expect(node.timestamp?.toISOString()).toBe(written.toISOString());
    expect(node.timeBasis).toBe('written');
  });
});

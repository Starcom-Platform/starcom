/**
 * The report id -> vault path index that makes deep-linking possible.
 *
 * A vault path is a slug of the report title plus a short hash of its id, and
 * the id is deliberately NOT written into frontmatter — frontmatter flows into
 * node.metadata and out to the MetadataPanel as user-visible noise. So the
 * mapping existed only inside the loop that built it and was thrown away on
 * return, and a caller wanting to open a specific report had no way to name it
 * except by guessing the slug.
 */
import { describe, it, expect } from 'vitest';
import { IntelWebIntegrationService } from '../IntelWebIntegrationService';
import type { IntelReportData } from '../../../types/IntelWorkspace';

const report = (id: string, title: string): IntelReportData => ({
  id, title, content: 'Body', author: 'analyst',
  createdAt: '2026-06-01T00:00:00.000Z', modifiedAt: '2026-06-01T00:00:00.000Z',
} as IntelReportData);

describe('BuildResult.reportPathById', () => {
  it('maps every report id to the path it became', async () => {
    const svc = new IntelWebIntegrationService();
    const result = await svc.buildFromReports([
      report('rpt-alpha', 'Relay Traffic Anomaly'),
      report('rpt-beta', 'Port Scan Cluster'),
    ]);

    expect(result.reportPathById.get('rpt-alpha')).toBeTruthy();
    expect(result.reportPathById.get('rpt-beta')).toBeTruthy();
    expect(result.reportPathById.get('rpt-alpha')).not.toBe(result.reportPathById.get('rpt-beta'));
  });

  it('maps to a path that actually exists in the vault', async () => {
    // The whole point: a path nothing can open is not an index, it is a guess.
    const svc = new IntelWebIntegrationService();
    const result = await svc.buildFromReports([report('rpt-alpha', 'Relay Traffic Anomaly')]);

    const path = result.reportPathById.get('rpt-alpha')!;
    expect(result.vfs.fileIndex.has(path)).toBe(true);
  });

  it('returns nothing for an id this vault was not built from', async () => {
    // A resolvable "not found" is what lets the UI say the report is gone
    // rather than silently opening nothing.
    const svc = new IntelWebIntegrationService();
    const result = await svc.buildFromReports([report('rpt-alpha', 'A')]);

    expect(result.reportPathById.get('rpt-missing')).toBeUndefined();
  });

  it('distinguishes two reports that share a title', async () => {
    // The slug is title-derived, so same-titled reports would collide without
    // the id hash. If they ever did, a deep-link would open the wrong report.
    const svc = new IntelWebIntegrationService();
    const result = await svc.buildFromReports([
      report('rpt-one', 'Duplicate Title'),
      report('rpt-two', 'Duplicate Title'),
    ]);

    const a = result.reportPathById.get('rpt-one')!;
    const b = result.reportPathById.get('rpt-two')!;
    expect(a).not.toBe(b);
    expect(result.vfs.fileIndex.has(a)).toBe(true);
    expect(result.vfs.fileIndex.has(b)).toBe(true);
  });
});

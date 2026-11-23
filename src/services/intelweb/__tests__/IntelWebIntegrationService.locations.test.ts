/**
 * No location nodes (decision D-IW, IW11). A node for each point, rounded to five decimal places,
 * almost never joined two notes: on the build, 25 of them, each beside one note. Countries join
 * notes now, and the Map layout places a note by its own point, which its file keeps.
 */
import { describe, expect, it } from 'vitest';
import { IntelWebIntegrationService } from '../IntelWebIntegrationService';
import type { IntelReportData } from '../../../models/IntelReportData';

const placed = (id: string, latitude: number, longitude: number, entities: string[] = []): IntelReportData => ({
  id, title: `Report ${id}`, content: 'x', tags: [], latitude, longitude, timestamp: Date.parse('2026-10-12T00:00:00Z'), author: 'a', entities,
} as IntelReportData);

describe('IntelWeb vault: no location nodes', () => {
  it('makes no file and no link for a note\'s point', async () => {
    const result = await new IntelWebIntegrationService().buildFromReports([placed('1', 15.35, 44.2, ['Houthis']), placed('2', 15.35, 44.2)]);
    expect([...result.vfs.fileIndex.values()].filter((f) => f.frontmatter?.type === 'location')).toEqual([]);
    const predicates = result.vfs.relationshipGraph.map((r) => (r.metadata as { predicate?: string }).predicate);
    expect(predicates).not.toContain('observed_at');
    expect(predicates).not.toContain('located_at');
  });

  it('keeps the point on the note itself, for the Map layout', async () => {
    const result = await new IntelWebIntegrationService().buildFromReports([placed('1', 15.35, 44.2)]);
    const note = result.vfs.fileIndex.get(result.reportPathById.get('1')!);
    expect(note?.frontmatter?.coordinates).toEqual([15.35, 44.2]);
  });
});

/**
 * IntelWeb's vault carries what links its notes (decision D-IW, step 1): a file for each hub, each
 * mission package and each stub, and a relationship from each note to what it shares or names, so
 * the graph draws them as it draws the rest.
 */
import { describe, expect, it } from 'vitest';
import { IntelWebIntegrationService, intelReportUIToReportData } from '../IntelWebIntegrationService';
import { intelStructure } from '../intelStructure';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const MJ = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const A = `30023:${MJ}:houthis-wikipedia`;
const B = `30023:${MJ}:houthis-convergence`;
const AWAY = `30023:${MJ}:not-here`;
const GRANT = `30079:${MJ}:ic-grant-1`;
const at = new Date('2026-10-12T10:00:00Z');
const report = (id: string, title: string, over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id, title, content: title, author: MJ, category: 'GEOINT', tags: ['nostr'], createdAt: at, updatedAt: at, status: 'SUBMITTED', ...over,
} as IntelReportUI);

async function build() {
  const reports = [
    report(A, 'Houthis on Wikipedia', { jurisdictions: ['ye'], hashtags: ['war_map'] }),
    report(B, 'Houthis, active in 3 countries', { jurisdictions: ['ye', 'sa'], hashtags: ['war_map'], refers: [A, AWAY, GRANT] }),
    report(`30023:${MJ}:third`, 'Something else', { hashtags: ['other'] }),
    report(`30023:${MJ}:fourth`, 'And another', { hashtags: ['other'] }),
  ];
  const structure = intelStructure(reports);
  const result = await new IntelWebIntegrationService().buildFromReports(reports.map(intelReportUIToReportData), { structure });
  return { result, structure };
}

describe('the vault: what links the notes', () => {
  it('a file for each country, tag, mission package and stub, each saying what it is', async () => {
    const { result } = await build();
    const byType = (type: string) => [...result.vfs.fileIndex.values()].filter((f) => f.frontmatter?.type === type).map((f) => f.name).sort();
    expect(byType('country')).toEqual(['Saudi Arabia', 'Yemen']);
    expect(byType('tag')).toEqual(['#other', '#war_map']);
    expect(byType('mission')).toEqual(['Mission package ic-grant-1, not held here']);
    expect(byType('stub')).toEqual(['A note not held here: not-here']);
  });

  it('a relationship from each note to what it shares and names', async () => {
    const { result } = await build();
    const from = result.reportPathById.get(B)!;
    const rels = result.vfs.relationshipGraph.filter((r) => r.source === from)
      .map((r) => [(r.metadata as { predicate: string }).predicate, r.target]).sort();
    expect(rels).toEqual([
      ['in_country', 'countries/sa.md'],
      ['in_country', 'countries/ye.md'],
      ['names_mission', `missions/${encodeURIComponent(GRANT)}.md`],
      ['refers', result.reportPathById.get(A)!],
      ['refers', `stubs/${encodeURIComponent(AWAY)}.md`],
      ['tagged', 'tags/war_map.md'],
    ]);
  });

  it('a stated hub is certain, a stub less so, so the confidence filter keeps both', async () => {
    const { result } = await build();
    const conf = (path: string) => result.vfs.fileIndex.get(path)?.frontmatter?.confidence;
    expect(conf('countries/ye.md')).toBe(1);
    expect(conf(`stubs/${encodeURIComponent(AWAY)}.md`)).toBe(0.5);
  });

  it('builds as before where no structure is given', async () => {
    const reports = [report(A, 'Houthis on Wikipedia', { jurisdictions: ['ye'] })];
    const result = await new IntelWebIntegrationService().buildFromReports(reports.map(intelReportUIToReportData));
    expect([...result.vfs.fileIndex.values()].map((f) => f.frontmatter?.type)).toEqual(['report']);
  });

  it('keeps on each note what IntelWeb groups it by: the jurisdictions and tags it states', async () => {
    const { result } = await build();
    const fm = result.vfs.fileIndex.get(result.reportPathById.get(B)!)?.frontmatter as Record<string, unknown>;
    expect(fm.jurisdictions).toEqual(['ye', 'sa']);
    expect(fm.hashtags).toEqual(['war_map']);
  });

  it('keeps on each note its assessment and category as the globe reads them (IW12)', async () => {
    const reports = [
      report(`30023:${MJ}:a`, 'Critical', { hashtags: ['critical', 'category:conflict.wars'] }),
      report(`30023:${MJ}:b`, 'Actionable', { hashtags: ['role:actionable', 'actionable', 'category:health'] }),
      report(`30023:${MJ}:c`, 'Stated', { priority: 'medium' } as Partial<IntelReportUI>),
      report(`30023:${MJ}:d`, 'Nobody assessed it'),
    ];
    const result = await new IntelWebIntegrationService().buildFromReports(reports.map(intelReportUIToReportData));
    const fm = (id: string) => result.vfs.fileIndex.get(result.reportPathById.get(id)!)?.frontmatter as Record<string, unknown>;
    expect(['a', 'b', 'c', 'd'].map((d) => fm(`30023:${MJ}:${d}`).assessment)).toEqual(['critical', 'actionable', 'standard', 'raw']);
    expect(['a', 'b', 'c'].map((d) => fm(`30023:${MJ}:${d}`).intelCategory ?? null)).toEqual(['conflict', 'health', null]);
  });
});


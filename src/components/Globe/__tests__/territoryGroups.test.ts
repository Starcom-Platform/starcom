/**
 * A click inside an outlined territory opens its reports (BA9; plan block J,
 * item 4): the territories containing the click, the smallest first, each with
 * the reports about it as a whole.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTerritoryIndex } from '../../../services/intel/coverage/territoryIndex';
import { usStatesFrom } from '../../../services/raverWatch/usStates';
import { territoryResolver } from '../../../features/globe/capture/territoryReports';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { territoryGroupIndex } from '../territoryGroups';

const ROOT = resolve(__dirname, '../../../..');
const TERRITORIES = buildTerritoryIndex(JSON.parse(readFileSync(resolve(ROOT, 'public/geopolitical/world-territories-lod0.geojson'), 'utf8')).features);
const STATES = usStatesFrom(JSON.parse(readFileSync(resolve(ROOT, 'public/geopolitical/us-states-50m.geojson'), 'utf8')));
const resolveBoth = territoryResolver(TERRITORIES, STATES);

const report = (id: string, jurisdictions: string[], over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id, title: `Report ${id}`, content: 'c', summary: 's', author: 'a'.repeat(64), category: 'intel',
  tags: [], hashtags: ['starcom_intel'], jurisdictions,
  createdAt: new Date('2026-10-02T12:00:00.000Z'), updatedAt: new Date('2026-10-02T12:00:00.000Z'),
  status: 'SUBMITTED', version: 1, history: [], ...over,
} as IntelReportUI);

const PARIS = [48.86, 2.35] as const;
const COLUMBUS = [39.96, -83.0] as const;
const DENVER = [39.74, -104.99] as const;
const MID_ATLANTIC = [30, -40] as const;

describe('the territories at a click', () => {
  it('the one the click is inside, with the reports about it', () => {
    const at = territoryGroupIndex([report('fr1', ['fr']), report('de1', ['de'])], resolveBoth);
    const groups = at(...PARIS);
    expect(groups.map((g) => g.key)).toEqual(['territory:fr']);
    expect(groups[0].title).toBe('France · 1 report');
    expect(groups[0].members.map((m) => m.pubkey)).toEqual(['fr1']);
  });

  it('a state inside its country: the state first, the smaller, and each says how many', () => {
    const at = territoryGroupIndex([report('us1', ['us']), report('us2', ['us']), report('oh1', ['us-oh'])], resolveBoth);
    const groups = at(...COLUMBUS);
    expect(groups.map((g) => g.title)).toEqual(['Ohio · 1 report', 'United States of America · 2 reports']);
    // Colorado has no report of its own: only the country is there.
    expect(at(...DENVER).map((g) => g.key)).toEqual(['territory:us']);
  });

  it('a report once in its territory\'s group, however often it names it', () => {
    const at = territoryGroupIndex([report('twice', ['fr', 'FR'])], resolveBoth);
    expect(at(...PARIS)[0]).toMatchObject({ title: 'France · 1 report' });
    expect(at(...PARIS)[0].members.map((m) => m.pubkey)).toEqual(['twice']);
  });

  it('a report about two territories is in each', () => {
    const at = territoryGroupIndex([report('both', ['fr', 'de'])], resolveBoth);
    expect(at(...PARIS)[0].members.map((m) => m.pubkey)).toEqual(['both']);
    expect(at(52.52, 13.4)[0].members.map((m) => m.pubkey)).toEqual(['both']);
  });

  it('nothing at sea, nothing for a report with a point of its own, nothing it cannot draw', () => {
    const at = territoryGroupIndex([report('fr1', ['fr']), report('pt', ['fr'], { latitude: 48.8, longitude: 2.3 }), report('gf', ['gf'])], resolveBoth);
    expect(at(...MID_ATLANTIC)).toEqual([]);
    expect(at(...PARIS)[0].members.map((m) => m.pubkey)).toEqual(['fr1']);
  });

  it('each report as a marker said to be about its territories as a whole, most severe first', () => {
    const at = territoryGroupIndex([
      report('raw', ['fr'], { createdAt: new Date('2026-10-03T00:00:00Z') }),
      report('crit', ['fr', 'de'], { tags: ['critical'] }),
    ], resolveBoth);
    const [france] = at(...PARIS);
    expect(france.members.map((m) => m.pubkey)).toEqual(['crit', 'raw']);
    expect(france.members[0].aboutTerritories).toEqual(['France', 'Germany']);
    expect(france.members[1].aboutTerritories).toEqual(['France']);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { publicationFromDelta } from '../ofacDelta';

const sample = fs.readFileSync(path.join(__dirname, 'fixtures/ofac-delta.sample.xml'), 'utf8');

describe("publicationFromDelta: one of OFAC's delta files, counted", () => {
  it('counts what was added and removed, by type, and an entry with no action as amended', async () => {
    const p = await publicationFromDelta(sample, 1049);
    expect(p).toMatchObject({ id: 1049, date: '2026-10-13', kind: 'Standard Action', amended: 1 });
    expect(p.added).toEqual({ entities: 1, individuals: 1, vessels: 0, aircraft: 0, other: 0 });
    expect(p.removed).toEqual({ entities: 0, individuals: 0, vessels: 1, aircraft: 0, other: 0 });
  });

  it('counts each programme an entry is under, people included, the most changed first', async () => {
    const p = await publicationFromDelta(sample, 1049);
    expect(p.programmes).toEqual([
      { code: 'ILLICIT-DRUGS-EO14059', added: 2, removed: 0 },
      { code: 'LIBYA3', added: 0, removed: 1 },
      { code: 'SDGT', added: 1, removed: 0 },
    ]);
  });

  it('names organisations and vessels by their primary name, with their countries once each', async () => {
    const p = await publicationFromDelta(sample, 1049);
    expect(p.named).toEqual([
      { action: 'add', type: 'Entity', name: 'EXAMPLE LOGISTICS', countries: ['Mexico'], programmes: ['ILLICIT-DRUGS-EO14059', 'SDGT'] },
      { action: 'remove', type: 'Vessel', name: 'EXAMPLE STAR', countries: [], programmes: ['LIBYA3'] },
    ]);
  });

  it('never carries a person\'s name (BF2)', async () => {
    expect(JSON.stringify(await publicationFromDelta(sample, 1049))).not.toContain('PERSONNAME');
  });

  it('refuses a file that is not a delta, or has no date', async () => {
    await expect(publicationFromDelta('<other/>', 1)).rejects.toThrow(/not an OFAC delta/);
    await expect(publicationFromDelta(sample.replace('2026-10-13T00:00:00-04:00', 'soon'), 1)).rejects.toThrow(/no date/);
  });
});

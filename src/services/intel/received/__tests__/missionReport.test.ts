/**
 * Reporting back on a taken mission (decision D-MF, MF11–MF13; its form NavCom's kind 1912 since D-MX MX28): the
 * counts the package asks for on its own effect lines, sealed to its publisher, the day only, claiming nothing, and
 * a salt so the id inside the seal names its author to nobody. Mecha Jono's packages name their counts in
 * format.effect as "Naloxone kits carried or placed: a count" (15 of the 107 on 2026-10-16).
 */
import { describe, it, expect } from 'vitest';
import type { AcceptedPackage } from '../../MissionPackageIngest';
import { countsAskedOf, dayOf, newSalt, reportTemplate, REPORT_KIND } from '../missionReport';

const pkg = (format: Record<string, unknown>): AcceptedPackage => ({
  event: { id: 'e', pubkey: 'p', created_at: 1, kind: 30079, content: '', sig: '', tags: [['d', 'starcom_mission_package_x']] },
  check: { ok: true, manifest: { id: 'x', name: 'X', version: '1.0.0', description: '', author: 'A', createdAt: '', license: '', visibility: 'public', reports: [], intel: [], assets: [], metadata: { mechaJono: { format } }, objectives: [] } } as AcceptedPackage['check'],
  relay: 'r',
});

describe('countsAskedOf', () => {
  it('reads each count the package names on an effect line, and keeps the line verbatim', () => {
    expect(countsAskedOf(pkg({ effect: ['Naloxone kits carried or placed: a count', 'Bottles handed out: a count.'] }))).toEqual([
      { id: 'naloxone-kits-carried-or-placed', label: 'Naloxone kits carried or placed', line: 'Naloxone kits carried or placed: a count' },
      { id: 'bottles-handed-out', label: 'Bottles handed out', line: 'Bottles handed out: a count.' },
    ]);
  });

  it('reads only what an effect line names as a count, each once: a performance line would be dropped by its reader', () => {
    expect(countsAskedOf(pkg({ effect: ['Fewer people die', 'Kits placed: a count', 'Kits placed: a count'], performance: ['Trainings run: a count'] }))).toEqual([
      { id: 'kits-placed', label: 'Kits placed', line: 'Kits placed: a count' },
    ]);
    expect(countsAskedOf(pkg({}))).toEqual([]);
  });

  it("reads a package made in Starcom by its neutral field, and Mecha Jono's first where both are (MX32)", () => {
    const withMeta = (metadata: Record<string, unknown>) => ({ ...pkg({}), check: { ...pkg({}).check, manifest: { ...pkg({}).check.manifest!, metadata } } }) as AcceptedPackage;
    expect(countsAskedOf(withMeta({ format: { effect: ['Kits placed: a count'] } })).map((c) => c.line)).toEqual(['Kits placed: a count']);
    expect(countsAskedOf(withMeta({ format: { effect: ['Ours: a count'] }, mechaJono: { format: { effect: ['Theirs: a count'] } } })).map((c) => c.line)).toEqual(['Theirs: a count']);
  });
});

describe('reportTemplate', () => {
  const counts = [
    { id: 'kits', label: 'Naloxone kits carried or placed', line: 'Naloxone kits carried or placed: a count' },
    { id: 'trainings', label: 'Trainings run', line: 'Trainings run: a count.' },
  ];
  const coordinate = '30079:6301c4d0:starcom_mission_package_field-naloxone-NM';
  const salt = '0123456789abcdef0123456789abcdef';

  it('is NavCom\'s report: the package by its coordinate, and in the content the callsign, the day, each count on its line, a salt', () => {
    const t = reportTemplate({ coordinate, counts, values: { kits: 3, trainings: 0 }, day: '2026-10-16', callsign: 'Nightjar', salt });
    expect(t.kind).toBe(REPORT_KIND);
    expect(REPORT_KIND).toBe(1912);
    // No g tag, no place: a region-indexed history of who worked where is what both sides refuse to build.
    expect(t.tags).toEqual([['a', coordinate]]);
    expect(t.content).toBe(JSON.stringify({
      callsign: 'Nightjar', date: '2026-10-16',
      counts: [{ line: 'Naloxone kits carried or placed: a count', n: 3 }, { line: 'Trainings run: a count.', n: 0 }], salt,
    }));
    expect(t.createdAt).toBe(Date.parse('2026-10-16T00:00:00Z') / 1000);
    expect(t.given).toEqual([{ label: 'Naloxone kits carried or placed', n: 3 }, { label: 'Trainings run', n: 0 }]);
  });

  it('leaves out a count not given, and a callsign not set', () => {
    const t = reportTemplate({ coordinate, counts, values: { kits: 2 }, day: '2026-10-16', salt });
    expect(JSON.parse(t.content)).toEqual({ date: '2026-10-16', counts: [{ line: 'Naloxone kits carried or placed: a count', n: 2 }], salt });
  });

  it('names a count kept from before lines were kept by its label\'s line', () => {
    const t = reportTemplate({ coordinate, counts: [{ id: 'kits', label: 'Kits placed' }], values: { kits: 1 }, day: '2026-10-16', salt });
    expect(JSON.parse(t.content).counts).toEqual([{ line: 'Kits placed: a count', n: 1 }]);
  });

  it('salts every report afresh: 32 lowercase hex, never the same twice', () => {
    const a = JSON.parse(reportTemplate({ coordinate, counts, values: { kits: 1 }, day: '2026-10-16' }).content).salt;
    const b = JSON.parse(reportTemplate({ coordinate, counts, values: { kits: 1 }, day: '2026-10-16' }).content).salt;
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(b).not.toBe(a);
    expect(newSalt()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('says the day in UTC', () => {
    expect(dayOf(Date.parse('2026-10-16T23:59:00-05:00'))).toBe('2026-10-17');
  });
});

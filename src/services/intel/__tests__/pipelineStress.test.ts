/**
 * Adversarial pass over the Navcom boundary.
 *
 * The coordinate mask was written against ONE way of writing a position —
 * a decimal pair. This asks what else an operator actually types, because a
 * mask that covers one notation and is described as "position stays internal"
 * is more dangerous than no mask: it converts a known gap into a believed
 * guarantee.
 */
import { describe, it, expect } from 'vitest';
import { buildMissionPackageManifest } from '../MissionPackageBuilder';
import { MissionStatus } from '../../../types/intel/MissionUI';
import type { MissionUI } from '../../../types/intel/MissionUI';

const mission = (o: Partial<MissionUI> = {}): MissionUI => ({
  id: 'm1', missionNumber: 'MSN-2026-0001', title: 'T', briefing: 'B',
  status: MissionStatus.READY_FOR_PACKAGE, objectives: [], assignedTo: [],
  startDate: new Date().toISOString(), relatedReports: [], relatedCases: [],
  collaborators: [], activityLog: [],
  createdBy: 'pk', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  ...o,
} as MissionUI);

const crosses = (briefing: string): string =>
  buildMissionPackageManifest(mission({ briefing })).description ?? '';

describe('Navcom boundary — coordinate notations an operator might actually type', () => {
  it('masks the decimal pair it was designed for', () => {
    expect(crosses('At 52.52, 13.405 tonight')).not.toContain('52.52');
  });

  it('masks a slash-separated pair', () => {
    expect(crosses('At 52.52 / 13.405 tonight')).not.toContain('52.52');
  });

  it('masks a semicolon-separated pair', () => {
    expect(crosses('At 52.52; 13.405 tonight')).not.toContain('52.52');
  });

  const masked: Array<[string, string, string]> = [
    ['degrees-minutes-seconds', 'Meet at 52°31\'12"N 13°24\'18"E', '52°31'],
    ['space-separated pair', 'Grid 52.5200 13.4050 at dusk', '52.5200'],
    ['labelled lat/lon', 'lat: 52.52 lon: 13.405', '52.52'],
    ['newline-separated', 'Coordinates:\n52.52\n13.405', '52.52'],
  ];
  for (const [label, briefing, needle] of masked) {
    it(`masks ${label}`, () => {
      const out = crosses(briefing);
      expect(out).not.toContain(needle);
      expect(out).toContain('[redacted:position]');
    });
  }

  const stillCrosses: Array<[string, string, string]> = [
    ['a plus code', 'Location 9F4MGCFX+8Q', '9F4MGCFX+8Q'],
    ['a short grid reference', 'Grid 33UUU90001800', '33UUU90001800'],
    ['a place name', 'Meet at the Reichstag', 'Reichstag'],
  ];
  for (const [label, briefing, needle] of stillCrosses) {
    it(`KNOWN GAP: ${label} still crosses`, () => {
      expect(crosses(briefing)).toContain(needle);
    });
  }

  it('leaves ordinary figures alone — the range check is what bounds the mask', () => {
    // Widening the separators must not widen the collateral damage.
    const out = crosses('Budget 4500.75 over 12 days; ref MSN-2026-0001; 99.5% uptime, 3.2 hours');
    expect(out).toContain('4500.75');
    expect(out).toContain('MSN-2026-0001');
    expect(out).toContain('99.5');
    expect(out).toContain('3.2');
    expect(out).not.toContain('[redacted:position]');
  });
});

describe('the evidentiary void, recorded so it cannot be forgotten', () => {
  it('a mission with no reports, no cases and no objectives still packages cleanly', () => {
    // Not a bug in the builder — the builder is doing what it is told. It is
    // the record that nothing upstream requires a mission to rest on anything,
    // and that a published package therefore asserts nothing about evidence.
    const manifest = buildMissionPackageManifest(mission({
      title: 'Act on nothing', briefing: 'No evidence was gathered for this.',
    }));

    expect(manifest.metadata?.relatedReportCount).toBe(0);
    expect(manifest.metadata?.relatedCaseCount).toBe(0);
    expect(manifest.metadata?.objectiveCount).toBe(0);
    // It is a complete, checksummed, publishable manifest regardless.
    expect(manifest.reports[0].checksum).toBeTruthy();
  });
});

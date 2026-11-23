/**
 * Mecha Jono's `psi_` families, read from their build kit's own fixtures (decision D-PW; `kit/schemas_psi.md`).
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { loadPsiKit } from '../kitFixtures';
import {
  PSI_SIGNER, readAlert, readBrief, readField, readLedger, readRegistration, readScryResult, readSkyEvent, readWindowNote, refusalOf,
} from '../psiEvents';

describe("the kit's PsiOps fixtures", () => {
  it('loads every family the kit sends, each signed by the new key', async () => {
    const kit = await loadPsiKit({ samples: true });
    expect(new Set(kit.map((f) => f.family))).toEqual(new Set([
      'psi_sky_event', 'psi_field', 'psi_brief', 'psi_registration', 'psi_scry_result', 'psi_ledger', 'psi_alert', 'psi_window', 'psi_mission_package',
    ]));
    expect(kit.every((f) => f.event.pubkey === PSI_SIGNER)).toBe(true);
    expect(kit.filter((f) => f.family === 'psi_sky_event')).toHaveLength(9);
  });

  it('refuses a psi note signed by any other key, the exposed old one included', async () => {
    const [first] = await loadPsiKit({ samples: true });
    expect(refusalOf({ ...first.event, pubkey: '6301c4d0' + '0'.repeat(56) })).toBe('not-our-key');
    expect(refusalOf({ ...first.event, tags: [['t', 'starcom_intel']] })).toBe('not-psi');
  });

  it('reads a sky event: its words, the classic word beside the plain one, its bodies and its window', async () => {
    const kit = await loadPsiKit({ samples: true });
    const moon = readSkyEvent(kit.find((f) => f.file === 'psi_sky_event.aspect.moon.json')!.event)!;
    expect(moon).toMatchObject({
      title: 'Moon and Mars at change (square)', sky: { class: 'aspect', sub: 'harmonic' }, bodies: ['Moon', 'Mars'],
      harmonic: { n: 4, k: 1, plain: 'change', classic: 'square', targetDeg: 270 }, exact: 1793067486.485,
    });
    expect(moon.window).toMatchObject({ from: 1793049048, peak: 1793067486, until: 1793085875 });
    const gc = readSkyEvent(kit.find((f) => f.file === 'psi_sky_event.ingress.sidereal_gc.json')!.event)!;
    expect(gc.frame).toEqual({ frame: 'sidereal_gc', from: 'Aries', to: 'Taurus', ayanamsa: 27.225022 });
  });

  it('reads the field: each channel as given, a class kept as words, a percentile only where computed', async () => {
    const kit = await loadPsiKit({ samples: true });
    const field = readField(kit.find((f) => f.family === 'psi_field')!.event);
    expect(field.channels.map((c) => c.id)).toEqual([
      'kp', 'kp_1m', 'sw_speed', 'imf_bz', 'imf_bt', 'xray_max_24h', 'flare', 'aurora_max_north', 'aurora_max_south', 'aurora_lowlat_north', 'sw_active_source', 'beacon_egg',
    ]);
    expect(field.channels[0]).toMatchObject({ value: '2.0', unit: 'Kp', percentile: 55, history: '1932-2026 (GFZ Potsdam, CC BY 4.0)' });
    expect(field.channels.find((c) => c.id === 'flare')).toMatchObject({ value: 'B8.4', unit: 'class' });
    expect(field.channels.find((c) => c.id === 'kp_1m')!.percentile).toBeUndefined();
  });

  it('reads the daily note by its headings, the registration as sealed, the ledger, a result, an alert and a window', async () => {
    const kit = await loadPsiKit({ samples: true });
    const of = (family: string) => kit.find((f) => f.family === family)!.event;
    const brief = readBrief(of('psi_brief'));
    expect(brief.sections.map((s) => s.heading)).toEqual(['Sky, next 72 h', 'Field']);
    expect(brief.points).toHaveLength(5);
    expect(readRegistration(of('psi_registration'))).toMatchObject({ id: 'PSI-0002', rung: '0', sealedAt: '2026-10-26T08:35:00+00:00' });
    expect(readLedger(of('psi_ledger')).counts).toEqual({ registered: 3, scored: 1, met: 0, missed: 1 });
    expect(readScryResult(of('psi_scry_result'))).toMatchObject({ verdict: 'missed', rr: { value: 1.07, low: 0.98, high: 1.17 } });
    expect(readAlert(of('psi_alert'))).toMatchObject({ zone: { id: 'zone:sahel', name: 'Sahel Zone' }, state: 'live' });
    expect(readWindowNote(of('psi_window'))).toMatchObject({ zones: [{ id: 'zone:sahel', name: 'Sahel Zone' }], jurisdictions: ['SD'], state: 'armed' });
  });
});


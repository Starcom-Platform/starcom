/**
 * What is new since a moment (plan H10; the owner's pick of 25 Oct, "both sides"): Space Weather from SWPC's issued
 * messages and DONKI's CMEs, Resources from EIA's yearly series, each item with its time and source, and each source
 * saying how far back it reaches, so a count is never read as complete when it is not.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { whatsNewSince, whatsNewWindow, WHATS_NEW_MAX_DAYS, type WhatsNewFeeds } from '../whatsNew';
import type { CmeSeen } from '../../../../services/spaceWeather/donki';

const H = 3_600_000;
const UNTIL = Date.UTC(2026, 9, 26, 0, 0);
const FROM = UNTIL - 48 * H;

const alert = (productId: string, issuedAt: number, headline: string) => ({ productId, issuedAt: new Date(issuedAt).toISOString(), headline });
const cme = (id: string, startTime: number, measured: Partial<NonNullable<CmeSeen['cme']>> | null): CmeSeen => ({
  id, startTime, link: `https://ccmc.gsfc.nasa.gov/DONKI/view/CME/${id}`,
  cme: measured ? { id, leftAt: startTime + H, speed: 812.4, halfAngle: 40, lat: 0, lon: 0, type: 'C', link: '', earth: { kind: 'unmodelled' }, ...measured } : null,
});

const feeds = (over: Partial<WhatsNewFeeds> = {}): WhatsNewFeeds => ({
  alerts: async () => [
    alert('K05A', UNTIL - 2 * H, 'ALERT: Geomagnetic K-index of 5'),
    alert('WATA50', UNTIL - 30 * H, 'WATCH: Geomagnetic Storm Category G1 Predicted'),
    alert('K04A', FROM - 5 * H, 'ALERT: Geomagnetic K-index of 4'),
  ],
  cmes: async () => [
    cme('CME-A', UNTIL - 10 * H, { earth: { kind: 'arrives', at: Date.UTC(2026, 9, 27, 14), glancing: true, modelledAt: UNTIL - 4 * H, link: '' } }),
    cme('CME-B', UNTIL - 3 * H, null),
    cme('CME-OLD', FROM - H, { earth: { kind: 'misses', modelledAt: FROM, link: '' } }),
  ],
  energy: async () => ({
    oil: { name: 'Crude oil including lease condensate production', unit: 'thousand barrels per day', year: 2025, values: { USA: 1 }, via: 'record', written: new Date(UNTIL - 20 * H).toISOString() },
    gas: { name: 'Dry natural gas production', unit: 'billion cubic feet', year: 2024, values: { USA: 1 }, via: 'file', written: '2026-09-30T00:00:00.000Z' },
  }),
  ...over,
});

describe('whatsNewWindow', () => {
  it('takes whole unix seconds, until defaulting to now', () => {
    expect(whatsNewWindow(FROM / 1000, undefined, UNTIL)).toEqual({ from: FROM, until: UNTIL });
    expect(whatsNewWindow(FROM / 1000, (UNTIL - H) / 1000, UNTIL)).toEqual({ from: FROM, until: UNTIL - H });
  });

  it('refuses a moment that is not whole seconds, not before until, or further back than the feeds are asked', () => {
    expect(() => whatsNewWindow('yesterday', undefined, UNTIL)).toThrow(/whole unix seconds/);
    expect(() => whatsNewWindow(FROM / 1000 + 0.5, undefined, UNTIL)).toThrow(/whole unix seconds/);
    expect(() => whatsNewWindow(UNTIL / 1000, undefined, UNTIL)).toThrow(/before/);
    expect(() => whatsNewWindow((UNTIL - (WHATS_NEW_MAX_DAYS + 1) * 24 * H) / 1000, undefined, UNTIL)).toThrow(/31 days/);
  });
});

describe('whatsNewSince: Space Weather', () => {
  it('lists the messages SWPC issued and the CMEs DONKI saw after the moment, newest first', async () => {
    const { layers } = await whatsNewSince({ from: FROM, until: UNTIL }, feeds());
    const sw = layers.find((l) => l.layer === 'SpaceWeather')!;
    expect(sw.count).toBe(4);
    expect(sw.items.map((i) => i.title)).toEqual([
      'ALERT: Geomagnetic K-index of 5',
      'Coronal mass ejection, not measured yet',
      'Coronal mass ejection, 812 km/s, modelled to reach the Earth 27 Oct 14:00Z, a glancing blow',
      'WATCH: Geomagnetic Storm Category G1 Predicted',
    ]);
    expect(sw.items[0]).toMatchObject({ id: `swpc:K05A:${new Date(UNTIL - 2 * H).toISOString()}`, kind: 'alert', time: { basis: 'written' }, source: 'NOAA SWPC' });
    expect(sw.items[1]).toMatchObject({ id: 'CME-B', kind: 'cme', time: { iso: new Date(UNTIL - 3 * H).toISOString(), basis: 'event' }, link: 'https://ccmc.gsfc.nasa.gov/DONKI/view/CME/CME-B' });
    expect(sw.items[3].kind).toBe('watch');
  });

  it('reads SWPC\'s kind past the words it puts first: CONTINUED, EXTENDED, CANCEL', async () => {
    const at = UNTIL - H;
    const kinds = (await whatsNewSince({ from: FROM, until: UNTIL }, feeds({ alerts: async () => [
      alert('EF3A', at, 'CONTINUED ALERT: Electron 2MeV Integral Flux exceeded 1,000pfu'),
      alert('WARK05', at - 1, 'EXTENDED WARNING: Geomagnetic K-index of 5 expected'),
      alert('WARK04', at - 2, 'CANCEL WARNING: Geomagnetic K-index of 4 expected'),
      alert('PRESAF', at - 3, 'Space Weather Advisory Bulletin #25-12'),
      alert('K04A', FROM - H, 'ALERT: Geomagnetic K-index of 4'),
    ], cmes: async () => [] }))).layers[0].items.map((i) => i.kind);
    expect(kinds).toEqual(['alert', 'warning', 'warning', 'message']);
  });

  it('is complete when every source was read and reaches back to the moment', async () => {
    const sw = (await whatsNewSince({ from: FROM, until: UNTIL }, feeds())).layers.find((l) => l.layer === 'SpaceWeather')!;
    expect(sw.complete).toBe(true);
    expect(sw.sources[0]).toMatchObject({ read: 'ok', reachesBack: new Date(FROM - 5 * H).toISOString() });
  });

  it('says so when SWPC\'s list begins after the moment: what it held, and from when', async () => {
    const sw = (await whatsNewSince({ from: FROM - 10 * H, until: UNTIL }, feeds())).layers.find((l) => l.layer === 'SpaceWeather')!;
    expect(sw.complete).toBe(false);
    expect(sw.sources[0].reachesBack).toBe(new Date(FROM - 5 * H).toISOString());
  });

  it('keeps what one source gave when the other cannot be read, and says why', async () => {
    const sw = (await whatsNewSince({ from: FROM, until: UNTIL }, feeds({ cmes: async () => { throw new Error('DONKI answered 503'); } }))).layers[0];
    expect(sw.complete).toBe(false);
    expect(sw.count).toBe(2);
    expect(sw.sources[1].read).toBe('not read: DONKI answered 503');
  });
});

describe('whatsNewSince: Resources', () => {
  it('lists the EIA series whose figures were written after the moment, with the year they are for', async () => {
    const res = (await whatsNewSince({ from: FROM, until: UNTIL }, feeds())).layers.find((l) => l.layer === 'ResourceZones')!;
    expect(res).toMatchObject({ count: 1, complete: true });
    expect(res.items[0]).toMatchObject({
      id: 'eia:oil:2025', kind: 'figures', title: 'Crude oil including lease condensate production, 2025 figures (thousand barrels per day)',
      time: { basis: 'written' }, source: 'EIA, as posted on The Record',
    });
    expect(res.note).toMatch(/yearly/);
  });

  it('says plainly when nothing is new, and is not complete when neither The Record nor the file answered', async () => {
    const none = (await whatsNewSince({ from: UNTIL - H, until: UNTIL }, feeds())).layers.find((l) => l.layer === 'ResourceZones')!;
    expect(none).toMatchObject({ count: 0, items: [], complete: true });
    const unread = (await whatsNewSince({ from: FROM, until: UNTIL }, feeds({ energy: async () => ({}) }))).layers.find((l) => l.layer === 'ResourceZones')!;
    expect(unread.complete).toBe(false);
    expect(unread.sources[0].read).toMatch(/not read/);
  });
});

describe('whatsNewSince', () => {
  it('says the moment and its end as ISO, and names no publisher', async () => {
    const answer = await whatsNewSince({ from: FROM, until: UNTIL }, feeds());
    expect(answer).toMatchObject({ since: new Date(FROM).toISOString(), until: new Date(UNTIL).toISOString() });
    expect(JSON.stringify(answer)).not.toMatch(/Mecha Jono|Archangel/);
  });
});

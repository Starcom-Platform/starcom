/**
 * Starcom's deeplink v1 (decision RW8; globe record, section 19, Phase 1 step
 * 5): the grammar Mecha Jono's links use, read as they read it. Their 21
 * vectors, kept beside the record, are run here as they run them, so both
 * sides read every link the same way. The builder is the parser's inverse: a
 * card's `provenance.link` must read back as the view it was made from.
 *
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseDeeplink, deeplinkSearch, type Deeplink } from '../deeplinkV1';

const KEPT = resolve(__dirname, '../../../docs/missions/01-architecture-decisions/raver-watch/deeplink_v1_vectors.json');
const { vectors } = JSON.parse(readFileSync(KEPT, 'utf8')) as { vectors: Array<{ name: string; url: string; expect: Deeplink }> };
const search = (url: string) => new URL(url).search;
const PK = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';

describe('deeplink v1, read', () => {
  it("opens AI Watch with its sections pinned (D-AW)", () => {
    const link = parseDeeplink('?mode=AIWatch&sub=AiFrontier&pin=AiIncidents,AiWar,AiSafety');
    expect(link.mode).toBe('AIWatch');
    expect(link.sub).toBe('AiFrontier');
    expect(link.pins).toEqual(['AiIncidents', 'AiWar', 'AiSafety']);
  });

  it("opens Missions, with Hero Watch's field missions pinned beside it (D-MF, step 5)", () => {
    const link = parseDeeplink('?mode=Missions&sub=OpenMissions&pin=FieldMissions');
    expect(link.mode).toBe('Missions');
    expect(link.sub).toBe('OpenMissions');
    expect(link.pins).toEqual(['FieldMissions']);
  });

  it('has all 21 of their vectors to run', () => {
    expect(vectors).toHaveLength(21);
  });

  it.each(vectors.map((v) => [v.name, v] as const))('%s', (_name, vector) => {
    expect(parseDeeplink(search(vector.url))).toEqual(vector.expect);
  });

  it('reads Hero Watch\'s sections, and still never pins RLSH, now that it is one of them (D-HW)', () => {
    const link = parseDeeplink('?v=1&sub=Lifeboats&pin=RLSH,SpaceWeather');
    expect([link.mode, link.sub, link.pins]).toEqual(['HeroWatch', 'Lifeboats', ['SpaceWeather']]);
    expect(parseDeeplink('?v=1&sub=RLSH').mode).toBe('HeroWatch');
  });

  it('pins at most four layers, the first four it can use', () => {
    expect(parseDeeplink('?v=1&sub=IntelReports&pin=Satellites,CommHubs,SpaceWeather,EarthWeather,ConflictZones').pins)
      .toEqual(['Satellites', 'CommHubs', 'SpaceWeather', 'EarthWeather']);
  });

  it('keeps four pins when a featured report moves the asked-for layer among them', () => {
    const link = parseDeeplink(`?v=1&sub=SpaceWeather&pin=Satellites,CommHubs,EarthWeather,ConflictZones&focus=${'a'.repeat(64)}`);
    expect(link.sub).toBe('IntelReports');
    expect(link.pins).toEqual(['SpaceWeather', 'Satellites', 'CommHubs', 'EarthWeather']);
  });

  it('takes a bare event id as a report id, and nothing that is not one', () => {
    expect(parseDeeplink(`?focus=${'b'.repeat(64)}`).focus).toBe('b'.repeat(64));
    expect(parseDeeplink(`?focus=${'B'.repeat(64)}`).focus).toBeNull();
    expect(parseDeeplink(`?focus=30023:${PK}:${'x'.repeat(201)}`).focus).toBeNull();
  });

  // A Hero Watch field mission is a mission package (D-HW, step 7), addressed by kind 30079.
  it('takes a field mission\'s address, and opens it on the Hero Watch section that draws it', () => {
    const address = `30079:${PK}:starcom_mission_package_field-naloxone-NM`;
    const link = parseDeeplink(`?v=1&sub=FieldMissions&focus=${address}`);
    expect(link).toMatchObject({ focus: address, sub: 'FieldMissions', mode: 'HeroWatch' });
    for (const sub of ['Lifeboats', 'Relief'] as const) {
      expect(parseDeeplink(`?v=1&sub=${sub}&focus=30023:${PK}:hero-watch-x`)).toMatchObject({ sub, mode: 'HeroWatch' });
    }
    // A Raver Watch scene event, featured on Scene events (Interchange 3.7: any of their addresses).
    const scene = `31923:${PK}:raver-scene-event-19hz-abc123`;
    expect(parseDeeplink(`?v=1&sub=SceneEvents&focus=${scene}`)).toMatchObject({ focus: scene, sub: 'SceneEvents', mode: 'RaverWatch' });
    // Other kinds stay out: a link carries a report, an item or a mission, nothing else.
    expect(parseDeeplink(`?focus=1:${PK}:x`).focus).toBeNull();
    expect(parseDeeplink(`?focus=30078:${PK}:mecha-jono:interchange`).focus).toBeNull();
  });

  // War & Conflict lists and features its own items, as Raver Watch and Hero Watch do: a link to one
  // opened Intel Reports in Intel Watch, which never draws them, with War & Conflict pinned beside it.
  it('opens a War & Conflict item on War & Conflict, in its own mode', () => {
    const address = `30023:${PK}:starcom-intel-conflict-easa-b582f0c184d60e5f`;
    expect(parseDeeplink(`?v=1&sub=WarConflict&pin=ConflictZones&focus=${address}`))
      .toMatchObject({ focus: address, sub: 'WarConflict', mode: 'GeoPolitical', pins: ['ConflictZones'] });
  });

  it('reads a window only in whole seconds, and never a negative one', () => {
    expect(parseDeeplink('?win=10.5..20').win).toBeNull();
    expect(parseDeeplink('?win=-10..20').win).toBeNull();
    expect(parseDeeplink('?win=0..1').win).toEqual({ from: 0, until: 1 });
  });

  // Version 2 adds the look (deeplinkV2.test); a version it does not know is unstated, and the link still reads.
  it('reads only the versions it knows as stated', () => {
    expect(parseDeeplink('?v=3&sub=Satellites')).toMatchObject({ v: null, sub: 'Satellites' });
  });
});

describe('deeplink v1, written', () => {
  it.each(vectors.map((v) => [v.name, v] as const))('reads back as it was written: %s', (_name, vector) => {
    const { v: _v, ...rest } = vector.expect;
    const { v: again, ...back } = parseDeeplink(deeplinkSearch(vector.expect));
    expect(back).toEqual(rest);
    expect(again).toBe(1);
  });

  it('writes the smallest link that reads back the same', () => {
    expect(deeplinkSearch({ v: 1, sub: 'DrugCheckAlerts', mode: 'RaverWatch', at: { lat: 48.2, lng: 16.4, alt: 1.3 }, pins: [], focus: null, win: null }))
      .toBe('?v=1&sub=DrugCheckAlerts&at=48.2,16.4,1.3');
  });
});

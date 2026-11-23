/**
 * The source register (D-CS, CS1–CS3) holds every source the app draws on. A host the browser was seen contacting,
 * or a data file baked into the build, that no entry names fails here, so the register cannot fall behind the app.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCE_REGISTER } from '../sourceRegister';

/** Every host the network census saw a visitor's browser contact, every mode, sub-mode and app (11 Nov 2026). */
const CENSUS_2026_11_11 = [
  'air-quality-api.open-meteo.com', 'api.fbi.gov', 'api.open-meteo.com', 'api.unhcr.org', 'api.worldbank.org', 'blackpi.cosmiccodex.app',
  'ccmc.gsfc.nasa.gov', 'celestrak.org', 'earthquake.usgs.gov', 'eonet.gsfc.nasa.gov', 'mecha.jono.archangel.agency', 'navcom.app',
  'noaa-gfs-bdp-pds.s3.amazonaws.com', 'nos.lol', 'nostr.mom', 'raw.githubusercontent.com', 'record.cosmiccodex.app', 'relay.damus.io',
  'relay.primal.net', 'relay.wellorder.net', 'rewardsforjustice.net', 'sanctionslistservice.ofac.treas.gov', 'services.swpc.noaa.gov',
  'www.gdacs.org', 'www.seismicportal.eu',
];

// A folder a clone lacks holds nothing to register: the public repository holds back the volcano catalogue, and git
// keeps no empty folder.
const bakedFiles = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir) : []).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return [path];
  return name.endsWith('.json') ? [path] : [];
});

describe('the source register', () => {
  it('names every host the census saw the browser contact', () => {
    const named = new Set(SOURCE_REGISTER.flatMap((s) => s.hosts));
    expect(CENSUS_2026_11_11.filter((host) => !named.has(host))).toEqual([]);
  });

  it('names every data file baked into the build', () => {
    const named = new Set(SOURCE_REGISTER.flatMap((s) => s.files ?? []));
    const covered = (path: string) => [...named].some((f) => f === path || f.startsWith(`${path}/`) || path.startsWith(`${f}/`));
    // public/eco-natural too: the volcano catalogue sat there unregistered until 22 Nov 2026.
    expect([...bakedFiles('public/data'), ...bakedFiles('public/eco-natural')].filter((path) => !covered(path))).toEqual([]);
  });

  it('gives every entry a unique id, its licence, when its terms were read, and a status', () => {
    const ids = SOURCE_REGISTER.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SOURCE_REGISTER) {
      expect(s.licence.trim().length, s.id).toBeGreaterThan(0);
      expect(s.terms.read, s.id).toMatch(/^(\d{4}-\d{2}-\d{2}|unread|not applicable)$/);
      // A status other than unread rests on terms that were read.
      if (s.commercial !== 'unread' && s.commercial !== 'infrastructure') expect(s.terms.read, s.id).not.toBe('unread');
    }
  });
});

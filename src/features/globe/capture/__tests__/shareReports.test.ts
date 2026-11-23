/**
 * Featuring one report in a capture (decision D-F, section 18, item 2).
 *
 * What an agent can learn about the reports on the globe, where the camera
 * goes to show them, and what a card says about the one it features. The rules
 * that bind all three are Mecha Jono's and this project's: RLSH is people and is
 * never listed, nothing is framed below one globe radius, and a position is
 * never handed out finer than it was placed.
 */
import { describe, it, expect } from 'vitest';
import {
  SHARE_ALTITUDE_FLOOR, SHARE_ALTITUDE_CEILING,
  listShareReports, roundedForSharing, altitudeToFit, frameForReports,
  describeAuthor, featuredReportFor,
} from '../shareReports';
import { groupReportsByPlace } from '../../../../components/Globe/reportPlaces';
import type { IntelReportOverlayMarker } from '../../../../interfaces/IntelReportOverlay';

const HEX = 'a'.repeat(64);
const report = (over: Partial<IntelReportOverlayMarker> = {}): IntelReportOverlayMarker => ({
  pubkey: 'evt1', title: 'Grant closes Friday', content: '', tags: ['nostr', 'relay:wss://relay.example'],
  latitude: 39.7392, longitude: -104.9903, timestamp: Date.parse('2026-09-24T12:00:00Z'),
  timeBasis: 'written', author: HEX, ...over,
});

describe('listShareReports', () => {
  it('lists every drawn report, including each one at a crowded place', () => {
    const places = groupReportsByPlace([report(), report({ pubkey: 'evt2' }), report({ pubkey: 'evt3', latitude: 40.7 })]);
    const listed = listShareReports(places);
    expect(listed.map((r) => r.id).sort()).toEqual(['evt1', 'evt2', 'evt3']);
    expect(listed.find((r) => r.id === 'evt1')!.sharesPlaceWith).toBe(1);
  });

  it('never lists an RLSH entity, which is a person', () => {
    const places = groupReportsByPlace([report(), report({ pubkey: 'hero', kind: 'rlsh', latitude: 10 })]);
    expect(listShareReports(places).map((r) => r.id)).toEqual(['evt1']);
  });

  it('says what the variant means, not only its name', () => {
    const [listed] = listShareReports(groupReportsByPlace([report({ tags: ['critical'] })]));
    expect(listed.variant).toBe('critical');
    expect(listed.variantMeans).toBe('critical');
    const [raw] = listShareReports(groupReportsByPlace([report()]));
    expect(raw.variantMeans).toBe('not assessed');
  });

  it('never gives a position finer than a tenth of a degree', () => {
    const [listed] = listShareReports(groupReportsByPlace([report({ geoPrecisionM: 5 })]));
    expect(listed.lat).toBe(39.7);
    expect(listed.lng).toBe(-105);
  });

  it('says which time it is: when it happened, or only when it was written', () => {
    const [written] = listShareReports(groupReportsByPlace([report()]));
    expect(written.time).toEqual({ iso: '2026-09-24T12:00:00.000Z', basis: 'written' });
    const [event] = listShareReports(groupReportsByPlace([report({ timeBasis: 'event' })]));
    expect(event.time?.basis).toBe('event');
  });
});

describe('roundedForSharing', () => {
  it('rounds to what the stated precision supports, and never finer than 0.1°', () => {
    expect(roundedForSharing(39.7392, -104.9903, undefined)).toEqual({ lat: 39.7, lng: -105 });
    expect(roundedForSharing(39.7392, -104.9903, 80_000)).toEqual({ lat: 40, lng: -105 });
  });
});

describe('altitudeToFit', () => {
  const view = { fovDeg: 50, frameAspect: 1.6, cardAspect: 1.91 };

  it('never frames below one globe radius, however close the reports are', () => {
    expect(SHARE_ALTITUDE_FLOOR).toBe(1);
    expect(altitudeToFit([{ lat: 39.7, lng: -105 }], { lat: 39.7, lng: -105 }, view)).toBe(SHARE_ALTITUDE_FLOOR);
  });

  it('pulls back to fit reports spread across a continent', () => {
    const us = [{ lat: 47.6, lng: -122.3 }, { lat: 25.8, lng: -80.2 }, { lat: 40.7, lng: -74 }, { lat: 32.7, lng: -117.2 }];
    const centre = frameForReports(us, view)!;
    expect(centre.altitude).toBeGreaterThan(SHARE_ALTITUDE_FLOOR);
    expect(centre.altitude).toBeLessThanOrEqual(SHARE_ALTITUDE_CEILING);
  });

  it('fits a wider card with less pulling back than a square one needs vertically', () => {
    const tall = [{ lat: 60, lng: -100 }, { lat: 20, lng: -100 }];
    const centre = { lat: 40, lng: -100 };
    const square = altitudeToFit(tall, centre, { ...view, cardAspect: 1 });
    const wide = altitudeToFit(tall, centre, view);
    // A wide card is cut from the frame's middle, so a north-south spread needs MORE room.
    expect(wide).toBeGreaterThan(square);
  });
});

describe('frameForReports', () => {
  it('centres on the reports on the sphere, not on the average of their numbers', () => {
    const across = [{ lat: 10, lng: 170 }, { lat: 10, lng: -170 }];
    const framed = frameForReports(across, { fovDeg: 50, frameAspect: 1.6, cardAspect: 1.91 })!;
    expect(Math.abs(framed.lng)).toBeGreaterThan(179);
  });

  it('refuses reports that have no one side of the planet to look at', () => {
    const around = [{ lat: 0, lng: 0 }, { lat: 0, lng: 180 }];
    expect(frameForReports(around, { fovDeg: 50, frameAspect: 1.6, cardAspect: 1.91 })).toBeNull();
  });

  it('refuses an empty set', () => {
    expect(frameForReports([], { fovDeg: 50, frameAspect: 1.6, cardAspect: 1.91 })).toBeNull();
  });
});

describe('describeAuthor', () => {
  it('names a Nostr key as a shortened npub', () => {
    expect(describeAuthor(HEX)).toMatch(/^npub1[a-z0-9]{6}…[a-z0-9]{4}$/);
  });

  it('does not dress up an author that is not a key', () => {
    expect(describeAuthor('nostr')).toBe('an unnamed author');
    expect(describeAuthor('Analyst 7')).toBe('Analyst 7');
  });
});

describe('featuredReportFor', () => {
  it('describes a report received from a relay as a signed event checked on intake', () => {
    const featured = featuredReportFor(report())!;
    expect(featured.title).toBe('Grant closes Friday');
    expect(featured.lines.join('\n')).toMatch(/not assessed/);
    expect(featured.lines.join('\n')).toMatch(/2026-09-24 12:00Z/);
    expect(featured.lines.join('\n')).toMatch(/Written .*when it happened was not stated/);
    expect(featured.lines.join('\n')).toMatch(/signed Nostr event.*checked on intake/i);
    expect(featured.lines.join('\n')).toMatch(/relay\.example/);
  });

  it('says a report made on this device is not signed', () => {
    const featured = featuredReportFor(report({ tags: [] }))!;
    expect(featured.lines.join('\n')).toMatch(/not signed/i);
    expect(featured.lines.join('\n')).not.toMatch(/checked on intake/i);
  });

  it('states the precision the report was placed to, and says so when none was stated', () => {
    expect(featuredReportFor(report({ geoPrecisionM: 30_000 }))!.lines.join('\n')).toMatch(/placed to within 30 km/);
    expect(featuredReportFor(report())!.lines.join('\n')).toMatch(/precision not stated/);
  });

  it('refuses an RLSH entity', () => {
    expect(featuredReportFor(report({ kind: 'rlsh' }))).toBeNull();
  });

  it('keeps the position on the card no finer than the list gives it', () => {
    const featured = featuredReportFor(report({ geoPrecisionM: 5 }))!;
    expect(featured.position).toEqual({ lat: 39.7392, lng: -104.9903 });
    expect(featured.lines.join('\n')).not.toMatch(/39\.73/);
  });
});

/*
 * The card's one claim that is not read off the report: that a relay report's
 * signature was checked on intake. The intake builds its pool with
 * createRelayPool, a nostr-tools SimplePool whose verifier is left alone, and
 * relayPool.test.ts sends it a forged event and checks nothing sees it. So the
 * intake is held to building its pool there and passing no verifier of its
 * own; if either changes, this fails and the card's sentence has to be
 * re-earned.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('the signature claim on a featured card', () => {
  it('rests on an intake pool that verifies signatures', () => {
    const source = readFileSync(resolve(__dirname, '../../../../services/intel/NostrStarcomIntelIngest.ts'), 'utf8');
    expect(source).toMatch(/createRelayPool\(\)/);
    expect(source).not.toMatch(/new \w*\.?SimplePool\(/);
    expect(source).not.toMatch(/verifyEvent\s*:/);
    const pool = readFileSync(resolve(__dirname, '../../../../services/nostr/relayPool.ts'), 'utf8');
    expect(pool).not.toMatch(/verifyEvent/);
  });
});

/**
 * A stated coordinate beats a derived one.
 *
 * Starcom's own network publishes intel as a JSON report envelope —
 * {"title":…, "ipfsCid":…, "lat":38.9072, "lon":-77.0369} — which is not
 * GeoJSON, so parseGeoJSON found nothing in it and the only feature came from
 * the `g` geohash tag. Measured on a live event pulled from nos.lol, that
 * geohash resolved to 38.90533, -77.04163: roughly 200m from what the
 * publisher actually said.
 *
 * That is the globe's own rule inverted. globeIntelLayer refuses to jitter
 * coincident marks because position IS the claim; silently substituting an
 * approximation for a stated position is the same error at a different scale.
 */
import { describe, it, expect } from 'vitest';
import { parseEvent } from '../parser';
import { GEOINT_DEFAULT_CONFIG } from '../types';
import type { NostrEvent } from '../types';

const cfg = { ...GEOINT_DEFAULT_CONFIG, maxFeaturesPerCollection: 10 };

/** Shaped exactly like a real published Starcom intel event. */
const event = (over: Partial<NostrEvent> = {}): NostrEvent => ({
  id: 'evt-1',
  pubkey: 'a'.repeat(64),
  created_at: Math.floor(Date.parse('2026-06-01T00:00:00.000Z') / 1000),
  kind: 30023,
  tags: [['t', 'starcom_intel'], ['g', 'dqcjqf']],
  content: '{"title":"Cross-Node Verification","ipfsCid":"QmX","visibility":"public","lat":38.9072,"lon":-77.0369}',
  sig: 's',
  ...over,
} as NostrEvent);

describe('stated vs derived coordinates', () => {
  it('uses the coordinate the publisher stated, not the geohash', () => {
    const out = parseEvent(event(), cfg);

    expect(out.features).toHaveLength(1);
    expect(out.features[0].geometry).toEqual({ lat: 38.9072, lon: -77.0369 });
  });

  it('records that the coordinate was stated, not approximated', () => {
    // A reader cannot judge a pin without knowing whether it was claimed or
    // computed, and on a 3D Earth the two look identical.
    expect(parseEvent(event(), cfg).features[0].props.geoSource).toBe('content');
  });

  it('falls back to the geohash when the content states no coordinate', () => {
    const out = parseEvent(event({ content: '{"title":"No coords","ipfsCid":"QmX"}' }), cfg);

    expect(out.features).toHaveLength(1);
    expect(out.features[0].props.geoSource).toBe('geohash');
    expect(out.features[0].geometry).not.toEqual({ lat: 38.9072, lon: -77.0369 });
  });

  it('ignores a content coordinate that is not a real number', () => {
    const out = parseEvent(event({ content: '{"title":"Bad","lat":"38.9","lon":null}' }), cfg);

    // Falls through to the geohash rather than coercing a string.
    expect(out.features[0].props.geoSource).toBe('geohash');
  });

  it('ignores content that is not JSON at all', () => {
    const out = parseEvent(event({ content: 'Just prose about a place.' }), cfg);

    expect(out.features[0].props.geoSource).toBe('geohash');
  });

  it('rejects a stated coordinate outside real bounds rather than drawing it', () => {
    const out = parseEvent(event({
      content: '{"lat":999,"lon":-77.0369}',
      tags: [['t', 'starcom_intel']],
    }), cfg);

    expect(out.features).toHaveLength(0);
  });
});

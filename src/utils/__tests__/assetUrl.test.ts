/**
 * A bundle that only runs from one origin is not an escape hatch.
 *
 * These pin the property that makes the IPFS build usable: static-asset paths
 * resolve relative to wherever the app was served from, not to the root of
 * whatever host is serving it.
 *
 * The failure this prevents is quiet. Under a gateway, fetch('/borders.geojson')
 * hits the GATEWAY's root and 404s, and a failed borders fetch produces an
 * emptier globe rather than an error — the layer just is not there.
 */
import { describe, it, expect } from 'vitest';
import { assetUrl } from '../assetUrl';

describe('assetUrl', () => {
  it('joins against the build base without doubling slashes', () => {
    // BASE_URL is '/' under vitest, matching the hosted build.
    expect(assetUrl('borders.geojson')).toBe('/borders.geojson');
    expect(assetUrl('/borders.geojson')).toBe('/borders.geojson');
  });

  it('never returns a path starting with a double slash', () => {
    // '//host' is protocol-relative and would leave the origin entirely.
    for (const p of ['/a.json', 'a.json', '///a.json']) {
      expect(assetUrl(p).startsWith('//')).toBe(false);
    }
  });

  it('handles nested paths', () => {
    expect(assetUrl('content-snapshots/latest.json')).toBe('/content-snapshots/latest.json');
  });
});

/**
 * Whether a relay a citation names is one this node already reads (D-MX,
 * MX23), however the citation wrote it.
 */
import { describe, it, expect } from 'vitest';
import { readsRelay, readRelays } from '../publishTargets';

describe('readsRelay', () => {
  it('knows a relay it reads, written with a trailing slash or in capitals', () => {
    const read = readRelays('MISSION')[0];
    expect(readsRelay('MISSION', read)).toBe(true);
    expect(readsRelay('MISSION', `${read.toUpperCase()}/`)).toBe(true);
  });

  it('knows a relay it does not read', () => {
    expect(readsRelay('MISSION', 'wss://somewhere-a-stranger-chose.example')).toBe(false);
  });
});

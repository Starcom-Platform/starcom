import { describe, it, expect } from 'vitest';
import { isCableActiveByYear } from './commHubsTemporal';

describe('isCableActiveByYear', () => {
  it('treats a real cable as active once the scrubbed year reaches its real rfsYear', () => {
    expect(isCableActiveByYear({ rfsYear: 2012 }, 2012)).toBe(true);
    expect(isCableActiveByYear({ rfsYear: 2012 }, 2020)).toBe(true);
  });

  it('treats a real cable as not yet active before its real rfsYear', () => {
    expect(isCableActiveByYear({ rfsYear: 2023 }, 2020)).toBe(false);
  });

  it('treats a cable with no known real rfsYear as not yet active at any scrubbed year — an honest unknown, not assumed pre-existing', () => {
    expect(isCableActiveByYear({ rfsYear: undefined }, 1990)).toBe(false);
    expect(isCableActiveByYear({ rfsYear: undefined }, 2026)).toBe(false);
  });
});

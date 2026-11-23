/** OTX stays off until LevelBlue grants it in writing (decision D-CS, CS9): its agreement bars displaying any of it. */
import { describe, it, expect } from 'vitest';
import { otxPermitted } from '../OTXEnrichmentService';

describe('otxPermitted', () => {
  it('is off until LevelBlue grants it in writing', () => {
    expect(otxPermitted()).toBe(false);
  });
});

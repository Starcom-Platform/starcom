/**
 * A boundary is only called settled when its source says so (decision D-F,
 * step 16; the rule of step 8 — every colour on the base map means something).
 *
 * Natural Earth marks two frontiers "Indeterminant frontier". The rule for
 * indefinite boundaries matched /indefinite/ and not that spelling, and
 * anything the rules did not recognise fell through to 'International' — so
 * both were baked into the topology as settled international borders, and drawn
 * in the settled colour. A class the rules cannot read is UNKNOWN, which the key
 * shows as "unclassified", not a claim the boundary is settled.
 */
import { describe, it, expect } from 'vitest';
import { normalizeFeatures } from '../normalization/normalization';

const border = (FEATURECLA?: string) => ({
  geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
  properties: FEATURECLA === undefined ? {} : { FEATURECLA },
});
const classOf = (cla?: string) => normalizeFeatures([border(cla)])[0].classification;

describe('border classification', () => {
  it('reads an indeterminate frontier as indefinite, not as settled', () => {
    expect(classOf('Indeterminant frontier')).toBe('Indefinite');
  });

  it('still reads the classes it always did', () => {
    expect(classOf('International boundary (verify)')).toBe('International');
    expect(classOf('Disputed (please verify)')).toBe('Disputed');
    expect(classOf('Line of control (please verify)')).toBe('LineOfControl');
    expect(classOf('Indefinite (please verify)')).toBe('Indefinite');
  });

  it('calls a class it cannot read unknown, never international', () => {
    expect(classOf('Something new from the source')).toBe('Unknown');
    expect(classOf(undefined)).toBe('Unknown');
  });
});

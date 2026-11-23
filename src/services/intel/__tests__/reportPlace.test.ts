/**
 * Three states, told apart.
 *
 * The one that matters most is the distinction between a report that named a
 * territory and one that named nowhere. Both lack a coordinate, both used to
 * render as a blank space in the lists, and they are different claims.
 */
import { describe, it, expect } from 'vitest';
import { reportPlace } from '../reportPlace';
import { en } from '../../../i18n/app/en';
import { interpolate } from '../../../i18n/messages';

describe('reportPlace', () => {
  it('reads a coordinate as a point', () => {
    expect(reportPlace({ latitude: 10, longitude: 8 })).toEqual({ kind: 'point', latitude: 10, longitude: 8 });
  });

  it('prefers the coordinate when a report has both', () => {
    // A report placed at a point AND tagged with a country is placed. Drawing
    // the whole country as well would restate it at a resolution it did not
    // claim — the same rule useGlobeRegionMarks applies.
    expect(reportPlace({ latitude: 10, longitude: 8, jurisdictions: ['ng'] }).kind).toBe('point');
  });

  it('reads stated territories when there is no coordinate', () => {
    expect(reportPlace({ jurisdictions: ['fr', 'us-va'] })).toEqual({
      kind: 'jurisdiction', codes: ['fr', 'us-va'],
    });
  });

  it('is not fooled by half a coordinate', () => {
    // One coordinate is not half-placed, it is unplaceable — reportToMarker
    // refuses the same shape.
    expect(reportPlace({ latitude: 10 }).kind).toBe('none');
    expect(reportPlace({ longitude: 8 }).kind).toBe('none');
  });

  it('treats a non-finite coordinate as no coordinate', () => {
    expect(reportPlace({ latitude: Number.NaN, longitude: 8 }).kind).toBe('none');
  });

  it('says a report names nowhere when it does', () => {
    expect(reportPlace({})).toEqual({ kind: 'none' });
  });

  it('does not count an empty jurisdiction as a stated place', () => {
    expect(reportPlace({ jurisdictions: ['  ', ''] }).kind).toBe('none');
  });
});

// The words are in the catalogue (D-ML, L3): the list's line and the report page's, in English.
describe('the words used', () => {
  it('says a jurisdiction is what the report is ABOUT, not where it is', () => {
    // "in FR" would claim the report is located in France. It claims only to
    // concern it.
    expect(interpolate(en.workspace.placeAbout, { codes: 'FR' })).toBe('about FR');
    expect(interpolate(en.reportPanel.subject, { codes: 'US-VA, FR' })).toBe('Subject: about US-VA, FR');
  });

  it("states the publisher's silence rather than this node's failure", () => {
    // Not "location unknown", which asserts a location exists and was lost.
    expect(en.workspace.noPlace).toBe('names no place');
    for (const said of [en.workspace.noPlace, en.reportPanel.noPlace]) expect(said).not.toMatch(/unknown|missing|failed/i);
  });
});

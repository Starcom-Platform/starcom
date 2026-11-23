/**
 * The Organisations mode's state (decision D-ZR, ZR10): one body shown at a time, kept in this browser, its panel
 * opened by a click on it.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getOrganisationsState, openOrganisationPanel, organisationAreas, resetOrganisationsStoreForTests, setOrganisationsOn, showOrganisation,
} from '../organisationsStore';

beforeEach(() => { resetOrganisationsStoreForTests(); localStorage.clear(); });

describe('organisationsStore', () => {
  it('offers every body the registry names by a union code', () => {
    expect(organisationAreas().map((a) => a.code)).toEqual(expect.arrayContaining(['union:eu', 'union:au', 'union:asean']));
    expect(organisationAreas().every((a) => a.code.startsWith('union:'))).toBe(true);
  });

  it('showing a body turns the mode on and keeps the choice; a code it does not know changes nothing', () => {
    showOrganisation('union:gcc');
    expect(getOrganisationsState()).toMatchObject({ on: true, shown: 'union:gcc', open: false });
    expect(localStorage.getItem('starcom-organisation-shown')).toBe('union:gcc');
    showOrganisation('union:atlantis');
    expect(getOrganisationsState().shown).toBe('union:gcc');
  });

  it('opens its panel on asking, and closes it when the mode goes off', () => {
    showOrganisation('union:eu', true);
    expect(getOrganisationsState().open).toBe(true);
    setOrganisationsOn(false);
    expect(getOrganisationsState()).toMatchObject({ on: false, open: false, hovered: null });
    openOrganisationPanel(true);
    expect(getOrganisationsState().open).toBe(true);
  });
});

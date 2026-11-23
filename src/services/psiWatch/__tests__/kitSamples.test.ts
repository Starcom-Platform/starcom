/**
 * The kit's invented samples stay behind the switch (PW48; Mecha Jono's ask of 2 Nov): opening Psi Watch to everyone
 * (OR6) had put the invented result, ledger, alert, window places and mission in front of every visitor. A file is
 * invented when its own provenance says so; only a tab opened with `?psi=kit` draws those, and `?psi=off` forgets it.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isInventedSample, loadPsiKit } from '../kitFixtures';

const files = async () => (await loadPsiKit()).map((f) => f.file).sort();
const open = (search: string) => window.history.replaceState({}, '', `/${search}`);

beforeEach(() => { window.sessionStorage.clear(); open(''); });
afterEach(() => { window.sessionStorage.clear(); open(''); });

describe("the kit's invented samples", () => {
  it('are left out of a tab not opened with ?psi=kit, the real files kept', async () => {
    const kit = await loadPsiKit();
    expect(kit.some(isInventedSample)).toBe(false);
    const shown = await files();
    for (const real of ['psi_field.json', 'psi_registration.json', 'psi_brief.json', 'psi_sky_event.lunation.json']) expect(shown).toContain(real);
    for (const invented of ['psi_scry_result.json', 'psi_ledger.json', 'psi_alert.json', 'psi_mission_package.json', 'psi_window.json']) {
      expect(shown).not.toContain(invented);
    }
  });

  it('are drawn in a tab opened with ?psi=kit, for the rest of the tab, until ?psi=off', async () => {
    const all = (await loadPsiKit({ samples: true })).map((f) => f.file).sort();
    open('?psi=kit');
    expect(await files()).toEqual(all);
    open('');
    expect(await files()).toEqual(all);
    open('?psi=off');
    expect((await loadPsiKit()).some(isInventedSample)).toBe(false);
  });

  it('are told apart by each file\'s own words, not a list kept here', async () => {
    for (const fixture of await loadPsiKit({ samples: true })) {
      expect(isInventedSample(fixture)).toBe(Boolean(fixture.provenance?.invented));
    }
  });
});

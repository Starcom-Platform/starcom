/**
 * A visualization you cannot link to is one nobody can cite.
 *
 * ─── WHY ───────────────────────────────────────────────────────────────────
 *
 * Which layer the globe draws lived in `localStorage` and nowhere else. That
 * had two consequences, and the second is worse than the first.
 *
 * An autonomous agent in a fresh browser got the default — CyberCommand /
 * IntelReports — and could reach none of the other ten. `setLayer` on the share
 * handle fixes that for an agent that can run script.
 *
 * But a PERSON could not share what they were looking at either. There was no
 * address for "the globe, showing space weather". Every link to this app landed
 * on whatever the recipient happened to have chosen last, which is the opposite
 * of what a link is for.
 *
 * ─── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────
 *
 * The URL is read ONCE, at startup, and never written back. Writing it on every
 * mode change would fight the application router for the address bar and fill a
 * person's history with entries they did not ask for. This is an entry point,
 * not two-way binding.
 *
 * An unrecognised value is IGNORED rather than defaulted noisily: a link with a
 * typo should show the app, not an error page. The existing storage path already
 * sanitises the same way.
 */
import { describe, it, expect } from 'vitest';
import { modeFromSearch } from '../visualizationModeFromUrl';

describe('reading a visualization mode from the address', () => {
  it('reads a mode and sub-mode pair', () => {
    expect(modeFromSearch('?mode=EcoNatural&sub=SpaceWeather'))
      .toEqual({ mode: 'EcoNatural', subMode: 'SpaceWeather' });
  });

  it('accepts the sub-mode alone and infers the mode that owns it', () => {
    // A caller should not have to know that Satellites belongs to CyberCommand.
    // The pair is not free-form: a sub-mode belongs to exactly one mode.
    expect(modeFromSearch('?sub=Satellites'))
      .toEqual({ mode: 'CyberCommand', subMode: 'Satellites' });
    expect(modeFromSearch('?sub=ConflictZones'))
      .toEqual({ mode: 'GeoPolitical', subMode: 'ConflictZones' });
  });

  it('is case-insensitive about the value, because a link gets retyped', () => {
    expect(modeFromSearch('?sub=spaceweather'))
      .toEqual({ mode: 'EcoNatural', subMode: 'SpaceWeather' });
  });

  it('ignores a mode whose sub-mode does not belong to it', () => {
    // GeoPolitical does not own SpaceWeather. Honouring the pair would produce
    // a combination the app never generates and no renderer expects.
    expect(modeFromSearch('?mode=GeoPolitical&sub=SpaceWeather')).toBeNull();
  });

  it('ignores an unknown sub-mode rather than failing', () => {
    expect(modeFromSearch('?sub=Atlantis')).toBeNull();
  });

  it('ignores an empty or absent query', () => {
    expect(modeFromSearch('')).toBeNull();
    expect(modeFromSearch('?')).toBeNull();
    expect(modeFromSearch('?other=1')).toBeNull();
  });

  it('accepts a mode on its own and uses that mode\'s default sub-mode', () => {
    expect(modeFromSearch('?mode=GeoPolitical'))
      .toEqual({ mode: 'GeoPolitical', subMode: 'DiplomaticEvents' });
  });

  it('covers every layer the share contract publishes', () => {
    // If a layer is reachable by the agent it should be reachable by a link.
    // A layer that exists and cannot be addressed is the gap this closes.
    const layers = [
      'IntelReports', 'CyberThreats', 'Satellites', 'CommHubs', 'RLSH',
      'DiplomaticEvents', 'ResourceZones', 'ConflictZones',
      'SpaceWeather', 'EcologicalDisasters', 'EarthWeather',
    ];
    for (const layer of layers) {
      expect(modeFromSearch(`?sub=${layer}`), layer).not.toBeNull();
    }
  });

  // Raver Watch, Mecha Jono's safety mode (globe record, section 19; RW5): its six
  // layer ids as they proposed them, and the mode derived from any of them.
  it('reads Raver Watch by its layer or by the mode, and refuses another mode\'s layer under it', () => {
    expect(modeFromSearch('?sub=sceneincidents')).toEqual({ mode: 'RaverWatch', subMode: 'SceneIncidents' });
    expect(modeFromSearch('?sub=SceneEvents')).toEqual({ mode: 'RaverWatch', subMode: 'SceneEvents' });
    expect(modeFromSearch('?mode=raverwatch')).toEqual({ mode: 'RaverWatch', subMode: 'DrugCheckAlerts' });
    expect(modeFromSearch('?mode=RaverWatch&sub=IntelReports')).toBeNull();
    expect(modeFromSearch('?mode=CyberCommand&sub=DrugCheckAlerts')).toBeNull();
  });
});

// Hero Watch (D-HW): its sections, and RLSH, which moved there from Intel Watch.
describe('modeFromSearch — Hero Watch', () => {
  it('reads Hero Watch by a section or by the mode, and RLSH under it', () => {
    expect(modeFromSearch('?mode=herowatch')).toEqual({ mode: 'HeroWatch', subMode: 'Lifeboats' });
    expect(modeFromSearch('?sub=lifeboats')).toEqual({ mode: 'HeroWatch', subMode: 'Lifeboats' });
    expect(modeFromSearch('?sub=RLSH')).toEqual({ mode: 'HeroWatch', subMode: 'RLSH' });
    expect(modeFromSearch('?mode=HeroWatch&sub=FieldMissions')).toEqual({ mode: 'HeroWatch', subMode: 'FieldMissions' });
    expect(modeFromSearch('?mode=HeroWatch&sub=IntelReports')).toBeNull();
  });

  it('still opens a link made before RLSH moved, on Hero Watch', () => {
    expect(modeFromSearch('?mode=CyberCommand&sub=RLSH')).toEqual({ mode: 'HeroWatch', subMode: 'RLSH' });
  });
});

// Missions (D-MF, step 5): the open missions, at their places.
describe('modeFromSearch — Missions', () => {
  it('reads Missions by the mode or its section, and refuses another mode\'s layer under it', () => {
    expect(modeFromSearch('?mode=missions')).toEqual({ mode: 'Missions', subMode: 'OpenMissions' });
    expect(modeFromSearch('?sub=openmissions')).toEqual({ mode: 'Missions', subMode: 'OpenMissions' });
    expect(modeFromSearch('?mode=Missions&sub=FieldMissions')).toBeNull();
  });
});

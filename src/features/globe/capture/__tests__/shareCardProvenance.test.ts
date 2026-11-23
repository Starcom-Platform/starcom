/**
 * What a published image is allowed to claim.
 *
 * These are the tests that matter most in the share pipeline, because a card
 * cannot be corrected once posted. The property under test throughout is that
 * the caveats are DERIVED — they cannot fall out of step with what the image
 * shows, because no caller supplies them.
 */
import { describe, it, expect } from 'vitest';
import { CREDITS } from '../sourceCredits';
import { IMAGERY } from '../../../../globe-engine/imagery';
import {
  buildGlobeViewProvenance,
  formatCameraLine,
  CAPTURE_ORIGIN,
  STALE_AFTER_MS,
  feedState,
  noteApplies,
  type BuildProvenanceInput,
} from '../shareCardProvenance';

const AT = new Date('2026-09-10T12:00:00.000Z');

const input = (over: Partial<BuildProvenanceInput> = {}): BuildProvenanceInput => ({
  capturedAt: AT,
  camera: { lat: 38.9072, lon: -77.0369, altitude: 2.5 },
  frame: { width: 1200, height: 630 },
  layers: [{ label: 'Intel Reports', active: true, implemented: true }],
  feeds: [{ name: 'NOAA', lastUpdated: AT.toISOString() }],
  /*
   * Stated, so tests about feeds and layers are not perturbed by the
   * unidentified-build caveat. Its own behaviour is asserted separately below,
   * in both directions.
   */
  build: { sha: 'a'.repeat(40), builtAt: AT.toISOString() },
  now: AT,
  ...over,
});

const caveatsOf = (over: Partial<BuildProvenanceInput> = {}) =>
  buildGlobeViewProvenance(input(over)).caveats.join(' | ');

describe('a build that does not describe its own code', () => {
  const build = (over: Partial<{ sha: string | null; builtAt: string | null; treeDirty: boolean | null }>) => ({
    sha: 'a'.repeat(40), builtAt: '2026-09-12T00:00:00.000Z', treeDirty: false, ...over,
  });

  it('says nothing extra for a clean tree', () => {
    const p = buildGlobeViewProvenance({ ...input(), build: build({ treeDirty: false }) });
    expect(p.caveats.filter((c) => /uncommitted/i.test(c))).toEqual([]);
  });

  it('warns, and names the sha, when the tree had uncommitted changes', () => {
    const p = buildGlobeViewProvenance({ ...input(), build: build({ treeDirty: true }) });
    const caveat = p.caveats.find((c) => /uncommitted/i.test(c));
    expect(caveat).toBeTruthy();
    // The sha is in the warning, because the sha is what a reader would go and fetch.
    expect(caveat).toContain('aaaaaaaa');
    expect(caveat).toMatch(/does not describe the code/i);
  });

  it('says the build is unidentified, not dirty, when there is no sha at all', () => {
    const p = buildGlobeViewProvenance({ ...input(), build: build({ sha: null, treeDirty: true }) });
    expect(p.caveats.some((c) => /unidentified/i.test(c))).toBe(true);
    expect(p.caveats.filter((c) => /uncommitted/i.test(c))).toEqual([]);
  });

  it('treats an unknown tree state as unknown, not as clean', () => {
    // Pre-schema-6 captures and builds with no git carry null here.
    const p = buildGlobeViewProvenance({ ...input(), build: build({ treeDirty: null }) });
    expect(p.caveats.filter((c) => /uncommitted/i.test(c))).toEqual([]);
    expect(p.build.treeDirty).toBeNull();
  });
});

describe('how the planet was drawn and lit', () => {
  it('names the skin and the light on the card, whichever they are', () => {
    const p = buildGlobeViewProvenance({ ...input(), appearance: { skin: 'Terrain', lightMode: 'sun' } });
    expect(p.appearance).toEqual({ skin: 'Terrain', lightMode: 'sun' });
  });

  it('says nothing extra for the Sun, which needs no caveat', () => {
    const p = buildGlobeViewProvenance({ ...input(), appearance: { skin: 'Blue Marble', lightMode: 'sun' } });
    expect(p.caveats.filter((c) => /lit/i.test(c))).toEqual([]);
  });

  it('warns that a headlamp image\'s day and night sides are not real', () => {
    const p = buildGlobeViewProvenance({ ...input(), appearance: { skin: 'Blue Marble', lightMode: 'headlamp' } });
    expect(p.caveats.some((c) => /camera/i.test(c) && /not real/i.test(c))).toBe(true);
  });

  it('warns that a flat image does not show where it was dark', () => {
    const p = buildGlobeViewProvenance({ ...input(), appearance: { skin: 'Terrain', lightMode: 'flat' } });
    expect(p.caveats.some((c) => /evenly/i.test(c) && /dark/i.test(c))).toBe(true);
  });

  it('records how much detail was drawn', () => {
    const quality = { setting: 'auto' as const, detail: 'softer edges', clouds: true, atmosphere: true };
    const p = buildGlobeViewProvenance({ ...input(), appearance: { skin: 'Terrain', lightMode: 'sun', quality } });
    expect(p.appearance?.quality).toEqual(quality);
  });

  it('warns when the device dropped clouds from the image', () => {
    const p = buildGlobeViewProvenance({ ...input(), appearance: {
      skin: 'Terrain', lightMode: 'sun', quality: { setting: 'auto', detail: 'no clouds', clouds: false, atmosphere: true },
    } });
    expect(p.caveats.join(' ')).toMatch(/Drawn without clouds because this device could not keep up/);
  });

  it('names the Low setting as the viewer\'s choice, not the device\'s', () => {
    const p = buildGlobeViewProvenance({ ...input(), appearance: {
      skin: 'Terrain', lightMode: 'sun',
      quality: { setting: 'low', detail: 'no clouds or atmosphere', clouds: false, atmosphere: false },
    } });
    expect(p.caveats.join(' ')).toMatch(/Low quality setting, without clouds and the atmosphere/);
  });

  /*
   * Within Earth Weather the decorative cloud picture never draws (decision D-W, WX9):
   * its clouds are the satellites' and the model's, drawn at every setting. A card
   * there that said "without clouds" contradicted its own picture.
   */
  const earthWeather = [{ id: 'EarthWeather', label: 'Earth Weather', active: true, implemented: true }];

  it('does not say a weather card was drawn without clouds: Earth Weather draws its own', () => {
    const p = buildGlobeViewProvenance({ ...input({ layers: earthWeather }), appearance: {
      skin: 'Terrain', lightMode: 'sun',
      quality: { setting: 'low', detail: 'no clouds or atmosphere', clouds: false, atmosphere: false },
    } });
    expect(p.caveats.join(' ')).toMatch(/Low quality setting, without the atmosphere, so the planet/);
    expect(p.caveatsShort.join(' ')).toMatch(/Drawn at Low quality, without the atmosphere;/);
    expect([...p.caveats, ...p.caveatsShort].join(' ')).not.toMatch(/without clouds/);
  });

  it('says nothing of quality on a weather card when only the decorative clouds were dropped', () => {
    const p = buildGlobeViewProvenance({ ...input({ layers: earthWeather }), appearance: {
      skin: 'Terrain', lightMode: 'sun', quality: { setting: 'auto', detail: 'no clouds', clouds: false, atmosphere: true },
    } });
    expect(p.caveats.join(' ')).not.toMatch(/could not keep up|quality setting|plainer/);
  });

  it('still names dropped clouds when Earth Weather is selected but not drawn', () => {
    const p = buildGlobeViewProvenance({ ...input({ layers: [{ ...earthWeather[0], implemented: false }] }), appearance: {
      skin: 'Terrain', lightMode: 'sun', quality: { setting: 'auto', detail: 'no clouds', clouds: false, atmosphere: true },
    } });
    expect(p.caveats.join(' ')).toMatch(/Drawn without clouds because this device could not keep up/);
  });

  it('says nothing about sharpness, which never reaches a capture', () => {
    const p = buildGlobeViewProvenance({ ...input(), appearance: {
      skin: 'Terrain', lightMode: 'sun', quality: { setting: 'auto', detail: 'softer edges', clouds: true, atmosphere: true },
    } });
    expect(p.caveats.join(' ')).not.toMatch(/could not keep up|quality setting|plainer/);
  });

  it('omits the field entirely when a caller has no appearance to report', () => {
    expect(buildGlobeViewProvenance(input()).appearance).toBeUndefined();
  });
});

describe('the envelope', () => {
  // Schema 10 (globe record, section 19; RW7, RW8).
  it('carries its own address, its window, and the Raver Watch items it draws', () => {
    const p = buildGlobeViewProvenance({
      ...input(),
      link: 'https://starcom.app/?v=1&sub=DrugCheckAlerts&at=48.21,16.37,1.3',
      window: { from: 1_790_899_200, until: 1_791_158_400 },
      raverWatchItems: [{ id: '30023:pk:raver-a', layer: 'DrugCheckAlerts', level: 'red' }],
    });
    expect(p.link).toBe('https://starcom.app/?v=1&sub=DrugCheckAlerts&at=48.21,16.37,1.3');
    expect(p.window).toEqual({ from: 1_790_899_200, until: 1_791_158_400 });
    expect(p.raverWatchItems).toEqual([{ id: '30023:pk:raver-a', layer: 'DrugCheckAlerts', level: 'red' }]);
    expect(buildGlobeViewProvenance({ ...input(), window: null }).window).toBeNull();
    expect(buildGlobeViewProvenance(input())).not.toHaveProperty('raverWatchItems');
  });

  // Schema 11 (decision IM1): a card made from a shot carries the shot as it was drawn, so it can be made again.
  it('carries the shot a card was made from, and nothing when it was made from none', () => {
    const shot = {
      v: 1 as const, subject: { address: '30023:pk:raver-x' }, layers: { primary: 'SceneEvents', pins: [] },
      time: { live: true as const }, emphasis: { featured: true }, appearance: { skin: 'auto' as const, light: 'sun' as const, nightFill: 0.15 },
      card: { preset: 'wide' as const }, output: { type: 'image/png' as const, scale: 1 },
    };
    expect(buildGlobeViewProvenance({ ...input(), shot }).shot).toEqual(shot);
    expect(buildGlobeViewProvenance(input())).not.toHaveProperty('shot');
  });

  it('names itself, its version, and what kind of artefact it is', () => {
    const p = buildGlobeViewProvenance(input());
    expect(p.schema).toBe('starcom.globe.capture');
    // 32 since the PsiOps Briefing's page (D-PW, PW77), 31 since a Timestream strip; see the constant's history.
    expect(p.schemaVersion).toBe(38);
    expect(p.origin).toBe(CAPTURE_ORIGIN);
    expect(p.capturedAt).toBe('2026-09-10T12:00:00.000Z');
  });

  /**
   * Matches SpaceWeatherExportService's wording deliberately: a reader who has
   * seen one unsigned client capture should recognise the other.
   */
  it('says unsigned, always, whatever else is true', () => {
    expect(caveatsOf()).toMatch(/Unsigned client-side capture/);
    expect(caveatsOf({ feeds: [], layers: [] })).toMatch(/Unsigned client-side capture/);
  });

  it('puts the artefact caveat last, after the specific ones', () => {
    const c = buildGlobeViewProvenance(input({
      feeds: [{ name: 'NOAA', lastUpdated: null, error: 'network' }],
    })).caveats;
    expect(c[c.length - 1]).toMatch(/Unsigned/);
    expect(c[0]).toMatch(/NOAA/);
  });
});

describe('an unreachable feed is not an all-clear', () => {
  /**
   * ThreatAssessmentPanel had to learn this distinction on screen. It matters
   * more here: a panel can be refreshed, a posted image cannot.
   */
  it('says so, and names the error', () => {
    const c = caveatsOf({ feeds: [{ name: 'NOAA', lastUpdated: null, error: 'HTTP 503' }] });
    expect(c).toMatch(/NOAA did not load \(HTTP 503\)/);
    expect(c).toMatch(/not an all-clear/);
  });

  /**
   * This line said "was unreachable (…)" for every failure. Live cards then
   * read "EIA was unreachable (needs an EIA key)" — EIA was never asked — and
   * "CelesTrak … was unreachable (CelesTrak refused …)" — it answered. The one
   * line that exists to say why was wrong about why.
   */
  it('does not call a source unreachable when it refused, or was never asked', () => {
    const c = caveatsOf({ feeds: [
      { name: 'Oil, gas and renewables (EIA)', lastUpdated: null, error: 'needs an EIA key' },
      { name: 'CelesTrak satellite catalogue', lastUpdated: null, error: 'CelesTrak refused active-satellites' },
    ] });
    expect(c).toMatch(/Oil, gas and renewables \(EIA\) did not load \(needs an EIA key\)/);
    expect(c).not.toMatch(/unreachable/);
  });

  it('reports the error rather than the missing timestamp — one cause, one caveat', () => {
    const c = buildGlobeViewProvenance(input({
      feeds: [{ name: 'NOAA', lastUpdated: null, error: 'HTTP 503' }],
    })).caveats.filter((x) => x.includes('NOAA'));
    expect(c).toHaveLength(1);
  });

  it('distinguishes never-loaded from still-loading', () => {
    expect(caveatsOf({ feeds: [{ name: 'EIA', lastUpdated: null }] }))
      .toMatch(/EIA had never loaded/);
    expect(caveatsOf({ feeds: [{ name: 'EIA', lastUpdated: null, loading: true }] }))
      .toMatch(/had not finished loading/);
  });
});

describe('staleness', () => {
  it('stays quiet for fresh data', () => {
    expect(caveatsOf()).not.toMatch(/last updated/);
  });

  it('reports an age once past the threshold', () => {
    const old = new Date(AT.getTime() - STALE_AFTER_MS - 60000).toISOString();
    expect(caveatsOf({ feeds: [{ name: 'NOAA', lastUpdated: old }] }))
      .toMatch(/NOAA was last updated 1h 1m before this capture/);
  });

  it('reads days for genuinely old data', () => {
    const ancient = new Date(AT.getTime() - 50 * 60 * 60 * 1000).toISOString();
    expect(caveatsOf({ feeds: [{ name: 'CelesTrak', lastUpdated: ancient }] }))
      .toMatch(/2d 2h before this capture/);
  });

  /**
   * A timestamp that cannot be parsed must not silently become "fresh" — the
   * failure has to be visible, or a broken feed reads as a current one.
   */
  it('says the recency is unknown rather than assuming it is fine', () => {
    expect(caveatsOf({ feeds: [{ name: 'NOAA', lastUpdated: 'not-a-date' }] }))
      .toMatch(/unreadable timestamp.*recency cannot be stated/);
  });

  it('measures against the capture time by default, not wall-clock at build time', () => {
    const p = buildGlobeViewProvenance({ ...input(), now: undefined });
    expect(p.caveats.filter((c) => c.includes('last updated'))).toEqual([]);
  });

  /*
   * A card of a paused moment shows that moment, as a clip's frame does (D-W,
   * steps 5c and 5d): each source is judged by how far its data falls short of
   * it, not of the capture. A card of yesterday's weather is not a day stale.
   */
  describe('at a paused moment', () => {
    const HOUR = 60 * 60 * 1000;
    const shownAt = new Date(AT.getTime() - 26 * HOUR);

    it('judges a source against the moment shown, and says so', () => {
      const slot = new Date(shownAt.getTime() - (2 * HOUR + 50 * 60000)).toISOString();
      const p = buildGlobeViewProvenance({ ...input({ feeds: [{ name: 'Clouds', shortName: 'The cloud image', lastUpdated: slot }] }), shownAt });
      expect(p.caveats.join(' ')).toMatch(/Clouds was last updated 2h 50m before the moment shown\./);
      expect(p.caveatsShort.join(' ')).toMatch(/The cloud image was 2h 50m older than the moment shown\./);
      expect(p.caveats.join(' ')).not.toMatch(/before this capture/);
    });

    it('says when the moment shown is ahead of the capture, and judges its sources against the capture', () => {
      // A forecast's moment (SW19): the other layers show what they held at the capture, not stale for that.
      const ahead = new Date(AT.getTime() + 3 * 24 * HOUR + 4 * HOUR);
      const slot = new Date(AT.getTime() - 10 * 60000).toISOString();
      const p = buildGlobeViewProvenance({ ...input({ feeds: [{ name: 'NOAA space weather', lastUpdated: slot }] }), shownAt: ahead });
      expect(p.caveats.join(' ')).toContain('The moment shown, 13 Sep 16:00Z, is 3d 4h ahead of this capture. Layers that forecast show their forecast for it. The others show what they held at the capture, those that filter by time only what falls in the window.');
      expect(p.caveatsShort).toContain('3d 4h ahead of now: forecasts show it; other layers what they held.');
      expect(p.caveats.join(' ')).not.toMatch(/older than|before the moment shown|last updated/);
      // A source stale at the capture is still said to be.
      const old = new Date(AT.getTime() - 5 * HOUR).toISOString();
      expect(buildGlobeViewProvenance({ ...input({ feeds: [{ name: 'NOAA space weather', lastUpdated: old }] }), shownAt: ahead }).caveats.join(' '))
        .toMatch(/NOAA space weather was last updated 5h 0m before this capture\./);
    });

    it('stays quiet for a source that reaches the moment shown, however long before the capture', () => {
      const hour = new Date(shownAt.getTime() - 10 * 60000).toISOString();
      expect(buildGlobeViewProvenance({ ...input({ feeds: [{ name: 'NOAA GFS', lastUpdated: hour }] }), shownAt }).caveats.join(' '))
        .not.toMatch(/last updated/);
    });
  });
});

describe('a layer that draws nothing', () => {
  /**
   * GlobeLayerInfo carries `isImplemented` because pinning an unimplemented
   * layer is a no-op. On a card the stakes change: a viewer reading
   * "Satellites: on" reasonably concludes the satellites shown are the
   * satellites there.
   */
  it('is excluded from what the card says it shows', () => {
    const p = buildGlobeViewProvenance(input({
      layers: [
        { label: 'Intel Reports', active: true, implemented: true },
        { label: 'Comm Hubs', active: true, implemented: false },
      ],
    }));
    expect(p.layersShown).toEqual(['Intel Reports']);
    expect(p.layersSelectedButEmpty).toEqual(['Comm Hubs']);
  });

  it('is named, so the absence is attributed to the app and not the world', () => {
    const c = caveatsOf({
      layers: [{ label: 'Comm Hubs', active: true, implemented: false }],
    });
    expect(c).toMatch(/Comm Hubs was selected but nothing renders it yet/);
    expect(c).toMatch(/not an absence in the world/);
  });

  it('omits inactive layers from both lists', () => {
    const p = buildGlobeViewProvenance(input({
      layers: [{ label: 'RLSH', active: false, implemented: true }],
    }));
    expect(p.layersShown).toEqual([]);
    expect(p.layersSelectedButEmpty).toEqual([]);
  });

  /**
   * The bare globe is a legitimate thing to post. It just must not be read as
   * a reading of anything.
   */
  it('says the bare globe is the globe, not a measurement', () => {
    expect(caveatsOf({ layers: [] }))
      .toMatch(/No data layer was active — this is the globe itself, not a reading of anything/);
  });

  it('does not say that when a layer really is shown', () => {
    expect(caveatsOf()).not.toMatch(/No data layer was active/);
  });
});

describe('the camera line', () => {
  it('reads as a position, with hemispheres', () => {
    expect(formatCameraLine({ lat: 38.9072, lon: -77.0369, altitude: 2.5 }))
      .toBe('38.91°N 77.04°W · alt 2.50R');
  });

  it('handles the southern and eastern hemispheres', () => {
    expect(formatCameraLine({ lat: -33.87, lon: 151.21, altitude: 1.8 }))
      .toBe('33.87°S 151.21°E · alt 1.80R');
  });

  /** Two decimals, matching the coordinate convention used elsewhere. */
  it('uses the same precision as the rest of the product', () => {
    expect(formatCameraLine({ lat: 0.123456, lon: 0.987654, altitude: 2 }))
      .toBe('0.12°N 0.99°E · alt 2.00R');
  });
});

describe('nothing is authored by the caller', () => {
  /**
   * The load-bearing property. If a caveat could be passed in, it could
   * disagree with the image — and the whole point is that it cannot.
   */
  it('accepts no caveats as input', () => {
    const withExtra = { ...input(), caveats: ['everything is fine, trust me'] } as never;
    expect(buildGlobeViewProvenance(withExtra).caveats.join(' '))
      .not.toMatch(/trust me/);
  });

  it('carries the build that drew the picture', () => {
    const p = buildGlobeViewProvenance(input({
      build: { sha: 'deadbeef' + '0'.repeat(32), builtAt: '2026-09-11T03:02:45.626Z' },
    }));
    expect(p.build.sha).toBe('deadbeef' + '0'.repeat(32));
    expect(p.build.builtAt).toBe('2026-09-11T03:02:45.626Z');
    // A known build is not something to warn about.
    expect(p.caveats.some((c) => c.includes('unidentified'))).toBe(false);
  });

  it('says so when the build cannot be identified', () => {
    /*
     * The case that matters: a card with no build stated and a card from an
     * unknown build look the same to a reader. Only one of them is honest by
     * accident, so the unknown one says it.
     */
    const p = buildGlobeViewProvenance(input({ build: { sha: null, builtAt: null } }));
    expect(p.caveats.some((c) => c.includes('unidentified'))).toBe(true);
  });

  it('derives every caveat from feed and layer state', () => {
    const p = buildGlobeViewProvenance(input({
      layers: [{ label: 'Comm Hubs', active: true, implemented: false }],
      feeds: [{ name: 'NOAA', lastUpdated: null, error: 'offline' }],
    }));
    // Two specific findings plus the bare-globe note plus the artefact note.
    expect(p.caveats).toHaveLength(4);
    expect(p.caveats.some((c) => c.includes('Comm Hubs'))).toBe(true);
    expect(p.caveats.some((c) => c.includes('NOAA'))).toBe(true);
  });
});


describe('the marks in the frame', () => {
  const withMarks = (marks: Partial<import('../shareCardProvenance').MarkProvenance>) =>
    buildGlobeViewProvenance(input({
      marks: { shown: 3, fabricated: null, totalObservations: null, emptyReason: null, ...marks },
    })).caveats.join(' | ');

  /**
   * ─── THE DISTINCTION THIS WHOLE TYPE EXISTS FOR ──────────────────────────
   *
   * Every GlobeIntelMark reports isMock false, because its only input is never
   * supplied — deliberately, with the reason recorded at the call site. So
   * false means "nobody looked", not "nothing fabricated".
   *
   * Counting the flags would have produced "0 fabricated marks" on a published
   * image: a positive claim, from a measurement that never ran, in the feature
   * written to refuse exactly that. These two tests are the difference.
   */
  it('says fabrication is UNMEASURED rather than reporting zero', () => {
    const c = withMarks({ fabricated: null });
    expect(c).toMatch(/not measured/i);
    expect(c).not.toMatch(/\b0 .*fabricated/i);
  });

  it('reports a real count when something actually measured it', () => {
    const c = withMarks({ fabricated: 2, totalObservations: 9 });
    expect(c).toMatch(/2 of 9 observations behind these marks are fabricated/i);
    expect(c).not.toMatch(/not measured/i);
  });

  it('claims nothing either way when a real measurement found none', () => {
    const c = withMarks({ fabricated: 0, totalObservations: 9 });
    // Measured and clean: no warning, and equally no boast.
    expect(c).not.toMatch(/not measured/i);
    expect(c).not.toMatch(/fabricated/i);
  });

  it('always says marks are drawn as exact points', () => {
    expect(withMarks({})).toMatch(/exact points/i);
    expect(withMarks({ fabricated: 0, totalObservations: 9 })).toMatch(/exact points/i);
  });

  it('explains an empty globe, differently for each reason', () => {
    const empty = (reason: 'no-observations' | 'nothing-qualified' | 'all-unplaceable') =>
      buildGlobeViewProvenance(input({
        marks: { shown: 0, fabricated: null, totalObservations: null, emptyReason: reason },
      })).caveats.join(' | ');

    expect(empty('no-observations')).toMatch(/not a finding that there is nothing to find/i);
    expect(empty('nothing-qualified')).toMatch(/is a result, not an absence of work/i);
    expect(empty('all-unplaceable')).toMatch(/rendering reason rather than an analytical one/i);

    // And they are genuinely different sentences, not one message reworded.
    const all = ['no-observations', 'nothing-qualified', 'all-unplaceable'] as const;
    expect(new Set(all.map(empty)).size).toBe(3);
  });

  it('says nothing about marks when there is no analysis layer at all', () => {
    const c = buildGlobeViewProvenance(input({ marks: null })).caveats.join(' | ');
    expect(c).not.toMatch(/marks/i);
    expect(c).not.toMatch(/not measured/i);
  });

  it('does not describe an empty globe as imprecise', () => {
    // No marks, no precision claim to qualify.
    const c = buildGlobeViewProvenance(input({
      marks: { shown: 0, fabricated: null, totalObservations: null, emptyReason: null },
    })).caveats.join(' | ');
    expect(c).not.toMatch(/exact points/i);
  });
});

describe('sources that fail silently, and sources that cannot say when', () => {
  const caveatsFor = (feed: import('../shareCardProvenance').FeedProvenance) =>
    buildGlobeViewProvenance(input({ feeds: [feed] })).caveats.join(' | ');

  /**
   * The Satellites layer drew nothing for five months after CelesTrak's
   * certificate expired, and its card said "Layers shown: Satellites" with no
   * caveat, because its hook reported nothing about its data. A layer that
   * cannot tell empty from failed has to say so on the card.
   */
  it('says when a layer does not report whether its data arrived', () => {
    const c = caveatsFor({ name: 'Earth Weather', lastUpdated: null, unreported: true });
    expect(c).toMatch(/Earth Weather does not report whether its data arrived/);
    expect(c).toMatch(/cannot be told apart from a failed source/);
  });

  /**
   * The trap on the other side. A source that loaded but does not record WHEN
   * would, under the old rule, be captioned "had never loaded" — calling a
   * working layer dead. `timestamped: false` exists to prevent exactly that.
   */
  it('does not call a working, untimed source "never loaded"', () => {
    const c = caveatsFor({ name: 'Conflict data', lastUpdated: null, timestamped: false });
    expect(c).not.toMatch(/never loaded/);
    expect(c).not.toMatch(/Conflict data/);
  });

  it('still reports an untimed source that failed', () => {
    expect(caveatsFor({ name: 'Conflict data', lastUpdated: null, timestamped: false, error: 'CORS' }))
      .toMatch(/Conflict data did not load \(CORS\)/);
  });

  it('still reports an untimed source that is loading', () => {
    expect(caveatsFor({ name: 'Conflict data', lastUpdated: null, timestamped: false, loading: true }))
      .toMatch(/Conflict data had not finished loading/);
  });

  it('keeps "never loaded" for a timestamped source with no successful load', () => {
    expect(caveatsFor({ name: 'CelesTrak', lastUpdated: null })).toMatch(/CelesTrak had never loaded/);
  });
});

/**
 * A standing note about what a source's data IS — GDELT's, that its events are
 * machine-coded from news and any one can be miscoded (the tested export coded an
 * office-lease article as an Egypt–UK "Fight" at -9.5). Distinct from state: a
 * fresh GDELT snapshot is still machine-coded.
 */
describe('credits (schema 19)', () => {
  it('lists, for the Data line, each source whose data can be in the picture, with its licence', () => {
    const p = buildGlobeViewProvenance(input({ feeds: [
      { name: 'Submarine cable map', lastUpdated: null, timestamped: false, credits: [CREDITS.cables] },
      { name: 'Conflict events (GDELT snapshot)', lastUpdated: null, error: 'HTTP 503', credits: [CREDITS.gdelt] },
      { name: 'NOAA GFS temperature', lastUpdated: AT.toISOString(), credits: [CREDITS.noaaGfs] },
    ] }));
    expect(p.credits).toEqual(['TeleGeography, 2022 (CC BY-NC-SA 3.0)', 'NOAA GFS']);
    // The links stay with each feed, for the key.
    expect(p.feeds[0].credits?.[0].licence?.url).toBe('https://creativecommons.org/licenses/by-nc-sa/3.0/');
  });

  it('is empty, not absent, when no source names one', () => {
    expect(buildGlobeViewProvenance(input()).credits).toEqual([]);
  });
});

describe('imagery (schema 21; decisions TX8–TX10)', () => {
  it('names the maker of each image drawn, once, in the order drawn, with its licence', () => {
    const p = buildGlobeViewProvenance(input({
      imagery: [IMAGERY.earthDay.source, IMAGERY.earthNight.source, IMAGERY.earthTopology.source, IMAGERY.earthWater.source],
    }));
    expect(p.imagery).toEqual(['Solar System Scope (CC BY 4.0)', 'NASA']);
  });

  it('is empty, not absent, when the globe says nothing is drawn', () => {
    expect(buildGlobeViewProvenance(input()).imagery).toEqual([]);
  });
});

describe('standing notes', () => {
  const NOTE = 'GDELT events are machine-coded from news reports; any single event can be miscoded.';
  const fresh = AT.toISOString();

  it('states a source\'s note once, even when two of its feeds are on', () => {
    const caveats = buildGlobeViewProvenance(input({ feeds: [
      { name: 'Diplomatic events (GDELT snapshot)', lastUpdated: fresh, note: NOTE },
      { name: 'Conflict events (GDELT snapshot)', lastUpdated: fresh, note: NOTE },
    ] })).caveats;
    expect(caveats.filter((c) => c === NOTE)).toHaveLength(1);
  });

  it('states it for a fresh source — a note is about the data, not its age', () => {
    expect(caveatsOf({ feeds: [{ name: 'GDELT', lastUpdated: fresh, note: NOTE }] })).toContain(NOTE);
  });

  it('says nothing of the data\'s nature when none of it is in the picture', () => {
    expect(caveatsOf({ feeds: [{ name: 'GDELT', lastUpdated: null, error: 'no snapshot', note: NOTE }] })).not.toContain(NOTE);
    expect(caveatsOf({ feeds: [{ name: 'GDELT', lastUpdated: null, note: NOTE }] })).not.toContain(NOTE);
    expect(caveatsOf({ feeds: [{ name: 'GDELT', lastUpdated: null, loading: true, note: NOTE }] })).not.toContain(NOTE);
  });

  // A failure the card states as "nothing from it appears here" — with an old time or not.
  it('does not note a failed source, even one that had loaded before', () => {
    expect(caveatsOf({ feeds: [{ name: 'GDELT', lastUpdated: fresh, error: 'HTTP 503', note: NOTE }] })).not.toContain(NOTE);
  });

  it('states it for a source that loaded without saying when', () => {
    expect(caveatsOf({ feeds: [{ name: 'GDELT', lastUpdated: null, timestamped: false, note: NOTE }] })).toContain(NOTE);
  });

  it('comes before the line about what the artefact is', () => {
    const caveats = buildGlobeViewProvenance(input({ feeds: [{ name: 'GDELT', lastUpdated: fresh, note: NOTE }] })).caveats;
    expect(caveats.indexOf(NOTE)).toBeLessThan(caveats.findIndex((c) => c.startsWith('Unsigned')));
  });
});

/**
 * What state a source is in — one classification, shared by the share card and
 * the in-app key (decision D-F, step 11).
 *
 * The card has always known how old each layer's data was, and whether its
 * source failed. The live globe showed none of it: Globe.tsx built the feeds for
 * the card and nothing else read them. Now the key shows them too, and both
 * surfaces classify a feed HERE, so the app cannot call a source fresh while an
 * image of the same moment calls it stale.
 */
describe('feedState', () => {
  const NOW = new Date('2026-09-19T17:00:00Z');
  const at = (iso: string) => ({ name: 'NOAA', lastUpdated: iso });

  it('names a source that does not report as unreported, before anything else', () => {
    expect(feedState({ name: 'X', lastUpdated: null, unreported: true, error: 'boom' }, NOW).kind).toBe('unreported');
  });

  it('carries the reason a source failed', () => {
    expect(feedState({ name: 'X', lastUpdated: null, error: 'HTTP 403' }, NOW)).toEqual({ kind: 'failed', error: 'HTTP 403' });
  });

  it('tells loading, never loaded and loaded-but-untimed apart', () => {
    expect(feedState({ name: 'X', lastUpdated: null, loading: true }, NOW).kind).toBe('loading');
    expect(feedState({ name: 'X', lastUpdated: null }, NOW).kind).toBe('never');
    expect(feedState({ name: 'X', lastUpdated: null, timestamped: false }, NOW).kind).toBe('untimed');
  });

  it('gives a loaded source its time and its age', () => {
    expect(feedState(at('2026-09-19T16:52:00Z'), NOW)).toEqual({
      kind: 'loaded', at: Date.parse('2026-09-19T16:52:00Z'), ageMs: 8 * 60_000, stale: false,
    });
  });

  it('calls it stale at the same threshold the card has always used', () => {
    expect(feedState(at(new Date(NOW.getTime() - STALE_AFTER_MS + 1).toISOString()), NOW)).toMatchObject({ stale: false });
    expect(feedState(at(new Date(NOW.getTime() - STALE_AFTER_MS).toISOString()), NOW)).toMatchObject({ stale: true });
  });

  it('keeps an unreadable timestamp rather than inventing an age', () => {
    expect(feedState(at('not a date'), NOW)).toEqual({ kind: 'unreadable', raw: 'not a date' });
  });
});

/**
 * Whether a source's standing note applies — one rule for the card and the key
 * (decision D-F, step 13). Only when something from the source can be in the
 * picture: a note about data that is not drawn describes nothing a viewer sees.
 */
describe('noteApplies', () => {
  const note = 'about the data';

  it('applies to a source that loaded, timed or untimed', () => {
    expect(noteApplies({ name: 'X', lastUpdated: '2026-09-19T12:00:00Z', note })).toBe(true);
    expect(noteApplies({ name: 'X', lastUpdated: null, timestamped: false, note })).toBe(true);
  });

  it('does not apply when the source failed, never loaded, or does not report', () => {
    expect(noteApplies({ name: 'X', lastUpdated: null, error: 'boom', note })).toBe(false);
    expect(noteApplies({ name: 'X', lastUpdated: null, note })).toBe(false);
    expect(noteApplies({ name: 'X', lastUpdated: null, unreported: true, note })).toBe(false);
  });

  it('does not apply when there is no note', () => {
    expect(noteApplies({ name: 'X', lastUpdated: '2026-09-19T12:00:00Z' })).toBe(false);
  });
});

describe('country names on a card (schema 23; decision K5, TS10–TS14)', () => {
  const names = { codes: ['DEU', 'FRA'], source: 'Natural Earth Admin 0 (public domain): NAME, LABEL_X/Y, LABELRANK, MIN_LABEL' };
  const appearance = { skin: 'Blue Marble', lightMode: 'sun' as const };

  it('lists the names placed and their source, and says whose names they are, de facto control and all', () => {
    const p = buildGlobeViewProvenance(input({ appearance: { ...appearance, countryNames: names } }));
    expect(p.appearance?.countryNames).toEqual(names);
    expect(p.caveats.join(' ')).toMatch(/Natural Earth's, which shows de facto control; some are disputed/);
    expect(p.caveatsShort).toContain('Names: Natural Earth, de facto.');
  });

  it('says nothing of names on a card that drew none', () => {
    const p = buildGlobeViewProvenance(input({ appearance }));
    expect(p.appearance).not.toHaveProperty('countryNames');
    expect(p.caveats.join(' ')).not.toMatch(/Natural Earth/);
  });
});

// Tonight's card draws tonight's twelve hours, so events already under way as it begins are drawn and not counted (raver-nights.md, RN10).
describe('tonight\'s caveat', () => {
  const FROM = Date.UTC(2026, 9, 2, 23) / 1000;
  const page = (underWay: number) => ({
    kind: 'tonight' as const, fromS: FROM, untilS: FROM + 12 * 3600, title: 'Raver Watch · tonight from 2 Oct 2026 23:00Z',
    lines: ['199 scene events start in the twelve hours from 23:00Z, 89 in a hot town'], count: 199, underHeat: 89, underWay, regions: [],
  });

  it('says how many events already under way are drawn and not counted, in full and on the card', () => {
    const p = buildGlobeViewProvenance(input({ frontPage: page(14) }));
    expect(p.caveats).toContain('14 scene events already under way at 23:00Z are drawn on this card and not counted: its lines count the events starting in the twelve hours from then.');
    expect(p.caveatsShort).toContain('14 events under way at 23:00Z are drawn, not counted.');
    expect(buildGlobeViewProvenance(input({ frontPage: page(1) })).caveatsShort).toContain('1 event under way at 23:00Z is drawn, not counted.');
  });

  it('says nothing of it when none is under way, or on any other card', () => {
    expect(buildGlobeViewProvenance(input({ frontPage: page(0) })).caveats.join(' ')).not.toMatch(/under way/);
    expect(buildGlobeViewProvenance(input()).caveats.join(' ')).not.toMatch(/under way/);
  });
});

// The declassified desk's day (plan H9): its releases are not drawn, so the page credits them and says so.
describe('the declassified page', () => {
  const page = {
    kind: 'declassified' as const, day: '2026-10-23', title: 'Declassified on 23 Oct 2026: 2 releases', lines: ['One · Archive A', 'Two · Archive B'], count: 2,
    records: [], credits: ['Archive A: public domain (US government work)', 'Archive B: CC BY 4.0'],
  };

  it('puts its releases\' sources and licences on the Data line, after the feeds\' own', () => {
    const p = buildGlobeViewProvenance(input({ frontPage: page }));
    expect(p.credits.slice(-2)).toEqual(['Archive A: public domain (US government work)', 'Archive B: CC BY 4.0']);
  });

  it('says none of its releases is on the globe, in full and on the card', () => {
    const p = buildGlobeViewProvenance(input({ frontPage: page }));
    expect(p.caveats).toContain('The releases on this card have no place on the globe: none of them is drawn on it.');
    expect(p.caveatsShort).toContain('None of these releases is drawn.');
    expect(buildGlobeViewProvenance(input()).caveats.join(' ')).not.toMatch(/releases/);
  });
});

// The licences the notes in the picture carry (Interchange 3.25; the owner's pick of 26 Oct; schema 29).
describe('the licences in the picture', () => {
  const office = (name: string) => `Licence Ouverte 2.0 (Etalab) (DATAtourisme, from ${name}, last updated 2026-10-23)`;

  it('names each on the Data line once, a platform\'s producers together, and keeps each whole in the record', () => {
    const p = buildGlobeViewProvenance(input({ licences: [office('OT BOURGES'), 'CC BY 4.0', office('ADT 79'), office('OT BOURGES')] }));
    expect(p.credits.slice(-2)).toEqual(['DATAtourisme, Licence Ouverte 2.0 (Etalab): OT BOURGES, ADT 79', 'CC BY 4.0']);
    expect(p.licences).toEqual([office('OT BOURGES'), 'CC BY 4.0', office('ADT 79')]);
  });

  it('says nothing of licences when no note in the picture carries one', () => {
    expect(buildGlobeViewProvenance(input()).licences).toBeUndefined();
    expect(buildGlobeViewProvenance(input({ licences: [] })).licences).toBeUndefined();
  });
});

// D-CM, CM3 (schema 36; OR35): a card of two layers side by side says which half is which.
describe('a card of two layers side by side', () => {
  it('names each half by its layer, and says nothing of halves on a card of one', () => {
    const layers = [
      { id: 'EcologicalDisasters', label: 'Eco Disasters', active: true, implemented: true },
      { id: 'EarthWeather', label: 'Earth Weather', active: true, implemented: true },
    ];
    const appearance = { skin: 'Blue Marble', lightMode: 'sun' as const, compare: { left: 'EcologicalDisasters', right: 'EarthWeather' } };
    const p = buildGlobeViewProvenance(input({ layers, appearance }));
    expect(p.appearance?.compare).toEqual({ left: 'EcologicalDisasters', right: 'EarthWeather' });
    expect(p.caveats.join(' | ')).toContain('Side by side: Eco Disasters in the left half, Earth Weather in the right');
    expect(caveatsOf({ layers })).not.toContain('Side by side');
  });
});

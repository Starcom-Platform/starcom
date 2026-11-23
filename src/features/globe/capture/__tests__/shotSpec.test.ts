/**
 * A shot, read (decision IM1; globe record, section 21).
 *
 * One declarative description of one picture: its subject, layers, time,
 * emphasis, look, card and output. Reading one is strict where strictness
 * protects the picture and forgiving where it only protects the polish:
 *
 *   an unknown field is refused, so a misspelt key never silently does
 *     nothing;
 *   a field that would change WHAT the picture shows, and is not built yet
 *     (a theatre, an area or a mission as the subject; a moment in time), is
 *     refused with its reason;
 *   a field that only changes HOW it looks, and is not built yet (tilt,
 *     padding, a layer's opacity, a QR code, callouts, alt text), is dropped
 *     with a note, and the picture is made without it.
 *
 * The guardrails are not fields: no shot can name RLSH, go below the altitude
 * floor, or leave out a caveat.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { HISTORY_FLOOR_S } from '../../timebar/timebarRange';
import { readShot, shotOfRequest, SHOT_FIELDS } from '../shotSpec';

const LAYERS = ['IntelReports', 'RLSH', 'WarConflict', 'ConflictZones', 'SceneEvents', 'HeatRisk', 'Relief', 'FieldMissions', 'Lifeboats'];
const ADDRESS = '30023:6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692:starcom-intel-conflict-wikipedia-8b12506d8d1a4565';
const read = (input: unknown) => readShot(input, { layers: LAYERS });
const asked = (input: unknown) => {
  const result = read(input);
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result;
};
const refused = (input: unknown) => {
  const result = read(input);
  if (result.ok) throw new Error('was accepted');
  return result.reason;
};

describe('a shot that says only its subject', () => {
  it('reads an address as the subject, featured, with nothing else stated', () => {
    expect(asked({ subject: { address: ADDRESS } })).toEqual({
      ok: true,
      shot: { v: 1, subject: { address: ADDRESS }, emphasis: { featured: true } },
      notes: [],
    });
  });

  it('features nothing when told not to, though its subject is an item', () => {
    expect(asked({ subject: { address: ADDRESS }, emphasis: { featured: false } }).shot.emphasis).toEqual({ featured: false });
  });

  it('reads a camera position as the subject, featuring nothing', () => {
    expect(asked({ subject: { view: { lat: 15, lng: 30, altitude: 2 } } }).shot).toEqual({
      v: 1, subject: { view: { lat: 15, lng: 30, altitude: 2 } }, emphasis: { featured: false },
    });
  });
});

describe('everything that is built, as it is asked', () => {
  it('keeps layers, time, look, card and output', () => {
    const { shot, notes } = asked({
      v: 1,
      subject: { address: ADDRESS },
      layers: { primary: 'WarConflict', pins: ['ConflictZones', 'IntelReports'] },
      time: { window: { from: 1_790_899_200, until: 1_791_158_400 } },
      emphasis: { featured: true },
      appearance: { skin: 'blueMarble', light: 'headlamp', nightFill: 0.3 },
      card: { preset: 'square' },
      output: { type: 'image/webp', quality: 0.8, scale: 2, maxBytes: 8_000_000 },
    });
    expect(notes).toEqual([]);
    expect(shot).toEqual({
      v: 1,
      subject: { address: ADDRESS },
      layers: { primary: 'WarConflict', pins: ['ConflictZones', 'IntelReports'] },
      time: { window: { from: 1_790_899_200, until: 1_791_158_400 } },
      emphasis: { featured: true },
      appearance: { skin: 'blueMarble', light: 'headlamp', nightFill: 0.3 },
      card: { preset: 'square' },
      output: { type: 'image/webp', quality: 0.8, scale: 2, maxBytes: 8_000_000 },
    });
  });

  it('reads live time, and pins alone', () => {
    expect(asked({ subject: { address: ADDRESS }, time: { live: true }, layers: { pins: [] } }).shot).toMatchObject({
      time: { live: true }, layers: { pins: [] },
    });
  });
});

describe('the guardrails, which are not fields', () => {
  it('never draws RLSH, as a layer or beside one', () => {
    expect(refused({ subject: { address: ADDRESS }, layers: { primary: 'RLSH' } })).toMatch(/RLSH/);
    expect(refused({ subject: { address: ADDRESS }, layers: { pins: ['WarConflict', 'RLSH'] } })).toMatch(/RLSH/);
  });

  it('raises a camera below the floor to it, and lowers one past the ceiling, and says so', () => {
    const low = asked({ subject: { view: { lat: 0, lng: 0, altitude: 0.2 } } });
    expect(low.shot.subject).toEqual({ view: { lat: 0, lng: 0, altitude: 1 } });
    expect(low.notes.join(' ')).toMatch(/raised to 1 globe radius, the floor/);
    const high = asked({ subject: { view: { lat: 0, lng: 0, altitude: 9 } } });
    expect(high.shot.subject).toEqual({ view: { lat: 0, lng: 0, altitude: 4 } });
    expect(high.notes.join(' ')).toMatch(/lowered to 4/);
  });

  it('refuses a field that would switch a guardrail off, as the unknown field it is', () => {
    expect(refused({ subject: { address: ADDRESS }, caveats: false })).toMatch(/unknown field "caveats"/);
    expect(refused({ subject: { address: ADDRESS }, card: { preset: 'wide', provenance: false } })).toMatch(/unknown field "card.provenance"/);
  });
});

describe('what is refused, and why', () => {
  it('anything but an object', () => {
    for (const input of [null, undefined, 'shot', 3, []]) expect(refused(input), String(input)).toMatch(/object/);
  });

  it('a version it does not read', () => {
    expect(refused({ v: 2, subject: { address: ADDRESS } })).toMatch(/version 2/);
  });

  it('no subject, two subjects, or a subject it cannot read', () => {
    expect(refused({})).toMatch(/subject/);
    expect(refused({ subject: { address: ADDRESS, view: { lat: 0, lng: 0, altitude: 2 } } })).toMatch(/one subject/);
    expect(refused({ subject: { address: '' } })).toMatch(/address/);
    expect(refused({ subject: { address: 'x'.repeat(400) } })).toMatch(/address/);
    expect(refused({ subject: { view: { lat: 95, lng: 0, altitude: 2 } } })).toMatch(/lat/);
    expect(refused({ subject: { view: { lat: 0, lng: 'east', altitude: 2 } } })).toMatch(/lng/);
  });

  it('a subject that is not built yet, naming what will build it', () => {
    expect(refused({ subject: { mission: 'x' } })).toMatch(/mission.*not built yet.*renderMission/);
  });

  it('a layer this build does not have, or too many beside it', () => {
    expect(refused({ subject: { address: ADDRESS }, layers: { primary: 'NoSuchLayer' } })).toMatch(/NoSuchLayer/);
    expect(refused({ subject: { address: ADDRESS }, layers: { pins: ['WarConflict', 'ConflictZones', 'IntelReports', 'SceneEvents', 'HeatRisk'] } }))
      .toMatch(/at most 4/);
  });

  it('a time that is not a window in whole unix seconds, or live (a moment is built since contract v19)', () => {
    expect(refused({ subject: { address: ADDRESS }, time: { window: { from: 10, until: 5 } } })).toMatch(/window/);
    expect(refused({ subject: { address: ADDRESS }, time: { window: { from: 1.5, until: 5 } } })).toMatch(/window/);
    expect(refused({ subject: { address: ADDRESS }, time: { live: false } })).toMatch(/live/);
  });

  it('featuring with no item to feature', () => {
    expect(refused({ subject: { view: { lat: 0, lng: 0, altitude: 2 } }, emphasis: { featured: true } })).toMatch(/featured/);
  });

  it('a look, a preset or an output it does not have', () => {
    expect(refused({ subject: { address: ADDRESS }, appearance: { skin: 'neon' } })).toMatch(/skin "neon"/);
    expect(refused({ subject: { address: ADDRESS }, appearance: { light: 'disco' } })).toMatch(/light "disco"/);
    expect(refused({ subject: { address: ADDRESS }, appearance: { nightFill: 2 } })).toMatch(/nightFill/);
    expect(refused({ subject: { address: ADDRESS }, card: { preset: 'banner' } })).toMatch(/banner/);
    expect(refused({ subject: { address: ADDRESS }, output: { type: 'image/gif' } })).toMatch(/image\/gif/);
    expect(refused({ subject: { address: ADDRESS }, output: { quality: 1.5 } })).toMatch(/quality/);
    expect(refused({ subject: { address: ADDRESS }, output: { scale: 0 } })).toMatch(/scale/);
    expect(refused({ subject: { address: ADDRESS }, output: { scale: 5 } })).toMatch(/scale/);
    expect(refused({ subject: { address: ADDRESS }, output: { maxBytes: -1 } })).toMatch(/maxBytes/);
  });
});

describe('how a card frames the planet (block I, item 2)', () => {
  it('reads what the camera framed, or the whole planet', () => {
    expect(asked({ subject: { address: ADDRESS }, framing: { fit: 'planet' } }).shot.framing).toEqual({ fit: 'planet' });
    expect(asked({ subject: { address: ADDRESS }, framing: { fit: 'view' } }).shot.framing).toEqual({ fit: 'view' });
    expect(asked({ subject: { address: ADDRESS } }).shot).not.toHaveProperty('framing');
  });

  it('refuses a fit it does not have', () => {
    expect(refused({ subject: { address: ADDRESS }, framing: { fit: 'zoom' } })).toMatch(/fit "zoom"/);
  });
});

describe('what only changes how it looks, and is not built yet: dropped, with a note', () => {
  it('drops each, says which, and makes the rest', () => {
    const { shot, notes } = asked({
      subject: { address: ADDRESS },
      framing: { tilt: 20, padding: 0.2 },
      layers: { primary: 'WarConflict', opacity: { WarConflict: 0.5 } },
      emphasis: { featured: true, others: 'spotlight' },
      appearance: { clouds: false },
      card: { preset: 'wide', template: 'critical_intel', callouts: true, timeZone: 'Asia/Kabul' },
    });
    expect(shot).toEqual({
      v: 1, subject: { address: ADDRESS }, layers: { primary: 'WarConflict' }, emphasis: { featured: true },
      card: { preset: 'wide', template: 'critical_intel' },
    });
    const said = notes.join('\n');
    for (const field of ['framing.tilt', 'framing.padding', 'layers.opacity', 'emphasis.others', 'appearance.clouds',
      'card.callouts', 'card.timeZone']) {
      expect(said, field).toContain(field);
    }
    expect(said).not.toContain('card.template');
  });

  it('notes a quality asked of a PNG, which has none', () => {
    const { shot, notes } = asked({ subject: { address: ADDRESS }, output: { type: 'image/png', quality: 0.5 } });
    expect(shot.output).toEqual({ type: 'image/png' });
    expect(notes.join(' ')).toMatch(/PNG has no quality/);
  });
});

// Mecha Jono's card templates (IM5, IM14): which one, read here; whether the item agrees, when it is staged.
describe('the card\'s template', () => {
  it('reads one it knows', () => {
    expect(asked({ subject: { address: ADDRESS }, card: { template: 'critical_intel' } }).shot.card).toEqual({ template: 'critical_intel' });
  });

  it('refuses one it does not know, naming those it has', () => {
    expect(refused({ subject: { address: ADDRESS }, card: { template: 'raver_watch.scene_event' } }))
      .toMatch(/^unknown template "raver_watch.scene_event": the templates are critical_intel, actionable_intel,/);
  });

  it('refuses one not built yet, with what will build it', () => {
    expect(refused({ subject: { address: ADDRESS }, card: { template: 'mission_package' } })).toMatch(/renderMission/);
  });

  it('refuses a template about one item on a shot that features none', () => {
    expect(refused({ subject: { view: { lat: 0, lng: 0, altitude: 2 } }, card: { template: 'critical_intel' } })).toMatch(/features none/);
    expect(refused({ subject: { address: ADDRESS }, emphasis: { featured: false }, card: { template: 'raver_alert' } })).toMatch(/features none/);
  });

  it('refuses a front page on a subject that is not its own', () => {
    expect(refused({ subject: { view: { lat: 0, lng: 0, altitude: 2 } }, card: { template: 'conflict_brief' } })).toMatch(/subject is \{ brief/);
    expect(refused({ subject: { brief: 'latest' }, card: { template: 'critical_intel' } })).toMatch(/a brief's card is conflict_brief/);
  });

  it('takes one that suits any card on either', () => {
    expect(asked({ subject: { view: { lat: 0, lng: 0, altitude: 2 } }, card: { template: 'hazard' } }).shot.card).toEqual({ template: 'hazard' });
  });
});

// Block I, item 5: alt text comes with every card, written from what it states; a shot can leave it off.
describe('the alt text', () => {
  it('reads card.inset as true or false (IM36)', () => {
    expect(asked({ subject: { address: ADDRESS }, card: { inset: true } }).shot.card).toMatchObject({ inset: true });
    expect(refused({ subject: { address: ADDRESS }, card: { inset: 'please' } })).toMatch(/card\.inset is true or false: a close-up of the featured item/);
    expect(SHOT_FIELDS.built).toContain('card.inset');
    expect(SHOT_FIELDS.notBuilt).not.toContain('card.inset');
  });

  it('reads card.qr as true or false (IM13)', () => {
    expect(asked({ subject: { address: ADDRESS }, card: { qr: true } }).shot.card).toMatchObject({ qr: true });
    expect(refused({ subject: { address: ADDRESS }, card: { qr: 'please' } })).toMatch(/card\.qr is true or false/);
    expect(SHOT_FIELDS.built).toContain('card.qr');
    expect(SHOT_FIELDS.notBuilt).not.toContain('card.qr');
  });

  it('reads output.alt as true or false', () => {
    expect(asked({ subject: { address: ADDRESS }, output: { alt: false } }).shot.output).toEqual({ alt: false });
    expect(refused({ subject: { address: ADDRESS }, output: { alt: 'Planes over Kabul' } })).toMatch(/output.alt is true or false: the alt text is written from what the card states/);
  });
});

// IM16: the War & Conflict Brief's front page is a subject of its own: a UTC day, or the newest.
describe('the brief as the subject', () => {
  it('reads the newest day, or a UTC day, as the subject, featuring nothing', () => {
    expect(asked({ subject: { brief: 'latest' } }).shot).toEqual({ v: 1, subject: { brief: 'latest' }, emphasis: { featured: false } });
    expect(asked({ subject: { brief: '2026-10-02' }, card: { template: 'conflict_brief' } }).shot.subject).toEqual({ brief: '2026-10-02' });
  });

  it('refuses a day it cannot read', () => {
    for (const day of ['2026-13-01', '2026-02-30', '2 Oct 2026', '2026-10-2', '', 20261002]) {
      expect(refused({ subject: { brief: day } }), String(day)).toMatch(/subject.brief is "latest" or a UTC day/);
    }
  });

  it('features nothing: a front page is about no one item', () => {
    expect(refused({ subject: { brief: 'latest' }, emphasis: { featured: true } })).toMatch(/needs an address/);
  });

  it('draws War & Conflict: another layer can be pinned beside it, not put in its place', () => {
    expect(refused({ subject: { brief: 'latest' }, layers: { primary: 'ConflictZones' } })).toMatch(/A brief draws War & Conflict/);
    expect(asked({ subject: { brief: 'latest' }, layers: { primary: 'WarConflict', pins: ['ConflictZones'] } }).shot.layers)
      .toEqual({ primary: 'WarConflict', pins: ['ConflictZones'] });
  });

  it('is one subject among the others, not beside them', () => {
    expect(refused({ subject: { brief: 'latest', address: ADDRESS } })).toMatch(/one subject/);
  });
});

// BA22, BA23: a card about an area, framed to its largest part, counting its Intel Reports.
describe('an area as the subject', () => {
  it('by its code, as listAreas() gives it, or a bare eu, read as the code', () => {
    expect(asked({ subject: { area: 'union:eu' } }).shot.subject).toEqual({ area: 'union:eu' });
    expect(asked({ subject: { area: 'EU' } }).shot.subject).toEqual({ area: 'union:eu' });
    expect(asked({ subject: { area: ' Zone:Sahel ' } }).shot.subject).toEqual({ area: 'zone:sahel' });
  });

  it('refuses an area no one defined, or one given as anything but its code', () => {
    expect(refused({ subject: { area: 'union:no-such-body' } })).toMatch(/listAreas\(\)/);
    expect(refused({ subject: { area: { jurisdiction: 'us-ca' } } })).toMatch(/listAreas\(\)/);
    expect(refused({ subject: { area: 'union:eu', address: ADDRESS } })).toMatch(/one subject/);
  });

  it('counts Intel Reports, so its primary layer is theirs; others may be pinned beside it', () => {
    expect(refused({ subject: { area: 'union:eu' }, layers: { primary: 'WarConflict' } })).toMatch(/Intel Reports/);
    expect(asked({ subject: { area: 'union:eu' }, layers: { primary: 'IntelReports', pins: ['WarConflict'] } }).shot.layers)
      .toEqual({ primary: 'IntelReports', pins: ['WarConflict'] });
  });

  it('features no item, so a card about one item is refused', () => {
    expect(refused({ subject: { area: 'union:eu' }, emphasis: { featured: true } })).toMatch(/emphasis.featured/);
    expect(refused({ subject: { area: 'union:eu' }, card: { template: 'critical_intel' } })).toMatch(/about one item/);
  });
});

// theatre-lens.md, TL3: a card about one War & Conflict theatre, its countries lit.
describe('a theatre as the subject', () => {
  it('by its slug, as the brief names it', () => {
    expect(asked({ subject: { theatre: 'russia-ukraine' } }).shot.subject).toEqual({ theatre: 'russia-ukraine' });
    expect(asked({ subject: { theatre: ' Sahel ' } }).shot.subject).toEqual({ theatre: 'sahel' });
  });

  it('refuses one that is not a slug, or beside another subject', () => {
    expect(refused({ subject: { theatre: 'Russia & Ukraine' } })).toMatch(/theatre's slug/);
    expect(refused({ subject: { theatre: 7 } })).toMatch(/theatre's slug/);
    expect(refused({ subject: { theatre: 'sahel', area: 'zone:sahel' } })).toMatch(/one subject/);
  });

  it('draws War & Conflict, so its primary layer is that; others may be pinned beside it', () => {
    expect(refused({ subject: { theatre: 'sahel' }, layers: { primary: 'IntelReports' } })).toMatch(/War & Conflict/);
    expect(asked({ subject: { theatre: 'sahel' }, layers: { primary: 'WarConflict', pins: ['IntelReports'] } }).shot.layers)
      .toEqual({ primary: 'WarConflict', pins: ['IntelReports'] });
  });

  it('features no item, so a card about one item is refused', () => {
    expect(refused({ subject: { theatre: 'sahel' }, emphasis: { featured: true } })).toMatch(/emphasis.featured/);
    expect(refused({ subject: { theatre: 'sahel' }, card: { template: 'critical_intel' } })).toMatch(/about one item/);
  });

  it('is a renderBatch request too', () => {
    expect(shotOfRequest({ theatre: 'sahel', preset: 'square' })).toEqual({ shot: { subject: { theatre: 'sahel' }, card: { preset: 'square' } } });
    expect(shotOfRequest({ theatre: 'sahel', address: ADDRESS })).toEqual({ refused: 'A request names one of an address, an area, a theatre, a brief, tonight, the week, the declassified day, a psi event or the PsiOps Briefing.' });
  });
});

describe('the fields, as the contract publishes them', () => {
  it('names each field as built, or not built yet', () => {
    expect(SHOT_FIELDS.built).toContain('subject.address');
    expect(SHOT_FIELDS.built).toContain('output.maxBytes');
    expect(SHOT_FIELDS.built).toContain('subject.theatre');
    expect(SHOT_FIELDS.notBuilt).not.toContain('subject.theatre');
    expect(SHOT_FIELDS.notBuilt).toContain('framing.tilt');
    expect(SHOT_FIELDS.built).toContain('framing.fit');
    expect(SHOT_FIELDS.built).toContain('card.template');
    expect(SHOT_FIELDS.built).toContain('subject.brief');
    expect(SHOT_FIELDS.built).toContain('output.alt');
    expect(SHOT_FIELDS.built).toContain('subject.area');
    expect(SHOT_FIELDS.built.filter((f) => SHOT_FIELDS.notBuilt.includes(f))).toEqual([]);
  });
});

describe('a renderBatch request, as a shot', () => {
  it('passes a shot through as it is', () => {
    const shot = { subject: { address: ADDRESS }, card: { preset: 'square' } };
    expect(shotOfRequest(shot)).toEqual({ shot });
  });

  it('reads a v9 request as the same shot: pins, window or live, preset and template', () => {
    expect(shotOfRequest({ address: ADDRESS, preset: 'square', layers: ['WarConflict'], window: { from: 1, until: 2 }, template: 'critical_intel' })).toEqual({
      shot: {
        subject: { address: ADDRESS },
        layers: { pins: ['WarConflict'] },
        time: { window: { from: 1, until: 2 } },
        card: { preset: 'square', template: 'critical_intel' },
      },
    });
    expect(shotOfRequest({ address: ADDRESS, window: null })).toEqual({ shot: { subject: { address: ADDRESS }, time: { live: true } } });
    expect(shotOfRequest({ address: ADDRESS })).toEqual({ shot: { subject: { address: ADDRESS } } });
  });

  it('reads an area request as a shot of the area (BA22)', () => {
    expect(shotOfRequest({ area: 'union:eu', preset: 'square', layers: ['WarConflict'] })).toEqual({
      shot: { subject: { area: 'union:eu' }, layers: { pins: ['WarConflict'] }, card: { preset: 'square' } },
    });
  });

  it('refuses what v9 refused, with its reasons', () => {
    expect(shotOfRequest(null)).toEqual({ refused: expect.stringMatching(/object/) });
    expect(shotOfRequest({ address: ADDRESS, area: {} })).toEqual({ refused: expect.stringMatching(/one of an address, an area, a theatre, a brief, tonight, the week, the declassified day, a psi event or the PsiOps Briefing/) });
    expect(shotOfRequest({ area: {} })).toEqual({ refused: expect.stringMatching(/listAreas\(\)/) });
    expect(shotOfRequest({})).toEqual({ refused: expect.stringMatching(/address/) });
    expect(shotOfRequest({ address: ADDRESS, layers: 'WarConflict' })).toEqual({ refused: expect.stringMatching(/list of layer ids/) });
  });
});

// IM20: a moment pauses the shared timeline there, with the sun there.
describe('a moment in time', () => {
  it('reads time.at as whole unix seconds', () => {
    expect(asked({ subject: { address: ADDRESS }, time: { at: 1_790_967_291 } }).shot.time).toEqual({ at: 1_790_967_291 });
  });

  it('takes a window in the history, before 1970 (D-EQ, EQ15)', () => {
    const from = Date.UTC(1964, 0, 1) / 1000;
    const until = Date.UTC(1965, 0, 1) / 1000;
    expect(asked({ subject: { address: ADDRESS }, time: { window: { from, until } } }).shot.time).toEqual({ window: { from, until } });
  });

  it('refuses a moment that is not whole seconds, and a moment beside a window or live', () => {
    // Before 2150 BC, the quakes' history's start (D-EQ, EQ15): seconds before 1970 are negative, and taken back to it.
    for (const at of [1.5, HISTORY_FLOOR_S - 1, '1790967291', null]) {
      expect(refused({ subject: { address: ADDRESS }, time: { at } }), String(at)).toMatch(/time.at is a moment in whole unix seconds/);
    }
    expect(refused({ subject: { address: ADDRESS }, time: { at: 5, window: { from: 1, until: 2 } } })).toMatch(/one of them/);
    expect(refused({ subject: { address: ADDRESS }, time: { at: 5, live: true } })).toMatch(/one of them/);
  });

  it('is built now', () => {
    expect(SHOT_FIELDS.built).toContain('time.at');
    expect(SHOT_FIELDS.notBuilt).not.toContain('time.at');
  });
});

/*
 * The four-theatre front page (theatre-lens.md, TL15; contract v37): the brief,
 * narrowed to its worst theatres, 1 to 4, lit together on one planet.
 */
describe('a brief narrowed to its worst theatres', () => {
  it('reads subject.theatres beside subject.brief, 1 to 4', () => {
    const shot = read({ subject: { brief: 'latest', theatres: 4 } });
    expect(shot).toMatchObject({ ok: true, shot: { subject: { brief: 'latest', theatres: 4 } } });
    expect(read({ subject: { brief: '2026-10-09', theatres: 1 } })).toMatchObject({ ok: true, shot: { subject: { brief: '2026-10-09', theatres: 1 } } });
    // Without it, the brief card as it was.
    expect((read({ subject: { brief: 'latest' } }) as { shot: { subject: object } }).shot.subject).toEqual({ brief: 'latest' });
    expect(SHOT_FIELDS.built).toContain('subject.theatres');
  });

  it('refuses a count that is not a whole number from 1 to 4, or one with no brief', () => {
    for (const theatres of [0, 5, 2.5, '4', null]) {
      expect(read({ subject: { brief: 'latest', theatres } })).toMatchObject({ ok: false, reason: expect.stringMatching(/^subject\.theatres is how many of the brief's theatres to light, worst first: 1 to 4/) });
    }
    expect(read({ subject: { theatre: 'russia-ukraine', theatres: 2 } })).toMatchObject({ ok: false, reason: expect.stringMatching(/subject\.theatres goes with subject\.brief/) });
  });

  it('is taken in a renderBatch request as { brief, theatres }', () => {
    expect(shotOfRequest({ brief: 'latest', theatres: 4, preset: 'square' })).toEqual({ shot: { subject: { brief: 'latest', theatres: 4 }, card: { preset: 'square' } } });
    expect(shotOfRequest({ brief: '2026-10-09' })).toEqual({ shot: { subject: { brief: '2026-10-09' } } });
    expect(shotOfRequest({ brief: 'latest', theatre: 'sahel' })).toEqual({ refused: 'A request names one of an address, an area, a theatre, a brief, tonight, the week, the declassified day, a psi event or the PsiOps Briefing.' });
  });
});

/*
 * Tonight's card (raver-nights.md, RN3; contract v38): Scene events, the twelve hours
 * from the shot's moment, on its own front page.
 */
describe('Hero Watch\'s week as the subject (D-HW, HW10)', () => {
  it('reads subject.week as "latest", drawn on a Hero Watch section', () => {
    expect(read({ subject: { week: 'latest' } })).toMatchObject({ ok: true, shot: { subject: { week: 'latest' } } });
    for (const primary of ['Relief', 'FieldMissions', 'Lifeboats']) {
      expect(read({ subject: { week: 'latest' }, layers: { primary, pins: ['Relief'] } }), primary).toMatchObject({ ok: true });
    }
    expect(SHOT_FIELDS.built).toContain('subject.week');
  });

  it('refuses another value, a layer not Hero Watch\'s, a template, or a window', () => {
    expect(read({ subject: { week: '2026-w41' } })).toMatchObject({ ok: false, reason: expect.stringMatching(/^subject\.week is "latest"/) });
    expect(read({ subject: { week: 'latest' }, layers: { primary: 'WarConflict' } }))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/primary layer is Relief, FieldMissions or Lifeboats/) });
    expect(read({ subject: { week: 'latest' }, card: { template: 'field_mission' } })).toMatchObject({ ok: false, reason: expect.stringMatching(/week's card takes no template/) });
    expect(read({ subject: { week: 'latest' }, time: { window: { from: 1_791_600_000, until: 1_791_643_200 } } }))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/^the week's card shows what stands at one moment/) });
    expect(read({ subject: { week: 'latest' }, time: { at: 1_791_600_000 } })).toMatchObject({ ok: true });
    expect(read({ subject: { week: 'latest', tonight: 'latest' } })).toMatchObject({ ok: false, reason: expect.stringMatching(/one subject/) });
  });

  it('is taken in a renderBatch request as { week }', () => {
    expect(shotOfRequest({ week: 'latest', preset: 'story' })).toEqual({ shot: { subject: { week: 'latest' }, card: { preset: 'story' } } });
    expect(shotOfRequest({ week: 'latest', tonight: 'latest' })).toEqual({ refused: 'A request names one of an address, an area, a theatre, a brief, tonight, the week, the declassified day, a psi event or the PsiOps Briefing.' });
  });
});

/* The declassified desk's day (plan H9; contract v58): Mecha Jono's releases, listed on their own front page. */
describe('the declassified desk\'s day as the subject', () => {
  it('reads subject.declassified as "latest" or a UTC day', () => {
    expect(read({ subject: { declassified: 'latest' } })).toMatchObject({ ok: true, shot: { subject: { declassified: 'latest' } } });
    expect(read({ subject: { declassified: '2026-10-23' }, card: { template: 'declassified' } })).toMatchObject({ ok: true, shot: { subject: { declassified: '2026-10-23' } } });
    expect(SHOT_FIELDS.built).toContain('subject.declassified');
  });

  it('refuses another value, another template, or its template on another subject', () => {
    expect(read({ subject: { declassified: 'today' } })).toMatchObject({ ok: false, reason: expect.stringMatching(/^subject\.declassified is "latest" or a UTC day/) });
    expect(read({ subject: { declassified: '2026-02-30' } })).toMatchObject({ ok: false, reason: expect.stringMatching(/^subject\.declassified is/) });
    expect(read({ subject: { declassified: 'latest' }, card: { template: 'context_report' } })).toMatchObject({ ok: false, reason: expect.stringMatching(/declassified day's card is declassified/) });
    expect(refused({ subject: { address: ADDRESS }, card: { template: 'declassified' } })).toMatch(/declassified desk's front page/);
    expect(read({ subject: { declassified: 'latest', week: 'latest' } })).toMatchObject({ ok: false, reason: expect.stringMatching(/one subject/) });
  });

  it('is taken in a renderBatch request as { declassified }', () => {
    expect(shotOfRequest({ declassified: 'latest', preset: 'square' })).toEqual({ shot: { subject: { declassified: 'latest' }, card: { preset: 'square' } } });
  });
});

describe('tonight as the subject', () => {
  it('reads subject.tonight as "latest", drawing Scene events', () => {
    expect(read({ subject: { tonight: 'latest' } })).toMatchObject({ ok: true, shot: { subject: { tonight: 'latest' } } });
    expect(read({ subject: { tonight: 'latest' }, layers: { primary: 'SceneEvents', pins: ['HeatRisk'] } })).toMatchObject({ ok: true });
    expect(SHOT_FIELDS.built).toContain('subject.tonight');
  });

  it('refuses another value, another primary layer, or a template: the templates are Mecha Jono\'s, and none is about tonight', () => {
    expect(read({ subject: { tonight: '2026-10-10' } })).toMatchObject({ ok: false, reason: expect.stringMatching(/^subject\.tonight is "latest"/) });
    expect(read({ subject: { tonight: 'latest' }, layers: { primary: 'WarConflict' } })).toMatchObject({ ok: false, reason: expect.stringMatching(/primary layer is SceneEvents/) });
    expect(read({ subject: { tonight: 'latest' }, card: { template: 'hazard' } })).toMatchObject({ ok: false, reason: expect.stringMatching(/tonight's card takes no template/) });
    // Tonight starts at one moment, so a window would leave it unsaid which.
    expect(read({ subject: { tonight: 'latest' }, time: { window: { from: 1_791_600_000, until: 1_791_643_200 } } }))
      .toMatchObject({ ok: false, reason: expect.stringMatching(/^tonight is the twelve hours from one moment: give time\.at, or time\.live/) });
    expect(shotOfRequest({ tonight: 'latest', window: { from: 1_791_600_000, until: 1_791_643_200 } })).toMatchObject({ shot: expect.anything() });
    expect(read(shotOfRequest({ tonight: 'latest', window: { from: 1_791_600_000, until: 1_791_643_200 } }).shot)).toMatchObject({ ok: false });
    expect(read({ subject: { tonight: 'latest' }, time: { at: 1_791_600_000 } })).toMatchObject({ ok: true, shot: { time: { at: 1_791_600_000 } } });
    expect(read({ subject: { tonight: 'latest' }, time: { live: true } })).toMatchObject({ ok: true });
  });

  it('is taken in a renderBatch request as { tonight }', () => {
    expect(shotOfRequest({ tonight: 'latest', preset: 'square' })).toEqual({ shot: { subject: { tonight: 'latest' }, card: { preset: 'square' } } });
    expect(shotOfRequest({ tonight: 'latest', brief: 'latest' })).toEqual({ refused: 'A request names one of an address, an area, a theatre, a brief, tonight, the week, the declassified day, a psi event or the PsiOps Briefing.' });
  });
});

describe('a psi event as the subject (D-PW, PW62; the kit\'s schemas_psi §3.6)', () => {
  const KEY = '86f824c3f1e67c60b1dc15ce110648c4de5c3fb879022fbbcc5e8deb720e402c';
  const SKY = `31923:${KEY}:psi-sky-aspect-Venus_Jupiter-h6k1-20261103T071907`;
  const WINDOW = `31923:${KEY}:psi-window-focus-20261101`;
  const PSI = [...LAYERS, 'PsiLines', 'PsiWindows', 'PsiField'];
  const readPsi = (input: unknown) => readShot(input, { layers: PSI });

  it('reads a sky event or a window by its address, at its exact moment unless a moment is given', () => {
    expect(readPsi({ subject: { psiEvent: SKY } })).toMatchObject({ ok: true, shot: { subject: { psiEvent: SKY, at: 'exact' } } });
    expect(readPsi({ subject: { psiEvent: WINDOW, at: 1793560000 } })).toMatchObject({ ok: true, shot: { subject: { psiEvent: WINDOW, at: 1793560000 } } });
    expect(SHOT_FIELDS.built).toEqual(expect.arrayContaining(['subject.psiEvent', 'subject.at']));
  });

  it('refuses another address, a moment that is not one, and subject.at without a psi event', () => {
    expect(readPsi({ subject: { psiEvent: `30023:${KEY}:psi-field-2026-10-26` } })).toMatchObject({ ok: false, reason: expect.stringMatching(/31923/) });
    expect(readPsi({ subject: { psiEvent: SKY, at: 'peak' } })).toMatchObject({ ok: false, reason: expect.stringMatching(/"exact" or a moment/) });
    expect(readPsi({ subject: { address: ADDRESS, at: 1 } })).toMatchObject({ ok: false, reason: expect.stringMatching(/subject\.at goes with subject\.psiEvent/) });
  });

  it('draws Psi Watch first, and is drawn at its own moment: time only repeats it', () => {
    expect(readPsi({ subject: { psiEvent: SKY }, layers: { primary: 'WarConflict' } })).toMatchObject({ ok: false, reason: expect.stringMatching(/PsiLines, PsiWindows/) });
    expect(readPsi({ subject: { psiEvent: SKY }, time: { live: true } })).toMatchObject({ ok: false, reason: expect.stringMatching(/drawn at its subject\.at/) });
    expect(readPsi({ subject: { psiEvent: SKY, at: 1793560000 }, time: { at: 1793560001 } })).toMatchObject({ ok: false });
    expect(readPsi({ subject: { psiEvent: SKY, at: 1793560000 }, time: { at: 1793560000 } })).toMatchObject({ ok: true });
  });

  it('is the psi card, and the psi card is a psi event\'s alone', () => {
    expect(readPsi({ subject: { psiEvent: SKY }, card: { template: 'psi' } })).toMatchObject({ ok: true, shot: { card: { template: 'psi' } } });
    expect(readPsi({ subject: { psiEvent: SKY }, card: { template: 'hazard' } })).toMatchObject({ ok: false, reason: 'a Psi Watch card is psi' });
    expect(readPsi({ subject: { view: { lat: 0, lng: 0, altitude: 2 } }, card: { template: 'psi' } })).toMatchObject({ ok: false, reason: expect.stringMatching(/psiEvent, at/) });
  });

  it('is taken in a renderBatch request as { psiEvent, at }', () => {
    expect(shotOfRequest({ psiEvent: SKY, at: 'exact', preset: 'square' })).toEqual({ shot: { subject: { psiEvent: SKY, at: 'exact' }, card: { preset: 'square' } } });
    expect(shotOfRequest({ psiEvent: SKY, week: 'latest' })).toEqual({ refused: expect.stringMatching(/a psi event or the PsiOps Briefing/) });
  });
});

describe('a Timestream strip in the card (D-PW, PW62, PW77)', () => {
  it('is true, for the card\'s moment ±3 days, or its own span and lanes', () => {
    expect(read({ subject: { address: ADDRESS }, card: { strip: true } })).toMatchObject({ ok: true, shot: { card: { strip: true } } });
    expect(read({ subject: { address: ADDRESS }, card: { strip: { from: 100, until: 200, lanes: ['kp', 'kp', 'windows'] } } }))
      .toMatchObject({ ok: true, shot: { card: { strip: { from: 100, until: 200, lanes: ['kp', 'windows'] } } } });
    expect(read({ subject: { address: ADDRESS }, card: { strip: false } })).toMatchObject({ ok: true });
    expect(SHOT_FIELDS.built).toContain('card.strip');
  });

  it('refuses a strip it cannot read, saying what a strip is', () => {
    expect(read({ subject: { address: ADDRESS }, card: { strip: 'yes' } })).toMatchObject({ ok: false, reason: expect.stringMatching(/card\.strip is true/) });
    expect(read({ subject: { address: ADDRESS }, card: { strip: { from: 200, until: 100 } } })).toMatchObject({ ok: false, reason: 'card.strip runs from before until' });
    expect(read({ subject: { address: ADDRESS }, card: { strip: { lanes: ['tides'] } } })).toMatchObject({ ok: false, reason: expect.stringMatching(/windows, kp, bodies/) });
    expect(read({ subject: { address: ADDRESS }, card: { strip: { span: 3 } } })).toMatchObject({ ok: false, reason: expect.stringMatching(/card\.strip\.span/) });
  });
});

describe('an event chart in the card (D-PW, PW87)', () => {
  it('reads when and where, its title, the sky outside\'s moment and its frame', () => {
    expect(read({ subject: { address: ADDRESS }, card: { chart: { at: 1_794_300_000, lat: 3, lng: 41 } } }))
      .toMatchObject({ ok: true, shot: { card: { chart: { at: 1_794_300_000, lat: 3, lng: 41 } } } });
    expect(read({ subject: { address: ADDRESS }, card: { chart: { at: 1_794_300_000, lat: 3, lng: 41, title: '  Mandera ', cursorAt: 1_794_400_000, frame: 'tropical' } } }))
      .toMatchObject({ ok: true, shot: { card: { chart: { title: 'Mandera', cursorAt: 1_794_400_000, frame: 'tropical' } } } });
    expect(SHOT_FIELDS.built).toContain('card.chart');
  });

  it('refuses a chart it cannot read, saying what a chart is', () => {
    expect(read({ subject: { address: ADDRESS }, card: { chart: true } })).toMatchObject({ ok: false, reason: expect.stringMatching(/card\.chart is \{ at, lat, lng/) });
    expect(read({ subject: { address: ADDRESS }, card: { chart: { lat: 3, lng: 41 } } })).toMatchObject({ ok: false, reason: expect.stringMatching(/card\.chart\.at/) });
    expect(read({ subject: { address: ADDRESS }, card: { chart: { at: 1_794_300_000, lat: 95, lng: 41 } } })).toMatchObject({ ok: false, reason: expect.stringMatching(/latitude/) });
    expect(read({ subject: { address: ADDRESS }, card: { chart: { at: 1_794_300_000, lat: 3, lng: 41, frame: 'lahiri' } } })).toMatchObject({ ok: false, reason: 'card.chart.frame is galactic or tropical' });
    expect(read({ subject: { address: ADDRESS }, card: { chart: { at: 1_794_300_000, lat: 3, lng: 41, houses: 'koch' } } })).toMatchObject({ ok: false, reason: expect.stringMatching(/card\.chart\.houses/) });
  });
});

describe('the PsiOps Briefing as the subject (D-PW, PW77)', () => {
  const PSI = [...LAYERS, 'PsiLines', 'PsiWindows', 'PsiRifts'];
  const readPsi = (input: unknown) => readShot(input, { layers: PSI });

  it('is "latest", at the shot\'s moment or now, on the psi card', () => {
    expect(readPsi({ subject: { psiBriefing: 'latest' }, time: { at: 1_793_500_000 } })).toMatchObject({ ok: true, shot: { subject: { psiBriefing: 'latest' } } });
    expect(readPsi({ subject: { psiBriefing: 'latest' }, card: { template: 'psi', strip: false } })).toMatchObject({ ok: true, shot: { card: { template: 'psi', strip: false } } });
    expect(SHOT_FIELDS.built).toContain('subject.psiBriefing');
  });

  it('refuses another value, a window of time, and another template', () => {
    expect(readPsi({ subject: { psiBriefing: 'today' } })).toMatchObject({ ok: false, reason: expect.stringMatching(/"latest"/) });
    expect(readPsi({ subject: { psiBriefing: 'latest' }, time: { window: { from: 1, until: 2 } } })).toMatchObject({ ok: false, reason: expect.stringMatching(/the week from one moment/) });
    expect(readPsi({ subject: { psiBriefing: 'latest' }, card: { template: 'hazard' } })).toMatchObject({ ok: false, reason: 'a Psi Watch card is psi' });
  });

  it('is taken in a renderBatch request as { psiBriefing }', () => {
    expect(shotOfRequest({ psiBriefing: 'latest', preset: 'portrait' })).toEqual({ shot: { subject: { psiBriefing: 'latest' }, card: { preset: 'portrait' } } });
  });
});

/**
 * The roster's one shape (decision D-RS, RS16–RS18; interchange rev 14, "Roster Item — 30084"): every kind of
 * larger work as one addressable event, built from an item and read back from an event, refused past the
 * limits the spec states, its two links kept apart.
 */
import { describe, it, expect } from 'vitest';
import { ROSTER_ITEM_KIND, ROSTER_TOPIC, rosterTemplate, readRosterEvent, coordinateOf, type RosterItem } from '../rosterItem';

const PK = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const directive: RosterItem = {
  d: 'directive-drug-supply', kind: 'directive', title: 'Map the drug supply at events',
  purpose: 'So that people at events know what is in circulation before they take anything.',
  limits: ['Never name or place a person.', 'Public, lawful places only.'],
  window: { from: '2026-10-17', until: '' },
  places: ['us-ca', 'union:eu'],
  toward: [{ coordinate: `30084:${OTHER}:cause-harm-reduction`, relay: '' }],
  counts: [{ coordinate: `30079:${PK}:starcom_mission_package_naloxone-sf`, relay: 'wss://record.cosmiccodex.app' }],
  text: 'What we look for, and why.',
};

describe('rosterTemplate', () => {
  it('writes the item as the spec\'s tags, in its order', () => {
    const t = rosterTemplate(directive);
    expect(t.kind).toBe(ROSTER_ITEM_KIND);
    expect(ROSTER_ITEM_KIND).toBe(30084);
    expect(t.content).toBe('What we look for, and why.');
    expect(t.tags).toEqual([
      ['d', 'directive-drug-supply'],
      ['t', ROSTER_TOPIC],
      ['roster', 'directive'],
      ['title', 'Map the drug supply at events'],
      ['purpose', 'So that people at events know what is in circulation before they take anything.'],
      ['limit', 'Never name or place a person.'],
      ['limit', 'Public, lawful places only.'],
      ['window', '2026-10-17', ''],
      ['place', 'us-ca'],
      ['place', 'union:eu'],
      ['a', `30084:${OTHER}:cause-harm-reduction`, '', 'toward'],
      ['a', `30079:${PK}:starcom_mission_package_naloxone-sf`, 'wss://record.cosmiccodex.app', 'counts'],
      ['alt', 'Starcom roster item: Directive · Map the drug supply at events'],
    ]);
  });

  it('leaves out what the item does not state', () => {
    const t = rosterTemplate({ d: 'q1', kind: 'quest', title: 'Learn to read a drug-check alert', limits: [], places: [], toward: [], counts: [], text: '' });
    expect(t.tags.map((tag) => tag[0])).toEqual(['d', 't', 'roster', 'title', 'alt']);
  });
});

describe('readRosterEvent', () => {
  const event = (over: { tags?: string[][]; content?: string; pubkey?: string } = {}) => ({
    kind: 30084, pubkey: over.pubkey ?? PK, created_at: 1_792_200_000, content: over.content ?? '',
    tags: over.tags ?? rosterTemplate(directive).tags,
  });

  it('reads back what was written, with its author and its address', () => {
    const read = readRosterEvent(event({ content: directive.text }));
    expect(read).toEqual({ ok: true, item: { ...directive, author: PK, createdAt: 1_792_200_000, address: `30084:${PK}:directive-drug-supply` } });
  });

  it('keeps the two links apart: a claim toward, and what its author counts', () => {
    const read = readRosterEvent(event());
    expect(read.ok && read.item.toward.map((l) => l.coordinate)).toEqual([`30084:${OTHER}:cause-harm-reduction`]);
    expect(read.ok && read.item.counts.map((l) => l.coordinate)).toEqual([`30079:${PK}:starcom_mission_package_naloxone-sf`]);
  });

  it('refuses an event without its address, its topic, a known kind or a title', () => {
    const without = (name: string) => event({ tags: rosterTemplate(directive).tags.filter((t) => t[0] !== name) });
    expect(readRosterEvent(without('d'))).toEqual({ ok: false, reason: 'no d tag' });
    expect(readRosterEvent(without('t'))).toEqual({ ok: false, reason: 'not tagged starcom_roster' });
    expect(readRosterEvent(without('title'))).toEqual({ ok: false, reason: 'no title' });
    const unknown = event({ tags: rosterTemplate(directive).tags.map((t) => (t[0] === 'roster' ? ['roster', 'crusade'] : t)) });
    expect(readRosterEvent(unknown)).toEqual({ ok: false, reason: 'a kind this build does not know: crusade', unknownKind: 'crusade' });
    expect(readRosterEvent({ ...event(), kind: 30023 })).toEqual({ ok: false, reason: 'not kind 30084' });
  });

  it('refuses one past the spec\'s limits, rather than cutting it', () => {
    const tags = rosterTemplate(directive).tags;
    const swap = (name: string, value: string) => event({ tags: tags.map((t) => (t[0] === name ? [name, value] : t)) });
    expect(readRosterEvent(swap('title', 'x'.repeat(201)))).toMatchObject({ ok: false, reason: 'title over 200 characters' });
    expect(readRosterEvent(swap('purpose', 'x'.repeat(1001)))).toMatchObject({ ok: false, reason: 'purpose over 1,000 characters' });
    expect(readRosterEvent(event({ content: 'x'.repeat(20_001) }))).toMatchObject({ ok: false, reason: 'text over 20,000 characters' });
    const limits = Array.from({ length: 21 }, (_, i) => ['limit', `limit ${i}`]);
    expect(readRosterEvent(event({ tags: [...tags, ...limits] }))).toMatchObject({ ok: false, reason: 'over 20 limits' });
  });

  it('drops a link that is not a roster item or a mission package, and a window that is not a date', () => {
    const tags = [
      ...rosterTemplate({ ...directive, toward: [], counts: [], window: undefined }).tags,
      ['a', '30023:' + PK + ':note', '', 'toward'],
      ['a', 'nonsense', '', 'counts'],
      ['a', `30084:${OTHER}:fine`, '', 'sideways'],
      ['window', 'soon', 'later'],
    ];
    const read = readRosterEvent(event({ tags }));
    expect(read.ok && read.item.toward).toEqual([]);
    expect(read.ok && read.item.counts).toEqual([]);
    expect(read.ok && read.item.window).toBeUndefined();
  });

  it('withdraws a retracted item', () => {
    const tags = [...rosterTemplate(directive).tags, ['t', 'retracted']];
    expect(readRosterEvent(event({ tags }))).toEqual({ ok: false, reason: 'retracted', retracted: true });
  });
});

describe('coordinateOf', () => {
  it('names an item by its kind, its author and its d', () => {
    expect(coordinateOf(PK, 'directive-drug-supply')).toBe(`30084:${PK}:directive-drug-supply`);
  });
});

/*
 * Each kind's own tags, as its screens come (rev 14, "What each kind adds"): a Directive's end state (RS2), an
 * Epic's criteria as counts with their targets and its evidence standard (RS7).
 */
describe('the Directive\'s and the Epic\'s own tags', () => {
  const epic: RosterItem = {
    d: 'epic-bay', kind: 'epic', title: 'Every Bay Area venue checked', purpose: 'So that no one buys blind.',
    limits: [], places: [], toward: [], counts: [], text: '',
    criteria: [{ label: 'Venues checked', target: 40 }, { label: 'Alerts posted', target: 12 }],
    evidence: 'A drug-check result from a named lab, linked.',
  };

  it('writes and reads an epic\'s criteria and evidence standard', () => {
    const t = rosterTemplate(epic);
    expect(t.tags).toEqual(expect.arrayContaining([
      ['criterion', 'Venues checked', '40'], ['criterion', 'Alerts posted', '12'],
      ['evidence', 'A drug-check result from a named lab, linked.'],
    ]));
    const read = readRosterEvent({ ...t, pubkey: PK, created_at: 1 });
    expect(read.ok && read.item.criteria).toEqual(epic.criteria);
    expect(read.ok && read.item.evidence).toBe(epic.evidence);
  });

  it('writes and reads a directive\'s end state', () => {
    const t = rosterTemplate({ ...directive, endState: 'Every major event in California has a published check.' });
    expect(t.tags).toEqual(expect.arrayContaining([['end_state', 'Every major event in California has a published check.']]));
    const read = readRosterEvent({ ...t, pubkey: PK, created_at: 1 });
    expect(read.ok && read.item.endState).toBe('Every major event in California has a published check.');
  });

  it('drops a criterion that is not a whole count, and refuses past the limits', () => {
    const t = rosterTemplate(epic);
    const bad = [...t.tags, ['criterion', 'Fractional', '2.5'], ['criterion', '', '3'], ['criterion', 'Zero', '0']];
    const read = readRosterEvent({ ...t, tags: bad, pubkey: PK, created_at: 1 });
    expect(read.ok && read.item.criteria?.map((c) => c.label)).toEqual(['Venues checked', 'Alerts posted']);
    const many = [...t.tags, ...Array.from({ length: 20 }, (_, i) => ['criterion', `c${i}`, '1'])];
    expect(readRosterEvent({ ...t, tags: many, pubkey: PK, created_at: 1 })).toMatchObject({ ok: false, reason: 'over 20 criteria' });
    const long = t.tags.map((x) => (x[0] === 'evidence' ? ['evidence', 'x'.repeat(1001)] : x));
    expect(readRosterEvent({ ...t, tags: long, pubkey: PK, created_at: 1 })).toMatchObject({ ok: false, reason: 'evidence over 1,000 characters' });
  });
});

/* An Operation's own tags (RS6, RS27): who coordinates it, and that it ended, when and why. */
describe('the Operation\'s tags', () => {
  const op: RosterItem = {
    d: 'operation-geminids', kind: 'operation', title: 'Count the Geminids from dark sites',
    limits: [], places: ['us-ca'], toward: [], counts: [], text: '',
    window: { from: '2026-12-13', until: '2026-12-15' },
    coordinator: OTHER, ended: { date: '2026-12-14', why: 'Clouded out everywhere.' },
  };

  it('writes and reads its coordinator and its end', () => {
    const t = rosterTemplate(op);
    expect(t.tags).toEqual(expect.arrayContaining([['coordinator', OTHER], ['ended', '2026-12-14', 'Clouded out everywhere.']]));
    const read = readRosterEvent({ ...t, pubkey: PK, created_at: 1 });
    expect(read.ok && read.item.coordinator).toBe(OTHER);
    expect(read.ok && read.item.ended).toEqual({ date: '2026-12-14', why: 'Clouded out everywhere.' });
  });

  it('drops a coordinator that is not a key, and an end that is not a date', () => {
    const t = rosterTemplate(op);
    const tags = t.tags.map((x) => (x[0] === 'coordinator' ? ['coordinator', 'npub-ish'] : x[0] === 'ended' ? ['ended', 'soon', 'why'] : x));
    const read = readRosterEvent({ ...t, tags, pubkey: PK, created_at: 1 });
    expect(read.ok && read.item.coordinator).toBeUndefined();
    expect(read.ok && read.item.ended).toBeUndefined();
  });
});

/* An Adventure (RS10, RS33): a call over missions, kept only with what the safety rules need. */
describe('the Adventure\'s call', () => {
  const TRIAL = `30079:${PK}:starcom_mission_package_aurora-watch`;
  const adventure: RosterItem = {
    d: 'adventure-aurora-mn', kind: 'adventure', title: 'Aurora tonight over Minnesota',
    purpose: 'Look north from a dark public place, and say whether you saw it.',
    call: { what: 'Aurora likely as far south as Minnesota', odds: 'Kp 7 forecast; the 30-minute oval shows 60% at 46°N', source: 'https://www.swpc.noaa.gov/products/aurora-30-minute-forecast' },
    hazards: ['Cold after midnight', 'Dark roads'], access: 'public', fromHome: 'Watch NOAA\'s live aurora oval.',
    limits: ['Never stop on a road shoulder.'], places: ['us-mn'], toward: [],
    counts: [{ coordinate: TRIAL, relay: '' }], text: '',
    window: { from: '2026-10-17T02:00Z', until: '2026-10-17T09:00Z' },
  };
  const readOf = (tags: string[][]) => readRosterEvent({ kind: 30084, pubkey: PK, created_at: 1, content: '', tags });

  it('writes its call after its purpose, then its hazards, access and way from home, and reads them back', () => {
    const t = rosterTemplate(adventure);
    expect(t.tags.slice(4, 10)).toEqual([
      ['purpose', 'Look north from a dark public place, and say whether you saw it.'],
      ['call', 'Aurora likely as far south as Minnesota', 'Kp 7 forecast; the 30-minute oval shows 60% at 46°N', 'https://www.swpc.noaa.gov/products/aurora-30-minute-forecast'],
      ['hazard', 'Cold after midnight'],
      ['hazard', 'Dark roads'],
      ['access', 'public'],
      ['from_home', 'Watch NOAA\'s live aurora oval.'],
    ]);
    const read = readOf(t.tags);
    expect(read.ok && read.item.call).toEqual(adventure.call);
    expect(read.ok && [read.item.hazards, read.item.access, read.item.fromHome]).toEqual([['Cold after midnight', 'Dark roads'], 'public', 'Watch NOAA\'s live aurora oval.']);
  });

  it('refuses one without a hazard, public access or a way from home (RS43), or past their limits', () => {
    const t = rosterTemplate(adventure).tags;
    const needs = { ok: false, reason: 'an adventure needs its hazards, public access and a way to take part from home' };
    expect(readOf(t.filter((x) => x[0] !== 'hazard'))).toMatchObject(needs);
    expect(readOf(t.filter((x) => x[0] !== 'access'))).toMatchObject(needs);
    expect(readOf(t.map((x) => (x[0] === 'access' ? ['access', 'members'] : x)))).toMatchObject(needs);
    expect(readOf(t.filter((x) => x[0] !== 'from_home'))).toMatchObject(needs);
    expect(readOf(t.map((x) => (x[0] === 'from_home' ? ['from_home', '  '] : x)))).toMatchObject(needs);
    expect(readOf(t.map((x) => (x[0] === 'from_home' ? ['from_home', 'x'.repeat(301)] : x)))).toMatchObject({ ok: false, reason: 'way from home over 300 characters' });
    expect(readOf([...t, ...Array.from({ length: 10 }, (_, i) => ['hazard', `h${i}`])])).toMatchObject({ ok: false, reason: 'over 10 hazards' });
    expect(readOf(t.map((x) => (x[0] === 'hazard' ? ['hazard', 'x'.repeat(301)] : x)))).toMatchObject({ ok: false, reason: 'a hazard over 300 characters' });
  });

  it('refuses one without a call, a window with both ends, a place, or a mission package as its trials', () => {
    const t = rosterTemplate(adventure).tags;
    const without = (name: string) => t.filter((x) => x[0] !== name);
    expect(readOf(without('call'))).toMatchObject({ ok: false, reason: 'an adventure needs a call: what, its odds and their source' });
    expect(readOf(t.map((x) => (x[0] === 'window' ? ['window', '2026-10-17T02:00Z', ''] : x)))).toMatchObject({ ok: false, reason: 'an adventure needs a window with both ends' });
    expect(readOf(without('place'))).toMatchObject({ ok: false, reason: 'an adventure needs a place' });
    expect(readOf(t.map((x) => (x[0] === 'a' ? ['a', `30084:${OTHER}:quest-x`, '', 'counts'] : x)))).toMatchObject({ ok: false, reason: 'an adventure needs a mission package as its trials' });
  });

  it('refuses a call with no odds, no source, a source that is not an https link, or past its limits', () => {
    const t = rosterTemplate(adventure).tags;
    const call = (...v: string[]) => t.map((x) => (x[0] === 'call' ? ['call', ...v] : x));
    const needs = { ok: false, reason: 'an adventure needs a call: what, its odds and their source' };
    expect(readOf(call('Aurora likely', '', 'https://www.swpc.noaa.gov/'))).toMatchObject(needs);
    expect(readOf(call('Aurora likely', 'Kp 7', ''))).toMatchObject(needs);
    expect(readOf(call('Aurora likely', 'Kp 7', 'http://www.swpc.noaa.gov/'))).toMatchObject(needs);
    expect(readOf(call('Aurora likely', 'Kp 7', 'javascript:alert(1)'))).toMatchObject(needs);
    expect(readOf(call('x'.repeat(201), 'Kp 7', 'https://www.swpc.noaa.gov/'))).toMatchObject({ ok: false, reason: 'call over 200 characters' });
    expect(readOf(call('Aurora likely', 'x'.repeat(301), 'https://www.swpc.noaa.gov/'))).toMatchObject({ ok: false, reason: 'odds over 300 characters' });
    expect(readOf(call('Aurora likely', 'Kp 7', `https://www.swpc.noaa.gov/${'x'.repeat(500)}`))).toMatchObject({ ok: false, reason: 'source over 500 characters' });
  });

  it('keeps no call on another kind', () => {
    const tags = [...rosterTemplate(directive).tags, ['call', 'Aurora likely', 'Kp 7', 'https://www.swpc.noaa.gov/']];
    const read = readOf(tags);
    expect(read.ok && read.item.call).toBeUndefined();
  });
});

/* An Initiative (RS3, RS54): a proposal, its problem, a first step, who it is for, and what it grew into. */
describe('the Initiative\'s tags', () => {
  const campaign = `30084:${PK}:campaign-defibrillators`;
  const initiative: RosterItem = {
    d: 'initiative-defibrillators', kind: 'initiative', title: 'Map the town\'s defibrillators',
    purpose: 'No one knows where they are.', firstStep: 'List the ones in public buildings.', forWhom: 'Anyone in Ames',
    limits: [], places: ['us-ia'], toward: [], counts: [], grewInto: [{ coordinate: campaign, relay: '' }], text: '',
  };

  it('writes its first step and whom it is for after its purpose, and what it grew into after its links, and reads them back', () => {
    const t = rosterTemplate(initiative);
    const names = t.tags.map((x) => x[0]);
    expect(names.indexOf('first_step')).toBe(names.indexOf('purpose') + 1);
    expect(t.tags).toEqual(expect.arrayContaining([
      ['first_step', 'List the ones in public buildings.'], ['for', 'Anyone in Ames'], ['a', campaign, '', 'grew_into'],
    ]));
    expect(names.indexOf('a')).toBeGreaterThan(names.indexOf('place'));
    const read = readRosterEvent({ ...t, pubkey: PK, created_at: 1 });
    expect(read.ok && read.item).toMatchObject({ firstStep: 'List the ones in public buildings.', forWhom: 'Anyone in Ames', grewInto: [{ coordinate: campaign, relay: '' }] });
    // What it grew into is neither its claim nor its count.
    expect(read.ok && [read.item.toward, read.item.counts]).toEqual([[], []]);
  });

  it('keeps only a roster item as what it grew into, and refuses past the limits', () => {
    const t = rosterTemplate(initiative);
    const asPackage = t.tags.map((x) => (x[3] === 'grew_into' ? ['a', `30079:${PK}:starcom_mission_package_x`, '', 'grew_into'] : x));
    const read = readRosterEvent({ ...t, tags: asPackage, pubkey: PK, created_at: 1 });
    expect(read.ok && read.item.grewInto).toBeUndefined();
    const long = (name: string, n: number) => t.tags.map((x) => (x[0] === name ? [name, 'x'.repeat(n)] : x));
    expect(readRosterEvent({ ...t, tags: long('first_step', 1001), pubkey: PK, created_at: 1 })).toMatchObject({ ok: false, reason: 'first step over 1,000 characters' });
    expect(readRosterEvent({ ...t, tags: long('for', 301), pubkey: PK, created_at: 1 })).toMatchObject({ ok: false, reason: 'whom it is for over 300 characters' });
    const many = [...t.tags, ...Array.from({ length: 10 }, (_, i) => ['a', `30084:${PK}:epic-${i}`, '', 'grew_into'])];
    expect(readRosterEvent({ ...t, tags: many, pubkey: PK, created_at: 1 })).toMatchObject({ ok: false, reason: 'grew into over 10 items' });
  });
});

describe('another app\'s story, as read (RS58)', () => {
  it('comes with what names or places people held back, and nothing else changed; other kinds are read as signed', () => {
    const tags = rosterTemplate({ d: 's1', kind: 'story', title: 'The night we counted', limits: [], places: [], toward: [], counts: [], text: '' }).tags;
    const read = readRosterEvent({ kind: 30084, pubkey: 'b'.repeat(64), created_at: 1_792_000_000, tags, content: 'Twelve kits.\nText 505-555-0142 to help.' });
    if (!read.ok) throw new Error(read.reason);
    expect(read.item.text).toBe('Twelve kits.\n[held back: a phone number]');
    expect(read.item.heldBack).toEqual(['Line 2 of its text: a phone number']);
    const quest = rosterTemplate({ d: 'q2', kind: 'quest', title: 'Call 505-555-0142', limits: [], places: [], toward: [], counts: [], text: '' });
    const other = readRosterEvent({ kind: 30084, pubkey: 'b'.repeat(64), created_at: 1_792_000_000, tags: quest.tags, content: '' });
    if (!other.ok) throw new Error(other.reason);
    expect(other.item.title).toBe('Call 505-555-0142');
    expect(other.item).not.toHaveProperty('heldBack');
  });
});


/**
 * A story never names or places people (decision D-RS, RS11; the owner's RS51, 2026-10-18): before a story is
 * posted, Starcom looks for what names a person, a key, a handle, an email address or a phone number, and what
 * places one, map coordinates or a street address, and says which line. People's names cannot be told from the
 * names of places, so they stay with the author, as the editor's reminder says.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { nip19 } from 'nostr-tools';
import { holdBackStory, storyProblems, storyProblemsText } from '../storyCheck';

const story = (text: string, over: { title?: string; purpose?: string; limits?: string[] } = {}) =>
  storyProblems({ title: over.title ?? 'After action: the aurora watch', purpose: over.purpose, limits: over.limits ?? [], text });
const kinds = (text: string) => story(text).map((p) => p.what);

const NPUB = 'npub1vvquf5qy5vgxfeasj50a6dygzklxsg46s5gk83r3tdxj7y2ha73qwsv9ue';
const HEX = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
/** Made here, from a key nobody uses, so no secret key is written into the source (the public mirror refuses one). */
const NSEC = nip19.nsecEncode(new Uint8Array(32).fill(7));

describe('what names a person', () => {
  it('finds a key, as npub, nprofile or hex', () => {
    expect(kinds(`Met ${NPUB} at the gate.`)).toEqual(['key']);
    expect(kinds('Ask nprofile1qqsrhuxx8l9ex335q7he0f09aej04zpazpl0ne2cgukyawd24mayt8gpp4mhxue69uhhytnc9e3k7mgpz4mhxue69uhkg6nzv9ejuumpv34kytnrdaksjlyr9p about it.')).toEqual(['key']);
    expect(kinds(`Signed by ${HEX}.`)).toEqual(['key']);
  });

  it('finds a secret key, and says never to post one', () => {
    const [problem] = story(`My key is ${NSEC} for now.`);
    expect(problem.what).toBe('secret key');
    expect(problem.said).toBe('Never post a secret key: take it out.');
  });

  it('finds a handle, an email address and a phone number', () => {
    expect(kinds('Thanks to @nightowl_42 for the lift.')).toEqual(['handle']);
    expect(kinds('Write to sam.r@example.org for the photos.')).toEqual(['email']);
    expect(kinds('Call +1 (555) 123-4567 if you are lost.')).toEqual(['phone']);
    expect(kinds('Or 555-123-4567.')).toEqual(['phone']);
  });
});

describe('what places a person', () => {
  it('finds map coordinates, as numbers or in degrees and minutes', () => {
    expect(kinds('We stood at 37.7749, -122.4194 all night.')).toEqual(['coordinates']);
    expect(kinds('The pin: https://maps.example/@44.98,-93.27,12z')).toEqual(['coordinates']);
    expect(kinds('Near 45°30′N 73°34′W.')).toEqual(['coordinates']);
  });

  it('finds a street address', () => {
    expect(kinds('We met at 161 Erie Street.')).toEqual(['street address']);
    expect(kinds('Rendez-vous Rue de Rivoli 12.')).toEqual(['street address']);
    expect(kinds('Treffpunkt Hauptstraße 5.')).toEqual(['street address']);
  });
});

describe('what it leaves alone', () => {
  it('passes a story that names towns, dates, times and counts', () => {
    expect(story([
      'We counted 40 people at the vigil in Ames, Iowa, on 2026-11-12 at 21:00.',
      'Kp reached 7.33 by 02:00Z; the sky cleared over Highway 30 towns.',
      'Rounded to the nearest 0.1°, as Starcom draws it: 1 000 000 photons, give or take.',
      'Email the organisers through the event page. Saturday, 4 Oct: 12 of 20 trials done.',
      'It began 2026-11-12 21:00Z. Tickets were 95.50, 130.25 or 120.50, 60.75 at the door.',
    ].join('\n'))).toEqual([]);
  });
});

describe('where it says the problem is', () => {
  it('names the field and the line, quoting a little of what it found', () => {
    const problems = story(['All went well.', '', `Met ${NPUB} at the gate.`].join('\n'), { title: 'With @nightowl_42' });
    expect(problems.map((p) => [p.field, p.line, p.what])).toEqual([['title', 1, 'handle'], ['text', 3, 'key']]);
    expect(problems[1].found).toBe('npub1vvquf5qy5vgxfea…');
    expect(storyProblemsText(problems)).toBe([
      'Its title: “@nightowl_42”. A story never names people: take out the handle.',
      'Line 3 of its text: “npub1vvquf5qy5vgxfea…”. A story never names people: take out the key.',
    ].join('\n'));
  });

  it('reads its purpose and its limits too', () => {
    expect(story('Fine.', { purpose: 'For 555-123-4567', limits: ['Not past 161 Erie Street'] }).map((p) => p.field)).toEqual(['purpose', 'limit']);
  });
});

describe('holdBackStory (RS58): another app\'s story as a reader sees it', () => {
  it('replaces each line that names or places a person by what was held back, and keeps the rest as signed', () => {
    const read = holdBackStory({
      title: 'After action: the aurora watch',
      purpose: 'Count the clear skies.\nCall me on +1 505 555 0142',
      limits: ['Stay on public land', 'Meet at 44.9778, -93.2650'],
      text: 'We saw it at 23:10.\nMail jo@example.org for photos and call +1 505 555 0142.\nSix of us went.',
    });
    expect(read.title).toBe('After action: the aurora watch');
    expect(read.purpose).toBe('Count the clear skies.\n[held back: a phone number]');
    expect(read.limits).toEqual(['Stay on public land', '[held back: coordinates]']);
    expect(read.text).toBe('We saw it at 23:10.\n[held back: an email address, a phone number]\nSix of us went.');
    expect(read.heldBack).toEqual([
      'Line 2 of its purpose: a phone number',
      'Its limit 2: coordinates',
      'Line 2 of its text: an email address',
      'Line 2 of its text: a phone number',
    ]);
    expect(JSON.stringify(read)).not.toMatch(/555|jo@example|44\.9778/);
  });

  it('holds back a title that fails, and leaves a story that passes untouched', () => {
    expect(holdBackStory({ title: 'Ring 505-555-0142', limits: [], text: 'Fine.' }).title).toBe('[held back: a phone number]');
    const clean = { title: 'The night shift', limits: [], text: 'All of it clean.' };
    expect(holdBackStory(clean)).toBe(clean);
  });
});


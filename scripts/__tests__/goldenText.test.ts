/**
 * What a golden card's statement is compared on (block I, item 5; IM21, IM22).
 *
 * The difference is the real one: war-critical-square drawn at cce6495f from
 * a clean tree had a picture 518 px tall, and at 08af285c from a tree with
 * uncommitted changes 497 px, the "Uncommitted build" caveat's line taking
 * 21 px. The kept copy's own height is read, not pinned: it changes whenever a
 * card gains a line (the "Data:" line made it 498, at c0907d66), and a test
 * pinned to 518 failed on the kept copies it was meant to describe.
 * The kept copies come from clean builds, so a check made before a commit found
 * every card 18 to 28 px out of place and reported it as a difference, while
 * the harness said that what a card states is still compared on such a build.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { differences, statedBy, withoutLayout } from '../lib/goldenText.mjs';

const GOLDEN = path.join(process.cwd(), 'docs/missions/01-architecture-decisions/imaging/golden');
const kept = JSON.parse(fs.readFileSync(path.join(GOLDEN, 'war-critical-square.json'), 'utf8'));
/** The kept copy's picture height, read before anything here could touch it. */
const CLEAN = kept.card.frame.height as number;
/** Measured: the caveat an uncommitted build adds takes 21 px from the picture. */
const DIRTY = CLEAN - 21;

/** The same card as the uncommitted build stated it, that build's caveat already set aside. */
function asTheDirtyBuildDrewIt(stated: typeof kept) {
  const now = structuredClone(stated);
  for (const box of [now.card.frame, now.card.provenance.frame, now.card.regions.picture, now.card.sourceRect]) box.height = DIRTY;
  return now;
}

describe('a card drawn by a build from a tree with uncommitted changes', () => {
  it('is out of place against its kept copy, drawn clean: the caveat line moves the layout', () => {
    expect(differences(kept, asTheDirtyBuildDrewIt(kept))).toEqual([
      `.card.frame.height: kept ${CLEAN} | now ${DIRTY}`,
      `.card.provenance.frame.height: kept ${CLEAN} | now ${DIRTY}`,
      `.card.regions.picture.height: kept ${CLEAN} | now ${DIRTY}`,
      `.card.sourceRect.height: kept ${CLEAN} | now ${DIRTY}`,
    ]);
  });

  it('so its layout is set aside, and it matches', () => {
    expect(differences(withoutLayout(kept), withoutLayout(asTheDirtyBuildDrewIt(kept)))).toEqual([]);
  });

  it('while its words are still compared, every one', () => {
    const reworded = asTheDirtyBuildDrewIt(kept);
    reworded.card.alt = reworded.card.alt.replace('Saudi Arabia', 'Yemen');
    reworded.card.provenance.caveats[0] = `${reworded.card.provenance.caveats[0]} And more.`;
    expect(differences(withoutLayout(kept), withoutLayout(reworded))).toEqual([
      expect.stringMatching(/^\.card\.alt: kept /),
      expect.stringMatching(/^\.card\.provenance\.caveats\.0: kept /),
    ]);
  });

  it('sets aside only where things are: the picture\'s frame, the regions and the source rectangle', () => {
    const set = withoutLayout(kept);
    expect(set.card.frame).toBe('<layout>');
    expect(set.card.provenance.frame).toBe('<layout>');
    expect(set.card.regions).toBe('<layout>');
    expect(set.card.sourceRect).toBe('<layout>');
    for (const key of ['width', 'height', 'alt', 'warnings', 'mimeType']) expect(set.card[key]).toEqual(kept.card[key]);
    expect({ ...set.card.provenance, frame: kept.card.provenance.frame }).toEqual(kept.card.provenance);
    expect(set.drawn).toEqual(kept.drawn);
    // The kept copy itself is untouched.
    expect(kept.card.frame.height).toBe(CLEAN);
  });

  it('a statement with no card, refused, is left as it is', () => {
    const refused = { name: 'x', ok: false, reason: 'refused' };
    expect(withoutLayout(refused)).toEqual(refused);
  });
});

describe('what a card states, with what changes every run set aside', () => {
  const capturedAt = '2026-10-03T22:45:20.512Z';
  const result = (treeDirty: boolean) => ({
    ok: true,
    notes: [],
    warnings: [],
    shot: { card: { preset: 'square' } },
    card: {
      width: 1080, height: 1080, mimeType: 'image/webp', warnings: [],
      alt: `A card. Made by Starcom, ${capturedAt.replace('T', ' ').replace(/\.\d+Z$/, 'Z')}.`,
      regions: {}, sourceRect: {}, frame: {},
      provenance: {
        capturedAt,
        build: { sha: 'cce6495f0123456789abcdef0123456789abcdef', treeDirty },
        feeds: [{ name: 'War & Conflict', lastUpdated: '2026-10-03T22:40:00.000Z' }],
        link: 'http://localhost:5210/?v=2&sub=WarConflict',
        caveats: [
          'Drawn at Low quality.',
          ...(treeDirty ? ['Built from a working tree with uncommitted changes — cce6495f does not describe the code that drew this image.'] : []),
        ],
        caveatsShort: ['Low quality.', ...(treeDirty ? ['Uncommitted build: cce6495f does not describe it.'] : [])],
      },
    },
  });

  it('the capture moment, when each feed was read, the origin and the build', () => {
    const stated = statedBy({ name: 'x' }, result(false), 'http://localhost:5210');
    expect(stated.card.alt).toBe('A card. Made by Starcom, <captured>.');
    expect(stated.card.provenance.capturedAt).toBe('<captured>');
    expect(stated.card.provenance.feeds[0].lastUpdated).toBe('<read>');
    expect(stated.card.provenance.link).toBe('<origin>/?v=2&sub=WarConflict');
    expect(stated.card.provenance.build).toBe('<build>');
  });

  it('the caveat an uncommitted build adds, dropped whole and not left as an empty line', () => {
    const clean = statedBy({ name: 'x' }, result(false), 'http://localhost:5210');
    const dirty = statedBy({ name: 'x' }, result(true), 'http://localhost:5210');
    expect(dirty.card.provenance.caveats).toEqual(['Drawn at Low quality.']);
    expect(dirty.card.provenance.caveatsShort).toEqual(['Low quality.']);
    expect(differences(clean, dirty)).toEqual([]);
  });
});

/*
 * The footer prints the capture moment and the build, so how many lines it
 * wraps to changes with the run: the QR card's, wrapping beside its code, went
 * from 60 px to 79 px between cce6495f and 0e312879, nothing else changing.
 * Its band's height is set aside like the build; where the band starts, and
 * everything above it, are still compared.
 */
describe('the footer band, which wraps with the run', () => {
  const result = (footerHeight: number, footerY = 679) => ({
    ok: true, notes: [], warnings: [], shot: {},
    card: {
      width: 1280, height: 800, mimeType: 'image/webp', warnings: [], alt: 'A card.',
      regions: { picture: { x: 0, y: 0, width: 800, height: 800 }, footer: { x: 800, y: footerY, width: 480, height: footerHeight } },
      sourceRect: {}, frame: {},
      provenance: { capturedAt: '2026-10-04T03:00:00.000Z', build: { sha: 'a'.repeat(40) }, feeds: [], caveats: [], caveatsShort: [] },
    },
  });

  it('is compared without its height', () => {
    const kept = statedBy({ name: 'x' }, result(60), 'http://localhost:5210');
    expect(differences(kept, statedBy({ name: 'x' }, result(79), 'http://localhost:5210'))).toEqual([]);
  });

  it('but where it starts is still compared', () => {
    const kept = statedBy({ name: 'x' }, result(60), 'http://localhost:5210');
    expect(differences(kept, statedBy({ name: 'x' }, result(60, 700), 'http://localhost:5210'))).toEqual([
      '.card.regions.footer.y: kept 679 | now 700',
    ]);
  });
});

/*
 * europe-names-quiet-square at 6b0904f7, from a clean build, matched in every
 * pixel and every word but one: its camera stood at longitude 10, kept as
 * 9.999999999999986. Floating-point arithmetic's last digits, not a place.
 */
describe('a number in a statement', () => {
  const at = (lon: number) => ({ card: { provenance: { camera: { lat: 51, lon, altitude: 1.6 } } } });

  it('is the same where it differs only in arithmetic\'s last digits', () => {
    expect(differences(at(9.999999999999986), at(10))).toEqual([]);
  });

  it('differs where it moved at all, by a ten-millionth of a degree', () => {
    expect(differences(at(10), at(10.0000001))).toEqual(['.card.provenance.camera.lon: kept 10 | now 10.0000001']);
  });

  it('is still compared as a number, never as a word: "10" is not 10', () => {
    expect(differences({ v: '10' }, { v: 10 })).toEqual(['.v: kept "10" | now 10']);
  });
});

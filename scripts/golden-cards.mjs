#!/usr/bin/env node
/**
 * Golden cards (block I, item 5; decisions IM21, IM22): the same shots, drawn
 * from the same kept notes, against small copies kept in the repo.
 *
 * A card is two things, compared two ways (IM22):
 *   - what it STATES, exactly: its alt text, its warnings, the shot as drawn and
 *     its whole provenance, with what changes every run set aside (the capture
 *     moment, the build, when each feed was read);
 *   - what it SHOWS, closely: a 400 px copy, outside the footer's band (contract
 *     v20's `regions.footer`, the capture moment and the build), may differ from
 *     the kept one in only a small share of its pixels, since SwiftShader and
 *     Chrome updates shift them.
 *
 * Each shot pins its moment (`time.at`), and capture mode holds motion still
 * (IM20, IM23), so the same shot makes the same picture. The page is
 * card-harness.mjs's: nothing leaves the machine, The Record is answered from
 * the kept notes shots.json names, quality is pinned, and each shot is rendered
 * until two renders in a row agree.
 *
 * A shot with a `look` draws Earth Weather (decision D-W, step 5d): it is set
 * with setWeather, and drawn on a page of its own whose weather feeds answer
 * from the files kept in shots.json's `weatherFeeds`, its clock starting when
 * they were kept. `--keep-feeds --update` asks the real feeds again and keeps
 * their answers in place of the old: radar is kept only two hours, so a weather
 * shot's moment is set near the newest radar frame before it is kept.
 *
 * Pictures are kept and compared from clean builds only: a build from a tree
 * with uncommitted changes adds a caveat line, which moves the layout. On such a
 * build the words each card states are compared (that caveat set aside), not
 * its picture or where things are on it, and --update refuses. So: commit,
 * build, then update and look. What is compared is lib/goldenText.mjs's.
 *
 * Usage:
 *   npm run build && npx vite preview --port 5210 --strictPort &
 *   npm run golden:cards -- http://localhost:5210             compare
 *   npm run golden:cards -- http://localhost:5210 --update    rewrite them; look at each first
 *   npm run golden:cards -- http://localhost:5210 --only=heat-embed
 *   npm run golden:cards -- http://localhost:5210 --keep-feeds --update    weather shots from the real feeds, kept
 *   GOLDEN_OUT=/tmp/golden …   where each full-size card, and the diff of any that differs, goes
 *
 * Exit 0: every card matched. 1: a card differed in what it states or what it
 * shows: the app changed; look at the diff, and --update if it was meant.
 * 2: the harness could not observe (no WebGL, The Record never asked, a feed
 * never loaded, a weather answer asked for that was not kept), which says
 * nothing about the cards.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SMALL, bytesOf, cannotObserve, dataUrlOf, loadKeptFeeds, loadNotes, openCardPage, pictureOf, writeKeptFeeds,
} from './card-harness.mjs';
import { differences, statedBy, withoutLayout } from './lib/goldenText.mjs';
import { freshTempDir } from './lib/freshTempDir.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..');
const GOLDEN = path.join(REPO, 'docs/missions/01-architecture-decisions/imaging/golden');
const argv = process.argv.slice(2);
const BASE_URL = argv.find((a) => !a.startsWith('--')) || 'http://localhost:5210';
const UPDATE = argv.includes('--update');
const KEEP_FEEDS = argv.includes('--keep-feeds');
const ONLY = (argv.find((a) => a.startsWith('--only='))?.slice('--only='.length) ?? '').split(',').filter(Boolean);
const OUT = process.env.GOLDEN_OUT || freshTempDir('starcom-golden-');
fs.mkdirSync(OUT, { recursive: true });

const SPEC = JSON.parse(fs.readFileSync(path.join(GOLDEN, 'shots.json'), 'utf8'));
const SHOTS = SPEC.shots.filter((s) => ONLY.length === 0 || ONLY.includes(s.name));
/** How the kept copy is made, and when a pixel differs: shots.json's, the harness's by default. */
const KEPT = { ...SMALL, ...SPEC.golden, pixelDelta: SPEC.match.pixelDelta };
if (SHOTS.length === 0) cannotObserve(`no shot is named ${ONLY.join(', ')}`);
// New answers make new pictures: they are kept only as the pictures are.
if (KEEP_FEEDS && !UPDATE) cannotObserve('--keep-feeds keeps new answers, which change the weather shots: use it with --update');
const FEEDS_DIR = path.join(REPO, SPEC.weatherFeeds ?? 'missing-weatherFeeds');

const results = [];
const NOTES = loadNotes(REPO, SPEC.notes);
const pages = [
  { shots: SHOTS.filter((s) => !s.look) },
  { shots: SHOTS.filter((s) => s.look), feeds: KEEP_FEEDS ? { keep: true } : 'kept' },
].filter((p) => p.shots.length > 0);
for (const { shots, feeds } of pages) {
  const harness = await openCardPage({
    baseUrl: BASE_URL, notes: NOTES, viewport: SPEC.viewport,
    ...(feeds ? { feeds: feeds === 'kept' ? { kept: loadKeptFeeds(FEEDS_DIR) } : feeds } : {}),
  });
  await drawShots(harness, shots);
}

/** Each shot on this page, compared with its kept copy or kept in its place; then what the page kept or could not answer. */
async function drawShots(harness, shots) {
  const { page } = harness;
  try {
    for (const shot of shots) {
      if (shot.look) await harness.call('setWeather', shot.look);
      const { result, renders } = await harness.settled(shot.name, shot.shot);
      if (shot.look) await harness.call('setWeather', null);
      const stated = statedBy(shot, result, BASE_URL);
      const textFile = path.join(GOLDEN, `${shot.name}.json`);
      const pictureFile = path.join(GOLDEN, `${shot.name}.webp`);
      const row = { name: shot.name, ok: result.ok, renders };
      if (!result.card) {
        row.text = 'no card'; row.reason = result.reason;
      } else {
        fs.writeFileSync(path.join(OUT, `${shot.name}.full.${result.card.mimeType.split('/')[1]}`), bytesOf(result.card.dataUrl));
        /*
         * A build from a tree with uncommitted changes says so in a caveat, and that
         * line moves the card's layout: its picture is not the one a clean build
         * draws. So pictures are kept and compared from clean builds only; on a
         * dirty one, what the card states is still compared, the caveat set aside
         * and with it where things are (goldenText.mjs).
         */
        const dirty = result.card.provenance.build?.treeDirty === true;
        if (dirty && UPDATE) cannotObserve('this build is from a tree with uncommitted changes: commit, build, and update from the clean build');
        const kept = !UPDATE && fs.existsSync(pictureFile) ? dataUrlOf(pictureFile, KEPT.type) : null;
        const picture = await pictureOf(page, result.card, kept, KEPT);
        if (UPDATE) {
          fs.writeFileSync(pictureFile, bytesOf(picture.smallUrl));
          fs.writeFileSync(textFile, `${JSON.stringify(stated, null, 1)}\n`);
          row.updated = `${picture.width}x${picture.height}, ${fs.statSync(pictureFile).size} bytes`;
        } else if (!kept || !fs.existsSync(textFile)) {
          row.missing = true;
        } else {
          const keptText = JSON.parse(fs.readFileSync(textFile, 'utf8'));
          row.textDiffers = dirty ? differences(withoutLayout(keptText), withoutLayout(stated)) : differences(keptText, stated);
          row.picture = dirty ? 'not compared, nor where things are: an uncommitted build draws its caveat'
            : picture.sameSize === false
              ? { sameSize: false, kept: picture.keptSize, now: `${picture.width}x${picture.height}` }
              : { share: Number(picture.share.toFixed(5)), meanDelta: Number(picture.meanDelta.toFixed(2)) };
          row.pictureDiffers = !dirty && (picture.sameSize === false || picture.share > SPEC.match.share);
          if (row.pictureDiffers || row.textDiffers.length) {
            fs.writeFileSync(path.join(OUT, `${shot.name}.now.webp`), bytesOf(picture.smallUrl));
            if (picture.diffUrl) fs.writeFileSync(path.join(OUT, `${shot.name}.diff.png`), bytesOf(picture.diffUrl));
            fs.writeFileSync(path.join(OUT, `${shot.name}.now.json`), `${JSON.stringify(stated, null, 1)}\n`);
          }
        }
      }
      results.push(row);
      const verdict = row.updated ? `updated (${row.updated})`
        : row.missing ? 'NO KEPT COPY: run with --update, and look at it'
        : row.text === 'no card' ? `NO CARD: ${row.reason}`
        : row.textDiffers.length || row.pictureDiffers ? 'DIFFERS' : 'matches';
      console.log(`  ${shot.name}: ${verdict}${row.picture ? `  (picture: ${JSON.stringify(row.picture)})` : ''}  [${renders} renders]`);
      for (const d of row.textDiffers ?? []) console.log(`      ${d}`);
    }
    if (!harness.stats.recordAsked) cannotObserve('The Record was never asked, so no card drew the kept notes');
    if (harness.stats.unkept.length) {
      cannotObserve(`the weather shots asked for ${harness.stats.unkept.length} answers that were not kept, `
        + `first ${harness.stats.unkept[0]}: keep the feeds again with --keep-feeds --update`);
    }
    if (harness.stats.kept.length) {
      const kept = writeKeptFeeds(FEEDS_DIR, harness.stats.keptAt, harness.stats.kept);
      const bytes = kept.reduce((sum, k) => sum + k.bytes, 0);
      console.log(`  kept ${kept.length} weather answers, ${(bytes / 1e6).toFixed(2)} MB, in ${path.relative(REPO, FEEDS_DIR)}`);
      for (const k of kept) console.log(`      ${k.status} ${(k.bytes / 1e3).toFixed(1).padStart(7)} kB  ${k.url.slice(0, 110)}${k.range ? ` ${k.range}` : ''}`);
    }
    if (harness.pageErrors.length) console.log(`  page errors: ${harness.pageErrors.slice(0, 3).join(' | ')}`);
    if (harness.stats.publishRefused) console.log(`  ${harness.stats.publishRefused} publish attempts refused`);
  } finally {
    await harness.close();
  }
}

console.log(`\n  ${SHOTS.length} shots; full-size cards${UPDATE ? '' : ' and the diff of any that differs'} in ${OUT}`);
if (UPDATE) process.exit(0);
const failed = results.filter((r) => r.missing || r.text === 'no card' || r.pictureDiffers || r.textDiffers?.length);
if (failed.length) {
  console.error(`\n  ${failed.length} of ${results.length} cards differ from the kept copies.\n`);
  process.exit(1);
}
console.log('  every card matches its kept copy.');

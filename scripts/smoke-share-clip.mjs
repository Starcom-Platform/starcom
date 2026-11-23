#!/usr/bin/env node
/**
 * Record a real clip from the running globe, and check it outside the browser.
 *
 * ─── WHY THE CHECKS HAPPEN IN FFMPEG, NOT IN THE PAGE ──────────────────────
 *
 * The browser that produced a file is the worst witness to whether the file is
 * any good. MediaRecorder reports success on a stream of black frames exactly
 * as happily as on a stream of the globe. So the recording is written to disk
 * and interrogated by ffprobe and ffmpeg, which have no stake in it.
 *
 * ─── WHAT THIS CAUGHT THE FIRST TIME ───────────────────────────────────────
 *
 * The first recorder used MediaRecorder, and this script is what showed it was
 * wrong: a camera path taking 4.3 s of wall time came out as 3.25 s of footage,
 * and 2.86 s once converted. The browser reported success throughout. So the
 * load-bearing check below is that the assembled video is exactly as long as
 * the track — to the frame.
 *
 * ─── WHAT A PASSING RUN ESTABLISHES ────────────────────────────────────────
 *
 *   - the frames assemble, via ffmpeg at the declared rate, into H.264 mp4 —
 *     the form X and Instagram accept
 *   - the video is exactly as long as the camera track, frame for frame
 *   - its frames have content (a full luma range, not a flat field)
 *   - the camera actually moved (first and last frames differ)
 *   - its provenance names the camera as the track and rests on several samples
 *
 * And it writes a contact sheet — first, middle, last frame — because the one
 * defect found so far in recording (a region's geometry loading on camera) was
 * visible only by looking. The check that matters most is a person opening it.
 *
 * Exit 2 when this machine cannot observe (no ffmpeg, no WebGL); exit 1 when
 * the app failed. The difference matters: a missing tool is not a broken clip.
 *
 * Usage:
 *   npm run build && npx vite preview --port 5210 &
 *   node scripts/smoke-share-clip.mjs http://localhost:5210
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { freshTempDir } from './lib/freshTempDir.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE_URL = process.argv[2] || 'http://localhost:4173';
const OUT_DIR = process.env.CLIP_OUT_DIR || freshTempDir('starcom-clip-');
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

const fail = (m) => { console.error(`\n  APP FAILED: ${m}\n`); process.exit(1); };
const cannotObserve = (m) => {
  console.error(`\n  HARNESS CANNOT OBSERVE: ${m}`);
  console.error('  This says nothing about the application.\n');
  process.exit(2);
};

const tool = (name) => {
  try { execFileSync(name, ['-version'], { stdio: 'ignore' }); return true; } catch { return false; }
};
if (!tool('ffprobe') || !tool('ffmpeg')) cannotObserve('ffmpeg/ffprobe not on PATH — the recording cannot be checked independently');

const probe = (file, args) => execFileSync('ffprobe', ['-v', 'error', ...args, file], { encoding: 'utf8' }).trim();

/** Mean and range of luma for one image — a flat field has max ≈ min. */
const lumaOf = (png) => {
  const out = execFileSync('ffprobe', ['-v', 'error', '-f', 'lavfi', '-i', `movie=${png},signalstats`,
    '-show_entries', 'frame_tags=lavfi.signalstats.YMIN,lavfi.signalstats.YMAX,lavfi.signalstats.YAVG',
    '-of', 'json'], { encoding: 'utf8' });
  const tags = JSON.parse(out).frames[0].tags;
  return { min: +tags['lavfi.signalstats.YMIN'], max: +tags['lavfi.signalstats.YMAX'], avg: +tags['lavfi.signalstats.YAVG'] };
};

/** A path that crosses regions, zooms, and ends somewhere else entirely. */
const KEYFRAMES = [
  { atMs: 0, lat: 10, lng: -40, altitude: 2.6 },
  { atMs: 1500, lat: 25, lng: 10, altitude: 1.8 },
  { atMs: 3000, lat: 5, lng: 45, altitude: 2.4 },
];
const FPS = 30;

const browser = await chromium.launch({ args: GL_ARGS });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

try {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('starcom-pipeline-guide-dismissed', 'true');
      localStorage.setItem('support_funnel_session_v1', JSON.stringify({ dismissed: true, seen: true, ts: Date.now() }));
    } catch { /* storage unavailable */ }
  });

  const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    .catch(() => cannotObserve(`could not reach ${BASE_URL}`));
  if (response && !response.ok()) cannotObserve(`${BASE_URL} returned HTTP ${response.status()}`);

  const ready = await page.waitForFunction(() => {
    try { window.__starcomShareCard.captureFrame({ scale: 0.1 }); return true; } catch { return false; }
  }, undefined, { timeout: 120000, polling: 300 }).then(() => true).catch(() => false);
  if (!ready) fail('the globe never became capturable');

  const hasRecorder = await page.evaluate(() => typeof window.__starcomShareCard.recordClip === 'function');
  if (!hasRecorder) fail('window.__starcomShareCard.recordClip is missing');

  const trackMs = KEYFRAMES.at(-1).atMs;
  console.log(`  rendering ${trackMs / 1000}s at ${FPS} fps across ${KEYFRAMES.length} keyframes (path warmed first)…`);
  const clip = await page.evaluate(async ({ keyframes, fps }) => {
    try {
      return { ok: true, ...(await window.__starcomShareCard.recordClip({ keyframes, fps, quality: 0.9, settleMs: 1500 })) };
    } catch (e) {
      return { ok: false, reason: e && e.message ? e.message : String(e) };
    }
  }, { keyframes: KEYFRAMES, fps: FPS });
  if (!clip.ok) fail(`recordClip refused: ${clip.reason}`);

  const footageFrames = Math.round((trackMs / 1000) * FPS) + 1;
  const expectedFrames = footageFrames + clip.stats.endCardFrames;
  console.log(`  ${clip.frames.length} frames: ${footageFrames} footage + ${clip.stats.endCardFrames} end card `
    + `(${clip.stats.endCardPages} page${clip.stats.endCardPages === 1 ? '' : 's'}), ${clip.width}x${clip.height} ${clip.mimeType}`);
  if (clip.stats.footageFrames !== footageFrames) {
    fail(`${clip.stats.footageFrames} footage frames for a ${trackMs}ms track at ${FPS} fps — expected ${footageFrames}`);
  }
  if (!(clip.stats.endCardFrames > 0)) fail('no end card — the clip carries no caveats in its own frames');
  console.log(`  this machine took ${(clip.stats.renderMs / 1000).toFixed(1)}s to render `
    + `${(clip.stats.durationMs / 1000).toFixed(2)}s of footage — slow is fine; drift would not be`);
  if (clip.frames.length !== expectedFrames) {
    fail(`${clip.frames.length} frames returned; footage and end card account for ${expectedFrames}`);
  }

  const frameDir = path.join(OUT_DIR, 'frames');
  fs.mkdirSync(frameDir, { recursive: true });
  clip.frames.forEach((dataUrl, i) => {
    fs.writeFileSync(path.join(frameDir, `f${String(i).padStart(4, '0')}.jpg`), Buffer.from(dataUrl.split(',')[1], 'base64'));
  });

  // ── assembled at the declared rate, the way the agent will do it ──
  // Even dimensions for H.264: a viewport can make the canvas odd.
  const mp4 = path.join(OUT_DIR, 'clip.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(frameDir, 'f%04d.jpg'),
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);

  const codec = probe(mp4, ['-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'default=nw=1:nk=1']);
  const decoded = +probe(mp4, ['-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'default=nw=1:nk=1']);
  const duration = +probe(mp4, ['-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1']);
  console.log(`  assembled: ${codec} mp4, ${decoded} frames, ${duration.toFixed(3)}s`);

  /*
   * THE CHECK THAT FAILED THE FIRST DESIGN. A video's length is its frame count
   * over its rate, and every provenance time range assumes the footage runs
   * at track speed. One frame of tolerance for the container's rounding.
   */
  const videoSeconds = expectedFrames / FPS;
  const footageSeconds = footageFrames / FPS;
  if (codec !== 'h264') fail(`assembled codec is ${codec}, not h264`);
  if (decoded !== expectedFrames) fail(`the mp4 decodes to ${decoded} frames; ${expectedFrames} were rendered`);
  if (Math.abs(duration - videoSeconds) > 1 / FPS) {
    fail(`the video is ${duration.toFixed(3)}s where its frames account for ${videoSeconds.toFixed(3)}s — `
      + 'the footage is not running at track speed, so provenance time ranges would point at the wrong moments');
  }
  console.log(`  runs at track speed: ${duration.toFixed(3)}s = ${footageSeconds.toFixed(3)}s footage `
    + `+ ${(clip.stats.endCardFrames / FPS).toFixed(3)}s end card`);

  const all = fs.readdirSync(frameDir).filter((f) => f.endsWith('.jpg')).sort();
  // First, middle and last of the FOOTAGE — then the end card, looked at separately.
  const footage = all.slice(0, footageFrames);
  const pick = [footage[0], footage[Math.floor(footage.length / 2)], footage.at(-1)].map((f) => path.join(frameDir, f));
  const endCardFrame = path.join(frameDir, all[footageFrames]);
  for (const f of pick) {
    const l = lumaOf(f);
    if (l.max - l.min < 60) fail(`${path.basename(f)} is a flat field (luma ${l.min}–${l.max}) — no globe in it`);
  }
  console.log('  first, middle and last frames all have content (full luma range)');
  if (fs.readFileSync(pick[0]).equals(fs.readFileSync(pick[2]))) {
    fail('the first and last frames are identical — the camera path did not reach the footage');
  }
  console.log('  first and last frames differ — the camera moved on film');

  // ── what it claims ──
  const p = clip.provenance;
  if (p.schema !== 'starcom.globe.clip') fail(`provenance schema is ${p.schema}`);
  if (JSON.stringify(p.tracks) !== '["camera"]') fail(`tracks are ${JSON.stringify(p.tracks)}, expected the camera alone`);
  if (p.sampleCount < 3) fail(`provenance rests on ${p.sampleCount} samples — too few to describe a clip`);
  // Provenance describes the FOOTAGE; the end card is how it is disclosed, not part of it.
  if (Math.abs(p.durationMs - (footageFrames - 1) / FPS * 1000) > 1) {
    fail(`provenance describes ${p.durationMs}ms of footage; the file holds ${(footageFrames - 1) / FPS * 1000}ms of it`);
  }
  if (!p.caveats.at(-1).startsWith('Unsigned client-side recording')) fail('the unconditional recording caveat is missing');
  console.log(`  provenance: ${p.sampleCount} samples, track [${p.tracks}], ${p.caveats.length} caveat(s):`);
  for (const c of p.caveats) console.log(`    · ${c}`);

  // ── the end card: its own frame, kept for looking at ──
  const endCardCopy = path.join(OUT_DIR, 'end-card.jpg');
  fs.copyFileSync(endCardFrame, endCardCopy);

  // ── the part only a person can check ──
  const sheet = path.join(OUT_DIR, 'contact-sheet.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...pick.flatMap((f) => ['-i', f]), '-filter_complex',
    '[0]scale=466:-1[a];[1]scale=466:-1[b];[2]scale=466:-1[c];[a][b][c]hstack=3', sheet]);
  console.log(`\n  wrote ${mp4}\n        ${sheet}\n        ${endCardCopy}`);
  console.log('\n  SHARE CLIP SMOKE PASSED — open the contact sheet; a region loading on camera shows only there\n');
} finally {
  await browser.close();
}

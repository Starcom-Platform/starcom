#!/usr/bin/env node
/**
 * The card contact sheet (block I, item 5; decisions IM25, IM26): every
 * template Starcom can draw, at every size, from the kept notes, on one sheet,
 * and a labelled slot for each template it cannot draw yet, saying why and what
 * unblocks it. The rows are imaging/contact-sheet.json's.
 *
 * Where the golden cards check that a card has not changed, this is for a
 * person to look at the whole set at once: a badge that crowds a headline at one
 * size, a key that runs long on the 9:16, a template that draws as another. A
 * row that should draw and does not, or draws another template, fails the run.
 *
 * The page is card-harness.mjs's: nothing leaves the machine, The Record is
 * answered from the kept notes, and each card is rendered until two renders in
 * a row agree.
 *
 * Usage:
 *   npm run build && npx vite preview --port 5210 --strictPort &
 *   npm run contact:cards -- http://localhost:5210
 *   CONTACT_OUT=/tmp/sheet …   where contact-sheet.png, index.json and each card (480 px) go
 *
 * Exit 0: every row that should draw drew its own template at every size.
 * 1: one did not, as listed. 2: the harness could not observe.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SMALL, bytesOf, cannotObserve, loadNotes, openCardPage, pictureOf } from './card-harness.mjs';
import { freshTempDir } from './lib/freshTempDir.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..');
const BASE_URL = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:5210';
const OUT = process.env.CONTACT_OUT || freshTempDir('starcom-contact-');
fs.mkdirSync(OUT, { recursive: true });

const SPEC = JSON.parse(fs.readFileSync(path.join(REPO, 'docs/missions/01-architecture-decisions/imaging/contact-sheet.json'), 'utf8'));
/** Each card as kept beside the sheet: large enough to read its text. */
const CARD = { ...SMALL, width: 480, quality: 0.85 };

/*
 * The sheet, drawn in the page: a column per size, a row per template, each
 * card scaled to the column with its size and warnings under it, and a band
 * for each template not drawn yet, with why.
 */
function drawSheet({ title, presets, rows }) {
  const load = (src) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('could not decode')); img.src = src; });
  return (async () => {
    const LABEL = 170; const COL = 250; const THUMB = 230; const GAP = 20; const CAPTION = 34; const BAND = 64; const HEAD = 70;
    const ink = '#e6edf3'; const muted = '#93a4b8'; const ground = '#0b1622'; const rule = '#25364a';
    const images = await Promise.all(rows.map((row) => Promise.all((row.cards ?? []).map((c) => (c.dataUrl ? load(c.dataUrl) : null)))));
    const heights = rows.map((row, r) => (row.notYet ? BAND
      : GAP + Math.max(...images[r].map((img) => (img ? (img.height * THUMB) / img.width : 60))) + CAPTION));
    const canvas = document.createElement('canvas');
    canvas.width = LABEL + presets.length * COL + GAP;
    canvas.height = HEAD + heights.reduce((a, b) => a + b, 0) + GAP;
    const g = canvas.getContext('2d');
    g.fillStyle = ground; g.fillRect(0, 0, canvas.width, canvas.height);
    const font = (px, weight = 400) => { g.font = `${weight} ${px}px -apple-system, "Segoe UI", Roboto, sans-serif`; };
    const wrap = (text, x, y, width, lineHeight) => {
      let line = '';
      for (const word of text.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (g.measureText(next).width > width && line) { g.fillText(line, x, y); y += lineHeight; line = word; } else line = next;
      }
      if (line) g.fillText(line, x, y);
    };
    g.textBaseline = 'top';
    font(20, 600); g.fillStyle = ink; g.fillText(title, GAP, 18);
    presets.forEach((preset, i) => { font(13, 600); g.fillStyle = muted; g.fillText(preset.toUpperCase(), LABEL + i * COL, 50); });
    let y = HEAD;
    rows.forEach((row, r) => {
      g.fillStyle = rule; g.fillRect(GAP, y, canvas.width - 2 * GAP, 1);
      font(14, 600); g.fillStyle = ink; g.fillText(row.template, GAP, y + 14);
      if (row.notYet) {
        font(13); g.fillStyle = muted; g.fillText('not drawn yet', GAP, y + 34);
        font(13); g.fillStyle = muted; wrap(row.notYet, LABEL, y + 14, presets.length * COL - GAP, 18);
      } else {
        if (row.badge) { font(12); g.fillStyle = muted; wrap(`badge: ${row.badge}`, GAP, y + 34, LABEL - 2 * GAP, 16); }
        row.cards.forEach((card, i) => {
          const x = LABEL + i * COL;
          const img = images[r][i];
          if (!img) { font(12); g.fillStyle = '#ff7a7a'; wrap(card.reason ?? 'no card', x, y + GAP, THUMB, 16); return; }
          const h = (img.height * THUMB) / img.width;
          g.drawImage(img, x, y + GAP, THUMB, h);
          font(12); g.fillStyle = card.drewOther ? '#ff7a7a' : muted;
          const warned = card.warnings.length ? ` · ${card.warnings.length} warning${card.warnings.length > 1 ? 's' : ''}` : '';
          g.fillText(`${card.width}×${card.height}${warned}${card.drewOther ? ` · drew ${card.drew}` : ''}`, x, y + GAP + h + 8);
        });
      }
      y += heights[r];
    });
    return canvas.toDataURL('image/png');
  })();
}

const index = { made: new Date().toISOString(), build: null, presets: SPEC.presets, rows: [] };
const failed = [];
const harness = await openCardPage({ baseUrl: BASE_URL, notes: loadNotes(REPO, SPEC.notes), viewport: SPEC.viewport });
try {
  for (const row of SPEC.rows) {
    if (row.notYet) {
      index.rows.push({ template: row.template, notYet: row.notYet });
      console.log(`  ${row.template}: not drawn yet`);
      continue;
    }
    const cards = [];
    for (const preset of SPEC.presets) {
      const name = `${row.template}-${preset}`;
      const shot = { ...row.shot, card: { preset }, output: { type: 'image/webp', quality: 0.9, alt: true } };
      const { result, renders } = await harness.settled(name, shot);
      if (!result.card) {
        cards.push({ preset, ok: false, reason: result.reason ?? 'no card' });
        failed.push(`${name}: no card (${result.reason})`);
        continue;
      }
      const { provenance } = result.card;
      const drew = provenance.card?.template ?? null;
      const small = await pictureOf(harness.page, result.card, null, CARD);
      fs.writeFileSync(path.join(OUT, `${name}.webp`), bytesOf(small.smallUrl));
      index.build ??= provenance.build ?? null;
      cards.push({
        preset, ok: true, file: `${name}.webp`, width: result.card.width, height: result.card.height,
        drew, drewOther: drew !== row.template, badge: provenance.card?.badge ?? null, chosenBy: provenance.card?.chosenBy ?? null,
        picture: result.card.regions.picture, alt: result.card.alt, warnings: result.card.warnings, renders,
      });
      if (drew !== row.template) failed.push(`${name}: drew ${drew ?? 'the default card'}, not ${row.template}`);
      console.log(`  ${name}: ${result.card.width}×${result.card.height}, ${result.card.warnings.length} warnings [${renders} renders]`);
    }
    index.rows.push({ template: row.template, subject: row.subject, badge: cards.find((c) => c.badge)?.badge ?? null, cards });
  }
  if (!harness.stats.recordAsked) cannotObserve('The Record was never asked, so no card drew the kept notes');

  const sha = index.build?.sha ? `${index.build.sha.slice(0, 8)}${index.build.treeDirty ? '+' : ''}` : 'an unidentified build';
  const sheet = await harness.page.evaluate(drawSheet, {
    title: `Starcom card contact sheet · ${sha} · ${index.made.slice(0, 10)}`,
    presets: SPEC.presets,
    rows: index.rows.map((row) => ({
      ...row,
      cards: row.cards?.map((card) => ({ ...card, dataUrl: card.file ? `data:image/webp;base64,${fs.readFileSync(path.join(OUT, card.file)).toString('base64')}` : null })),
    })),
  });
  fs.writeFileSync(path.join(OUT, 'contact-sheet.png'), bytesOf(sheet));
  fs.writeFileSync(path.join(OUT, 'index.json'), `${JSON.stringify(index, null, 1)}\n`);
  if (harness.pageErrors.length) console.log(`  page errors: ${harness.pageErrors.slice(0, 3).join(' | ')}`);
} finally {
  await harness.close();
}

const drawn = index.rows.flatMap((row) => row.cards ?? []).filter((c) => c.ok).length;
console.log(`\n  ${drawn} cards and ${index.rows.filter((r) => r.notYet).length} templates not drawn yet: contact-sheet.png and index.json in ${OUT}`);
if (failed.length) {
  console.error(`\n  ${failed.length} did not draw as they should:\n${failed.map((f) => `    ${f}`).join('\n')}\n`);
  process.exit(1);
}

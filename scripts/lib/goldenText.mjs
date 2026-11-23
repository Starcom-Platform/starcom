/**
 * What a golden card states, and how two statements are compared (block I, item
 * 5; decisions IM21, IM22). golden-cards.mjs draws the cards; this decides what
 * of a card's statement is compared and what is set aside.
 *
 * ─── WHY THIS IS ITS OWN MODULE ────────────────────────────────────────────
 *
 * The harness said that on a build from a tree with uncommitted changes, what
 * each card states is still compared, that build's caveat set aside. Once the
 * kept copies came from a clean build (cce6495f), that check could never pass:
 * the caveat's line moves the layout, so the picture's frame, the regions and
 * the source rectangle stated a place 18 to 28 px from the kept copy's on every
 * card. Extracted, like auditVerdict.mjs, so the claim is tested without a
 * browser.
 */

/*
 * What changes every run, each named for what it is. The capture moment, when
 * each feed was read and the origin are replaced wherever they appear, in any
 * string: the capture moment is in the alt text as well as the provenance. The
 * build is set aside whole (statedBy), and its date and sha are NOT replaced in
 * strings: a bare date is also the day in an item's id
 * ("raver-heat-risk-ca-oakland-2026-10-03"), and replacing it hid real content
 * and tied the copy to the day it was built.
 */
export function runValues(provenance, origin) {
  const values = [];
  if (provenance?.capturedAt) {
    const at = provenance.capturedAt;
    values.push([at, '<captured>'], [at.replace('T', ' ').replace(/\.\d+Z$/, 'Z'), '<captured>'],
      [at.replace('T', ' ').replace(/:\d\d\.\d+Z$/, 'Z'), '<captured>']);
  }
  for (const feed of provenance?.feeds ?? []) if (feed.lastUpdated) values.push([feed.lastUpdated, '<read>']);
  values.push([new URL(origin).origin, '<origin>']);
  // Longest first, so a whole timestamp is replaced before a part of it.
  return values.sort((a, b) => b[0].length - a[0].length);
}

/*
 * Whether the build's tree had uncommitted changes is the build's, like its sha,
 * and set aside with the caveat it adds (shareCardProvenance.ts), word for word
 * with this build's sha: otherwise every check made before a commit would
 * differ in that one line.
 */
export function buildState(provenance) {
  const short = provenance?.build?.sha?.slice(0, 8);
  if (!short || !provenance.build.treeDirty) return [];
  return [
    `Built from a working tree with uncommitted changes — ${short} does not describe the code that drew this image.`,
    `Uncommitted build: ${short} does not describe it.`,
  ];
}

export function normalize(value, values, dropped) {
  if (typeof value === 'string') {
    const replaced = values.reduce((s, [from, to]) => s.split(from).join(to), value);
    return dropped.reduce((s, sentence) => s.split(`${sentence} `).join('').split(sentence).join(''), replaced);
  }
  if (Array.isArray(value)) {
    // A caveat that was only the build's state is dropped, not left as an empty line.
    return value.map((v) => normalize(v, values, dropped)).filter((v, i) => !(typeof value[i] === 'string' && value[i] !== '' && v === ''));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = normalize(value[key], values, dropped);
    return out;
  }
  return value;
}

/*
 * The footer prints the capture moment and the build, so how many lines it
 * wraps to changes with the run: the QR card's, beside its code, went from
 * 60 px to 79 px between two commits with nothing else changed. Its band's
 * height is set aside like the build; where it starts is still compared.
 */
const footerSetAside = (regions) => (regions?.footer
  ? { ...regions, footer: { ...regions.footer, height: '<wraps with the run>' } }
  : regions);

/** What a shot's card states, as kept: the result of renderShot, with what changes every run set aside. */
export function statedBy(shot, result, origin) {
  const card = result.card;
  const stated = {
    name: shot.name,
    ok: result.ok,
    ...(result.reason ? { reason: result.reason } : {}),
    notes: result.notes,
    warnings: result.warnings,
    drawn: result.shot,
    ...(card ? {
      card: {
        width: card.width, height: card.height, mimeType: card.mimeType, alt: card.alt, warnings: card.warnings,
        regions: footerSetAside(card.regions), sourceRect: card.sourceRect, frame: card.frame,
        provenance: { ...card.provenance, build: '<build>' },
      },
    } : {}),
  };
  return normalize(stated, runValues(card?.provenance, origin), buildState(card?.provenance));
}

/*
 * Where things are on the card, which an uncommitted build's caveat line moves:
 * the picture's frame (also in the provenance), the regions and the source
 * rectangle. On such a build these are set aside and the words compared; the
 * card's own size is not among them, as it never moves.
 */
export function withoutLayout(stated) {
  if (!stated.card) return stated;
  return {
    ...stated,
    card: {
      ...stated.card,
      frame: '<layout>', regions: '<layout>', sourceRect: '<layout>',
      provenance: { ...stated.card.provenance, frame: '<layout>' },
    },
  };
}

/*
 * Two numbers within a billionth of their size are one: a camera kept at longitude
 * 9.999999999999986 stood at 10, the difference floating-point arithmetic's last
 * digits. A ten-millionth of a degree still differs.
 */
const sameNumber = (a, b) => typeof a === 'number' && typeof b === 'number'
  && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** Where two statements differ, by path, for a person to read: twelve at most. */
export function differences(a, b, at = '', out = []) {
  if (out.length >= 12) return out;
  if (JSON.stringify(a) === JSON.stringify(b) || sameNumber(a, b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[key], b[key], `${at}.${key}`, out);
    return out;
  }
  out.push(`${at || '.'}: kept ${JSON.stringify(a)?.slice(0, 160)} | now ${JSON.stringify(b)?.slice(0, 160)}`);
  return out;
}

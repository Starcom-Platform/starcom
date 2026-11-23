/**
 * A headline the publisher wrote, kept whole.
 *
 * ─── WHAT WAS HAPPENING ────────────────────────────────────────────────────
 *
 * `deriveTitle` cut every title at 96 characters, mid-word. Measured against
 * the peer's own relay on 2026-09-23: **17 of 17** of their titles exceeded
 * that cap. They are not truncated at source — they are complete, deliberately
 * written lead sentences between 101 and 244 characters, and the cap was
 * vandalising all of them.
 *
 * What it destroyed was not decoration:
 *
 *   "...lost their 501(c)(3) exemption in the last 18 months -- 35% of every
 *    revocation ever recorded there, against 11% nationally."
 *
 * The cut landed before "against 11% nationally", and that comparison IS the
 * finding — 35% of anything means nothing without the baseline.
 *
 *   "Dubai Enterprises Co was paid $25,242 across 1 federal award(s) while
 *    carrying a Reciprocal exclusion"
 *
 * That one is 101 characters. Five characters over, and the word severed was
 * `exclusion` — which the opportunity board's own routing rule matches on. The
 * qui tam classification survived only because the classifier also reads
 * `content`, so the most valuable routing this node does was resting on a
 * fallback nobody had noticed it needed.
 *
 * ─── WHY NOT SIMPLY REMOVE THE CAP ─────────────────────────────────────────
 *
 * Because it was accidentally hiding something worse. The launch notices carry
 * no newline at all, so "the first line" is the entire 909-character content
 * INCLUDING the `---GEOJSON---{...}` payload. At 96 characters that tail was
 * invisible; uncapped, raw JSON would have gone straight into the title — the
 * exact defect decision D-F step 1 removed from the globe.
 *
 * So the tail is stripped first and the cap becomes generous and word-safe.
 */
import { describe, it, expect } from 'vitest';
import { nostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';

const post = (content: string, kind = 1) => ({
  id: `evt-${Math.random().toString(36).slice(2, 10)}`,
  pubkey: 'c'.repeat(64),
  created_at: Math.floor(Date.parse('2026-09-23T12:00:00.000Z') / 1000),
  kind,
  tags: [['t', 'starcom_intel'], ['geo', 'lat:38.9,lon:-77.0']],
  content,
  sig: 'sig',
});

async function ingest(raw: ReturnType<typeof post>): Promise<IntelReportUI[]> {
  const got: IntelReportUI[] = [];
  const off = nostrStarcomIntelIngest.subscribe((r) => got.push(r));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = nostrStarcomIntelIngest as any;
  const wasActive = svc.active;
  svc.active = true;
  try {
    await svc.handleEvent(raw, 'wss://test-relay');
  } finally {
    svc.active = wasActive;
    off();
  }
  return got;
}

/** Verbatim from wss://record.cosmiccodex.app, 2026-09-23. */
const CHARITY = '6 charities in Racine, WI lost their 501(c)(3) exemption in the last 18 months -- 33% of every revocation ever recorded there, against 11% nationally.';
const EXCLUSION = 'Dubai Enterprises Co was paid $25,242 across 1 federal award(s) while carrying a Reciprocal exclusion';
const LAUNCH = 'Swift Rescue Mission targeting Mon, 01 Jun 2026 00:00:00 GMT · Vehicle: Pegasus XL · Site: Air launch to orbit · Contracted by NASA. #starcom_intel ---GEOJSON---{"type":"Feature","geometry":{"type":"Point","coordinates":[-80.5,28.4]},"properties":{}}';

describe('a publisher\'s headline survives ingest', () => {
  it('keeps the comparison that makes the finding mean anything', async () => {
    const [report] = await ingest(post(CHARITY));
    expect(report.title).toContain('against 11% nationally');
  });

  it('keeps a 101-character sentence whole', async () => {
    const [report] = await ingest(post(EXCLUSION));
    expect(report.title).toBe(EXCLUSION);
  });

  it('does not sever the word the opportunity board routes on', async () => {
    // The five characters that decide whether a False Claims Act lead is found.
    const [report] = await ingest(post(EXCLUSION));
    expect(report.title.toLowerCase()).toMatch(/\bexclusion\b/);
  });
});

describe('but a title is still a title', () => {
  it('never carries the GeoJSON payload, which the old cap hid by accident', async () => {
    const [report] = await ingest(post(LAUNCH));
    expect(report.title).not.toContain('---GEOJSON---');
    expect(report.title).not.toContain('"type":"Feature"');
    expect(report.title).toContain('Swift Rescue Mission');
  });

  it('never carries a hashtag', async () => {
    const [report] = await ingest(post(LAUNCH));
    expect(report.title).not.toContain('#starcom_intel');
  });

  it('breaks on a word boundary when it must break at all', async () => {
    const long = `${'Alpha bravo charlie delta echo foxtrot golf hotel '.repeat(20)}end.`;
    const [report] = await ingest(post(long));
    expect(report.title.length).toBeLessThanOrEqual(300);
    // The reader is told it was cut...
    expect(report.title).toMatch(/…$/);
    // ...and the cut landed on a boundary: what was kept is a prefix of the
    // source, and the next character in the source is whitespace.
    //
    // An earlier version asserted the title "does not end in a word
    // character", which is meaningless — a cleanly broken word ends in one by
    // definition, so the assertion failed against correct output.
    const kept = report.title.replace(/…$/, '');
    expect(long.startsWith(kept)).toBe(true);
    expect(long[kept.length]).toMatch(/\s/);
  });

  it('leaves a short title exactly alone, with no ellipsis', async () => {
    const [report] = await ingest(post('Convoy north of the bridge.'));
    expect(report.title).toBe('Convoy north of the bridge.');
  });
});

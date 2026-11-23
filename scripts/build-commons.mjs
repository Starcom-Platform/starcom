#!/usr/bin/env node
/**
 * Build the public read surface.
 *
 * Turns signed findings into a static site: one stable URL per claim, no
 * wallet, no install, no JavaScript required to read it. Self-contained pages
 * with inline styles and no external requests, so the whole directory can be
 * pinned to IPFS or served from anything that serves files.
 *
 * WHY THIS EXISTS: until now the only way to see this project's public-interest
 * output was to run a 47 MB application. That is the same hoarding failure the
 * project exists to argue against, reproduced with better tooling. A finding
 * nobody outside can read is not published, it is merely broadcast.
 *
 * Every page shows the DERIVED weight together with the inputs it was derived
 * from, because a number a reader cannot check is a number they must simply
 * believe — which is the thing this whole format was built to avoid.
 *
 * Usage:
 *   node scripts/build-commons.mjs <findings-dir> [out-dir]
 */
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const { ml_dsa65 } = await import('@noble/post-quantum/ml-dsa.js');
const { sha256 } = await import('@noble/hashes/sha256');
const { hexToBytes, utf8ToBytes } = await import('@noble/hashes/utils');

const IN = process.argv[2];
const OUT = process.argv[3] ?? path.join(process.cwd(), 'public', 'commons');
if (!IN) { console.error('Usage: node scripts/build-commons.mjs <findings-dir> [out-dir]'); process.exit(2); }

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
  return `{${Object.entries(obj).sort(([a],[b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/**
 * Render a claim's value for a person.
 *
 * `value` is deliberately untyped in the format, because what a claim asserts
 * varies — a count, a coordinate, a date and a count together. This page
 * stringified whatever it was handed, so a same-day incorporation batch
 * published as `{"date":"2025-07-18","count":19}` on the one surface built for
 * people who are not reading JSON.
 *
 * Not wrong, and not readable. Known shapes get a sentence; anything else
 * falls back to the JSON rather than guessing, because a value this page
 * cannot describe is one a reader should see verbatim.
 */
function describeValue(value) {
  if (typeof value === 'number') return `<strong>${esc(value.toLocaleString('en'))}</strong>`;
  if (typeof value === 'string') return `<strong>${esc(value)}</strong>`;
  if (value && typeof value === 'object') {
    const v = value;
    if (typeof v.count === 'number' && typeof v.date === 'string') {
      return `<strong>${esc(v.count.toLocaleString('en'))}</strong> on <strong>${esc(v.date)}</strong>`;
    }
    if (typeof v.lat === 'number' && typeof v.lon === 'number') {
      return `<strong>${esc(v.lat)}, ${esc(v.lon)}</strong>`;
    }
  }
  return `<code>${esc(JSON.stringify(value))}</code>`;
}

function verify(signed) {
  try {
    const digest = sha256(utf8ToBytes(stableStringify(signed.content)));
    return ml_dsa65.verify(hexToBytes(signed.signature.sig), digest, hexToBytes(signed.signature.pubkey));
  } catch { return false; }
}

/**
 * Derive the weight from the published method, exactly as the NIP specifies.
 *
 * This is the fourth independent implementation of the derivation (with
 * conformance.mjs, verify-finding.mjs and the app), and it is the one
 * outsiders actually read. It went live handling only the corroboration case:
 * an enumeration scored 0.25 instead of 1, a relayed claim got full
 * corroboration, and a census was labelled "1 independent source". The gate
 * did not catch it because its fixtures only covered the case it handled —
 * so the gate now runs the published conformance vectors through this file.
 */
function deriveWeight(content, now = Date.now()) {
  const m = content.method;
  const isCensus = m.parameters.matchedBy === 'enumeration';

  // A census has no independent observers to count. What supports it is that
  // its boundary is stated, so somebody else could re-run the count.
  // Extra sources arriving through one relay share a single point of failure,
  // so they count half — capped below saturation, since that failure mode does
  // not weaken as sources accumulate.
  const corroboration = isCensus
    ? (m.enumeratedBoundary && String(m.enumeratedBoundary).trim() ? 1 : 0)
    : (() => {
        const relayed = Array.isArray(m.relayedVia) && m.relayedVia.length > 0;
        const effective = relayed
          ? Math.min(1 + (m.sourceCount - 1) * 0.5, 4 - 1)
          : m.sourceCount;
        return Math.min(effective, 4) / 4;
      })();

  // Timing precision is inapplicable where no time window was used — an
  // identifier match or a census. Running either through the ratio against a
  // published windowHours of 0 would zero the weight of every such claim.
  const windowMs = m.parameters.windowHours * 3_600_000;
  const precision = (isCensus || m.parameters.matchedBy === 'equality')
    ? 1
    : m.timePrecisionMs > 0 ? Math.min(windowMs / m.timePrecisionMs, 1) : 1;

  // An enumeration ages from the SNAPSHOT it describes, not from when the
  // publisher chose to publish it — otherwise a years-old register republished
  // this morning reads as fresh, and publishedAt is the publisher's own choice.
  const ageBasis = isCensus && Number.isFinite(Date.parse(m.observedTo))
    ? Date.parse(m.observedTo)
    : Date.parse(content.publishedAt);
  const ageDays = Math.max(0, (now - ageBasis) / 86_400_000);
  const recency = Math.pow(0.5, ageDays / 180);
  return { weight: corroboration * precision * recency, corroboration, precision, recency, ageDays, isCensus };
}

const STYLE = `
:root{--bg:#fff;--fg:#16181d;--muted:#5b6472;--line:#dfe3e8;--accent:#0b6b3a;--warn:#8a5a00}
@media(prefers-color-scheme:dark){:root{--bg:#101318;--fg:#e8eaed;--muted:#9aa4b2;--line:#2a2f37;--accent:#5fd39a;--warn:#e0b23c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);
font:16px/1.6 ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:44rem;margin:0 auto;padding:2.5rem 1.25rem 4rem}
h1{font-size:1.6rem;margin:0 0 .25rem}h2{font-size:1rem;text-transform:uppercase;
letter-spacing:.06em;color:var(--muted);margin:2rem 0 .5rem}
a{color:var(--accent)}.muted{color:var(--muted)}
table{width:100%;border-collapse:collapse;margin:.5rem 0}
td,th{text-align:left;padding:.4rem .5rem;border-bottom:1px solid var(--line);vertical-align:top}
th{font-weight:600;color:var(--muted);font-weight:500;width:11rem}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.88em;word-break:break-all}
.badge{display:inline-block;padding:.15rem .5rem;border:1px solid var(--line);border-radius:999px;font-size:.78rem}
.warn{color:var(--warn);border-color:var(--warn)}
.claim{font-size:1.15rem;margin:.75rem 0 0}
ul{padding-left:1.1rem}li{margin:.2rem 0}
footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--line);font-size:.85rem;color:var(--muted)}
`;

const page = (title, body) => `<!doctype html>
<html lang="${LANG}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${STYLE}</style></head>
<body><main>${body}
<footer>Published as an attested claim. Weight, where shown, is <strong>derived from the stated method</strong>, not asserted by the publisher — the inputs are listed so you can check it.<br>
Format: <code>NIP-XX Attested Claims</code>.</footer>
</main></body></html>`;

fs.mkdirSync(path.join(OUT, 'claim'), { recursive: true });

/**
 * One page per (author, slot), newest wins — matching the relay's own
 * parameterized-replaceable semantics.
 *
 * A publisher revising their claim about the same subject SHOULD overwrite
 * their previous one; that is what the slot means. What must not decide the
 * winner is directory order, which is what happened before this: two payloads
 * for one slot, and whichever the filesystem listed last became the published
 * page regardless of when it was actually published.
 */
/**
 * Language of the generated pages.
 *
 * The catalogue is the SAME JSON the app's TypeScript types gate, so a locale
 * that omits a key fails the app's build and a locale that drops a placeholder
 * fails `npm run check:i18n`. A separate copy of the strings for the static
 * builder would drift within a release.
 */
const LANG = process.env.COMMONS_LANG ?? 'en';
const localePath = path.join(process.cwd(), 'src/i18n/locales', `${LANG}.json`);
if (!fs.existsSync(localePath)) {
  console.error(`No locale "${LANG}" — ${localePath} does not exist.`);
  process.exit(2);
}
const T = JSON.parse(fs.readFileSync(localePath, 'utf8')).commons;
const t = (key, values = {}) => String(T[key] ?? '').replace(/\{(\w+)\}/g, (w, k) => (k in values ? String(values[k]) : w));

const REQUIRED = [
  'claim.subjectRef', 'claim.subjectKind', 'claim.attribute', 'claim.value',
  'method.algorithm', 'method.algorithmVersion', 'method.criteria',
  'method.sourceCount', 'method.observedFrom', 'method.observedTo',
  'method.timePrecisionMs', 'method.parameters', 'publishedAt',
];

const malformed = [];
const loaded = new Map();
for (const file of fs.readdirSync(IN).filter(f => f.endsWith('.json'))) {
  let signed;
  try { signed = JSON.parse(fs.readFileSync(path.join(IN, file), 'utf8')); } catch { continue; }
  const c = signed?.content;
  if (!c?.claim || !signed?.signature?.pubkey) continue;

  /**
   * Refuse to publish a payload that does not carry the fields the spec
   * requires. Rendering it anyway printed the literal string "undefined" into
   * public claim pages ("Subject is undefined", "Observed: undefined to
   * undefined") — a malformed claim dressed up as a complete one. Whether the
   * gap came from a bad publisher or a schema drift, the honest surface for a
   * claim we cannot fully read is no page at all.
   */
  const missing = REQUIRED.filter((f) => f.split('.').reduce((o, k) => o?.[k], c) === undefined);
  if (missing.length) {
    malformed.push({ file: file ?? '(unknown)', subject: c.claim.subjectRef ?? '(no subject)', missing });
    continue;
  }

  const key = `${signed.signature.pubkey}::${c.claim.subjectRef}::${c.claim.attribute}`;
  const prev = loaded.get(key);
  if (!prev || Date.parse(c.publishedAt) >= Date.parse(prev.content.publishedAt)) {
    loaded.set(key, signed);
  }
}

const entries = [];

for (const signed of loaded.values()) {
  const c = signed.content;

  const ok = verify(signed);
  // Include the author. Subject + attribute is the RELAY slot, where each
  // publisher has their own; as a filename it is shared, so two publishers
  // making claims about the same subject silently overwrote each other and the
  // index linked to whichever was written last.
  const author = signed.signature.pubkey.slice(0, 12);
  const slot = `${c.claim.subjectRef}-${c.claim.attribute}-${author}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const d = deriveWeight(c);
  const m = c.method;

  // An unverified claim is still PUBLISHED, prominently marked. Hiding it would
  // mean the reader cannot see that something purporting to be a finding failed
  // its own check — which is information.
  const verdict = ok
    ? `<span class="badge">${esc(t('signatureVerified'))}</span>`
    : `<span class="badge warn">${esc(t('signatureFailed'))}</span>`;

  const body = `
<p class="muted"><a href="../index.html">${esc(t('allClaims'))}</a></p>
<h1>${esc(c.claim.subjectRef)}</h1>
<p>${verdict}</p>
<p class="claim"><strong>${esc(c.claim.attribute)}</strong>: ${describeValue(c.claim.value)}</p>
<p class="muted">Subject is ${esc(c.claim.subjectKind)}${c.claim.subjectKind === 'unknown' ? ' — the publisher did not classify it' : ''}.</p>

<h2>${esc(t('whatThisRestsOn'))}</h2>
<p>${esc(m.criteria)}</p>
<table>
${d.isCensus
  ? `<tr><th>${esc(t('countedFrom'))}</th><td>${esc(m.enumeratedBoundary ?? '')}</td></tr>`
    + (m.enumeratedSetDigest
      ? `<tr><th>${esc(t('setCommitment'))}</th><td><code>${esc(m.enumeratedSetDigest)}</code><br><span class="muted">${esc(t('setCommitmentHow'))}</span></td></tr>`
      : '')
  : `<tr><th>${esc(t('independentSources'))}</th><td>${m.sourceCount}</td></tr>`}
<tr><th>${esc(t('observed'))}</th><td>${esc(m.observedFrom)} &rarr; ${esc(m.observedTo)}</td></tr>
<tr><th>${esc(t('timingKnownTo'))}</th><td>${esc(t('hours', { hours: (m.timePrecisionMs / 3_600_000).toFixed(1) }))}</td></tr>
<tr><th>${esc(t('method'))}</th><td><code>${esc(m.algorithm)}</code> v${m.algorithmVersion}</td></tr>
<tr><th>${esc(t('parametersUsed'))}</th><td><code>${esc(JSON.stringify(m.parameters))}</code></td></tr>
<tr><th>${esc(t('published'))}</th><td>${esc(c.publishedAt)}</td></tr>
</table>

<h2>${esc(t('weightHeading'))}</h2>
${ok ? `<p>This publisher did <strong>not</strong> state how confident they are. The number below
is computed from the facts above, and you can compute it yourself.</p>
<table>
${d.isCensus
  ? `<tr><th>${esc(t('completeness'))}</th><td>${d.corroboration.toFixed(3)} &mdash; ${esc(t('censusExplain'))}</td></tr>
<tr><th>${esc(t('precision'))}</th><td>${d.precision.toFixed(3)} &mdash; ${esc(t('precisionNotApplicableCensus'))}</td></tr>
<tr><th>${esc(t('recency'))}</th><td>${d.recency.toFixed(3)} &mdash; ${esc(t('daysOld', { days: d.ageDays.toFixed(1) }))}, ${esc(t('recencyFromSnapshot'))}</td></tr>`
  : `<tr><th>${esc(t('corroboration'))}</th><td>${d.corroboration.toFixed(3)} &mdash; ${esc(t('sourcesCount', { count: m.sourceCount }))}${Array.isArray(m.relayedVia) && m.relayedVia.length ? esc(t('relayedExplain', { relays: m.relayedVia.join(', ') })) : ''}</td></tr>
<tr><th>${esc(t('precision'))}</th><td>${d.precision.toFixed(3)} &mdash; ${esc(m.parameters.matchedBy === 'equality' ? t('precisionNotApplicableEquality') : t('precisionWindow'))}</td></tr>
<tr><th>${esc(t('recency'))}</th><td>${d.recency.toFixed(3)} &mdash; ${esc(t('daysOld', { days: d.ageDays.toFixed(1) }))}</td></tr>`}
<tr><th><strong>Weight</strong></th><td><strong>${d.weight.toFixed(4)}</strong></td></tr>
</table>`
: `<p class="warn"><strong>No weight is shown.</strong> Every input to the calculation —
the source count, the observation window, the timing precision — lives in the same
signed payload that failed verification. Deriving a number from data an attacker
could have written, and printing it next to a warning, would give a false claim
the appearance of measurement. There is nothing here to weigh.</p>`}

<h2>${esc(t('checkingThisYourself'))}</h2>
<ul>
<li>The signature is ML-DSA-65 over a SHA-256 digest of the claim.${ok ? '' : ' <strong>It did not verify here, so nothing below can be relied on.</strong>'}</li>
<li>${m.inputFingerprints?.length
  ? `${m.inputFingerprints.length} input fingerprint(s) are published. Hash your own evidence the same way to see how much of it you already hold.`
  : 'No input fingerprints were published, so you cannot check which evidence this rests on.'}</li>
<li>Source identities are <strong>not</strong> published, by design — only a count.</li>
</ul>

<h2>${esc(t('author'))}</h2>
<p><code>${esc(signed.signature.pubkey.slice(0, 32))}…</code></p>`;

  fs.writeFileSync(path.join(OUT, 'claim', `${slot}.html`), page(`${c.claim.subjectRef} — ${c.claim.attribute}`, body));
  entries.push({ slot, subject: c.claim.subjectRef, attribute: c.claim.attribute, weight: d.weight, ok, publishedAt: c.publishedAt });
}

/**
 * Verified first, then by weight.
 *
 * Sorting purely by weight let a claim whose signature FAILED outrank verified
 * ones and sit near the top of the public index — the position a reader scans
 * first and trusts most. Worse, the weight it was ranked on is derived from the
 * same unverified payload, so a forger could pick a source count and win the
 * ordering. Ranking must never be decided by numbers an attacker supplies.
 */
entries.sort((a, b) => (a.ok === b.ok ? b.weight - a.weight : a.ok ? -1 : 1));

const index = `
<h1>${esc(t('claimsIndex'))}</h1>
<p class="muted">Published findings, each with the method behind it. Weight is derived
from stated facts rather than asserted by the publisher, so every number here is
one you can recompute.</p>
${entries.length === 0
  ? '<p class="muted">No claims published yet. This is an empty index, not an error — nothing has met the publication bar.</p>'
  : `<table><tr><th>Claim</th><th>Weight</th></tr>${entries.map(e => `
<tr><td><a href="claim/${esc(e.slot)}.html">${esc(e.subject)}</a> <span class="muted">${esc(e.attribute)}</span>${e.ok ? '' : ` <span class="badge warn">${esc(t('unverified'))}</span>`}</td><td>${e.ok ? e.weight.toFixed(3) : '<span class="muted">&mdash;</span>'}</td></tr>`).join('')}</table>`}
<h2>What this is</h2>
<ul>
<li>Static pages. No account, no wallet, no application to install.</li>
<li>Every claim shows the evidence count, method and parameters behind it.</li>
<li>Source identities are never published — only how many there were.</li>
<li>A claim whose signature fails is shown anyway, marked, because that is information.</li>
</ul>`;

fs.writeFileSync(path.join(OUT, 'index.html'), page('Attested claims', index));
console.log(`Wrote ${entries.length} claim page(s) + index to ${OUT}`);
console.log(entries.length ? `  ${entries.filter(e => e.ok).length} verified, ${entries.filter(e => !e.ok).length} unverified` : '  (empty index)');
if (malformed.length) {
  // Loud, and on stderr: a dropped claim is a publisher's page that silently
  // did not appear. Failing quietly here would look identical to success.
  console.error(`  ${malformed.length} payload(s) NOT published — missing required fields:`);
  for (const m of malformed) console.error(`    ${m.file} (${m.subject}): ${m.missing.join(', ')}`);
}

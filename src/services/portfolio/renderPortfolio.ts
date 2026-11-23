/**
 * A portfolio as its intern hands it over (decision D-EX, EX12, EX20, EX29): one HTML page an advisor
 * reads with nothing else, and the same record as JSON.
 *
 * The record is the portfolio's exact JSON text, signed: an attestation of its own never-published kind
 * names the text's SHA-256 and is signed by the key whose work it lists. The page is written once, as
 * static text, so it reads without scripts and prints to PDF; every word in it is the page's text,
 * never its markup. It carries the exact signed text (base64, so nothing in a report can end the page
 * early) and one script: the checker (portfolioVerifier.ts, by its source), which hashes the text,
 * compares it with the attestation, and checks every signature, offline, in the advisor's browser.
 */
import { nip19, type Event } from 'nostr-tools';
import { APP_KINDS } from '../nostr/kindRegistry';
import { CYAN, FONTS, GUNMETAL, SEMANTIC } from '../../styles/tokens';
import { formatUtcDate, formatUtcDateTime } from '../../utils/utcTime';
import { bytesToBase64 } from '../../extension/bytes';
import { PORTFOLIO_SECTIONS, type Portfolio, type PortfolioItem, type PortfolioItemKind } from './gatherPortfolio';
import { verifyNostrEvents } from './portfolioVerifier';

export interface SignedPortfolio {
  /** The portfolio's exact JSON text: what the attestation names. */
  text: string;
  attestation: Event;
}

const sha256Hex = async (text: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The portfolio's text, and its attestation signed by `sign` (the person's key, at their click). */
export async function signPortfolio(
  portfolio: Portfolio,
  sign: (event: { kind: number; created_at: number; tags: string[][]; content: string }) => Promise<Event>,
  now: () => Date = () => new Date(),
): Promise<SignedPortfolio> {
  const text = JSON.stringify(portfolio);
  const digest = await sha256Hex(text);
  const attestation = await sign({
    kind: APP_KINDS.PORTFOLIO_ATTESTATION,
    created_at: Math.floor(now().getTime() / 1000),
    tags: [['t', 'starcom-portfolio'], ['x', digest]],
    content: JSON.stringify({ type: 'starcom-portfolio', v: 1, digest, items: portfolio.items.length, events: portfolio.events.length, madeAt: portfolio.madeAt }),
  });
  if (attestation.pubkey !== portfolio.key) throw new Error('The portfolio was signed by another key than the one its work is under');
  return { text, attestation };
}

/** The record as JSON: the signed text and its attestation, so anyone can hash the one and check the other. */
export function portfolioJsonFile(signed: SignedPortfolio): string {
  return JSON.stringify({ format: 'starcom.portfolio.signed', portfolio: signed.text, attestation: signed.attestation });
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const NOUN: Record<PortfolioItemKind, [noun: string, plural: string, verb: string]> = {
  case: ['case', 'Cases', 'opened'],
  mission: ['mission', 'Missions', 'made'],
  report: ['report', 'Reports', 'written'],
  evidence: ['piece of evidence', 'Evidence', 'captured'],
  claim: ['claim', 'Published claims', 'published'],
  refutation: ['refutation', 'Refutations', 'published'],
  package: ['mission package', 'Mission packages', 'published'],
  review: ['review', 'Reviews', 'published'],
};

/** "no signed events", "one signed event", "3 signed events". */
const count = (n: number, noun: string) => (n === 0 ? `no ${noun}s` : n === 1 ? `one ${noun}` : `${n} ${noun}s`);

const dateOf = (at: string) => (Number.isFinite(Date.parse(at)) ? formatUtcDate(Date.parse(at), { year: true }) : 'an unrecorded date');

/** "A Private case, opened 2 Dec 2026": what a listed item says of itself. */
export function listedPhrase(item: PortfolioItem): string {
  const [noun, , verb] = NOUN[item.kind];
  const when = `${verb} ${dateOf(item.at)}`;
  const because = item.listedBecause ?? 'not marked';
  if (because === 'Private' || because === 'Limited') return `A ${because} ${noun}, ${when}`;
  if (because === 'not marked') return `A ${noun} not yet marked, ${when}`;
  return `A ${noun} ${because}, ${when}`;
}

function shownItem(item: PortfolioItem): string {
  const [noun, , verb] = NOUN[item.kind];
  const meta = [`${noun[0].toUpperCase()}${noun.slice(1)}, ${verb} ${dateOf(item.at)}`, item.status ? item.status.toLowerCase() : ''];
  if (item.eventIds?.length) meta.push(`signed event ${item.eventIds.map((id) => id.slice(0, 12)).join(', ')}`);
  const parts = [
    `<article class="item"${item.eventIds?.length ? ` data-events="${escape(item.eventIds.join(' '))}"` : ''}>`,
    `<h3>${escape(item.title || `Untitled ${noun}`)}</h3>`,
    `<p class="meta">${meta.filter(Boolean).map(escape).join(' · ')}<span class="state"></span></p>`,
  ];
  if (item.url) parts.push(`<p class="url">From <span class="data">${escape(item.url)}</span></p>`);
  if (item.fingerprints?.length) parts.push(`<p class="meta">SHA-256 of each file:</p><ul class="data">${item.fingerprints.map((f) => `<li>${escape(f)}</li>`).join('')}</ul>`);
  if (item.timestampedBy?.length) parts.push(`<p class="meta">Timestamped with OpenTimestamps by ${escape(item.timestampedBy.join(' and '))}.</p>`);
  if (item.text) parts.push(`<pre class="text">${escape(item.text)}</pre>`);
  parts.push('</article>');
  return parts.join('');
}

/** The page's one script: the checker, by its source, and the two buttons. */
function checkerScript(): string {
  return `
const verifyNostrEvents = ${verifyNostrEvents.toString()};
const carried = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(document.getElementById('portfolio-data').textContent.trim()), (c) => c.charCodeAt(0))));
const out = document.getElementById('check-result');
const button = document.getElementById('check');
button.addEventListener('click', async () => {
  button.disabled = true;
  out.textContent = 'Checking…';
  try {
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(carried.portfolio))), (b) => b.toString(16).padStart(2, '0')).join('');
    const named = (carried.attestation.tags.find((t) => t[0] === 'x') || [])[1];
    const portfolio = JSON.parse(carried.portfolio);
    const results = await verifyNostrEvents([carried.attestation].concat(portfolio.events));
    const whole = digest === named && results[0].ok && carried.attestation.pubkey === portfolio.key;
    const work = results.slice(1);
    const failed = work.filter((r) => !r.ok);
    for (const article of document.querySelectorAll('article[data-events]')) {
      const ids = article.getAttribute('data-events').split(' ');
      const bad = ids.some((id) => results.some((r) => r.id === id && !r.ok));
      article.querySelector('.state').textContent = bad ? ' · its signature does NOT check' : ' · its signature checks';
      article.dataset.state = bad ? 'fail' : 'ok';
    }
    out.textContent = (whole ? 'This portfolio is exactly as its key signed it. ' : 'This portfolio is NOT as its key signed it: something in it was changed. ')
      + (!work.length ? 'It holds no signed events.'
        : failed.length ? (failed.length === 1 ? 'One' : failed.length) + ' of its ' + work.length + ' signed events ' + (failed.length === 1 ? 'does' : 'do') + ' NOT check.'
        : work.length === 1 ? 'Its one signed event checks.' : 'All ' + work.length + ' of its signed events check.');
    out.dataset.state = whole && !failed.length ? 'ok' : 'fail';
  } catch (error) {
    out.textContent = 'This browser could not run the check: ' + (error && error.message ? error.message : error);
  }
  button.disabled = false;
});
document.getElementById('save-json').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ format: 'starcom.portfolio.signed', portfolio: carried.portfolio, attestation: carried.attestation })], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'starcom-portfolio.json';
  link.click();
});`;
}

export function renderPortfolioHtml(signed: SignedPortfolio, portfolio: Portfolio, who: { name?: string }): string {
  const npub = nip19.npubEncode(portfolio.key);
  const shown = portfolio.items.filter((i) => i.shown).length;
  const sections = PORTFOLIO_SECTIONS.map((kind) => {
    const items = portfolio.items.filter((i) => i.kind === kind);
    if (!items.length) return '';
    const full = items.filter((i) => i.shown);
    const listed = items.filter((i) => !i.shown);
    return [
      `<section><h2>${escape(NOUN[kind][1])} <span class="count">${items.length}</span></h2>`,
      ...full.map(shownItem),
      listed.length ? `<ul class="listed">${listed.map((i) => `<li>${escape(listedPhrase(i))}</li>`).join('')}</ul>` : '',
      '</section>',
    ].join('');
  }).join('');
  const readNote = portfolio.read.complete
    ? `Published work was read from ${portfolio.read.relays.length === 1 ? 'one public relay' : `${portfolio.read.relays.length} public relays`}: ${portfolio.read.relays.join(', ')}.`
    : `Published work was read from ${portfolio.read.relays.join(', ')}, but the read did not finish${portfolio.read.note ? ` (${portfolio.read.note})` : ''}: some published work may be missing.`;
  const unsigned = portfolio.leftOut?.unsignedEvidence;
  const carried = bytesToBase64(new TextEncoder().encode(JSON.stringify({ portfolio: signed.text, attestation: signed.attestation })));
  const title = who.name ? `Starcom portfolio: ${who.name}` : 'Starcom portfolio';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
  :root { --sc-font-text: ${FONTS.text}; --sc-font-data: ${FONTS.data}; --paper: ${GUNMETAL[100]}; --ink: ${GUNMETAL[950]}; --soft: ${GUNMETAL[600]}; --rule: ${GUNMETAL[300]}; --accent: ${CYAN[700]}; --ok: ${SEMANTIC.ok}; --bad: ${SEMANTIC.danger}; }
  * { box-sizing: border-box; }
  body { margin: 0; padding-inline: 16px; padding-block: 32px 48px; background: var(--paper); color: var(--ink); font: 15px/1.55 var(--sc-font-text); }
  main { max-width: 46rem; margin: 0 auto; display: grid; gap: 28px; }
  header { border-bottom: 2px solid var(--accent); padding-bottom: 14px; display: grid; gap: 4px; }
  .wordmark { margin: 0; color: var(--accent); letter-spacing: .2em; text-transform: uppercase; font-size: .8rem; font-weight: 700; }
  h1 { margin: 0; font-size: 1.8rem; }
  h2 { margin: 0 0 10px; font-size: 1.1rem; border-bottom: 1px solid var(--rule); padding-bottom: 4px; }
  h3 { margin: 0; font-size: 1rem; }
  .count { color: var(--soft); font-weight: 400; }
  .meta, .url, .note, footer { color: var(--soft); font-size: .88rem; margin: 2px 0; }
  .data, code { font-family: var(--sc-font-data); font-size: .82rem; overflow-wrap: anywhere; }
  ul.data { margin: 2px 0; padding-left: 18px; }
  .item { padding: 10px 0; border-bottom: 1px solid var(--rule); display: grid; gap: 4px; }
  .item[data-state="fail"] .state, #check-result[data-state="fail"] { color: var(--bad); font-weight: 700; }
  .item[data-state="ok"] .state { color: var(--accent); }
  pre.text { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; }
  ul.listed { margin: 6px 0 0; padding-left: 18px; color: var(--soft); }
  .check { display: grid; gap: 6px; padding: 12px; border: 1px solid var(--rule); border-radius: 4px; }
  .check button { font: inherit; padding: 6px 12px; margin-right: 6px; cursor: pointer; }
  #check-result[data-state="ok"] { color: var(--accent); font-weight: 700; }
  footer { border-top: 1px solid var(--rule); padding-top: 12px; display: grid; gap: 6px; }
  @media print { .check button { display: none; } body { background: white; } }
</style>
</head>
<body>
<main>
<header>
  <p class="wordmark">Starcom</p>
  <h1>${escape(who.name ? `Portfolio of ${who.name}` : 'Portfolio')}</h1>
  <p class="meta">The work under the key <code>${escape(npub)}</code></p>
  <p class="meta">Made ${escape(formatUtcDateTime(Date.parse(portfolio.madeAt), { year: true }))}: ${count(portfolio.items.length, 'item')}, ${shown} in full, ${portfolio.items.length - shown} listed only; ${count(portfolio.events.length, 'signed event')}.</p>
</header>
<section class="check">
  <div><button type="button" id="check">Check every signature</button><button type="button" id="save-json">Save the record as JSON</button></div>
  <p id="check-result" role="status"></p>
  <p class="note">The check runs in this browser, offline: it hashes this portfolio, compares it with what its key signed, and checks every signature in it. Nothing is sent anywhere.</p>
</section>
${sections || '<p class="note">No work is under this key yet.</p>'}
<footer>
  <p>Work marked Public is shown in full. Work marked Limited, Private, careful or protected, or not yet marked, is listed by kind and date only.</p>
  <p>${escape(readNote)} Published items are shown as the relays hold them; their dates are as their key signed them. Other dates are as recorded on the device the work was done on. Evidence is listed by the SHA-256 of each file; the files stay with their capturer.</p>
  ${unsigned ? `<p>${unsigned === 1 ? 'One piece of evidence in that browser was not signed, so it is' : `${unsigned} pieces of evidence in that browser were not signed, so they are`} not listed: evidence is signed from the evidence, with the key.</p>` : ''}
</footer>
</main>
<script type="application/octet-stream" id="portfolio-data">${carried}</script>
<script>${checkerScript()}</script>
</body>
</html>
`;
}

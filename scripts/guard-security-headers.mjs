#!/usr/bin/env node
/**
 * The response headers that protect a visitor must actually be in vercel.json.
 *
 * ─── WHY A GUARD ───────────────────────────────────────────────────────────
 *
 * This is a static site with a signing key in the visitor's own browser, so the
 * headers below are not paperwork. Until 2026-09-12 it served none of them:
 * vercel.json carried Content-Type and Cache-Control rules and nothing else.
 *
 *   X-Frame-Options            the app cannot be framed, so a page cannot put an
 *                              invisible Starcom over its own UI and collect the
 *                              clicks (clickjacking). The one place this would
 *                              bite is an intentional embed, and there is none.
 *   X-Content-Type-Options     a served file is what its type says it is; a
 *                              browser may not sniff a .json into a script.
 *   Referrer-Policy            an outbound link carries the origin, never the
 *                              path — the path can name what was being looked at.
 *   Permissions-Policy         every device capability this app does not use is
 *                              denied outright rather than left to a prompt.
 *   Cross-Origin-Opener-Policy a cross-origin opener cannot reach into this
 *                              page. Deliberately same-origin-ALLOW-POPUPS: a
 *                              bare same-origin severs window.opener for popups
 *                              the app itself opens, which is how wallet and
 *                              OAuth flows talk back to it.
 *
 * A header is easy to drop by accident and its absence is silent — nothing
 * fails, no test goes red, the site simply stops being protected. So the
 * invariant is checked rather than described: each required header must be
 * present on a rule that covers every path.
 *
 * ─── THE CONTENT-SECURITY-POLICY ───────────────────────────────────────────
 *
 * Measured on 2026-09-12 before writing one. Two findings decided its shape:
 *
 *   Connections cannot be listed. The running app opens relays that code adds at
 *   runtime, and about forty hosts are called only when a person uses a tool (the
 *   NetRunner adapters, EIA, OpenWeather, IPFS pinning). The layer audit sees only
 *   what globe layers fetch on a fresh load. So connect-src stays open to any https
 *   or wss host; listing hosts would break features no probe reaches.
 *
 *   Scripts can be locked down, and that is what protects anything. An injected
 *   script can read the Nostr key in localStorage. script-src 'self' with no inline
 *   scripts, and object-src 'none', stop that. It needed index.html's two inline boot
 *   scripts moved into files (public/boot/).
 *
 * It shipped report-only first, by decision, and is now enforced: an enforced run over
 * the layers and screens, served locally with these headers, found one thing it
 * broke (a share card fetching its own data: URL), which was fixed first. Before
 * adding anything that loads a script, frames a page, or connects over something
 * other than https:, wss: or blob:, run it under this policy; a violation now blocks
 * it for every visitor. This guard holds the parts that protect, whichever mode is
 * served, and keeps index.html free of the inline scripts that script-src 'self'
 * would block.
 *
 * Usage: node scripts/guard-security-headers.mjs
 *
 * @asserts vercel.json serves the site-wide security headers on every path, with a CSP whose scripts are locked down, and index.html has no inline script it would block.
 */
import fs from 'node:fs';

const CONFIG = 'vercel.json';

/** Header → what it must say. A value is checked, not merely the key's presence. */
export const REQUIRED_HEADERS = {
  'X-Frame-Options': (v) => /^(DENY|SAMEORIGIN)$/i.test(v),
  'X-Content-Type-Options': (v) => v.toLowerCase() === 'nosniff',
  'Referrer-Policy': (v) => /^(no-referrer|same-origin|strict-origin|strict-origin-when-cross-origin)$/i.test(v),
  // Denying nothing would satisfy a key-only check, so the value must actually
  // deny something: at least one feature set to the empty allowlist.
  'Permissions-Policy': (v) => /=\(\s*\)/.test(v),
  'Cross-Origin-Opener-Policy': (v) => /^same-origin(-allow-popups)?$/i.test(v),
};

/** A Vercel source that covers every path. Only the forms this repo uses. */
export function coversEveryPath(source) {
  return source === '/(.*)' || source === '/(.*)?' || source === '/:path*';
}

/** Either form counts as served; which one is served is reported, not assumed. */
export const CSP_HEADERS = ['Content-Security-Policy', 'Content-Security-Policy-Report-Only'];

export function parseCsp(value) {
  const directives = new Map();
  for (const part of String(value).split(';')) {
    const [name, ...tokens] = part.trim().split(/\s+/).filter(Boolean);
    if (name) directives.set(name.toLowerCase(), tokens);
  }
  return directives;
}

/** What a policy must hold to stop an injected script: the reason to have one. */
export function cspProblems(value) {
  const csp = parseCsp(value);
  const problems = [];
  const scripts = csp.get('script-src') ?? csp.get('default-src');
  if (!scripts) {
    problems.push('it has no script-src or default-src, so it allows any script.');
  } else {
    const loose = scripts.filter((t) => ["'unsafe-inline'", '*', 'http:', 'https:', 'data:', 'blob:'].includes(t.toLowerCase()));
    if (loose.length) problems.push(`script-src allows ${loose.join(' ')}, which lets an injected script run.`);
  }
  if ((csp.get('object-src') ?? []).join(' ') !== "'none'") problems.push("object-src is not 'none', so a plugin can run code.");
  if (!csp.has('base-uri')) problems.push('it has no base-uri, so an injected <base> can repoint every relative script.');
  return problems;
}

/** Executable inline scripts, which script-src 'self' blocks. JSON-LD and other data blocks never run. */
export function findInlineScripts(html) {
  const found = [];
  for (const m of String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1] ?? '').toLowerCase();
    if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue;
    if (m[2].trim()) found.push(m[2].trim().split('\n')[0].slice(0, 80));
  }
  return found;
}

export function findMissingHeaders(config) {
  const rules = Array.isArray(config.headers) ? config.headers : [];
  const sitewide = rules.filter((r) => coversEveryPath(r.source));
  const served = new Map();
  for (const rule of sitewide) {
    for (const h of rule.headers ?? []) served.set(h.key, h.value);
  }

  const problems = [];
  for (const [key, valid] of Object.entries(REQUIRED_HEADERS)) {
    if (!served.has(key)) {
      problems.push(`${key} is not served on a rule covering every path.`);
      continue;
    }
    const value = served.get(key);
    if (!valid(value)) {
      problems.push(`${key} is served as "${value}", which does not protect anything.`);
    }
  }
  const policies = CSP_HEADERS.filter((key) => served.has(key));
  if (!policies.length) {
    problems.push('Neither Content-Security-Policy nor Content-Security-Policy-Report-Only is served on a rule covering every path.');
  }
  for (const key of policies) {
    for (const p of cspProblems(served.get(key))) problems.push(`${key}: ${p}`);
  }
  return problems;
}

// Run only as a script, so the pure functions above can be tested directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  const config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  const problems = findMissingHeaders(config);
  const html = fs.existsSync('index.html') ? fs.readFileSync('index.html', 'utf8') : null;
  if (html === null) {
    problems.push('index.html was not found, so it could not be checked for inline scripts.');
  } else {
    for (const script of findInlineScripts(html)) {
      problems.push(`index.html has an inline script ("${script}"), which script-src 'self' blocks. Move it into a file.`);
    }
  }

  if (problems.length) {
    console.error('\n  SECURITY HEADERS GUARD FAILED\n');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('\n  These are served to every visitor or to none. See this file for what each');
    console.error('  one prevents.\n');
    process.exit(1);
  }

  console.log('\n  SECURITY HEADERS GUARD\n');
  console.log(`  ${Object.keys(REQUIRED_HEADERS).length} header(s) served on every path:`);
  console.log(`  ${Object.keys(REQUIRED_HEADERS).join(', ')}.`);
  const sitewideKeys = (config.headers ?? []).filter((r) => coversEveryPath(r.source)).flatMap((r) => (r.headers ?? []).map((h) => h.key));
  console.log(sitewideKeys.includes('Content-Security-Policy')
    ? '  Content-Security-Policy: enforced.\n'
    : '  Content-Security-Policy-Report-Only: violations are reported, nothing is blocked yet. See this file.\n');
}

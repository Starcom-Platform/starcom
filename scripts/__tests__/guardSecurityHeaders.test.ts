/**
 * The headers guard, watched failing on every way of losing a header.
 *
 * The failure this protects against is silent by nature: drop a header and
 * nothing breaks, nothing goes red, the site simply stops being protected. So
 * each case here is a real way that could happen — a header deleted, a rule
 * narrowed to one path, a value weakened to something that denies nothing.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-security-headers.mjs';

/** Locks scripts down; leaves connections open, as the real one must. */
const POLICY = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; base-uri 'self'; "
  + "frame-ancestors 'none'; connect-src 'self' https: wss:";

/** JSON-LD is a data block and never runs, so it must not count as an inline script. */
const CLEAN_HTML = '<!doctype html><html><head><script type="application/ld+json">{"@type":"WebSite"}</script>'
  + '<script src="/boot/globals.js"></script></head>'
  + '<body><script type="module" src="/src/main.tsx"></script></body></html>';

const SITEWIDE = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'geolocation=(), camera=(), microphone=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Content-Security-Policy-Report-Only', value: POLICY },
];

const config = (over: { source?: string; headers?: Array<{ key: string; value: string }> } = {}) =>
  JSON.stringify({
    headers: [
      { source: over.source ?? '/(.*)', headers: over.headers ?? SITEWIDE },
      // A real rule from the repo, to prove the guard reads past unrelated ones.
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] },
    ],
  }, null, 2);

describe('guard-security-headers', () => {
  it('passes on the headers this site actually serves', () => {
    expect(runGuardIn(GUARD, { 'index.html': CLEAN_HTML, 'vercel.json': config() }).status).toBe(0);
  });

  it('FAILS when a header is dropped', () => {
    for (const missing of SITEWIDE) {
      const run = runGuardIn(GUARD, { 'index.html': CLEAN_HTML,
        'vercel.json': config({ headers: SITEWIDE.filter((h) => h.key !== missing.key) }),
      });
      expect(run.status, `dropping ${missing.key}`).toBe(1);
      expect(run.output).toContain(missing.key);
    }
  });

  it('FAILS when the rule stops covering every path', () => {
    // The quiet version of losing them all: the headers are still in the file.
    const run = runGuardIn(GUARD, { 'index.html': CLEAN_HTML, 'vercel.json': config({ source: '/index.html' }) });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/every path/i);
  });

  it('FAILS on a Permissions-Policy that denies nothing', () => {
    const run = runGuardIn(GUARD, { 'index.html': CLEAN_HTML,
      'vercel.json': config({
        headers: SITEWIDE.map((h) => (h.key === 'Permissions-Policy'
          ? { key: h.key, value: 'geolocation=(self), camera=(*)' } : h)),
      }),
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/does not protect/i);
  });

  it('FAILS on a Referrer-Policy that leaks the path', () => {
    const run = runGuardIn(GUARD, { 'index.html': CLEAN_HTML,
      'vercel.json': config({
        headers: SITEWIDE.map((h) => (h.key === 'Referrer-Policy'
          ? { key: h.key, value: 'unsafe-url' } : h)),
      }),
    });
    expect(run.status).toBe(1);
  });

  it('accepts same-origin-allow-popups, which the wallet and OAuth flows need', () => {
    // A bare same-origin severs window.opener for popups the app itself opens.
    for (const value of ['same-origin', 'same-origin-allow-popups']) {
      const run = runGuardIn(GUARD, { 'index.html': CLEAN_HTML,
        'vercel.json': config({
          headers: SITEWIDE.map((h) => (h.key === 'Cross-Origin-Opener-Policy' ? { key: h.key, value } : h)),
        }),
      });
      expect(run.status, value).toBe(0);
    }
    const unsafe = runGuardIn(GUARD, { 'index.html': CLEAN_HTML,
      'vercel.json': config({
        headers: SITEWIDE.map((h) => (h.key === 'Cross-Origin-Opener-Policy'
          ? { key: h.key, value: 'unsafe-none' } : h)),
      }),
    });
    expect(unsafe.status).toBe(1);
  });

  it('accepts the policy enforced as well as report-only', () => {
    const run = runGuardIn(GUARD, {
      'index.html': CLEAN_HTML,
      'vercel.json': config({
        headers: SITEWIDE.map((h) => (h.key === 'Content-Security-Policy-Report-Only'
          ? { key: 'Content-Security-Policy', value: h.value } : h)),
      }),
    });
    expect(run.status).toBe(0);
    expect(run.output).toMatch(/enforced/);
  });

  it("FAILS on a script-src that lets an inline script run", () => {
    const run = runGuardIn(GUARD, {
      'index.html': CLEAN_HTML,
      'vercel.json': config({
        headers: SITEWIDE.map((h) => (h.key === 'Content-Security-Policy-Report-Only'
          ? { key: h.key, value: h.value.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'") } : h)),
      }),
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/unsafe-inline/);
  });

  it("FAILS when object-src is not 'none'", () => {
    const run = runGuardIn(GUARD, {
      'index.html': CLEAN_HTML,
      'vercel.json': config({
        headers: SITEWIDE.map((h) => (h.key === 'Content-Security-Policy-Report-Only'
          ? { key: h.key, value: h.value.replace("object-src 'none'; ", '') } : h)),
      }),
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/object-src/);
  });

  it('FAILS when index.html carries an inline script the policy would block', () => {
    const run = runGuardIn(GUARD, {
      'index.html': CLEAN_HTML.replace('</head>', '<script>window.boot = 1;</script></head>'),
      'vercel.json': config(),
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/inline script/);
  });

  it('FAILS when index.html is missing, rather than passing unchecked', () => {
    const run = runGuardIn(GUARD, { 'vercel.json': config() });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/index\.html was not found/);
  });

});

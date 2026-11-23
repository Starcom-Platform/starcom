/**
 * Every address the app itself makes must open the app on the live site.
 *
 * Found by a smoke test of production on 2026-09-28: https://starcom.app/join
 * and every /app/... address answered Vercel's 404, so no invite link opened,
 * and reloading any app screen, or opening a shared link to a case, failed.
 * `vite preview`, which every other check here runs against, falls back to the
 * app on its own, so nothing had seen it. vercel.json had no rewrites.
 *
 * Vercel checks for a real file before it rewrites, and the fallback leaves out
 * /assets/ and /.well-known/, so a missing script still answers 404, not the
 * page, and the published .well-known documents are never replaced by it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Rewrite = { source: string; destination: string };
const config = JSON.parse(readFileSync(resolve(__dirname, '../../vercel.json'), 'utf8')) as { rewrites?: Rewrite[] };

/** A vercel.json source as Vercel reads it: the whole path, a group being a regular expression. */
const matches = (source: string, path: string) => new RegExp(`^${source}$`).test(path);
const toApp = (path: string) => (config.rewrites ?? []).some((r) => r.destination === '/index.html' && matches(r.source, path));

describe('the live site opens the app at every address the app makes', () => {
  it.each(['/join', '/app/teamworkspace', '/app/missions', '/app/cases/case-2026-77QX-B342', '/app/cases/an.id.with.dots', '/app/inteldashboard', '/app/cybercommand', '/some/old/link'])(
    '%s opens the app',
    (path) => expect(toApp(path)).toBe(true),
  );

  // After the first deploy, /favicon.ico (no such file) answered the page with a 200.
  it.each(['/assets/index-SV5yzkdJ.js', '/assets/missing-chunk.js', '/.well-known/nostr.json', '/.well-known/starcom-node.json', '/favicon.ico', '/robots.txt', '/missing.png', '/manifest.webmanifest'])(
    '%s is left to the file, or to a real 404',
    (path) => expect(toApp(path)).toBe(false),
  );

  it('rewrites only to the app itself: nothing is proxied to another host', () => {
    for (const r of config.rewrites ?? []) expect(r.destination).toMatch(/^\/[^/]/);
  });
});

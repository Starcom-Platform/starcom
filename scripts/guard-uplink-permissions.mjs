#!/usr/bin/env node
/**
 * Starcom Uplink asks for nothing it does not give a reason for, and says each
 * reason the same way everywhere (decision D-EX, E0).
 *
 * ─── WHY ───────────────────────────────────────────────────────────────────
 *
 * A browser extension's permissions are a promise to the person who installs
 * it. The store asks for a reason for each, the privacy page states them, and
 * the manifest is what the browser actually grants. Three places that say the
 * same thing drift apart unless one of them is the source and the others are
 * held to it.
 *
 * extension/permissions.json is the source. This guard holds to it:
 *   - the build config, which must take every permission from it and write
 *     none of its own, and every content script's pages likewise;
 *   - the privacy page (public/uplink/privacy.html) and the store listing
 *     (extension/store/listing.md), which must give each reason word for word;
 *   - every built production package present under extension/.output/, whose
 *     manifest must ask for exactly what the file lists.
 *
 * With no built package it checks the sources and says so: the deploy builds
 * the app, not the extension.
 *
 * Usage: node scripts/guard-uplink-permissions.mjs
 *
 * @asserts Uplink's manifest asks for exactly the permissions in
 *          extension/permissions.json, each with a reason the privacy page and
 *          the store listing give word for word.
 */
import fs from 'node:fs';
import path from 'node:path';

const SOURCE = 'extension/permissions.json';
const CONFIG = 'extension/wxt.config.ts';
const ENTRYPOINTS = 'extension/entrypoints';
const PRIVACY = 'public/uplink/privacy.html';
const LISTING = 'extension/store/listing.md';
/** Production packages only: a development build also runs the bridge on localhost, by design. */
const BUILDS = ['chrome-mv3', 'firefox-mv3', 'firefox-mv2'].map((b) => `extension/.output/${b}/manifest.json`);
/** A reason long enough to say what and why, short enough for the store's field. */
const REASON = { min: 40, max: 500 };

const problems = [];
const note = (m) => problems.push(m);
const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);

/** Text as a reader meets it: no tags, entities decoded, quotes straight, one space between words. */
const plain = (text) => text
  .replace(/<[^>]*>/g, ' ')
  .replace(/^\s*>\s?/gm, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/\s+/g, ' ');

const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

const sourceText = read(SOURCE);
let uplink = null;
if (sourceText === null) note(`${SOURCE} is missing: the permissions have no source of reasons.`);
else {
  try { uplink = JSON.parse(sourceText); } catch (e) { note(`${SOURCE} is not JSON: ${e.message}`); }
}

if (uplink) {
  /** Every statement the file makes, by name: what the privacy page and listing must give word for word. */
  const statements = [];
  const statement = (name, text) => {
    if (typeof text !== 'string') return note(`${SOURCE}: ${name} has no reason.`);
    if (text.length < REASON.min || text.length > REASON.max) note(`${SOURCE}: ${name}'s reason is ${text.length} characters; a reason is ${REASON.min}–${REASON.max}.`);
    if (/[<>]/.test(text)) note(`${SOURCE}: ${name}'s reason has < or >; reasons are plain words.`);
    statements.push([name, text]);
  };
  statement('single_purpose', uplink.single_purpose);
  const permissions = uplink.permissions && typeof uplink.permissions === 'object' ? Object.keys(uplink.permissions) : [];
  if (!permissions.length) note(`${SOURCE}: no permissions listed.`);
  // Permissions Firefox has no use for (its sidebar needs none): asked for in Chromium packages alone.
  const chromiumOnly = Array.isArray(uplink.chromium_only) ? uplink.chromium_only : [];
  for (const name of chromiumOnly) {
    if (!permissions.includes(name)) note(`${SOURCE}: chromium_only names "${name}", which it does not list with a reason.`);
  }
  for (const name of permissions) statement(`permission "${name}"`, uplink.permissions[name]);
  const patternsOf = (key) => {
    const block = uplink[key];
    if (!block || !Array.isArray(block.patterns) || !block.patterns.length) { note(`${SOURCE}: ${key} lists no patterns.`); return []; }
    statement(key, block.reason);
    return block.patterns;
  };
  const bridge = patternsOf('bridge_pages');
  const optional = patternsOf('optional_host_permissions');
  statement('remote_code', uplink.remote_code);
  statement('data_collected', uplink.data_collected);

  // The build config takes every permission from the file and writes none of its own.
  const config = read(CONFIG);
  if (config === null) note(`${CONFIG} is missing.`);
  else {
    if (!/from\s+['"]\.\/permissions\.json['"]/.test(config)) note(`${CONFIG} does not read permissions.json.`);
    const literal = config.match(/\b(permissions|host_permissions|optional_permissions|optional_host_permissions)\s*:\s*\[/);
    if (literal) note(`${CONFIG} writes ${literal[1]} itself; every permission comes from ${SOURCE}, with its reason.`);
  }
  // Every content script's pages likewise: a script's pages are sites it is granted.
  const scripts = fs.existsSync(ENTRYPOINTS)
    ? fs.readdirSync(ENTRYPOINTS, { recursive: true }).map(String).filter((f) => /\.content(\/index)?\.[jt]sx?$/.test(f))
    : [];
  for (const file of scripts) {
    const text = fs.readFileSync(path.join(ENTRYPOINTS, file), 'utf8');
    if (/\bmatches\s*:\s*\[/.test(text)) note(`${ENTRYPOINTS}/${file} lists its own pages; they come from ${SOURCE}'s bridge_pages, with their reason.`);
  }

  // The privacy page and the store listing give every reason word for word.
  for (const [file, what] of [[PRIVACY, 'privacy page'], [LISTING, 'store listing']]) {
    const text = read(file);
    if (text === null) { note(`The ${what} (${file}) is missing.`); continue; }
    const said = plain(text);
    for (const [name, reason] of statements) {
      if (!said.includes(plain(reason))) note(`The ${what} (${file}) does not give ${name} as ${SOURCE} states it.`);
    }
    for (const name of permissions) {
      if (!said.includes(name)) note(`The ${what} (${file}) does not name the permission "${name}".`);
    }
  }

  // Every built production package asks for exactly what the file lists.
  const built = BUILDS.filter((file) => fs.existsSync(file));
  for (const file of built) {
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { note(`${file} is not JSON: ${e.message}`); continue; }
    const asked = manifest.permissions ?? [];
    const v2 = manifest.manifest_version === 2;
    const firefox = Boolean(manifest.browser_specific_settings?.gecko) || file.includes('/firefox-');
    const expected = firefox ? permissions.filter((p) => !chromiumOnly.includes(p)) : permissions;
    // In MV2, sites sit among the permissions, and optional ones among the optional permissions.
    const named = v2 ? asked.filter((p) => !p.includes('://')) : asked;
    if (!sameSet(named, expected)) note(`${file} asks for [${named.join(', ')}]; ${SOURCE} lists [${expected.join(', ')}]${firefox ? ' for Firefox' : ''}.`);
    const hosts = v2 ? asked.filter((p) => p.includes('://')) : (manifest.host_permissions ?? []);
    const extraHosts = hosts.filter((h) => !bridge.includes(h));
    if (extraHosts.length) note(`${file} is granted [${extraHosts.join(', ')}] at install, beyond Starcom's own pages.`);
    const optionalAsked = v2 ? (manifest.optional_permissions ?? []) : (manifest.optional_host_permissions ?? []);
    if (!sameSet(optionalAsked, optional)) note(`${file} may ask for [${optionalAsked.join(', ')}]; ${SOURCE} lists [${optional.join(', ')}].`);
    if (!v2 && (manifest.optional_permissions ?? []).length) note(`${file} has optional permissions [${manifest.optional_permissions.join(', ')}] with no reason in ${SOURCE}.`);
    const pages = (manifest.content_scripts ?? []).flatMap((c) => c.matches ?? []);
    const extraPages = pages.filter((p) => !bridge.includes(p));
    if (extraPages.length) note(`${file} runs a script on [${extraPages.join(', ')}], beyond Starcom's own pages.`);
  }

  if (!problems.length) {
    console.log('\n  UPLINK PERMISSIONS GUARD\n');
    console.log(`  ${permissions.length} permission(s) and ${optional.length} optional site pattern(s), each with its reason,`);
    console.log('  given word for word on the privacy page and in the store listing.');
    console.log(built.length
      ? `  ${built.length} built package(s) ask for exactly these: ${built.map((f) => f.split('/')[2]).join(', ')}.\n`
      : '  No built package here, so the sources were checked: the manifest is made from them.\n');
  }
}

if (problems.length) {
  console.error('\n  UPLINK PERMISSIONS GUARD FAILED\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('');
  process.exit(1);
}

/**
 * guard-uplink-permissions.mjs: Starcom Uplink asks for nothing without a reason, and the privacy page
 * and the store listing give each reason as extension/permissions.json states it (decision D-EX, E0).
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-uplink-permissions.mjs';

const REASONS = {
  single_purpose: 'Connects Starcom to your browser, so investigations reach the sites you allow.',
  storage: 'Keeps the activity log and your settings in this browser, and nowhere else.',
  bridge: "Runs the bridge on Starcom's own pages, so Starcom can ask Uplink what it can do.",
  optional: 'Optional, and never granted at install: one site at a time, asked with its reason.',
  remote_code: 'None. Everything it runs is in its package, and it evaluates nothing it receives.',
  data: 'None. It sends nothing about you or your browsing to Starcom or anyone else.',
};

const SOURCE = {
  single_purpose: REASONS.single_purpose,
  permissions: { storage: REASONS.storage },
  bridge_pages: { patterns: ['https://starcom.app/*'], reason: REASONS.bridge },
  optional_host_permissions: { patterns: ['https://*/*'], reason: REASONS.optional },
  remote_code: REASONS.remote_code,
  data_collected: REASONS.data,
};

const CONFIG = `import uplink from './permissions.json';
export default { manifest: { permissions: Object.keys(uplink.permissions), optional_host_permissions: uplink.optional_host_permissions.patterns } };
`;
const BRIDGE = 'export default defineContentScript({ matches: bridgePages(import.meta.env.MODE), main() {} });\n';
/** Every reason, as a page might set it: in tags, with an entity for the apostrophe. */
const PRIVACY = `<html><body><dl><dt><code>storage</code></dt>${Object.values(REASONS).map((r) => `<p>${r.replace(/'/g, '&#39;')}</p>`).join('\n')}</dl></body></html>`;
/** And as the listing quotes it: wrapped, in a blockquote. */
const LISTING = `# Listing\n\n- \`storage\`\n\n${Object.values(REASONS).map((r) => `> ${r.replace(/, /g, ',\n> ')}`).join('\n\n')}\n`;

const MANIFEST = {
  manifest_version: 3,
  permissions: ['storage'],
  optional_host_permissions: ['https://*/*'],
  content_scripts: [{ matches: ['https://starcom.app/*'], js: ['content-scripts/starcom-bridge.js'] }],
};

const repo = (over: Record<string, string | null> = {}) => {
  const files: Record<string, string | null> = {
    'extension/permissions.json': JSON.stringify(SOURCE),
    'extension/wxt.config.ts': CONFIG,
    'extension/entrypoints/starcom-bridge.content.ts': BRIDGE,
    'public/uplink/privacy.html': PRIVACY,
    'extension/store/listing.md': LISTING,
    ...over,
  };
  return Object.fromEntries(Object.entries(files).filter(([, v]) => v !== null)) as Record<string, string>;
};

describe('guard-uplink-permissions', () => {
  it('passes the sources when every reason is given word for word, and says no build was checked', () => {
    const run = runGuardIn(GUARD, repo());
    expect(run.output).toMatch(/No built package here, so the sources were checked/);
    expect(run.status).toBe(0);
  });

  it('passes a built package that asks for exactly what the file lists, and names it', () => {
    const run = runGuardIn(GUARD, repo({ 'extension/.output/chrome-mv3/manifest.json': JSON.stringify(MANIFEST) }));
    expect(run.output).toMatch(/1 built package\(s\) ask for exactly these: chrome-mv3/);
    expect(run.status).toBe(0);
  });

  it('refuses a built package that asks for a permission with no reason', () => {
    const run = runGuardIn(GUARD, repo({ 'extension/.output/chrome-mv3/manifest.json': JSON.stringify({ ...MANIFEST, permissions: ['storage', 'tabs'] }) }));
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/asks for \[storage, tabs\]/);
  });

  it('refuses a built package granted a site at install beyond Starcom\'s own pages', () => {
    const run = runGuardIn(GUARD, repo({ 'extension/.output/firefox-mv3/manifest.json': JSON.stringify({ ...MANIFEST, host_permissions: ['https://example.com/*'] }) }));
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/granted \[https:\/\/example.com\/\*\] at install/);
  });

  it('refuses a build config that writes its own permissions', () => {
    const run = runGuardIn(GUARD, repo({ 'extension/wxt.config.ts': CONFIG.replace('Object.keys(uplink.permissions)', "['storage', 'tabs']") }));
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/writes permissions itself/);
  });

  it('refuses a content script that lists its own pages', () => {
    const run = runGuardIn(GUARD, repo({ 'extension/entrypoints/capture.content.ts': "export default defineContentScript({ matches: ['<all_urls>'], main() {} });\n" }));
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/capture\.content\.ts lists its own pages/);
  });

  it('refuses a privacy page that words a reason its own way', () => {
    const run = runGuardIn(GUARD, repo({ 'public/uplink/privacy.html': PRIVACY.replace('and nowhere else', 'and that is all') }));
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/privacy page .* does not give permission "storage" as/);
  });

  it('refuses a store listing that leaves a reason out', () => {
    const run = runGuardIn(GUARD, repo({ 'extension/store/listing.md': LISTING.split('\n\n').filter((b) => !b.includes('evaluates nothing')).join('\n\n') }));
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/store listing .* does not give remote_code/);
  });

  it('refuses a reason too short to say what and why, and a missing privacy page', () => {
    const run = runGuardIn(GUARD, repo({
      'extension/permissions.json': JSON.stringify({ ...SOURCE, permissions: { storage: 'Storage.' } }),
      'public/uplink/privacy.html': null,
    }));
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/permission "storage"'s reason is 8 characters/);
    expect(run.output).toMatch(/The privacy page \(public\/uplink\/privacy.html\) is missing/);
  });

  it('expects a Chromium-only permission in Chromium packages alone, and refuses one listed nowhere', () => {
    const withPanel = { ...SOURCE, permissions: { ...SOURCE.permissions, sidePanel: 'Shows Starcom beside the page you are reading, when you open it.' }, chromium_only: ['sidePanel'] };
    const pages = {
      'public/uplink/privacy.html': PRIVACY.replace('</dl>', '<dt>sidePanel</dt><p>Shows Starcom beside the page you are reading, when you open it.</p></dl>'),
      'extension/store/listing.md': `${LISTING}\n- \`sidePanel\`\n\n> Shows Starcom beside the page you are reading, when you open it.\n`,
    };
    const run = runGuardIn(GUARD, repo({
      'extension/permissions.json': JSON.stringify(withPanel), ...pages,
      'extension/.output/chrome-mv3/manifest.json': JSON.stringify({ ...MANIFEST, permissions: ['storage', 'sidePanel'] }),
      'extension/.output/firefox-mv3/manifest.json': JSON.stringify({ ...MANIFEST, browser_specific_settings: { gecko: { id: 'uplink@starcom.app' } } }),
    }));
    expect(run.output).toMatch(/2 built package\(s\)/);
    expect(run.status).toBe(0);
    const unknown = runGuardIn(GUARD, repo({ 'extension/permissions.json': JSON.stringify({ ...SOURCE, chromium_only: ['tabs'] }) }));
    expect(unknown.status).toBe(1);
    expect(unknown.output).toMatch(/chromium_only names "tabs", which it does not list/);
  });
});


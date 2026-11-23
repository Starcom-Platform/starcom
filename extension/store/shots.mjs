// Starcom Uplink's store screenshots and promo tile (decision D-EX, W12, EX36), made from the real
// extension and the real app: the development build in Brave, against a local Starcom, capturing a
// made-up sample page served here (store/sample/flood-watch.html). The browser's own surfaces (the side
// panel, the popup's bubble, the permission window) cannot be pictured by automation, so those shots set
// Uplink's real pages side by side; everything in them is what the extension draws.
//
// A copy of the build allowed every site stands in for the person allowing the sites used (example.com
// for the page scan, web.archive.org for the Wayback list), and for the click on Uplink that lets it
// picture a tab: the browser's own prompt and toolbar cannot be clicked by automation.
// Relay EVENT and AUTH frames are dropped, so nothing is published.
//
//   node extension/store/shots.mjs <starcom url (local)> <extension dir (chrome-mv3-dev)> <profile dir> seed|rest|evidence|promo
//
// "seed" makes the case, the captures and the evidence, and takes shots 1 to 3, the evidence as it stands
// (pending). "rest" takes shots 4 and 5 with the same profile. "evidence", hours later, completes the
// evidence's timestamps against the real calendars and block explorers and retakes shot 3, so the store
// shows evidence really proven in Bitcoin, not staged.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '..', '..', 'scripts', '/'));
const { chromium } = require('playwright');
const [base, extDir, profile, phase = 'seed'] = process.argv.slice(2);
const out = path.join(here, 'screenshots');
fs.mkdirSync(out, { recursive: true });
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const SAMPLE_PORT = 5299;
const SAMPLE = `http://localhost:${SAMPLE_PORT}/flood-watch.html`;
const W = 1280;
const H = 800;

// The sample site, served as a web page would be.
const server = http.createServer((req, res) => {
  const file = path.join(here, 'sample', path.basename(new URL(req.url, SAMPLE).pathname));
  if (!fs.existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(fs.readFileSync(file));
});
await new Promise((resolve) => server.listen(SAMPLE_PORT, resolve));

// The small promo tile, 440×280: Starcom's emblem linked to a browser, and no words, as the store asks.
if (phase === 'promo') {
  const emblem = `data:image/png;base64,${fs.readFileSync(path.join(here, '..', '..', 'public', 'starcom-512.png')).toString('base64')}`;
  const browser = await chromium.launch({ headless: true, executablePath: BRAVE });
  const page = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:440px;height:280px;overflow:hidden;background:#0a1116">
    <svg width="440" height="280" viewBox="0 0 440 280" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0">
      <defs>
        <radialGradient id="glow" cx="30%" cy="50%" r="60%"><stop offset="0" stop-color="#0f3a4a"/><stop offset="1" stop-color="#0a1116"/></radialGradient>
        <pattern id="grid" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="#14303b" stroke-width="1"/></pattern>
      </defs>
      <rect width="440" height="280" fill="url(#glow)"/>
      <rect width="440" height="280" fill="url(#grid)" opacity=".55"/>
      <path d="M196 140 C 240 140, 252 118, 292 118" fill="none" stroke="#2fd3ff" stroke-width="3" stroke-dasharray="7 6" stroke-linecap="round"/>
      <circle cx="292" cy="118" r="4.5" fill="#2fd3ff"/>
      <g transform="translate(292 74)">
        <rect x="0" y="0" width="122" height="96" rx="9" fill="#0d1d25" stroke="#2fd3ff" stroke-width="2.5"/>
        <path d="M0 22 H122" stroke="#2fd3ff" stroke-width="2"/>
        <circle cx="14" cy="11" r="3.2" fill="#2fd3ff"/><circle cx="26" cy="11" r="3.2" fill="#1d7f99"/><circle cx="38" cy="11" r="3.2" fill="#1d7f99"/>
        <rect x="14" y="36" width="62" height="7" rx="3" fill="#1d7f99"/>
        <rect x="14" y="52" width="94" height="6" rx="3" fill="#174a5a"/>
        <rect x="14" y="65" width="80" height="6" rx="3" fill="#174a5a"/>
        <rect x="88" y="34" width="22" height="22" rx="4" fill="none" stroke="#2fd3ff" stroke-width="2"/>
      </g>
    </svg>
    <img src="${emblem}" style="position:absolute;left:40px;top:62px;width:156px;height:156px;mix-blend-mode:screen">
  </body></html>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(here, 'promo-440x280.png') });
  await browser.close();
  server.close();
  console.log('promo tile: store/promo-440x280.png');
  process.exit(0);
}

// The build, copied once into the profile so its path, and so its ID and storage, stay the same between phases.
const copy = path.join(profile, 'extension');
if (phase === 'seed') {
  fs.rmSync(profile, { recursive: true, force: true });
  fs.cpSync(extDir, copy, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(copy, 'manifest.json'), 'utf8'));
  // Every site, and <all_urls>, which the browser's picture of a tab takes in place of a real click's activeTab.
  manifest.host_permissions = [...(manifest.host_permissions ?? []), 'https://*/*', 'http://*/*', '<all_urls>'];
  fs.writeFileSync(path.join(copy, 'manifest.json'), JSON.stringify(manifest));
}
const context = await chromium.launchPersistentContext(path.join(profile, 'browser'), {
  headless: true, executablePath: BRAVE, viewport: { width: W, height: H },
  args: [`--disable-extensions-except=${copy}`, `--load-extension=${copy}`],
});

const png = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
/** Real pages set side by side at full bleed: each part an image of what the extension or app drew. */
async function compose(name, html) {
  const page = await context.newPage();
  await page.setViewportSize({ width: W, height: H });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#0d1418">${html}</body></html>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, name) });
  await page.close();
}
/** Starcom's one-time notice of a new signing key, put away before a shot, as the person would. */
const noticeAway = async (page) => {
  const gotIt = page.getByTestId('identity-notice').getByRole('button', { name: 'Got it' });
  if (await gotIt.count()) await gotIt.click();
  // And the one-time offer to name the key, put off as the person may.
  const notNow = page.getByRole('button', { name: 'Not now' });
  if (await notNow.count()) await notNow.first().click();
  await page.waitForTimeout(300);
};
const shot = async (page, name) => { await noticeAway(page); await page.screenshot({ path: path.join(out, name) }); console.log('  shot', name); };
/** The evidence viewer scrolled so its hashes, timestamps and custody record show, under the edge of its picture. */
const evidenceInView = async (page) => {
  // Once the viewer has read the evidence: before that, there is nothing below its title to scroll to.
  await page.getByTestId('evidence-files').waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const viewer = document.querySelector('[data-testid=evidence-viewer]');
    const last = viewer?.lastElementChild;
    (last ?? viewer)?.scrollIntoView({ block: 'end' });
  });
  await page.waitForTimeout(800);
};

/** Ready a context as every shot needs it: no guide, a light globe, nothing published. */
async function ready(ctx) {
  await ctx.addInitScript(() => {
    localStorage.setItem('starcom-pipeline-guide-dismissed', 'true');
    localStorage.setItem('starcom-globe-quality', JSON.stringify({ version: 1, timestamp: Date.now(), data: { setting: 'low' } }));
  });
  await ctx.routeWebSocket(/.*/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => { const s = String(m); if (s.startsWith('["EVENT"') || s.startsWith('["AUTH"')) return; server.send(m); });
  });
}

/**
 * 5: Uplink's own pages, from the build as it ships, in a fresh profile: Starcom's page scan asks for
 * example.com in Uplink's window with its purpose, the person declines, sends a selection, and the popup
 * and the activity log show exactly that. No site was allowed, so none is listed.
 */
async function shotUplinkPages() {
  fs.rmSync(path.join(profile, 'plain'), { recursive: true, force: true });
  const plain = await chromium.launchPersistentContext(path.join(profile, 'plain'), {
    headless: true, executablePath: BRAVE, viewport: { width: W, height: H },
    args: [`--disable-extensions-except=${path.resolve(extDir)}`, `--load-extension=${path.resolve(extDir)}`],
  });
  try {
    await ready(plain);
    const worker = plain.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://')) ?? await plain.waitForEvent('serviceworker', { timeout: 10000 });
    const ext = new URL(worker.url()).host;
    const opened = [];
    plain.on('page', (p) => opened.push(p));
    const net = await plain.newPage();
    await net.goto(`${base}/app/netrunner`, { waitUntil: 'domcontentloaded' });
    const osint = net.locator('#netrunner-tabpanel-0');
    await osint.getByLabel(/TARGET/i).fill('https://example.com');
    await net.waitForFunction(() => { const b = [...document.querySelectorAll('#netrunner-tabpanel-0 button')].find((x) => /^scan$/i.test(x.textContent.trim())); return b && !b.disabled; }, null, { timeout: 15000 });
    await osint.getByRole('button', { name: /^scan$/i }).click();
    let grant;
    for (let i = 0; i < 60 && !grant; i++) { grant = opened.find((p) => p.url().includes('grant.html')); if (!grant) await net.waitForTimeout(500); }
    if (!grant) throw new Error('Uplink\'s window did not open');
    await grant.waitForLoadState();
    console.log('  Uplink\'s window:', grant.url().split('?')[0], '| headings:', await grant.locator('h1').count(), '| size:', JSON.stringify(await grant.evaluate(() => [innerWidth, innerHeight])));
    await grant.setViewportSize({ width: 460, height: 380 });
    await grant.screenshot({ path: path.join(out, 'part-grant.png') });
    await grant.getByRole('button', { name: 'Decline' }).click();
    await net.waitForFunction(() => /SCAN_ERROR/.test(document.body.innerText), null, { timeout: 30000 });

    // A selection the person sends from the sample page, as Uplink queues it at their right-click.
    const sample = await plain.newPage();
    await sample.goto(SAMPLE, { waitUntil: 'networkidle' });
    await worker.evaluate(async (c) => {
      const { captures = [] } = await chrome.storage.local.get('captures');
      await chrome.storage.local.set({ captures: [...captures, c] });
    }, { id: 'shot-plain-1', kind: 'selection', at: new Date().toISOString(), page: { url: SAMPLE, title: 'Riverside Flood Watch: gauge bulletin' }, text: 'Two of the three community gauges now read above their warning marks.' });
    const cases = await plain.newPage();
    await cases.goto(`${base}/app/cases`, { waitUntil: 'domcontentloaded' });
    await cases.getByTestId('capture-row').first().waitFor({ timeout: 30000 });
    await cases.waitForTimeout(1500);

    const pop = await plain.newPage();
    await pop.setViewportSize({ width: 360, height: 380 });
    await pop.goto(`chrome-extension://${ext}/popup.html`);
    await pop.waitForTimeout(800);
    await pop.screenshot({ path: path.join(out, 'part-popup.png') });
    const options = await plain.newPage();
    await options.setViewportSize({ width: 820, height: H });
    await options.goto(`chrome-extension://${ext}/options.html`);
    await options.waitForTimeout(1000);
    await options.screenshot({ path: path.join(out, 'part-options.png') });
    await compose('5-asks-and-logs.png', `<img src="${png(path.join(out, 'part-options.png'))}" style="position:absolute;left:0;top:0;width:820px;height:800px">
      <img src="${png(path.join(out, 'part-grant.png'))}" style="position:absolute;left:820px;top:0;width:460px;height:380px;border-left:1px solid #2d3d47;border-bottom:1px solid #2d3d47">
      <img src="${png(path.join(out, 'part-popup.png'))}" style="position:absolute;left:870px;top:400px;width:360px;height:380px;border:1px solid #2d3d47">`);
    console.log('  shot 5-asks-and-logs.png');
    for (const part of ['part-grant.png', 'part-popup.png', 'part-options.png']) fs.rmSync(path.join(out, part));
  } finally {
    await plain.close();
  }
}

try {
  await ready(context);
  const worker = context.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://')) ?? await context.waitForEvent('serviceworker', { timeout: 10000 });
  const id = new URL(worker.url()).host;
  const errors = [];

  if (phase === 'seed') {
    const app = await context.newPage();
    app.on('pageerror', (e) => errors.push(String(e)));
    await app.goto(`${base}/app/cases`, { waitUntil: 'domcontentloaded' });
    await app.getByTestId('new-case').click();
    await app.getByLabel('Title').fill('Riverside flood response');
    await app.getByLabel('Description').fill('Gauge readings, closures and warnings around the old bridge, for the volunteer response.');
    await app.getByLabel(/^Public —/).check();
    await app.getByTestId('save-case').click();
    await app.getByText('Riverside flood response').first().waitFor({ timeout: 15000 });
    console.log('1 case made');

    // The side panel's page, with the case open for captures.
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 400, height: H });
    await panel.goto(`${base}/panel`, { waitUntil: 'domcontentloaded' });
    await panel.getByText('Uplink connected').waitFor({ timeout: 15000 });
    await panel.waitForFunction(() => document.querySelectorAll('#panel-case option').length > 1, null, { timeout: 15000 });
    const caseValue = await panel.locator('#panel-case option').nth(1).getAttribute('value');
    await panel.locator('#panel-case').selectOption(caseValue);

    // What the person sends while browsing the sample page, as Uplink queues it at their right-click.
    const sent = (n, kind, extra) => ({ id: `shot-${n}`, kind, at: new Date(Date.now() - (10 - n) * 60_000).toISOString(), page: { url: SAMPLE, title: 'Riverside Flood Watch: gauge bulletin' }, ...extra });
    const queue = async (captures) => worker.evaluate(async (cs) => {
      const { captures: waiting = [] } = await chrome.storage.local.get('captures');
      await chrome.storage.local.set({ captures: [...waiting, ...cs] });
    }, captures);
    await queue([
      sent(1, 'selection', { text: 'The river at the old bridge gauge rose from 1.2 m to 4.2 m between midnight and six this morning.' }),
      sent(2, 'selection', { text: 'Two of the three community gauges now read above their warning marks.' }),
    ]);
    await panel.getByTestId('panel-capture').nth(1).waitFor({ timeout: 30000 });
    console.log('2 two selections filed to the open case');

    // The evidence capture, through the popup's button, of the sample page as it is open.
    const sample = await context.newPage();
    await sample.setViewportSize({ width: W - 400, height: H });
    await sample.goto(SAMPLE, { waitUntil: 'networkidle' });
    await panel.locator('#panel-case').selectOption('');
    const popupOpened = context.waitForEvent('page');
    await worker.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url: 'http://localhost/flood-watch.html' });
      await chrome.tabs.create({ url, active: false, windowId: tab.windowId });
    }, `chrome-extension://${id}/popup.html`);
    const popup = await popupOpened;
    await popup.waitForLoadState();
    await popup.getByRole('button', { name: 'Capture this page as evidence' }).click();
    await popup.locator('p.muted').last().waitFor();
    await popup.waitForTimeout(1500);
    console.log('3 evidence:', (await popup.locator('main p').last().innerText()).trim());
    await popup.close();
    // And two more for the inbox, sent with no case open.
    await queue([
      sent(4, 'link', { link: 'https://example.org/flood-watch/method' }),
      sent(5, 'selection', { text: 'The footpath under the old bridge is closed.' }),
    ]);

    // 1: the side panel beside the page, filing into the open case.
    await panel.locator('#panel-case').selectOption(caseValue);
    await panel.waitForTimeout(800);
    await sample.bringToFront();
    await sample.screenshot({ path: path.join(out, 'part-sample.png') });
    await panel.screenshot({ path: path.join(out, 'part-panel.png') });
    await compose('1-side-panel.png', `<img src="${png(path.join(out, 'part-sample.png'))}" style="position:absolute;left:0;top:0;width:880px;height:800px">
      <img src="${png(path.join(out, 'part-panel.png'))}" style="position:absolute;left:880px;top:0;width:400px;height:800px;border-left:1px solid #2d3d47">`);
    console.log('  shot 1-side-panel.png');
    for (const part of ['part-sample.png', 'part-panel.png']) fs.rmSync(path.join(out, part));

    // 2: the Captures inbox in Starcom, waiting to be filed.
    await app.bringToFront();
    await app.goto(`${base}/app/cases`, { waitUntil: 'domcontentloaded' });
    await app.getByTestId('capture-row').nth(2).waitFor({ timeout: 60000 });
    await app.getByTestId('captures-inbox').scrollIntoViewIfNeeded();
    await app.waitForTimeout(1000);
    await shot(app, '2-captures-inbox.png');

    // 3: the evidence, as it stands now (pending); "evidence" retakes it once Bitcoin has confirmed it.
    await app.getByRole('button', { name: 'View' }).first().click();
    await app.getByTestId('evidence-viewer').waitFor();
    await evidenceInView(app);
    await shot(app, '3-evidence.png');
  }

  if (phase === 'rest') {
    // 3, framed on its hashes and timestamps, while it waits for Bitcoin.
    const cases = await context.newPage();
    cases.on('pageerror', (e) => errors.push(String(e)));
    await cases.goto(`${base}/app/cases`, { waitUntil: 'domcontentloaded' });
    await cases.getByTestId('capture-row').first().waitFor({ timeout: 60000 }).catch(async (e) => {
      await cases.screenshot({ path: path.join(out, 'debug-cases.png') });
      throw e;
    });
    await cases.getByRole('button', { name: 'View' }).first().click();
    await cases.getByTestId('evidence-viewer').waitFor();
    await evidenceInView(cases);
    await shot(cases, '3-evidence.png');

    // 4: NetRunner: the Wayback Machine's snapshots, two compared, read through Uplink. The Archive is
    // asked once; when it is busy the shot is left for a later run rather than asked again and again.
    try {
      const net = await context.newPage();
      net.on('pageerror', (e) => errors.push(String(e)));
      await net.goto(`${base}/app/netrunner`, { waitUntil: 'domcontentloaded' });
      await net.getByRole('tab', { name: /SCANNER/ }).click();
      await net.getByLabel('PAGE').fill('www.iana.org/domains/root/db');
      await net.waitForTimeout(1500);
      await net.getByRole('button', { name: /LIST SNAPSHOTS/ }).click();
      await net.waitForFunction(() => document.querySelectorAll('input[type=checkbox]').length > 1 || /Could not look/.test(document.body.innerText), null, { timeout: 90000 });
      const refused = await net.getByText(/^Could not look/).first().textContent().catch(() => null);
      if (refused) throw new Error(refused);
      const boxes = net.getByRole('checkbox');
      await boxes.first().check();
      await boxes.nth((await boxes.count()) - 1).check();
      await net.getByRole('button', { name: 'COMPARE TWO' }).click();
      await net.waitForFunction(() => /lines? removed|words are the same/.test(document.body.innerText), null, { timeout: 90000 });
      // The comparison's card, its changed lines whole, at the foot of the view, the snapshots above it.
      await net.evaluate(() => {
        const said = [...document.querySelectorAll('p')].find((p) => /lines? removed|words are the same/.test(p.textContent ?? ''));
        (said?.closest('.MuiCard-root') ?? said)?.scrollIntoView({ block: 'end' });
      });
      await net.waitForTimeout(800);
      await shot(net, '4-netrunner-wayback.png');
    } catch (e) {
      console.log('  4 not taken:', e.message.split('\n')[0]);
    }

    await shotUplinkPages();
  }

  if (phase === 'evidence') {
    const app = await context.newPage();
    app.on('pageerror', (e) => errors.push(String(e)));
    await app.goto(`${base}/app/cases`, { waitUntil: 'domcontentloaded' });
    await app.getByTestId('capture-row').first().waitFor({ timeout: 60000 });
    await app.getByRole('button', { name: 'View' }).first().click();
    await app.getByTestId('evidence-viewer').waitFor();
    if (await app.getByRole('button', { name: 'Complete in Bitcoin' }).count()) {
      await app.getByRole('button', { name: 'Complete in Bitcoin' }).click();
      await app.waitForFunction(() => document.querySelector('[data-testid=evidence-completion],[data-testid=evidence-anchored]'), null, { timeout: 60000 });
    }
    const said = await app.locator('[data-testid=evidence-completion],[data-testid=evidence-anchored]').first().innerText().catch(() => '');
    console.log('the evidence:', said.trim());
    if (/Proven in Bitcoin/.test(said)) {
      await evidenceInView(app);
      await shot(app, '3-evidence.png');
    } else console.log('  not proven yet: 3-evidence.png left as it was');
  }
  console.log('page errors:', errors.length ? errors.join(' | ') : 'none');
} finally {
  await context.close();
  server.close();
}

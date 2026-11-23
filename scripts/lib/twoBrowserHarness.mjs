/**
 * Two (or more) people using Starcom on their own machines, through one
 * stand-in relay that lives inside the script (plan items 2.7 and V1). No
 * message, key bundle or team event ever reaches a real relay.
 *
 * The relay speaks NIP-01, asks for sign-in on team relay addresses
 * (NIP-42), accepts an invite's claim and signs its member list (NIP-43), and
 * describes itself (NIP-11). Every event any profile sends is on `wire`, so a
 * check can say what crossed it.
 *
 * Used by check-chat.mjs and audit-intern.mjs.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { generateSecretKey, getPublicKey, finalizeEvent, verifyEvent } = require('nostr-tools');

export async function openHarness(BASE_URL) {
  /** The team relay's own key, as its NIP-11 document states it: what signs its member list (NIP-43). */
  const TEAM_RELAY_SECRET = generateSecretKey();
  const TEAM_RELAY_KEY = getPublicKey(TEAM_RELAY_SECRET);
  /** The invite code the team relay accepts. */
  const TEAM_CLAIM = 'c-check-chat';
  const teamMembers = new Set();
  /**
   * Profiles that made a team: the relay was set up for them, so whoever signs
   * in from their browser once they press "Create team" is its owner, and a
   * member, as a zooid config's owner is. Not before: the check the app runs
   * first signs in with throwaway keys, which must stay outsiders.
   */
  const owners = new Set();
  const isTeamRelay = (url) => /^wss:\/\/relay\.[a-z-]+\.example/.test(url);
  const signedIn = new Map();

  // ── the stand-in relay (NIP-01: EVENT, REQ, CLOSE) ───────────────────────────
  const events = [];
  const wire = [];
  /** While set, every relay refuses every event with this reason, as a relay that will not take a key does (S22). */
  let refusing = null;
  const subscriptions = new Map();
  const tagValues = (ev, name) => ev.tags.filter((t) => t[0] === name).map((t) => t[1]);
  function matches(ev, f) {
    if (f.ids && !f.ids.includes(ev.id)) return false;
    if (f.kinds && !f.kinds.includes(ev.kind)) return false;
    if (f.authors && !f.authors.includes(ev.pubkey)) return false;
    if (f.since && ev.created_at < f.since) return false;
    if (f.until && ev.created_at > f.until) return false;
    for (const key of Object.keys(f)) {
      if (!key.startsWith('#')) continue;
      const values = tagValues(ev, key.slice(1));
      if (!f[key].some((v) => values.includes(v))) return false;
    }
    return true;
  }
  function relay(profile, url, socket, raw) {
    let message;
    try { message = JSON.parse(String(raw)); } catch { return; }
    const [type, ...rest] = message;
    const send = (payload) => { try { socket.send(JSON.stringify(payload)); } catch { /* socket closed */ } };
    if (type === 'AUTH') {
      // A team relay asks who is reading and writing (NIP-42).
      const ev = rest[0];
      const ok = verifyEvent(ev) && ev.kind === 22242 && ev.tags.some((t) => t[0] === 'challenge' && t[1] === signedIn.get(socket)?.challenge);
      if (ok) signedIn.set(socket, { ...signedIn.get(socket), reader: ev.pubkey });
      if (ok && owners.has(profile)) teamMembers.add(ev.pubkey);
      send(['OK', ev.id, ok, ok ? '' : 'invalid: bad sign-in']);
      return;
    }
    if (type === 'EVENT' && rest[0]?.kind === 28934) {
      // A join request with the invite's claim (NIP-43), from its signed-in author.
      const ev = rest[0];
      wire.push({ profile, id: ev.id, kind: ev.kind, pubkey: ev.pubkey, tags: ev.tags, content: String(ev.content) });
      const claim = ev.tags.find((t) => t[0] === 'claim')?.[1];
      const ok = verifyEvent(ev) && claim === TEAM_CLAIM && signedIn.get(socket)?.reader === ev.pubkey;
      if (ok) teamMembers.add(ev.pubkey);
      send(['OK', ev.id, ok, ok ? `info: welcome to ${url}!` : 'restricted: that is an invalid invite code.']);
      return;
    }
    // A team relay is members-only, as zooid is (plan item 2.3a): nothing is
    // read to or taken from someone not signed in, or signed in as an outsider.
    if (isTeamRelay(url) && (type === 'EVENT' || type === 'REQ')) {
      const reader = signedIn.get(socket)?.reader;
      const refusal = !reader ? 'auth-required: sign in first' : !teamMembers.has(reader) ? 'restricted: you are not a member of this relay' : null;
      if (refusal) {
        if (type === 'EVENT') wire.push({ profile, id: rest[0].id, kind: rest[0].kind, pubkey: rest[0].pubkey, tags: rest[0].tags, content: String(rest[0].content), refused: refusal });
        send(type === 'EVENT' ? ['OK', rest[0].id, false, refusal] : ['CLOSED', rest[0], refusal]);
        return;
      }
    }
    if (type === 'EVENT' && refusing) {
      const ev = rest[0];
      wire.push({ profile, id: ev.id, kind: ev.kind, pubkey: ev.pubkey, tags: ev.tags, content: String(ev.content), refused: refusing });
      send(['OK', ev.id, false, refusing]);
      return;
    }
    if (type === 'EVENT') {
      const ev = rest[0];
      wire.push({ profile, id: ev.id, kind: ev.kind, pubkey: ev.pubkey, tags: ev.tags, content: String(ev.content) });
      if (!events.some((e) => e.id === ev.id)) events.push(ev);
      send(['OK', ev.id, true, '']);
      for (const s of subscriptions.values()) {
        if (s.filters.some((f) => matches(ev, f))) { try { s.socket.send(JSON.stringify(['EVENT', s.id, ev])); } catch { /* closed */ } }
      }
    } else if (type === 'REQ') {
      const [id, ...filters] = rest;
      subscriptions.set(`${profile}|${url}|${id}`, { socket, id, filters });
      for (const ev of events.filter((e) => filters.some((f) => matches(e, f)))) send(['EVENT', id, ev]);
      if (filters.some((f) => (f.kinds ?? []).includes(13534))) {
        // The team relay's member list, signed with its own key (NIP-43).
        send(['EVENT', id, finalizeEvent({ kind: 13534, created_at: Math.floor(Date.now() / 1000), content: '', tags: [['-'], ...[...teamMembers].map((m) => ['member', m])] }, TEAM_RELAY_SECRET)]);
      }
      send(['EOSE', id]);
    } else if (type === 'CLOSE') {
      subscriptions.delete(`${profile}|${url}|${rest[0]}`);
    }
  }

  // ── the browser side ─────────────────────────────────────────────────────────
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
      // Every host but the app itself is unreachable; relay sockets are answered above.
      '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost'],
  });
  /**
   * A person on their own machine. Each has said how old they are, as an adult (RS37): Starcom asks before it makes
   * a first key (RS39), and a walk that never answered stopped at the question. `{ age: false }` leaves it unasked.
   */
  async function profile(name, { age = '18_plus' } = {}) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    if (age) {
      await context.addInitScript((bracket) => {
        try {
          if (!localStorage.getItem('starcom.age.v1')) {
            localStorage.setItem('starcom.age.v1', JSON.stringify({ bracket, method: 'self_declared', at: new Date().toISOString() }));
          }
        } catch { /* storage refused: the question is asked */ }
      }, age);
    }
    await context.routeWebSocket(/.*/, (socket) => {
      const url = socket.url();
      if (isTeamRelay(url)) {
        const challenge = `challenge-${Math.random().toString(36).slice(2)}`;
        signedIn.set(socket, { challenge });
        socket.send(JSON.stringify(['AUTH', challenge]));
      }
      socket.onMessage((m) => relay(name, url, socket, m));
    });
    // A team is made with its relay, whose description (NIP-11) is read first (plan item 2.3).
    await context.route((u) => /^relay\.[a-z-]+\.example$/.test(u.hostname), (route) => route.fulfill({
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/nostr+json' },
      body: JSON.stringify({ name: 'Team relay', supported_nips: [1, 11, 42, 43], self: TEAM_RELAY_KEY }),
    }));
    const page = await context.newPage();
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    return { name, page };
  }
  /** Click the first visible control whose name matches, without Playwright's post-click waits. */
  async function press(page, pattern) {
    const found = await page.evaluate((source) => {
      const re = new RegExp(source, 'i');
      const el = [...document.querySelectorAll('button,[role="button"],[role="tab"],a')].find((x) => {
        const r = x.getBoundingClientRect();
        return r.width > 1 && r.height > 1 && re.test((x.getAttribute('aria-label') || x.innerText || '').replace(/\s+/g, ' ').trim());
      });
      if (!el) return false;
      setTimeout(() => el.click(), 0);
      return true;
    }, pattern.source);
    await page.waitForTimeout(900);
    return found;
  }
  async function dismissNotices(p) {
    for (const dismiss of ['Got it', 'Not now']) {
      const button = p.page.getByRole('button', { name: dismiss });
      if (await button.count()) await button.first().click();
    }
  }
  async function createTeam(p, team) {
    await p.page.goto(`${BASE_URL}/app/teamworkspace?tab=overview`, { waitUntil: 'domcontentloaded' });
    await p.page.waitForTimeout(6000);
    // A team is made with its relay (plan item 2.3).
    await press(p.page, /^Create a team$/);
    const form = p.page.getByRole('dialog');
    await form.getByLabel(/^Team name/).fill(team);
    await form.getByLabel(/^Relay address/).fill(`wss://relay.${team.toLowerCase().replace(/[^a-z]+/g, '-')}.example`);
    owners.delete(p.name);
    await form.getByRole('button', { name: 'Check the relay' }).click();
    // The relay is checked before a team is made with it (plan item 2.3a).
    await form.getByTestId('relay-checks').waitFor({ timeout: 30000 });
    owners.add(p.name);
    await form.getByRole('button', { name: 'Create team' }).click();
    const created = Date.now();
    await p.page.waitForTimeout(2500);
    await dismissNotices(p);
    await p.page.keyboard.press('Escape');
    await p.page.waitForTimeout(600);
    return created;
  }
  /** An invite link to the team's relay, carrying the claim the relay accepts. */
  async function inviteLink(p) {
    await press(p.page, /^Admin$/);
    await press(p.page, /invite new member/);
    const dialog = p.page.getByRole('dialog');
    await dialog.getByLabel(/^Claim/).fill(TEAM_CLAIM);
    await dialog.getByRole('button', { name: 'Make invite link' }).click();
    const link = await dialog.getByLabel(/^Invite link/).inputValue({ timeout: 8000 });
    await dialog.getByRole('button', { name: 'Close' }).click();
    return link;
  }
  async function joinByInvite(p, link) {
    await p.page.goto(link.replace('https://starcom.app', BASE_URL), { waitUntil: 'domcontentloaded' });
    const page = p.page.getByTestId('join-team');
    await page.waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: /^Join / }).click();
    const joined = await p.page.getByTestId('join-result').waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    await dismissNotices(p);
    return joined;
  }
  async function openTeamChat(p) {
    await p.page.goto(`${BASE_URL}/app/teamworkspace`, { waitUntil: 'domcontentloaded' });
    await p.page.waitForTimeout(5000);
    await dismissNotices(p);
    await press(p.page, /^Chat$/);
    await p.page.waitForTimeout(2500);
  }
  async function speakToTeam(p, text) {
    await openTeamChat(p);
    await p.page.getByPlaceholder('Message the team…').fill(text);
    await press(p.page, /^Send$/);
    await p.page.waitForTimeout(4000);
  }
  async function openDirectMessage(p, pubkey, displayName) {
    await press(p.page, /chat/);
    await p.page.waitForTimeout(1500);
    await press(p.page, /add contact/);
    await p.page.getByPlaceholder('Public key (npub or hex)').fill(pubkey);
    await p.page.getByPlaceholder('Display name').fill(displayName);
    await press(p.page, /^Verify & Add$/);
    await p.page.waitForTimeout(2500);
    const clicked = await p.page.evaluate((label) => {
      const item = [...document.querySelectorAll('div')].find((d) => typeof d.onclick === 'function'
        && String(d.className).includes('contactItem') && (d.textContent || '').includes(label));
      if (!item) return false;
      item.click();
      return true;
    }, displayName);
    // The window opens a moment after the contact is chosen: wait for its box.
    if (clicked) await p.page.getByPlaceholder('Type a message...').first().waitFor({ timeout: 10000 }).catch(() => {});
    return clicked;
  }
  async function sendDirect(p, text) {
    const box = p.page.getByPlaceholder('Type a message...');
    if (!(await box.count())) return false;
    await box.fill(text);
    await p.page.keyboard.press('Enter');
    await p.page.waitForTimeout(5000);
    return true;
  }
  const onScreen = (p, text) => p.page.evaluate((t) => document.body.innerText.includes(t), text);
  const inClear = (text) => wire.some((w) => w.content.includes(text) || w.tags.some((t) => t.some((v) => String(v).includes(text))));
  const bundleKey = (name) => wire.find((w) => w.profile === name && w.kind === 30078)?.pubkey;

  return {
    browser, wire, events, teamMembers, TEAM_CLAIM, TEAM_RELAY_KEY,
    /** Every relay refuses every event with `reason`, or takes them again with null. */
    refuseEvents: (reason) => { refusing = reason; },
    profile, press, dismissNotices, createTeam, inviteLink, joinByInvite, openTeamChat, speakToTeam,
    openDirectMessage, sendDirect, onScreen, inClear, bundleKey,
    close: () => browser.close(),
  };
}

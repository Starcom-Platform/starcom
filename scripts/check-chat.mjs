#!/usr/bin/env node
/**
 * Chat, checked the way two people would use it: two browser profiles, one
 * relay — and the relay is an in-memory stand-in inside this script, so no
 * message, key bundle or team event ever reaches a real relay.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * On 2026-09-26 an audit that only READ the chat code concluded that contacts
 * could not be added and direct messages could not be opened. Both were wrong.
 * Running two profiles through a relay showed what is actually true: the
 * post-quantum core runs (every profile publishes an ML-KEM-768 prekey
 * bundle), but a direct message is addressed to `dm-<key>`, so the recipient's
 * bundle is never found and the message goes out in plain text; nothing
 * listens for direct messages; and team channels have no group encryption.
 * See docs/missions/00-current-state/chat.md.
 *
 * This is the test that plan items 0.2 (chat says what it is; the team
 * broadcast stops) and 2.7 (chat repaired) are written against. It states what
 * chat must do, and was written while most of it failed; run it to learn what
 * holds now, since a count written here would go stale.
 *
 * B joins A's team by invite, as a person on their own machine does (plan
 * item 2.3), so the stand-in relay asks for sign-in on team relay addresses
 * (NIP-42), accepts the invite's claim and signs its member list (NIP-43).
 * C makes a team of their own and must see nothing of A's or B's.
 *
 * ─── THE TWO FAILURE PATHS ──────────────────────────────────────────────────
 *
 *   HARNESS CANNOT OBSERVE -> exit 2. The stand-in relay saw nothing, so this
 *                              says nothing about chat.
 *   CHAT FAILED            -> exit 1. At least one expectation did not hold.
 *
 * Usage:
 *   npm run build && npx vite preview --port 5210 --strictPort &
 *   node scripts/check-chat.mjs http://localhost:5210
 *   node scripts/check-chat.mjs http://localhost:5210 --team-broadcast   (adds a 130 s wait)
 */
import { openHarness } from './lib/twoBrowserHarness.mjs';


const BASE_URL = process.argv[2] || 'http://localhost:5210';
const CHECK_TEAM_BROADCAST = process.argv.includes('--team-broadcast');
const TEAM_TEXT = 'Two of the five sites look closed. Checking by phone at 10.';
const DM_TEXT = 'check-chat direct message from A';
const REPLY_TEXT = 'check-chat reply from B';

const {
  wire, press, dismissNotices, createTeam, inviteLink, joinByInvite, openTeamChat, speakToTeam,
  openDirectMessage, sendDirect, onScreen, inClear, bundleKey, profile, close,
} = await openHarness(BASE_URL);

const results = [];
const expect = (claim, holds, detail = '') => results.push({ claim, holds: Boolean(holds), detail });

try {
  const A = await profile('A');
  const B = await profile('B');
  const C = await profile('C');
  // A makes the team and invites B, who joins on their own machine. C makes a
  // team of their own, and is in no conversation here.
  const teamCreatedAt = await createTeam(A, 'A cell');
  const link = await inviteLink(A);
  const bJoined = await joinByInvite(B, link);
  await createTeam(C, 'C cell');
  await B.page.waitForTimeout(3000);
  await speakToTeam(A, TEAM_TEXT);

  if (!wire.some((w) => w.profile === 'A') || !wire.some((w) => w.profile === 'B')) {
    console.error('\n  HARNESS CANNOT OBSERVE: the stand-in relay received nothing from one or both profiles.');
    console.error('  This says nothing about chat. Is the app served at ' + BASE_URL + '?\n');
    process.exit(2);
  }

  const aKey = bundleKey('A');
  const bKey = bundleKey('B');
  expect('Each profile publishes an ML-KEM-768 prekey bundle',
    aKey && bKey && wire.filter((w) => w.kind === 30078).every((w) => w.tags.some((t) => t[0] === 'algorithm' && t[1] === 'ML-KEM-768')));
  expect('A team message never crosses the wire in plain text', !inClear(TEAM_TEXT),
    inClear(TEAM_TEXT) ? 'the text was readable in an event on the wire' : '');
  await openTeamChat(B);
  expect('B, who joined A\'s team by invite, reads A\'s team message', bJoined && await onScreen(B, TEAM_TEXT),
    !bJoined ? 'B could not join by the invite' : '');

  const aOpened = aKey && bKey ? await openDirectMessage(A, bKey, 'Marcus') : false;
  const bOpened = aKey && bKey ? await openDirectMessage(B, aKey, 'Priya') : false;
  expect('A contact can be added and a direct message opened, on both sides', aOpened && bOpened);

  await sendDirect(A, DM_TEXT);
  await B.page.waitForTimeout(3000);
  // The sender's own bubble, and any post-quantum claim anywhere on the page.
  const mark = await A.page.evaluate((text) => {
    const bubble = [...document.querySelectorAll('div')].reverse()
      .find((d) => String(d.className).includes('messageContent') && d.innerText.includes(text));
    return {
      found: Boolean(bubble),
      lock: Boolean(bubble?.innerText.includes('🔒')),
      plain: Boolean(bubble?.innerText.includes('Not encrypted')),
      claims: document.body.innerText.match(/PQC Encrypted|PQC-NIST-\d|CRYSTALS-Kyber-\d+/g) ?? [],
    };
  }, DM_TEXT);
  const wentPlain = inClear(DM_TEXT);
  expect('A direct message never crosses the wire in plain text', !wentPlain,
    wentPlain ? 'the text was readable in an event on the wire' : '');
  expect('B receives A\'s direct message', await onScreen(B, DM_TEXT));
  expect('The sender\'s screen marks the direct message for what crossed the wire',
    mark.found && mark.claims.length === 0 && (wentPlain ? mark.plain && !mark.lock : mark.lock && !mark.plain),
    !mark.found ? 'the message is not on the sender\'s screen'
      : mark.claims.length ? `claims shown: ${[...new Set(mark.claims)].join(', ')}`
        : wentPlain && mark.lock ? 'a lock beside plain text'
          : wentPlain && !mark.plain ? 'no "Not encrypted" note beside plain text' : '');

  await sendDirect(B, REPLY_TEXT);
  await A.page.waitForTimeout(3000);
  expect('A receives B\'s reply', await onScreen(A, REPLY_TEXT));

  // C listens with a key of their own, on no team of A's and in no conversation.
  await openTeamChat(C);
  await C.page.waitForTimeout(2000);
  expect('C, on another team, sees neither the team message nor the direct messages',
    !(await onScreen(C, TEAM_TEXT)) && !(await onScreen(C, DM_TEXT)) && !(await onScreen(C, REPLY_TEXT)));

  if (CHECK_TEAM_BROADCAST) {
    const waitMs = Math.max(0, teamCreatedAt + 130_000 - Date.now());
    await A.page.waitForTimeout(waitMs);
    const broadcasts = wire.filter((w) => w.profile === 'A' && w.kind === 30090);
    expect('A team\'s details are not published by themselves (no kind 30090 within 130 s)', broadcasts.length === 0,
      broadcasts.length ? `${broadcasts.length} team-state event(s), naming the team` : '');
  }
} finally {
  await close();
}

console.log('');
for (const r of results) console.log(`  ${r.holds ? 'PASS' : 'FAIL'}  ${r.claim}${r.detail ? `  — ${r.detail}` : ''}`);
const failed = results.filter((r) => !r.holds).length;
console.log(`\n  ${results.length - failed} of ${results.length} hold.${failed ? ' See plan items 0.2 and 2.7 in docs/missions/04-plan/intern-readiness-plan.md.' : ''}\n`);
process.exit(failed ? 1 : 0);

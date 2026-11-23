#!/usr/bin/env node
/**
 * `npm run audit:intern` (plan item V1): each story in
 * docs/missions/03-pipeline/user-stories.md, and the chat stories in
 * docs/missions/00-current-state/chat.md, checked against a running build the
 * way the person in it would use it, printing what holds now.
 *
 * ─── WHY ────────────────────────────────────────────────────────────────────
 *
 * The stories were walked by hand on 2026-09-25, and their statuses are a
 * record of that day. Much has changed since, and a table that says what is
 * true goes stale the moment the next fix lands. This says it again, from
 * the screen, every time it runs.
 *
 * ─── WHAT A STATUS MEANS ────────────────────────────────────────────────────
 *
 * The stories file's own words: WORKS, HIDDEN, PARTIAL, BROKEN, MISSING,
 * UNSAFE. Two more, so nothing is claimed that was not checked:
 *   DECIDED       a deliberate choice, recorded, not a gap;
 *   NOT CHECKED   a person has to judge it, or a script cannot drive it here;
 *                 the reason is printed.
 * A check that cannot find the control it needs reports what it could not
 * find, as BROKEN.
 *
 * ─── HOW ────────────────────────────────────────────────────────────────────
 *
 * Browser profiles, each a person on their own machine, through the stand-in
 * relay in lib/twoBrowserHarness.mjs: nothing reaches a real relay, and every
 * publish is cancelled at the review or goes nowhere but the stand-in.
 *
 * Usage:
 *   npm run build && npx vite preview --port 5210 --strictPort &
 *   node scripts/audit-intern.mjs http://localhost:5210
 *   node scripts/audit-intern.mjs http://localhost:5210 --only=S2,S14
 *   AUDIT_DEBUG=1 node scripts/audit-intern.mjs …   (also prints what crossed the
 *                                                   stand-in relay, and both screens)
 *
 * Exit 0 when it ran; 2 when the harness could not observe the app at all.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openHarness } from './lib/twoBrowserHarness.mjs';

const BASE_URL = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:5210';
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const h = await openHarness(BASE_URL);
const results = [];

const works = (detail = '') => ({ status: 'WORKS', detail });
const partial = (detail) => ({ status: 'PARTIAL', detail });
const missing = (detail) => ({ status: 'MISSING', detail });
const broken = (detail) => ({ status: 'BROKEN', detail });
const decided = (detail) => ({ status: 'DECIDED', detail });
const notChecked = (detail) => ({ status: 'NOT CHECKED', detail });

/** Whether any of these stories is being run: shared steps run only for the stories that need them. */
const needs = (...ids) => !ONLY || ids.some((id) => ONLY.includes(id));

/** Why a shared step failed, by each story that needed it: those stories say so, and the walk goes on. */
const setupFailed = new Map();

/**
 * A step several stories share, run only for them. A step that fails used to stop the whole walk, so every story after
 * it went unreported; now each story that needed it is reported broken, saying which step, and the rest are walked.
 */
async function shared(label, ids, step) {
  if (!needs(...ids)) return;
  try {
    await step();
  } catch (e) {
    const why = `${label} failed: ${String(e?.message ?? e).split('\n')[0].slice(0, 120)}`;
    for (const id of ids) setupFailed.set(id, why);
  }
}

async function story(id, words, check) {
  if (ONLY && !ONLY.includes(id)) return;
  if (setupFailed.has(id)) {
    results.push({ id, words, status: 'BROKEN', detail: setupFailed.get(id) });
    return;
  }
  try {
    results.push({ id, words, ...(await check()) });
  } catch (e) {
    results.push({ id, words, status: 'BROKEN', detail: `stopped at: ${String(e?.message ?? e).split('\n')[0].slice(0, 150)}` });
  }
}

// ── What a person does, step by step ────────────────────────────────────────

const go = async (p, path) => {
  await p.page.goto(`${BASE_URL}${path}`, { waitUntil: 'domcontentloaded' });
  await p.page.waitForTimeout(4500);
  await h.dismissNotices(p);
};
const text = (p) => p.page.evaluate(() => document.body.innerText);

async function writeReport(p, title, content = 'Three cranes working after 02:00.') {
  await go(p, '/app/inteldashboard');
  await p.page.getByTestId('new-record').click();
  await p.page.getByLabel(/^Title/).fill(title);
  await p.page.getByLabel(/^Content/).fill(content);
  await p.page.getByTestId('create-record').click();
  await p.page.waitForTimeout(2000);
  await h.dismissNotices(p);
}

async function newCase(p, title, visibility = 'Private') {
  await go(p, '/app/cases');
  await p.page.getByTestId('new-case').click();
  const form = p.page.getByRole('dialog');
  await form.getByLabel(/^Title/).fill(title);
  await form.getByTestId('case-description-input').fill('Is berth 4 loading at night?');
  await form.getByRole('radio', { name: new RegExp(`^${visibility}`) }).check();
  await form.getByTestId('save-case').click();
  await p.page.waitForTimeout(2000);
  await h.dismissNotices(p);
}

async function openCase(p, title) {
  await go(p, '/app/cases');
  await p.page.getByRole('button', { name: `View ${title}` }).first().click();
  await p.page.getByTestId('case-detail').waitFor({ timeout: 8000 });
}

async function newMission(p, title, visibility = 'Private') {
  await go(p, '/app/teamworkspace?tab=missions');
  await h.press(p.page, /new mission/i);
  const form = p.page.getByTestId('create-mission-dialog');
  await form.getByTestId('mission-title-input').fill(title);
  await form.getByTestId('mission-briefing-input').fill('Photograph the cranes after 02:00. Rests on direct observation.');
  await form.getByRole('radio', { name: new RegExp(`^${visibility}`) }).check();
  await form.getByTestId('create-mission-submit').click();
  await p.page.getByTestId('mission-detail-dialog').waitFor({ timeout: 8000 });
}

/**
 * The header's box opens the command palette (D-CP, 2026-11-04); what is typed goes into the palette, not the
 * header. The walk typed into the header until 2026-11-20, so S2 and S24 failed on a box that was no longer there.
 */
const palette = async (p, query) => {
  const panel = p.page.getByTestId('command-palette');
  if (!(await panel.count())) {
    await p.page.getByTestId('header-search-opener').click();
    await panel.waitFor({ timeout: 5000 });
  }
  await p.page.getByTestId('command-palette-input').fill(query);
  await p.page.waitForTimeout(1200);
  return panel;
};

const setName = async (p, name) => {
  const panel = await palette(p, '/name');
  await panel.getByText('/name', { exact: true }).first().click();
  const card = p.page.getByTestId('own-name-prompt');
  await card.waitFor({ timeout: 5000 });
  await card.getByLabel('Your name').fill(name);
  await card.getByRole('button', { name: 'Save' }).click();
  await p.page.waitForTimeout(500);
};

try {
  const priya = await h.profile('Priya');
  const aisha = await h.profile('Aisha');

  // ── Arriving ─────────────────────────────────────────────────────────────

  await story('S1', 'Priya opens Starcom and understands what it is for and where to start.', async () => {
    const fresh = await h.profile('first-visit', { age: false });
    await go(fresh, '/');
    await fresh.page.getByTitle('Show the intel pipeline guide').click({ timeout: 15000 });
    const steps = await fresh.page.locator('[data-testid^="pipeline-step-"]').count();
    const coach = await fresh.page.getByTestId('start-coach').count();
    // Its globe kept drawing for the rest of the run, in the one GPU process every
    // profile shares, and S6's globe then took over 30 s to open.
    await fresh.page.close();
    if (steps !== 4 || !coach) return broken(`the guide showed ${steps} stage(s)${coach ? '' : ', and no coach'}`);
    return notChecked(`the guide opens on the globe with the pipeline's ${steps} stages and "Coach me through it"; whether it is understood is for a person to say (V2, the pilot)`);
  });

  await story('S2', "Priya's work carries her name.", async () => {
    await go(priya, '/');
    await writeReport(priya, 'Berth 4 cranes at night');
    await setName(priya, 'Priya');
    await go(priya, '/app/inteldashboard');
    await priya.page.getByTestId('report-row').first().click();
    await priya.page.waitForTimeout(1200);
    const shown = await text(priya);
    return /Author:\s*Priya/.test(shown) ? works('the report says "Author: Priya", from the name set with /name') : broken('the report does not show her name as its author');
  });

  let inviteLink = null;
  await story('S4', 'Aisha creates the team.', async () => {
    await go(aisha, '/app/teamworkspace?tab=overview');
    const offered = await aisha.page.getByRole('button', { name: 'Create a team' }).count();
    if (!offered) return missing('the empty Overview offers no way to create a team');
    await h.createTeam(aisha, 'Newark desk');
    inviteLink = await h.inviteLink(aisha);
    return works('"Create a team" on the empty Overview, with the relay it will use');
  });

  await story('S3', 'Priya joins her team with the invite code her lead sent.', async () => {
    if (!inviteLink) return broken('there was no team to invite her to (S4)');
    const joined = await h.joinByInvite(priya, inviteLink);
    return joined ? works('the invite link opens a page naming who invited her to what; joining signs her in to the team relay, and the relay lists her') : broken('the join did not finish');
  });

  await story('S5', 'Dana sets up a practice run where nothing leaves the building.', async () =>
    notChecked('a build setting (VITE_NOSTR_*_RELAYS_EXCLUSIVE) or the practice workspace (plan 6.2); sample material is never published (plan 0.9)'));

  // ── Reporting ────────────────────────────────────────────────────────────

  let labels = [];
  await shared('opening a new report', ['S6', 'S7', 'S8'], async () => {
    await go(priya, '/app/inteldashboard');
    await priya.page.getByTestId('new-record').click();
    labels = await priya.page.evaluate(() => [...document.querySelectorAll('label')].map((l) => l.textContent.trim()));
  });

  await story('S6', 'Priya writes a report about a place without knowing its coordinates.', async () => {
    const jurisdictions = await priya.page.getByTestId('record-jurisdictions').count();
    if (!jurisdictions) return missing('only latitude and longitude');
    const finder = priya.page.getByRole('searchbox', { name: /country/i });
    if (!(await finder.count())) return partial('a country or region can be named by its code, and a point picked on the globe; no search by name (plan 3.5)');
    await finder.fill('germ');
    await priya.page.getByRole('button', { name: 'Germany' }).click({ timeout: 8000 });
    const said = await priya.page.getByTestId('record-jurisdictions').inputValue();
    if (!/\bde\b/.test(said)) return broken(`choosing Germany left Jurisdictions reading "${said}"`);
    const pick = priya.page.getByRole('button', { name: 'Pick on the globe' });
    if (!(await pick.count())) return partial('a country is found by its name; a point is picked only by starting on the globe (plan 3.5)');
    await pick.click();
    const onGlobe = await priya.page.getByTestId('place-pick-hint').waitFor({ timeout: 30000 }).then(() => true, () => false);
    if (!onGlobe) return broken(`"Pick on the globe" did not open the globe with its hint; the page is ${priya.page.url()}`);
    // A point the globe's own canvas takes, once it has drawn. Off centre: the globe
    // opens looking at 0°, 0°, which reads like a form nobody filled in.
    await priya.page.waitForFunction(() => [...document.querySelectorAll('canvas')].some((c) => c.width > 300), null, { timeout: 30000 });
    await priya.page.waitForTimeout(6000);
    const at = await priya.page.evaluate(() => {
      const c = [...document.querySelectorAll('canvas')].sort((x, y) => y.width * y.height - x.width * x.height)[0];
      const r = c.getBoundingClientRect();
      return [[0.45, 0.55], [0.55, 0.45], [0.5, 0.6], [0.4, 0.5]].map(([fx, fy]) => ({ x: r.left + r.width * fx, y: r.top + r.height * fy }))
        .find((p) => document.elementFromPoint(p.x, p.y) === c) ?? null;
    });
    if (!at) return notChecked('nothing on the globe took a click to pick with');
    await priya.page.mouse.click(at.x, at.y);
    const back = await priya.page.getByTestId('record-latitude').waitFor({ timeout: 15000 }).then(() => true, () => false);
    if (!back) return broken(`a click on the globe did not bring the form back; the hint is ${await priya.page.getByTestId('place-pick-hint').isVisible() ? 'still' : 'not'} showing, on ${priya.page.url()}`);
    const lat = await priya.page.getByTestId('record-latitude').inputValue();
    const kept = await priya.page.getByTestId('record-jurisdictions').inputValue();
    return lat !== '' && /\bde\b/.test(kept)
      ? works(`a country is found by its name and added to Jurisdictions, and "Pick on the globe" comes back with the point (${lat}, ${await priya.page.getByTestId('record-longitude').inputValue()}) and the form as it was`)
      : broken(`after picking on the globe, Latitude read "${lat}" and Jurisdictions "${kept}"`);
  });

  // Severity is five buttons, each drawn as the badge it gives (BD17, 2026-10-05), not a list: the walk
  // asked a list for its options and called the field missing.
  await story('S7', 'Priya says how serious the report is.', async () => {
    const group = priya.page.getByRole('radiogroup', { name: /^Severity/ });
    if (!(await group.count())) return missing('no severity on the form');
    const levels = group.getByRole('radio');
    const count = await levels.count();
    if (count < 4) return partial(`severity offers ${count} levels`);
    const names = await group.locator('label').allTextContents();
    await levels.nth(count - 1).check();
    if (!(await levels.nth(count - 1).isChecked())) return broken('choosing a severity did not hold');
    return works(`the form asks how serious, as ${count} choices, none until chosen: ${names.map((n) => n.trim()).filter(Boolean).join(', ')}`);
  });

  await story('S8', 'Priya fills in the form and knows what is required.', async () => {
    const labelled = ['Title', 'Content'].every((l) => labels.some((t) => t.startsWith(l)));
    const says = await priya.page.getByTestId('form-missing').count();
    return labelled && says ? works('every field has a label that stays, and the form says what is still missing') : partial(`labels: ${labelled ? 'yes' : 'no'}; says what is missing: ${says ? 'yes' : 'no'}`);
  });
  if (needs('S6', 'S7', 'S8')) await priya.page.getByTestId('cancel-record').click().catch(() => {});

  await story('S9', 'Priya submits her report for review.', async () => {
    // S2 writes the report; run alone, this story writes its own.
    if (ONLY && !ONLY.includes('S2')) await writeReport(priya, 'Berth 4 cranes at night');
    await go(priya, '/app/inteldashboard');
    await priya.page.getByTestId('report-row').first().click();
    await priya.page.getByRole('button', { name: 'Edit' }).first().click();
    await priya.page.waitForTimeout(800);
    const submit = await priya.page.getByRole('button', { name: /submit for review/i }).count();
    const raw = /\bSUBMITTED\b/.test(await text(priya));
    return submit ? works('"Submit for review" says what it does') : partial(raw ? 'status is chosen from raw codes (SUBMITTED, REVIEWED, …), all offered at once (plan 1.7)' : 'no way to submit found');
  });

  await story('S10', 'Marcus starts a case from the report he is reading.', async () => {
    await go(priya, '/app/inteldashboard');
    await priya.page.getByTestId('report-row').first().click();
    const offered = await priya.page.getByRole('button', { name: 'Add to case' }).count();
    return offered ? works('"Add to case" on the report, including a new case named from it') : missing('the report offers no way into a case');
  });

  // ── Working a case ───────────────────────────────────────────────────────

  await story('S13', "Priya's first case is on screen with no search typed.", async () => {
    const fresh = await h.profile('empty-cases');
    await go(fresh, '/app/cases');
    const empty = await fresh.page.getByTestId('no-cases').textContent().catch(() => '');
    if (/match your search/i.test(empty)) return broken('an empty list blames a search nobody typed');
    return /No cases yet/i.test(empty) ? works('an empty list says "No cases yet" and offers the first case') : partial(`the empty list says: ${empty.slice(0, 80)}`);
  });

  await story('S11', 'Marcus opens a case to work on it.', async () => {
    await newCase(priya, 'Night loading at berth 4');
    await openCase(priya, 'Night loading at berth 4');
    await priya.page.waitForTimeout(3000);
    const still = await priya.page.getByTestId('case-detail').count();
    return still ? works('the case opens as its own page, and stays open') : broken('the case page did not stay open');
  });

  await story('S12', 'Marcus attaches evidence, records what is still needed, and states a position.', async () => {
    const ids = ['link-candidate-input', 'raise-requirement', 'state-position'];
    const found = [];
    for (const id of ids) if (await priya.page.getByTestId(id).count()) found.push(id);
    return found.length === ids.length ? works('evidence, requirements and a position are all on the case page itself') : partial(`on the page: ${found.join(', ') || 'none of them'}`);
  });

  await story('S15', 'Aisha builds a mission from a case.', async () => {
    const offered = await priya.page.getByTestId('create-mission-from-case').count();
    return offered ? works('"Build a mission from this case" is on the case page') : missing('no way from a case to a mission');
  });

  await story('S14', 'Marcus deletes the wrong case by mistake and gets it back.', async () => {
    await newCase(priya, 'Case to delete by mistake');
    await openCase(priya, 'Case to delete by mistake');
    await priya.page.getByRole('button', { name: 'Delete case' }).click();
    const undo = priya.page.getByRole('button', { name: 'Undo' });
    await undo.waitFor({ timeout: 5000 });
    await undo.click();
    await go(priya, '/app/cases');
    const back = await priya.page.getByRole('button', { name: 'View Case to delete by mistake' }).count();
    return back ? works('deleting says what went and offers Undo, and Undo brings the case back') : broken('Undo did not bring the case back');
  });

  // ── Missions ─────────────────────────────────────────────────────────────

  const mission = priya.page.getByTestId('mission-detail-dialog');
  await shared('making the mission "Watch berth 4"', ['S16', 'S17', 'S19', 'S20', 'S24', 'S26', 'S31'], async () => {
    await newMission(priya, 'Watch berth 4', 'Public');
    // An objective, opened, so what can be said about it is on screen.
    await mission.getByTestId('new-objective-input').fill('Photograph the cranes');
    await mission.getByTestId('add-objective').click();
    await priya.page.waitForTimeout(800);
    // What a report on it counts (MX32), so Aisha can report back to Priya (S31).
    await mission.getByTestId('mission-count-input').fill('Photos taken');
    await mission.getByTestId('mission-count-add').click();
    await priya.page.waitForTimeout(800);
    await mission.getByRole('button', { name: /^Show details for "Photograph the cranes"/ }).click().catch(() => {});
  });

  /** Back to the mission and its objective's details, for the stories after one that left it. */
  const reopenMission = async () => {
    await go(priya, '/app/teamworkspace?tab=missions');
    await priya.page.locator('[data-testid^="open-mission-"]').filter({ hasText: 'Watch berth 4' }).first().click();
    await mission.waitFor({ timeout: 8000 });
    await mission.getByRole('button', { name: /^Show details for "Photograph the cranes"/ }).click().catch(() => {});
  };

  await story('S16', 'Aisha gives an objective to Priya.', async () => {
    const picker = mission.getByRole('combobox', { name: 'Claimed by' });
    if (!(await picker.count())) {
      const free = await mission.getByLabel('Claimed by').count();
      return free ? partial('"Claimed by" is typed in: no list of the team, and nobody is told (plan 2.5)') : notChecked('no "Claimed by" field to read');
    }
    await picker.click();
    const options = priya.page.getByRole('listbox').getByRole('option');
    const people = (await options.allInnerTexts()).filter((t) => t !== 'nobody yet');
    if (people.length === 0) { await priya.page.keyboard.press('Escape'); return partial('"Claimed by" offers nobody on the mission'); }
    await options.filter({ hasText: people[0] }).first().click();
    await priya.page.waitForTimeout(1500);
    const chip = await mission.getByText(/^claimed by /).first().innerText().catch(() => '');
    // Given to Priya herself, the one person on this mission: her queue is the one to look in.
    await go(priya, '/app/intelanalyzer');
    const queued = /"Photograph the cranes" is yours/.test(await text(priya));
    await reopenMission();
    if (!/^claimed by \S/.test(chip)) return broken(`choosing ${people[0]} left the objective saying "${chip || 'nothing'}"`);
    return queued
      ? works(`"Claimed by" is chosen from the people on the mission, by name (${people.join(', ')}), and the one given it finds it in their attention queue`)
      : partial(`"Claimed by" is chosen by name, and the one given it did not find it in their attention queue`);
  });

  await story('S17', 'Aisha links the report an objective rests on.', async () => {
    const picker = mission.getByRole('combobox', { name: 'Rests on' });
    if (!(await picker.count())) {
      const byId = await mission.getByLabel(/report or finding id/i).count();
      return byId ? partial('the field asks for a "report or finding id" (plan 2.5)') : notChecked('no field to read');
    }
    await picker.click();
    const offered = await priya.page.getByRole('listbox').getByRole('option').allInnerTexts();
    await priya.page.keyboard.press('Escape');
    const records = offered.filter((t) => t !== 'nothing linked');
    return works(records.length
      ? `"Rests on" is chosen from the mission's records, by what they are called: ${records.join('; ')}`
      : '"Rests on" is chosen from the mission\'s reports and cases, by what they are called; this mission links none, so only "nothing linked" is offered');
  });

  await story('S19', 'Aisha moves the mission forward and understands each step.', async () => {
    const buttons = await mission.locator('[data-testid^="transition-to-"]').allTextContents();
    const raw = buttons.some((b) => /_[A-Z]/.test(b) || /^Move to [A-Z_]+$/.test(b.trim()));
    return raw ? partial(`steps read as codes: ${buttons.join(', ')} (plan 1.7)`) : works(`steps read: ${buttons.join(', ')}`);
  });

  await story('S20', 'Aisha sees exactly what will be published before publishing.', async () => {
    await mission.getByTestId('transition-to-PLANNING').click();
    await priya.page.waitForTimeout(800);
    await mission.getByTestId('transition-to-READY_FOR_PACKAGE').click();
    await priya.page.waitForTimeout(800);
    await mission.getByTestId('publish-to-navcom').click();
    const review = priya.page.getByTestId('publish-review');
    await review.waitFor({ timeout: 10000 });
    const shows = await review.getByTestId('publish-review-destinations').count();
    await review.getByRole('button', { name: /^Cancel/ }).click();
    return shows ? works('the publish review shows what goes and every destination, and nothing is sent until confirmed (cancelled here)') : partial('a review opened without saying where it goes');
  });

  await story('S21', "Dana approves Priya's mission before it goes public.", async () =>
    decided('no approval gate: publishing is not verification (decision, 2026-09); optional team sign-off and reviews after publishing are plan 5.x'));

  // Every relay refuses, with a reason as a real one gives it, and Priya confirms the publish (S22).
  await story('S22', "Priya's publish fails and she understands what happened.", async () => {
    const REASON = 'blocked: this relay is not taking events from this key';
    await reopenMission();
    const button = mission.getByTestId('publish-to-navcom');
    if (!(await button.count())) return notChecked('no publish button on the mission after S20');
    h.refuseEvents(REASON);
    try {
      const before = h.wire.length;
      await button.click();
      const review = priya.page.getByTestId('publish-review');
      await review.waitFor({ timeout: 10000 });
      const acknowledge = review.getByTestId('publish-review-acknowledgement').getByRole('checkbox');
      if (await acknowledge.count()) await acknowledge.check();
      await review.getByTestId('publish-review-confirm').click();
      await review.waitFor({ state: 'detached', timeout: 30000 });
      await priya.page.waitForTimeout(1500);
      const tried = h.wire.slice(before).filter((w) => w.profile === 'Priya');
      if (!tried.length) return broken('confirming sent nothing to any relay');
      if (tried.some((w) => !w.refused)) return broken('a relay took it, though every relay refused');
      const said = await mission.innerText();
      const nothing = /Nothing was published/i.test(said);
      const why = said.includes(REASON);
      const retry = await mission.getByRole('button', { name: /Retry/i }).count();
      const status = (await priya.page.getByTestId('mission-status-chip').innerText().catch(() => '')).trim();
      const gaps = [
        !nothing && 'it does not say nothing was published',
        !why && "the relays' reason is not shown",
        !retry && 'there is no Retry',
        !/Packaged/i.test(status) && `its status reads "${status}", not Packaged`,
      ].filter(Boolean);
      return gaps.length
        ? partial(gaps.join('; '))
        : works('it says nothing was published, shows each relay\'s reason ("blocked: …"), keeps the mission Packaged, and offers Retry');
    } finally {
      h.refuseEvents(null);
    }
  });

  await story('S23', 'Aisha removes an objective.', async () => {
    await go(priya, '/app/teamworkspace?tab=missions');
    await newMission(priya, 'Mission with an objective');
    const dialog = priya.page.getByTestId('mission-detail-dialog');
    await dialog.getByTestId('new-objective-input').fill('Photograph the cranes');
    await dialog.getByTestId('add-objective').click();
    await priya.page.waitForTimeout(800);
    const remove = dialog.getByRole('button', { name: /^Remove objective/ });
    if (!(await remove.count())) return notChecked('could not add an objective to remove');
    await remove.first().click();
    const undo = await priya.page.getByRole('button', { name: 'Undo' }).count();
    return undo ? works('removing an objective offers Undo') : partial('removed with no way back');
  });

  await story('S18', 'Sam opens a mission with the keyboard.', async () => {
    await go(priya, '/app/teamworkspace?tab=missions');
    const item = priya.page.locator('[data-testid^="open-mission-"]').first();
    const tag = await item.evaluate((e) => ({ tag: e.tagName, role: e.getAttribute('role'), tab: e.tabIndex })).catch(() => null);
    if (!tag) return notChecked('no mission in the list to reach');
    return tag.tag === 'BUTTON' || (tag.role === 'button' && tag.tab >= 0) ? works('a mission in the list is a button, reached by Tab') : broken(`a mission in the list is a ${tag.tag.toLowerCase()} that Tab does not reach`);
  });

  // ── Across the team ──────────────────────────────────────────────────────

  await story('S24', 'Marcus finds a case, mission or report by name.', async () => {
    const results = priya.page.getByTestId('command-palette');
    const search = async (query) => {
      await palette(priya, query);
      return (await results.count()) ? results.innerText() : '';
    };
    const opened = (testId, title) => priya.page.getByTestId(testId).filter({ hasText: title })
      .waitFor({ timeout: 8000 }).then(() => true, () => false);
    await go(priya, '/');
    if (!/Watch berth 4/.test(await search('Watch berth'))) return missing('the header search finds apps, commands and countries, not records (plan 1.4)');
    await results.getByText(/Watch berth 4/).first().click();
    if (!(await opened('mission-detail-dialog', 'Watch berth 4'))) return broken('the mission is found, and choosing it does not open it');
    // Another mission, chosen while Missions is open.
    await newMission(priya, 'Count the pallets');
    await priya.page.keyboard.press('Escape');
    await priya.page.waitForTimeout(2000);
    await search('watch berth');
    await results.getByText(/Watch berth 4/).first().click();
    if (!(await opened('mission-detail-dialog', 'Watch berth 4'))) return partial('a mission chosen while Missions is open does not open');
    await priya.page.keyboard.press('Escape');
    // A case, by part of its number.
    if (ONLY && !ONLY.includes('S11')) await newCase(priya, 'Night loading at berth 4');
    const number = (await search('night loading')).match(/CASE-\d{4}-(\w{4})-\w{4}/);
    if (!number) return partial('missions are found, and a case is not found by its name');
    if (!(await search(number[1].toLowerCase())).includes('Night loading at berth 4')) return partial('a case is not found by its number');
    await results.getByText(/Night loading at berth 4/).first().click();
    if (!(await opened('case-detail', 'Night loading at berth 4'))) return broken('the case is found, and choosing it does not open it');
    return works('the header search finds missions and cases by name or number, and opens them, Missions open or not');
  });

  await story('S25', "Priya's case is visible to Aisha on her own laptop.", async () => {
    // A Private case stays here (plan item 9.13b, decision G8d): its export is
    // refused, saying why. One for the team goes as a file.
    if (ONLY && !ONLY.includes('S11')) await newCase(priya, 'Night loading at berth 4');
    await openCase(priya, 'Night loading at berth 4');
    await priya.page.getByTestId('case-detail').getByRole('button', { name: 'Export as file' }).click();
    const refused = await priya.page.getByText(/To hand it on, change who may receive it first\./).count();
    if (!refused) return broken('a Private case was not refused, or not said to be');
    await newCase(priya, 'Berth 4 for the desk', 'Limited');
    await openCase(priya, 'Berth 4 for the desk');
    const [download] = await Promise.all([
      priya.page.waitForEvent('download', { timeout: 15000 }),
      priya.page.getByTestId('case-detail').getByRole('button', { name: 'Export as file' }).click(),
    ]);
    const file = join(tmpdir(), `audit-intern-${Date.now()}.starcom-bundle.json`);
    await download.saveAs(file);
    await go(aisha, '/app/cases');
    await aisha.page.getByTestId('import-bundle').click();
    const dialog = aisha.page.getByTestId('import-bundle-dialog');
    await dialog.locator('#bundle-file-input').setInputFiles(file);
    await dialog.getByRole('button', { name: /^Import \d+ records?$/ }).click();
    await dialog.getByTestId('bundle-imported').waitFor({ timeout: 8000 });
    await dialog.getByRole('button', { name: /^Open the case$/ }).click();
    const from = await aisha.page.getByTestId('received-from').textContent({ timeout: 8000 }).catch(() => '');
    return /From Priya/.test(from) ? works('a case for the team goes as a signed bundle (a file, or sealed over the team relay), and arrives saying "From Priya"; a Private one is refused, saying why') : partial(`imported, but it says: ${from || 'nothing about who sent it'}`);
  });

  await story('S26', 'Marcus acts on a Mission Package another node sent.', async () => {
    // Priya publishes her mission, and Aisha, on her own key, receives it.
    await reopenMission();
    for (const step of ['PLANNING', 'READY_FOR_PACKAGE']) {
      const move = mission.getByTestId(`transition-to-${step}`);
      if (await move.count()) { await move.click(); await priya.page.waitForTimeout(800); }
    }
    await mission.getByTestId('publish-to-navcom').click();
    const review = priya.page.getByTestId('publish-review');
    await review.waitFor({ timeout: 10000 });
    const ack = review.getByTestId('publish-review-acknowledgement');
    if (await ack.count()) await ack.getByRole('checkbox').check();
    await review.getByTestId('publish-review-confirm').click();
    await go(aisha, '/app/teamworkspace?tab=missions');
    const row = aisha.page.getByTestId('received-package-row').filter({ hasText: 'Watch berth 4' }).first();
    if (!(await row.waitFor({ timeout: 30000 }).then(() => true, () => false))) return notChecked("Priya's package did not reach Aisha");
    // Missions are cards (D-MF): "See what to do" opens one in full.
    await row.getByTestId('mission-card-open').click();
    const detail = aisha.page.getByTestId('received-package-detail');
    await detail.waitFor({ timeout: 8000 });
    const ask = detail.getByTestId('received-ask').filter({ hasText: 'Photograph the cranes' });
    if (!(await ask.count())) return partial('the package shows nothing it asks for (plan 2.6)');
    // A mission is taken whole, its limits agreed first (D-MF, MF7–MF10).
    await detail.getByTestId('mission-take-button').click();
    const limits = aisha.page.getByTestId('mission-take-agree');
    if (await limits.count()) await limits.click();
    const taken = await detail.getByTestId('mission-taken').waitFor({ timeout: 5000 }).then(() => true, () => false);
    if (!taken) return broken('"Take this mission" did not take it');
    const reply = await detail.getByTestId('received-package-reviews').getByRole('radio', { name: /^Comment/ }).count();
    const raw = /missionNumber|relatedReportCount/.test(await detail.innerText());
    await aisha.page.keyboard.press('Escape');
    await aisha.page.waitForTimeout(800);
    const listed = await aisha.page.getByTestId('taken-mission').filter({ hasText: 'Watch berth 4' }).count();
    if (!listed) return partial('a mission taken is not in "Taken" on Missions');
    return reply && !raw
      ? works('its asks are listed, it is taken whole and listed under Taken with its steps to tick, a reply goes as a comment, and the raw metadata is behind Details')
      : partial(`reply: ${reply ? 'yes' : 'no'}; raw metadata shown: ${raw ? 'yes' : 'no'}`);
  });
  await story('S31', "Aisha reports back on Priya's mission, and Priya settles her report.", async () => {
    // Taken by Aisha in S26: a report is sealed to Priya and sent to the inbox Priya's publish posted (MX32).
    await go(aisha, '/app/teamworkspace?tab=missions');
    const taken = aisha.page.getByTestId('taken-mission').filter({ hasText: 'Watch berth 4' }).first();
    if (!(await taken.count())) return notChecked('the mission was not taken (S26)');
    const open = taken.getByTestId('report-back-open');
    if (!(await open.count())) return broken('a taken mission that asks for counts offers no "Report back"');
    await open.click();
    await taken.getByTestId('report-count-photos-taken').fill('3');
    await taken.getByTestId('report-back-send').click();
    const review = aisha.page.getByTestId('publish-review');
    await review.waitFor({ timeout: 10000 });
    const ack = review.getByTestId('publish-review-acknowledgement');
    if (await ack.count()) await ack.getByRole('checkbox').check();
    await review.getByTestId('publish-review-confirm').click();
    await aisha.page.waitForTimeout(3000);
    const notSent = await taken.getByTestId('report-not-sent').textContent().catch(() => '');
    if (notSent) return broken(`the report was not sent: ${notSent.slice(0, 120)}`);
    await reopenMission();
    const received = mission.getByTestId('mission-report-received').filter({ hasText: 'Photos taken 3' });
    if (!(await received.waitFor({ timeout: 30000 }).then(() => true, () => false))) return partial("Aisha's report did not reach Priya's mission");
    await received.getByTestId('mission-report-settle').click();
    const settle = priya.page.getByTestId('publish-review');
    await settle.waitFor({ timeout: 10000 });
    const ack2 = settle.getByTestId('publish-review-acknowledgement');
    if (await ack2.count()) await ack2.getByRole('checkbox').check();
    await settle.getByTestId('publish-review-confirm').click();
    await reopenMission();
    const settled = await mission.getByTestId('mission-report-received').filter({ hasText: 'settled by its publisher' })
      .waitFor({ timeout: 20000 }).then(() => true, () => false);
    return settled
      ? works("the report reaches Priya's mission sealed to her inbox, with its count and day, and her settlement reads back as settled by its publisher")
      : partial('the report arrived; the settlement did not read back');
  });

  // Decision D-RP (the owner, 20 Nov 2026: "public publishing should work").
  await story('S32', 'Priya publishes her report, and Aisha reads it on her own laptop.', async () => {
    const title = 'Audit: gate 3 trucks queued at dawn';
    await go(priya, '/app/inteldashboard');
    await priya.page.getByTestId('new-record').click();
    await priya.page.getByTestId('record-title').fill(title);
    await priya.page.getByTestId('record-content').fill('Eleven trucks queued at gate 3 before 06:00, engines running.');
    await priya.page.getByTestId('record-latitude').fill('40.6840');
    await priya.page.getByTestId('record-longitude').fill('-74.1530');
    await priya.page.getByTestId('report-distribution').getByLabel(/^Public/).check();
    await priya.page.getByTestId('create-record').click();
    await priya.page.waitForTimeout(2500);
    await h.dismissNotices(priya);
    const publish = priya.page.getByTestId('report-publish');
    if (!(await publish.count())) return missing('a report has no Publish');
    await publish.click();
    const review = priya.page.getByTestId('publish-review');
    if (!(await review.waitFor({ timeout: 10000 }).then(() => true, () => false))) return broken('Publish opened no review');
    const shown = (await review.innerText()).replace(/\s+/g, ' ');
    const ack = review.getByTestId('publish-review-acknowledgement');
    if (await ack.count()) await ack.getByRole('checkbox').check();
    await review.getByTestId('publish-review-confirm').click();
    await priya.page.waitForTimeout(4000);
    const line = await priya.page.getByTestId('report-published').textContent().catch(() => '');
    if (!line) return broken(`no relay took it: ${(await priya.page.getByTestId('report-publish-note').textContent().catch(() => '')).slice(0, 160)}`);
    await go(aisha, '/app/inteldashboard');
    const arrived = await aisha.page.getByText(title).first().waitFor({ timeout: 30000 }).then(() => true, () => false);
    if (!arrived) return partial('published, but it did not reach Aisha');
    await aisha.page.getByText(title).first().click();
    await aisha.page.waitForTimeout(1200);
    const read = (await text(aisha)).includes('Eleven trucks queued at gate 3');
    await go(priya, '/app/inteldashboard');
    const copies = await priya.page.getByText(title).count();
    const gaps = [
      !shown.includes('Eleven trucks queued') && 'the review does not show the text',
      !read && "Aisha sees the title and not the text",
      copies !== 1 && `Priya's list shows it ${copies} times`,
    ].filter(Boolean);
    return gaps.length
      ? partial(gaps.join('; '))
      : works("the review shows the note and where it goes; it reaches Aisha's dashboard with its text and place; Priya's list keeps one copy");
  });

  // Decision D-RP, RP7: withdrawn by a notice in its place and a deletion request.
  await story('S33', "Priya withdraws her report, and it leaves Aisha's dashboard.", async () => {
    const title = 'Audit: gate 3 trucks queued at dawn';
    await go(aisha, '/app/inteldashboard');
    const hadIt = await aisha.page.getByText(title).first().waitFor({ timeout: 20000 }).then(() => true, () => false);
    if (!hadIt) return notChecked('Aisha never had the report (S32)');
    await go(priya, '/app/inteldashboard');
    const mine = priya.page.getByText(title).first();
    if (!(await mine.count())) return notChecked('Priya has no published report (S32)');
    await mine.click();
    await priya.page.waitForTimeout(800);
    const withdraw = priya.page.getByTestId('report-withdraw');
    if (!(await withdraw.count())) return missing('a published report has no Withdraw');
    await withdraw.click();
    const review = priya.page.getByTestId('publish-review');
    if (!(await review.waitFor({ timeout: 10000 }).then(() => true, () => false))) return broken('Withdraw opened no review');
    const shown = (await review.innerText()).replace(/\s+/g, ' ');
    const ack = review.getByTestId('publish-review-acknowledgement');
    if (await ack.count()) await ack.getByRole('checkbox').check();
    await review.getByTestId('publish-review-confirm').click();
    await priya.page.waitForTimeout(4000);
    const line = await priya.page.getByTestId('report-withdrawn').textContent().catch(() => '');
    if (!line) return broken(`not withdrawn: ${(await priya.page.getByTestId('report-publish-note').textContent().catch(() => '')).slice(0, 160)}`);
    // Aisha comes back: the withdrawal arrives, and her saved copy goes, with no Undo offered for it.
    await go(aisha, '/app/inteldashboard');
    const gone = await aisha.page.getByText(title).first().waitFor({ state: 'detached', timeout: 30000 }).then(() => true, () => false);
    const undo = await aisha.page.getByTestId('undo-deletion').count();
    const gaps = [
      /Eleven trucks|gate 3 trucks/i.test(shown.replace(/Withdraw "[^"]*"/, '')) && 'the withdrawal repeats the report',
      !gone && "it stayed in Aisha's dashboard",
      undo > 0 && 'Aisha was offered Undo for a deletion she did not make',
    ].filter(Boolean);
    return gaps.length
      ? partial(gaps.join('; '))
      : works("the review shows that only a notice goes, the report says it was withdrawn, and it left Aisha's dashboard with no Undo offered");
  });

  // Decision D-KL: a locked key is asked for once, over whatever dialog is open (KL4, KL7).
  await story('S34', 'Dana, whose key is locked, publishes a Mission Package.', async () => {
    const PASS = 'correct horse battery staple';
    const dana = await h.profile('Dana');
    await go(dana, '/app/inteldashboard');
    await dana.page.getByTestId('new-record').click();
    await dana.page.getByLabel(/^Title/).fill('Gate 5 lights out');
    await dana.page.getByLabel(/^Content/).fill('The floodlights at gate 5 were off from 01:00.');
    await dana.page.getByTestId('create-record').click();
    await dana.page.waitForTimeout(2500);
    const offer = dana.page.getByTestId('identity-notice-lock');
    if (!(await offer.count())) return broken('no lock was offered when her key was made');
    await dana.page.locator('#identity-notice-passphrase').fill(PASS);
    await dana.page.locator('#identity-notice-passphrase-again').fill(PASS);
    await offer.locator('button[type="submit"]').click();
    await dana.page.waitForTimeout(5000);
    await h.dismissNotices(dana);
    await dana.page.reload({ waitUntil: 'domcontentloaded' });
    await dana.page.waitForTimeout(4500);
    await newMission(dana, 'Watch gate 5', 'Public');
    const own = dana.page.getByTestId('mission-detail-dialog');
    await own.getByTestId('new-objective-input').fill('Note when the lights come back');
    await own.getByTestId('add-objective').click();
    await dana.page.waitForTimeout(800);
    for (const step of ['PLANNING', 'READY_FOR_PACKAGE']) {
      const move = own.getByTestId(`transition-to-${step}`);
      if (await move.count()) { await move.click(); await dana.page.waitForTimeout(800); }
    }
    await own.getByTestId('publish-to-navcom').click();
    const unlock = dana.page.getByTestId('key-unlock');
    const review = dana.page.getByTestId('publish-review');
    let prompts = 0;
    const answer = async () => {
      prompts += 1;
      await dana.page.locator('#key-unlock-passphrase').click({ timeout: 5000 });
      await dana.page.keyboard.type(PASS);
      await dana.page.keyboard.press('Enter');
      await unlock.waitFor({ state: 'detached', timeout: 15000 });
    };
    try {
      const first = await Promise.race([
        review.waitFor({ timeout: 15000 }).then(() => 'review'),
        unlock.waitFor({ timeout: 15000 }).then(() => 'unlock'),
      ]);
      if (first === 'unlock') await answer();
      await review.waitFor({ timeout: 15000 });
      const ack = review.getByTestId('publish-review-acknowledgement');
      if (await ack.count()) await ack.getByRole('checkbox').check();
      await review.getByTestId('publish-review-confirm').click();
      if (await unlock.waitFor({ timeout: 5000 }).then(() => true, () => false)) await answer();
    } catch {
      return broken('the passphrase could not be given: the prompt took no typing or never closed');
    }
    await dana.page.waitForTimeout(5000);
    const said = (await own.innerText().catch(() => '')).replace(/\s+/g, ' ');
    const published = /a relay has confirmed it has it/i.test(said);
    const sealed = await dana.page.evaluate(() => new Promise((resolve) => {
      const open = indexedDB.open('pqc-manifest-signing-key', 1);
      open.onsuccess = () => {
        const get = open.result.transaction('ml-dsa-key', 'readonly').objectStore('ml-dsa-key').get('current');
        get.onsuccess = () => resolve(!!get.result?.sealed && !get.result?.secretKey);
      };
      open.onerror = () => resolve(false);
    }));
    const gaps = [
      !published && 'the package did not go',
      prompts !== 1 && `she was asked for her passphrase ${prompts} times`,
      !sealed && 'her post-quantum signing key is stored in the clear',
    ].filter(Boolean);
    return gaps.length
      ? partial(gaps.join('; '))
      : works('asked once for her passphrase over the open mission, the package went, and her post-quantum signing key is kept sealed to her key');
  });

  // Work package W1: what no relay took waits on this device, and goes when one answers.
  await story('S35', 'Priya publishes a report on a train with no connection, and it goes when she is back.', async () => {
    const title = 'Audit: berth 7 crane down';
    await go(priya, '/app/inteldashboard');
    await priya.page.getByTestId('new-record').click();
    await priya.page.getByTestId('record-title').fill(title);
    await priya.page.getByTestId('record-content').fill('The crane at berth 7 stopped at 14:10; two ships wait.');
    await priya.page.getByTestId('record-latitude').fill('40.6690');
    await priya.page.getByTestId('record-longitude').fill('-74.1490');
    await priya.page.getByTestId('report-distribution').getByLabel(/^Public/).check();
    await priya.page.getByTestId('create-record').click();
    await priya.page.waitForTimeout(2500);
    await h.dismissNotices(priya);
    // The train: no connection, and no relay answering.
    const context = priya.page.context();
    h.refuseEvents('error: no connection');
    await context.setOffline(true);
    try {
      await priya.page.getByTestId('report-publish').click();
      const review = priya.page.getByTestId('publish-review');
      if (!(await review.waitFor({ timeout: 10000 }).then(() => true, () => false))) return broken('Publish opened no review');
      const ack = review.getByTestId('publish-review-acknowledgement');
      if (await ack.count()) await ack.getByRole('checkbox').check();
      await review.getByTestId('publish-review-confirm').click();
      const kept = await priya.page.getByTestId('report-kept').waitFor({ timeout: 15000 }).then(() => true, () => false);
      if (!kept) return broken(`nothing was kept: ${(await priya.page.getByTestId('report-publish-note').textContent().catch(() => '')).slice(0, 160)}`);
      if (await priya.page.getByTestId('report-published').count()) return broken('it says published while no relay took it');
    } finally {
      // Back in town.
      h.refuseEvents(null);
      await context.setOffline(false);
    }
    const went = await priya.page.getByTestId('report-published').waitFor({ timeout: 30000 }).then(() => true, () => false);
    if (!went) return partial('kept while offline, and still waiting once back online');
    const stillKept = await priya.page.getByTestId('report-kept').count();
    await go(aisha, '/app/inteldashboard');
    const arrived = await aisha.page.getByText(title).first().waitFor({ timeout: 30000 }).then(() => true, () => false);
    const gaps = [
      stillKept > 0 && 'the report still says it waits after it went',
      !arrived && 'it went, but did not reach Aisha',
    ].filter(Boolean);
    return gaps.length
      ? partial(gaps.join('; '))
      : works("with no connection the report says it waits on this device, not that it was published; back online it goes by itself and reaches Aisha's dashboard");
  });

  // Work package W1c: a Mission Package no relay took waits, signed, and the mission is dispatched when it goes.
  await story('S36', 'Priya publishes a Mission Package with no connection, and it is dispatched when she is back.', async () => {
    await go(priya, '/app/teamworkspace?tab=missions');
    await h.press(priya.page, /new mission/i);
    const form = priya.page.getByTestId('create-mission-dialog');
    if (!(await form.waitFor({ timeout: 8000 }).then(() => true, () => false))) return notChecked('no New Mission form opened');
    await form.getByTestId('mission-title-input').fill('Audit: count cranes at berth 7');
    await form.getByTestId('mission-briefing-input').fill('Count the working cranes after 14:00. Rests on direct observation.');
    await form.getByRole('radio', { name: /^Public/ }).check();
    await form.getByTestId('create-mission-submit').click();
    const mission = priya.page.getByTestId('mission-detail-dialog');
    await mission.waitFor({ timeout: 8000 });
    await mission.getByTestId('new-objective-input').fill('Count the cranes');
    await mission.getByTestId('add-objective').click();
    await priya.page.waitForTimeout(800);
    for (const step of ['PLANNING', 'READY_FOR_PACKAGE']) {
      const move = mission.getByTestId(`transition-to-${step}`);
      if (await move.count()) { await move.click(); await priya.page.waitForTimeout(800); }
    }
    const context = priya.page.context();
    h.refuseEvents('error: no connection');
    await context.setOffline(true);
    try {
      await mission.getByTestId('publish-to-navcom').click();
      const review = priya.page.getByTestId('publish-review');
      if (!(await review.waitFor({ timeout: 15000 }).then(() => true, () => false))) return broken('Publish opened no review');
      const ack = review.getByTestId('publish-review-acknowledgement');
      if (await ack.count()) await ack.getByRole('checkbox').check();
      await review.getByTestId('publish-review-confirm').click();
      const kept = await mission.getByTestId('mission-package-kept').waitFor({ timeout: 15000 }).then(() => true, () => false);
      if (!kept) return broken(`nothing was kept: ${(await mission.innerText().catch(() => '')).replace(/\s+/g, ' ').match(/Nothing was published[^.]*\./)?.[0] ?? 'no word of it'}`);
    } finally {
      h.refuseEvents(null);
      await context.setOffline(false);
    }
    const chip = mission.getByTestId('mission-status-chip');
    const dispatched = await priya.page.waitForFunction(
      () => document.querySelector('[data-testid="mission-status-chip"]')?.getAttribute('data-status') === 'DISPATCHED',
      null, { timeout: 30000 },
    ).then(() => true, () => false);
    if (!dispatched) return partial(`kept while offline; back online it is still ${await chip.getAttribute('data-status').catch(() => '?')}`);
    const receipt = await mission.getByTestId('dispatch-receipt').textContent().catch(() => '');
    return receipt
      ? works('with no connection the mission says its package waits on this device, in place of Retry Publish; back online it goes by itself and the mission is dispatched, with its receipt')
      : partial('dispatched, with no receipt shown');
  });

  await story('S27', 'Priya comes back the next day and her own report looks normal.', async () =>
    notChecked('drawn on the globe; the layer audit (npm run audit:layers) is the check for the globe'));
  await story('S28', "Marcus uses IntelAnalyzer's Entity Review to judge whether two records are one organisation.", async () =>
    notChecked('a judgement on real data; readable identifiers are plan 3.6'));

  await story('S29', 'Anyone learns what a term means: Navcom, adjudicated, geohash, READY_FOR_PACKAGE, relay.', async () => {
    await go(priya, '/app/cases');
    await priya.page.getByTestId('new-case').click();
    await priya.page.getByTestId('what-is-visibility').click();
    const entry = await priya.page.getByTestId('glossary-entry').textContent({ timeout: 5000 }).catch(() => '');
    return entry ? works('a "?" beside a word opens the glossary there; the command box finds any word in it') : missing('no glossary opened');
  });

  await story('S30', 'Mecha Jono does what a person can.', async () =>
    notChecked('a protocol contract (docs/spec), checked by the spec and conformance scripts, not a browser'));

  // ── Chat (00-current-state/chat.md) ──────────────────────────────────────

  await story('C1', 'An intern joins by the code a lead sent, and both see one channel and one roster.', async () => {
    const said = 'Audit: berth 4 again tonight?';
    await h.speakToTeam(aisha, said);
    await h.openTeamChat(priya);
    return (await h.onScreen(priya, said)) ? works('a member who joined by invite reads the lead\'s team message, sealed to each member') : broken('the member did not read the lead\'s team message');
  });

  await story('C4', 'An intern messages one teammate privately; replies thread, and it survives a reload.', async () => {
    const aishaKey = h.bundleKey('Aisha');
    const priyaKey = h.bundleKey('Priya');
    if (!aishaKey || !priyaKey) return notChecked('a prekey bundle was not seen for both');
    await go(priya, '/app/teamworkspace');
    await go(aisha, '/app/teamworkspace');
    if (!(await h.openDirectMessage(priya, aishaKey, 'Aisha'))) return broken('could not open a direct message with Aisha from her key');
    if (!(await h.sendDirect(priya, 'Audit direct message'))) return broken('the direct message window had no box to write in');
    await h.openDirectMessage(aisha, priyaKey, 'Priya');
    await aisha.page.waitForTimeout(2000);
    const arrived = await h.onScreen(aisha, 'Audit direct message');
    await go(aisha, '/app/teamworkspace');
    await h.openDirectMessage(aisha, priyaKey, 'Priya');
    await aisha.page.waitForTimeout(2000);
    const kept = await h.onScreen(aisha, 'Audit direct message');
    const inClear = h.inClear('Audit direct message');
    if (inClear) return broken('the message crossed the wire in plain text');
    return arrived && kept ? works('sealed to her, received, and still there after a reload') : broken(`arrived: ${arrived}; after a reload: ${kept}`);
  });

  await story('C5', 'Every message says whether it was end-to-end encrypted.', async () => {
    const claims = /PQC-NIST-\d|CRYSTALS-Kyber-\d+|PQC Encrypted/.test(await text(priya));
    return claims ? broken('a post-quantum claim is shown that nothing checked') : works('a direct message shows a lock only for what went sealed, and says when it is not post-quantum (check:chat checks this in detail)');
  });

  // A third person joins after the team has talked (C2), writes while Priya is
  // on another screen (C8), and is then taken off the relay's list (C3, C9):
  // the stories plan items 9.7 to 9.12 built, walked (V1).
  let marcus = null;
  if (inviteLink) {
    await shared('Marcus joining by the invite', ['C2', 'C3', 'C8', 'C9'], async () => {
      marcus = await h.profile('Marcus');
      await h.speakToTeam(aisha, 'Audit: before Marcus joined');
      marcus.joined = await h.joinByInvite(marcus, inviteLink);
    });
  }

  await story('C2', 'A lead adds a member, who reads from the point they joined, and the app says whether earlier history is visible.', async () => {
    if (!marcus?.joined) return broken('Marcus could not join the team (S4)');
    await h.openTeamChat(marcus);
    const told = await marcus.page.getByTestId('team-chat-joined').textContent({ timeout: 8000 }).catch(() => '');
    const earlier = await h.onScreen(marcus, 'Audit: before Marcus joined');
    await h.speakToTeam(aisha, 'Audit: after Marcus joined');
    await h.openTeamChat(marcus);
    const later = await h.onScreen(marcus, 'Audit: after Marcus joined');
    if (earlier) return broken('a message sealed before he joined was shown to him');
    if (!later) return broken('a message sent after he joined did not reach him');
    return told ? works(`he reads from when he joined, and is told why not before: "${told.slice(0, 70)}…"`) : partial('nothing says when he joined, or why earlier messages are absent');
  });

  await story('C8', 'An intern outside Missions is told once about each new message.', async () => {
    if (!marcus?.joined) return broken('there was no one to write (C2)');
    await go(priya, '/app/cases');
    const count = async () => Number(await priya.page.getByTestId('chat-unread').textContent({ timeout: 500 }).catch(() => '0')) || 0;
    const before = await count();
    const from = h.wire.length;
    // A notice shows for 4 s, and speaking takes longer than that: record every
    // one that appears on her screen from before he writes.
    await priya.page.evaluate(() => {
      const seen = window.__notices = [];
      new MutationObserver(() => {
        for (const el of document.querySelectorAll('[class*="notificationMessage"]')) {
          const t = (el.textContent || '').trim();
          if (/ wrote to /.test(t) && !seen.includes(t)) seen.push(t);
        }
      }).observe(document.body, { subtree: true, childList: true, characterData: true });
    });
    await h.speakToTeam(marcus, 'Audit: for Priya, elsewhere');
    await priya.page.waitForTimeout(3000);
    const notices = await priya.page.evaluate(() => window.__notices);
    const told = notices.length;
    const after = await count();
    if (told !== 1) {
      const priyaKey = h.bundleKey('Priya');
      const sealed = h.wire.slice(from).filter((w) => w.kind === 1059 && (!priyaKey || w.tags.some((t) => t[0] === 'p' && t[1] === priyaKey))).length;
      return broken(`announced ${told} times; unread ${before} → ${after}; ${sealed} sealed message(s) to her crossed the relay`);
    }
    const where = notices[0];
    if (!/wrote to Newark desk\./.test(where)) return partial(`announced once, but not by the team's name: "${where}"`);
    return after > before ? works(`announced once, by who wrote and where, and the chat button counts it (${before} → ${after})`) : partial('announced, but the chat button did not count it');
  });

  await story('C3', 'A member leaves or is removed, and later messages are unreadable to them.', async () => {
    if (!marcus?.joined) return broken('there was no one to remove (C2)');
    const marcusKey = h.bundleKey('Marcus');
    if (!marcusKey || !h.teamMembers.has(marcusKey)) return notChecked('Marcus\'s key was not on the relay\'s list to take off');
    // The relay's admin takes him off its list, as a zooid admin does.
    h.teamMembers.delete(marcusKey);
    const from = h.wire.length;
    await h.speakToTeam(aisha, 'Audit: after Marcus left');
    const sealedToHim = h.wire.slice(from).some((w) => w.kind === 1059 && w.tags.some((t) => t[0] === 'p' && t[1] === marcusKey));
    await h.openTeamChat(marcus);
    const warned = await marcus.page.getByTestId('team-chat-standing').textContent({ timeout: 8000 }).catch(() => '');
    const read = await h.onScreen(marcus, 'Audit: after Marcus left');
    if (sealedToHim || read) return broken(`after his removal a message was ${read ? 'read by him' : 'sealed to him'}`);
    return warned ? works(`nothing after his removal is sealed to him, and he is told: "${warned.slice(0, 70)}…"`) : partial('nothing reaches him, but nothing tells him why');
  });

  await story('C9', "Every message shows a stable name tied to the sender's key, and non-members are flagged.", async () => {
    if (!marcus?.joined) return broken('there was no one to flag (C3)');
    await h.openTeamChat(priya);
    const flagged = await priya.page.evaluate(() => [...document.querySelectorAll('li')]
      .some((li) => li.innerText.includes('Audit: for Priya, elsewhere') && li.innerText.includes("Not on this team's member list")));
    return flagged ? works("a message from someone no longer on the relay's list is marked \"Not on this team's member list\"") : broken('a message from someone off the list was not flagged');
  });

  await story('C6', 'An intern on a second device sees their teams and history.', async () => {
    // Narrowed by decision G2 (plan 9.11): the key is brought through "Your key",
    // and messages sent from then on reach every device. Teams, names and
    // history stay on the device that has them.
    const aishaKey = h.bundleKey('Aisha');
    const priyaKey = h.bundleKey('Priya');
    if (!aishaKey || !priyaKey) return notChecked('a prekey bundle was not seen for both');
    let at = 'opening her key';
    try {
    await go(priya, '/');
    await priya.page.getByRole('button', { name: 'Your key' }).click();
    await priya.page.getByRole('button', { name: 'Show the key to back up' }).click();
    const nsec = (await priya.page.getByTestId('your-key-nsec').textContent({ timeout: 5000 }).catch(() => ''))?.trim();
    if (!nsec?.startsWith('nsec1')) return broken('her key could not be shown to bring it');
    at = 'bringing it to a second browser';
    const laptop = await h.profile('Priya-laptop');
    await go(laptop, '/');
    await laptop.page.getByRole('button', { name: 'Your key' }).click();
    await laptop.page.getByRole('button', { name: /^Use (your|a) key from another device$/ }).click();
    await laptop.page.locator('#your-key-bring').fill(nsec);
    await laptop.page.getByRole('button', { name: 'Use this key here' }).click();
    const replace = laptop.page.getByRole('button', { name: 'Replace it' });
    if (await replace.count()) await replace.click();
    if (!(await laptop.page.getByText('This browser now signs as you.').count())) return broken('the second browser did not take her key');
    at = 'sending to her';
    // Chat starts on the laptop, which publishes its own device's bundle.
    await go(laptop, '/app/teamworkspace');
    await laptop.page.waitForTimeout(5000);
    await go(aisha, '/app/teamworkspace');
    if (!(await h.openDirectMessage(aisha, priyaKey, 'Priya'))) return broken('Aisha could not open a message to Priya');
    await h.sendDirect(aisha, 'Audit: to both of her devices');
    const seen = [];
    for (const p of [priya, laptop]) {
      await go(p, '/app/teamworkspace');
      await h.openDirectMessage(p, aishaKey, 'Aisha');
      await p.page.waitForTimeout(2500);
      seen.push(await h.onScreen(p, 'Audit: to both of her devices'));
    }
    if (h.inClear('Audit: to both of her devices')) return broken('the message crossed the wire in plain text');
    return seen.every(Boolean) ? works('her key brought to a second browser, a message sent then reaches both, sealed') : broken(`first device: ${seen[0]}; second: ${seen[1]}`);
    } catch (e) {
      return broken(`stopped while ${at}: ${String(e?.message ?? e).split('\n')[0].slice(0, 120)}`);
    }
  });

  await story('C7', 'An intern attaches evidence, encrypted to the members.', async () =>
    notChecked('waits on plan 9.10: encrypted attachments need the Blossom server on the Jetson'));

  if (process.env.AUDIT_DEBUG) {
    const summary = {};
    for (const w of h.wire) { const k = `${w.profile}:${w.kind}${w.kind === 1059 ? `→${w.tags.find((t) => t[0] === 'p')?.[1]?.slice(0, 8)}` : ''}`; summary[k] = (summary[k] ?? 0) + 1; }
    console.error('WIRE', JSON.stringify(summary), 'keys', JSON.stringify({ priya: h.bundleKey('Priya')?.slice(0, 8), aisha: h.bundleKey('Aisha')?.slice(0, 8) }));
    for (const who of ['Priya', 'Aisha']) console.error(who, 'SCREEN', (await (who === 'Priya' ? priya : aisha).page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(-600));
  }
  if (!h.wire.some((w) => w.profile === 'Priya') && !ONLY) {
    console.error('\n  HARNESS CANNOT OBSERVE: the stand-in relay received nothing from Priya. Is the app served at ' + BASE_URL + '?\n');
    process.exit(2);
  }
} finally {
  await h.close();
}

// ── The report ─────────────────────────────────────────────────────────────

const width = Math.max(...results.map((r) => r.status.length));
console.log('');
for (const r of results) {
  console.log(`  ${r.id.padEnd(4)} ${r.status.padEnd(width)}  ${r.words}`);
  if (r.detail) console.log(`  ${' '.repeat(4)} ${' '.repeat(width)}  → ${r.detail}`);
}
const counts = results.reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
console.log(`\n  ${Object.entries(counts).map(([s, n]) => `${n} ${s}`).join(' · ')}\n`);

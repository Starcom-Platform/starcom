import { test, expect, type Page } from '@playwright/test';
import { waitForGlobe, settleSupportFunnel, gotoApp } from './helpers/appReady';

/**
 * Whole journeys, not stages.
 *
 * ─── WHY THESE EXIST ───────────────────────────────────────────────────────
 *
 * pipeline-walk.spec.ts proves every stage is REACHABLE — a real thing to
 * prove, and not the same as proving anyone can get through them. Its report
 * test ends at a report existing; its navigation test ends at a lane label.
 * Nothing connected them, so nothing established that one piece of intel can
 * travel from typed to adjudicated to published.
 *
 * A stage that works in isolation and a pipeline that works are different
 * claims, and this codebase has repeatedly shipped the first while believing
 * the second: corroboration computed and never consulted, findings ingested
 * and rendered nowhere, a refutation format with no publisher. Each passed its
 * own tests.
 *
 * ─── ON PUBLISHING FOR REAL ────────────────────────────────────────────────
 *
 * Story B clicks a button that broadcasts an attested claim. It is safe here
 * only because playwright.config.cjs builds with
 * VITE_NOSTR_FINDING_RELAYS_EXCLUSIVE and globalSetup runs the relay it points
 * at. Before that existed, FindingsBroadcastService had five public relays
 * hardcoded and no override — so this spec could not have been written without
 * repeating an irretrievable publish this project has already done once.
 */

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function land(page: Page) {
  await page.goto('/');
  await waitForGlobe(page);
  await settleSupportFunnel(page);
}

async function createReport(page: Page, title: string, body: string) {
  await gotoApp(page, /IntelDashboard/, 'INTELDASHBOARD');
  await page.getByTestId('new-record').click();
  await page.getByTestId('record-title').fill(title);
  await page.getByTestId('record-content').fill(body);
  // Without coordinates a report never reaches the globe, which is the surface
  // this whole pipeline feeds.
  await page.getByTestId('record-latitude').fill('51.5');
  await page.getByTestId('record-longitude').fill('-0.12');
  await page.getByTestId('create-record').click();
  await expect(page.locator('[data-testid="report-row"]', { hasText: title }))
    .toHaveCount(1, { timeout: 15_000 });
}

async function createCase(page: Page, title: string) {
  await gotoApp(page, /Cases/, 'CASES');
  await page.getByRole('button', { name: /new case/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^title/i).fill(title);
  await dialog.getByLabel(/^description/i).fill('Opened by an end-to-end user story.');
  await dialog.getByRole('button', { name: /^create$/i }).click();
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(title)).toBeVisible();
}

/** Opens a case's own page (plan item 1.2); it used to be a "Connections" dialog. */
async function openConnections(page: Page, caseTitle: string) {
  await page.getByRole('button', { name: `View ${caseTitle}` }).click();
  const casePage = page.getByTestId('case-detail');
  await expect(casePage).toBeVisible();
  return casePage;
}

async function attachEvidence(page: Page, dialog: ReturnType<Page['getByTestId']>, reportTitle: string) {
  const input = dialog.getByTestId('link-candidate-input').locator('input');
  await input.click();
  await input.fill(reportTitle);
  await page.getByRole('option', { name: new RegExp(reportTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).click();
  await dialog.getByTestId('attach-action').click();
}

test.describe('end-to-end user stories', () => {
  test.setTimeout(180_000);

  test('a newcomer reaches their first report without being told where to look', async ({ page }) => {
    await land(page);

    // The globe is the first impression and has to carry it alone: a newcomer
    // arrives with no briefing, no fixtures and no idea what a "lane" is.
    await expect(page.locator('canvas').first()).toBeVisible();

    const title = `First report ${stamp()}`;
    await createReport(page, title, 'The first thing this operator has ever recorded.');

    // Reachable by its own identity afterwards, not by position in a list —
    // an operator who cannot find what they just made has not really made it.
    await page.getByTestId('search-reports').fill(title);
    await expect(page.locator('[data-testid="report-row"]', { hasText: title }))
      .toHaveCount(1, { timeout: 15_000 });
  });

  test('a case reaches an adjudicated position, and that position is published', async ({ page }) => {
    await land(page);

    const s = stamp();
    const reportTitle = `Registry extract ${s}`;
    await createReport(page, reportTitle, 'Two directors named at the same address.');

    const caseTitle = `Ownership of Northwind ${s}`;
    await createCase(page, caseTitle);

    const dialog = await openConnections(page, caseTitle);
    await attachEvidence(page, dialog, reportTitle);
    await expect(dialog.getByTestId('linked-evidence-list')).toContainText(reportTitle, { timeout: 15_000 });

    // A case with evidence and no position is a folder. This is the step the
    // aggregation tier had nowhere to put until recently.
    await dialog.getByTestId('position-input').fill('Northwind is directed by the two individuals named in the registry extract.');
    await dialog.getByTestId('verdict-select').selectOption('substantiated');
    await dialog.getByTestId('state-position').click();
    await expect(dialog.getByTestId('case-position')).toContainText('substantiated', { timeout: 15_000 });

    // Publishing sends the VERDICT and the counts — never the prose above.
    await dialog.getByTestId('publish-subject').fill('Northwind Shipping Ltd');
    await dialog.getByTestId('publish-subject-kind').selectOption('organization');
    await dialog.getByTestId('publish-position').click();

    // "Queued" is a distinct outcome and is NOT success: it means the
    // broadcast reached no relay. Asserting on "Published" is what
    // distinguishes a claim that is public from one parked in an outbox.
    await expect(dialog.getByTestId('publish-position'))
      .toHaveText(/^Published$/, { timeout: 60_000 });
  });

  test('a case becomes a mission without leaving to find one', async ({ page }) => {
    await land(page);

    const s = stamp();
    const reportTitle = `Handoff evidence ${s}`;
    const caseTitle = `Handoff case ${s}`;
    await createReport(page, reportTitle, 'Supports the case that becomes a mission.');
    await createCase(page, caseTitle);

    const dialog = await openConnections(page, caseTitle);
    await attachEvidence(page, dialog, reportTitle);
    await expect(dialog.getByTestId('linked-evidence-list')).toContainText(reportTitle, { timeout: 15_000 });

    /**
     * The seam this closes was written on the screen in prose: "Attach this
     * case to a mission from the Missions tab in CollabCenter" — the app
     * has since been renamed OpsCenter, and the sentence is gone. Every forward
     * step here was pull-only, so an operator who had just reached a verdict
     * had to leave, navigate, and re-find what they were already looking at.
     */
    await dialog.getByTestId('create-mission-from-case').click();

    // Arrives in the missions tab with the create dialog already open — the
    // point is landing on a form, not on a list that must be acted on again.
    await expect
      .poll(async () => (await page.locator('body').innerText()).match(/MISSION LANE:\s*\n?\s*(\w+)/)?.[1], { timeout: 20_000 })
      .toBe('TEAMWORKSPACE');
    await expect(page.getByTestId('create-mission-dialog')).toBeVisible({ timeout: 20_000 });

    await page.getByTestId('mission-title-input').fill(`Mission from a case ${s}`);
    await page.getByTestId('mission-briefing-input').fill('Built directly from the case that decided it was warranted.');
    // Nothing is pre-selected (plan item 0.5): say who may receive it.
    await page.getByRole('radio', { name: /^Public/ }).check();
    await page.getByTestId('create-mission-submit').click();

    await expect(page.getByTestId('mission-detail-dialog')).toBeVisible({ timeout: 20_000 });

    /**
     * It arrives RESTING ON the case, which is the half that matters. Without
     * relatedCases the mission would be created empty and the evidence gate
     * would refuse to advance it — sending the operator back through the attach
     * control to redo the link they just made.
     */
    // The case itself, named under Related Cases — not a count, which lives in
    // the list row rather than the detail dialog and made the first version of
    // this assertion fail against a mission that was in fact correctly linked.
    await expect(page.getByTestId('mission-detail-dialog')).toContainText(caseTitle);
    await expect(page.getByTestId('transition-to-PLANNING')).toBeEnabled();
  });

  test('a case somebody else opened can be picked up and carried further', async ({ page }) => {
    await land(page);

    const s = stamp();
    const reportTitle = `Handover evidence ${s}`;
    const caseTitle = `Inherited case ${s}`;
    await createReport(page, reportTitle, 'Recorded by the operator who opened the case.');
    await createCase(page, caseTitle);

    // Everything above is "the previous operator". Reloading drops all
    // in-memory state, so what follows reads the case from storage exactly as
    // somebody arriving fresh would — which is the only way to find out
    // whether a case carries its own context or lives in its author's head.
    await page.reload();
    await waitForGlobe(page);
    await settleSupportFunnel(page);
    await gotoApp(page, /Cases/, 'CASES');

    const dialog = await openConnections(page, caseTitle);

    // Nothing has been linked yet, and the screen has to SAY so rather than
    // render an empty region the reader has to interpret.
    await expect(dialog.getByTestId('no-linked-evidence')).toBeVisible();
    await expect(dialog.getByTestId('no-position')).toBeVisible();

    await attachEvidence(page, dialog, reportTitle);
    await expect(dialog.getByTestId('linked-evidence-list')).toContainText(reportTitle, { timeout: 15_000 });

    await dialog.getByTestId('position-input').fill('Picked up from a colleague; the evidence supports the original premise.');
    await dialog.getByTestId('verdict-select').selectOption('inconclusive');
    await dialog.getByTestId('state-position').click();

    // `inconclusive` is a real outcome, not a failure to reach one. An
    // adjudicator with no way to say "we looked and could not settle it" is
    // pushed toward overstating.
    await expect(dialog.getByTestId('case-position')).toContainText('inconclusive', { timeout: 15_000 });
  });
});

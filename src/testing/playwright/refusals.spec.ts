import { test, expect, type Page } from '@playwright/test';
import { waitForGlobe, settleSupportFunnel, gotoApp } from './helpers/appReady';

/**
 * The gates, driven from the outside.
 *
 * ─── WHY THESE ARE WORTH A BROWSER ─────────────────────────────────────────
 *
 * Every refusal below is already unit-tested, and every one of them was still
 * wrong in the app. The evidence gate threw where the button should have been
 * disabled. The publication gate refused case adjudications unconditionally
 * because provenance was never stated. Both had passing tests the whole time.
 *
 * A gate that only ever fires in a unit test is a gate no operator has met, so
 * nobody knows whether it explains itself, fires at the right moment, or fires
 * at all through the screen someone actually uses. Refusing well is most of
 * what makes a tool trustworthy: the moment it says no is the moment it is
 * either protecting somebody or wasting their afternoon.
 *
 * ─── WHAT IS DELIBERATELY NOT HERE ─────────────────────────────────────────
 *
 * "A classified mission refuses a public relay" is NOT driven here, and that is
 * a decision rather than an omission. The harness builds with relays forced
 * private, so the condition cannot arise; producing it would mean building with
 * public relays and then relying on the very block under test to stop a
 * classified package reaching them. A test whose safety depends on the thing it
 * is testing is not a test.
 *
 * It is covered where it can be, at service level:
 * MissionService.publishToNavcom.test.ts drives all three classified levels
 * against the real relay resolver, asserts nothing is broadcast and the mission
 * does not advance, and checks UNCLASSIFIED still passes so the gate has not
 * become a blanket refusal.
 *
 * "A relay is unreachable, so the publish queues" is likewise absent: the
 * relay's lifetime belongs to globalSetup, and a test that kills it would break
 * every test sharing the run. Covered by outboxDrain.test.ts and
 * FindingsPublisherService.test.ts, which assert a failed broadcast is durably
 * queued rather than lost.
 */

const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function land(page: Page) {
  await page.goto('/');
  await waitForGlobe(page);
  await settleSupportFunnel(page);
}

async function createCase(page: Page, title: string) {
  await gotoApp(page, /Cases/, 'CASES');
  await page.getByRole('button', { name: /new case/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^title/i).fill(title);
  await dialog.getByLabel(/^description/i).fill('Opened to exercise a refusal.');
  await dialog.getByRole('button', { name: /^create$/i }).click();
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
}

test.describe('the gates, as an operator meets them', () => {
  test.setTimeout(180_000);

  test('a mission resting on nothing is refused BEFORE the click, with a reason', async ({ page }) => {
    await land(page);
    await gotoApp(page, /Missions/, 'TEAMWORKSPACE');

    await page.getByRole('button', { name: /^missions$/i }).click({ force: true });
    await page.getByRole('button', { name: /New Mission/i }).click();
    await expect(page.getByTestId('create-mission-dialog')).toBeVisible();
    await page.getByTestId('mission-title-input').fill(`Unevidenced ${stamp()}`);
    await page.getByTestId('mission-briefing-input').fill(
      'Deliberately rests on nothing: no linked evidence, and no claim of having seen it firsthand.',
    );
    // Nothing is pre-selected (plan item 0.5): say who may receive it.
    await page.getByRole('radio', { name: /^Public/ }).check();
    await page.getByTestId('create-mission-submit').click();
    await expect(page.getByTestId('mission-detail-dialog')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('transition-to-PLANNING').click();
    await expect(page.getByTestId('mission-status-chip')).toHaveAttribute('data-status', 'PLANNING', { timeout: 15_000 });

    // Disabled, not throwing. An operator offered a step that then fails has
    // been misled about what the tool can do; the refusal belongs before the
    // click. This is the exact shape that broke mission-publish.spec.ts.
    await expect(page.getByTestId('transition-to-READY_FOR_PACKAGE')).toBeDisabled();

    // And it must SAY why. A greyed control with no explanation reads as a bug.
    await expect(page.getByTestId('needs-evidence')).toBeVisible();
    await expect(page.getByTestId('needs-evidence')).toContainText(/evidence|report|case/i);
  });

  test('publishing about a private individual is refused, and says so', async ({ page }) => {
    await land(page);

    const title = `Person subject ${stamp()}`;
    await createCase(page, title);
    // A case opens as its own page (plan item 1.2).
    await page.getByRole('button', { name: `View ${title}` }).click();
    const dialog = page.getByTestId('case-detail');
    await expect(dialog).toBeVisible();

    await dialog.getByTestId('position-input').fill('The subject was present at the meeting.');
    await dialog.getByTestId('verdict-select').selectOption('substantiated');
    await dialog.getByTestId('state-position').click();
    await expect(dialog.getByTestId('case-position')).toBeVisible({ timeout: 15_000 });

    await dialog.getByTestId('publish-subject').fill('A named individual');
    await dialog.getByTestId('publish-subject-kind').selectOption('person');
    await dialog.getByTestId('publish-position').click();

    // Refused is its OWN outcome, distinct from an error. A refusal is a
    // decision — nothing was signed and nothing was sent — while an error is an
    // outage, and offering "Retry" for a decision invites an operator to mash a
    // button that will keep saying no.
    await expect(dialog.getByTestId('publish-position')).toHaveText(/^Refused$/, { timeout: 30_000 });
    // The reason, in full, or the button simply stopped working for no cause a
    // reader can see.
    await expect(dialog).toContainText(/person|individual|consent/i);
  });

  test('a requirement past its usefulness goes stale, and stays in the queue', async ({ page }) => {
    await land(page);

    const title = `Stale requirement ${stamp()}`;
    await createCase(page, title);
    // A case opens as its own page (plan item 1.2).
    await page.getByRole('button', { name: `View ${title}` }).click();
    const dialog = page.getByTestId('case-detail');
    await expect(dialog).toBeVisible();

    await dialog.getByTestId('requirement-question').fill('Which registry holds the lease?');
    await dialog.getByTestId('requirement-because').fill('The package cannot name a liable entity without it.');
    // Yesterday. Until this control existed the field was set by nothing, so
    // the stale state was unreachable in the running app however carefully it
    // was derived.
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await dialog.getByTestId('requirement-stale-after').fill(yesterday);
    await dialog.getByTestId('raise-requirement').click();

    await expect(dialog.getByTestId('requirement-queue')).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByTestId('requirement-state-stale')).toBeVisible();

    // Still listed. Something needed and not gathered in time is exactly what a
    // collector should see; dropping it would make the queue look healthier
    // than the work is.
    await expect(dialog.getByTestId('requirement-queue')).toContainText('Which registry holds the lease?');
  });
});

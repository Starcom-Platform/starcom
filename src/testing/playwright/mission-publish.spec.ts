import { test, expect, type Page } from '@playwright/test';
import { waitForGlobe } from './helpers/appReady';

/**
 * The last leg of the pipeline, driven for real.
 *
 * pipeline-walk.spec.ts proves every stage is REACHABLE. Nothing proved the
 * Mission stage is COMPLETABLE — that a mission can actually be created,
 * moved through its status machine, and published as a signed Mission
 * Package. The existing coverage stops at the boundary that matters:
 * MissionService.publishToNavcom.test.ts mocks MissionPackageBroadcastService
 * wholesale, and jsdom cannot substitute for a browser here anyway (it drops
 * every Nostr event at verifyEvent/matchFilters, which invalidated several
 * earlier conclusions about ingest drawn from vitest).
 *
 * So this drives the real thing in a real browser: real ML-DSA-65 manifest
 * signing, real Schnorr event signing, a real WebSocket publish and relay
 * handshake. It publishes to a LOCAL relay that verifies signatures
 * (VITE_NOSTR_MISSION_RELAYS + _EXCLUSIVE=true, set at build time) rather
 * than to the five public relays — a test mission on public infrastructure
 * cannot be reliably retracted, and a relay that verifies is stronger
 * evidence than one that merely accepts.
 */

async function settleSupportFunnel(page: Page) {
  const close = page.locator('button[aria-label*="close support" i]').first();
  await close.waitFor({ state: 'visible', timeout: 45_000 }).catch(() => {});
  await close.click({ timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(500);
}

/**
 * Publishing is irreversible, so this refuses to run by default.
 *
 * The bundle under test decides where a Mission Package goes, and it is built
 * separately from this file — so a run against an ordinary build would put a
 * test package on five public relays with no way to retract it. That is not
 * hypothetical: it happened once here, because VITE_NOSTR_MISSION_RELAYS was
 * silently inert in production builds (fixed in MissionPackageBroadcastService).
 *
 * Opt in deliberately, with a build whose relay config matches:
 *   VITE_NOSTR_MISSION_RELAYS=ws://127.0.0.1:7447 \
 *   VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE=true npm run build
 *   PW_MISSION_PUBLISH_RELAY=ws://127.0.0.1:7447 npx playwright test mission-publish
 */
/**
 * Set by globalSetup, which starts the relay. Not skipped when absent any more:
 * a skip is indistinguishable from a pass, and this spec spent most of a day
 * broken and silent because of exactly that. If the harness did not run, this
 * fails and says so.
 */
const ISOLATED_RELAY = process.env.PW_MISSION_PUBLISH_RELAY ?? 'ws://127.0.0.1:7447';

test.describe('a mission can be completed, not just reached', () => {
  test('create -> PLANNING -> READY_FOR_PACKAGE -> published and DISPATCHED', async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto('/');
    // Wait for the globe to actually paint rather than for a fixed twelve
    // seconds of software rasterisation — same guarantee, a fraction of the
    // CPU, and it does not give up early on a loaded machine.
    await waitForGlobe(page);
    await settleSupportFunnel(page);

    /**
     * Create the evidence FIRST, because the mission has to rest on something.
     *
     * This spec used to create a mission with nothing linked and a briefing
     * that did not claim direct observation, then click straight through to
     * READY_FOR_PACKAGE. That worked until the evidence gate landed 39 minutes
     * after this file did, at which point the transition button became disabled
     * and the click could only time out. Nothing said so, because the whole
     * spec is skipped unless a relay is configured — so the one test that
     * drives a complete story was broken and silent for as long as nobody ran
     * it deliberately.
     *
     * Seeding real evidence is also the more honest test. A mission published
     * on the strength of the words "direct observation" exercises the escape
     * hatch; a mission carrying a report exercises the path an operator
     * actually takes.
     */
    await page.getByRole('button', { name: /IntelDashboard/ }).first().click({ force: true });
    await expect
      .poll(async () => (await page.locator('body').innerText()).match(/MISSION LANE:\s*\n?\s*(\w+)/)?.[1], { timeout: 20_000 })
      .toBe('INTELDASHBOARD');

    const reportTitle = `Evidence for publish check ${Date.now()}`;
    await page.getByTestId('new-record').click();
    await page.getByTestId('record-title').fill(reportTitle);
    await page.getByTestId('record-content').fill('Seeded so the mission below rests on something real.');
    await page.getByTestId('record-latitude').fill('51.5');
    await page.getByTestId('record-longitude').fill('-0.12');
    await page.getByTestId('create-record').click();
    await expect(page.locator('[data-testid="report-row"]', { hasText: reportTitle }))
      .toHaveCount(1, { timeout: 15_000 });

    // The bottom nav sits under docked overlays, so normal actionability stalls.
    await page.getByRole('navigation', { name: 'Main Navigation' }).getByRole('button', { name: /Missions/ }).first().click({ force: true });
    await expect
      .poll(async () => (await page.locator('body').innerText()).match(/MISSION LANE:\s*\n?\s*(\w+)/)?.[1], { timeout: 20_000 })
      .toBe('TEAMWORKSPACE');

    await page.getByRole('button', { name: /^missions$/i }).click({ force: true });
    await page.getByRole('button', { name: /New Mission/i }).click();
    await expect(page.getByTestId('create-mission-dialog')).toBeVisible();

    const stamp = `PW ${new Date().toISOString()}`;
    await page.getByTestId('mission-title-input').fill(`Pipeline completion check ${stamp}`);
    await page.getByTestId('mission-briefing-input').fill(
      'Automated end-to-end check that the Mission Package publish path completes. Published to a local verifying relay only.'
    );
    // Nothing is pre-selected (plan item 0.5): say who may receive it.
    await page.getByRole('radio', { name: /^Public/ }).check();
    await page.getByTestId('create-mission-submit').click();

    // Creating selects the new mission, which opens the detail dialog.
    await expect(page.getByTestId('mission-detail-dialog')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('mission-status-chip')).toHaveAttribute('data-status', 'DRAFT');

    // DRAFT -> PLANNING -> READY_FOR_PACKAGE are the only routes to publish;
    // PACKAGED is deliberately not offered as a generic transition button.
    // Attach it. Until this happens the mission rests on nothing, and the
    // READY_FOR_PACKAGE control is correctly disabled.
    const attach = page.getByTestId('attach-report-input');
    await attach.click();
    await attach.fill(reportTitle);
    await page.getByRole('option', { name: new RegExp(reportTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).click();
    await expect(page.getByTestId('mission-detail-dialog')).toContainText('1 report');

    await page.getByTestId('transition-to-PLANNING').click();
    await expect(page.getByTestId('mission-status-chip')).toHaveAttribute('data-status', 'PLANNING', { timeout: 15_000 });

    await page.getByTestId('transition-to-READY_FOR_PACKAGE').click();
    await expect(page.getByTestId('mission-status-chip')).toHaveAttribute('data-status', 'READY_FOR_PACKAGE', { timeout: 15_000 });

    // Publishing is irreversible, so the destination must be stated BEFORE the
    // operator commits — and it must name the relays actually configured, not
    // a hardcoded default. This is the surface that env config silently failed
    // to affect for the whole life of the feature.
    const destination = page.getByTestId('publish-destination');
    await expect(destination).toBeVisible();
    await expect(destination).toContainText(ISOLATED_RELAY);
    // This run is pointed at a private relay, and the disclosure must say so
    // in words — the whole point is that an intern can tell a sandbox from
    // irreversible public infrastructure without parsing a wss:// URL.
    await expect(destination).toContainText('nothing leaves your network');
    await expect(destination).not.toContainText('PUBLIC relays');

    await expect(page.getByTestId('publish-to-navcom')).toBeVisible();
    await page.getByTestId('publish-to-navcom').click();

    // DISPATCHED is reached ONLY when the broadcast reported success. A failed
    // broadcast leaves the mission parked at PACKAGED for manual retry, so
    // this assertion distinguishes "published" from "packaged and stranded" —
    // the exact distinction the mocked unit test cannot make.
    await expect(page.getByTestId('mission-status-chip')).toHaveAttribute('data-status', 'DISPATCHED', { timeout: 60_000 });
  });
});

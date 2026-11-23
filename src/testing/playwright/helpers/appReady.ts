import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Wait until Starcom has actually booted.
 *
 * `page.waitForLoadState('networkidle')` cannot work here and never could:
 * the app holds Nostr relay WebSockets open by design and polls on intervals,
 * so the network is never idle. Every spec that waited on it timed out after
 * 15s and then carried on asserting against the preloader — which is why one
 * of them expected the first focusable element to be "Join Team" and received
 * "STARCOM / Earth Intelligence Network / Initializing Systems...".
 *
 * The preloader unmounting is the real signal, so wait for that instead.
 */
export async function waitForAppReady(page: Page, timeout = 60_000): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('[data-testid="app-preloader"]').waitFor({ state: 'detached', timeout }).catch(() => {
    // Already gone before we looked, or this build renders no preloader.
  });
}

/**
 * Wait until the globe has actually painted.
 *
 * Specs used a flat `waitForTimeout(12_000)` for this. Under
 * `--use-angle=swiftshader` the globe rasterises entirely on the CPU, so those
 * twelve seconds are twelve seconds of every core working — and the wait was
 * both too long on a quiet machine and too short on a busy one, which is how
 * a loaded machine produced "a blank canvas" failures that looked like product
 * defects.
 *
 * Polling the real condition returns as soon as it is true and keeps waiting
 * when it is not, which is cheaper and more honest than either.
 */
export async function waitForGlobe(page: Page, minArea = 100_000, timeout = 60_000): Promise<void> {
  await waitForAppReady(page, timeout);
  await page.waitForFunction(
    (area) => Math.max(0, ...[...document.querySelectorAll('canvas')]
      .map((c) => { const b = c.getBoundingClientRect(); return Math.round(b.width * b.height); })) > area,
    minArea,
    { timeout },
  );
}

/**
 * The support funnel takes the screen once the globe has painted, and swallows
 * every click while it is up — a forced click still dispatches at coordinates
 * the modal owns.
 *
 * So it must be waited for and dismissed, never raced. Polling for it and
 * giving up quietly is what made the first version of this spec fail four
 * tests for one reason: the 12s setup wait landed before the funnel appeared,
 * dismissal no-opped, and every later click hit the modal.
 */
export async function settleSupportFunnel(page: Page) {
  const close = page.locator('button[aria-label*="close support" i]').first();
  await close.waitFor({ state: 'visible', timeout: 45_000 }).catch(() => {
    /* Genuinely absent — already snoozed, or disabled for this deployment. */
  });
  await close.click({ timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(500);
}

/** The bottom nav sits under docked overlays, so normal actionability stalls. */
export async function gotoApp(page: Page, name: RegExp, expectLane: string) {
  /**
   * Dismiss the funnel again, immediately before clicking.
   *
   * settleSupportFunnel at the top of a test dismisses whatever is on screen
   * THEN. If the funnel has not opened yet, it waits, gives up quietly, and the
   * funnel appears afterwards — over the nav bar, swallowing this click. That
   * is not hypothetical: two of three user stories failed here while the third
   * passed, and the only difference was one extra assertion in the third that
   * happened to let the funnel arrive before navigation.
   *
   * A short poll, not another 45-second wait: by this point it is either up or
   * it is not.
   */
  const funnel = page.locator('button[aria-label*="close support" i]').first();
  if (await funnel.isVisible().catch(() => false)) {
    await funnel.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(300);
  }

  // In the bar only: since K1 the bar's Missions shares its name with the
  // guide's "Open Missions" and the app's own Missions tab.
  const inBar = page.getByRole('navigation', { name: 'Main Navigation' }).getByRole('button', { name }).first();
  await inBar.click({ force: true });
  // Apps are lazy-loaded, so the FIRST navigation is a cold chunk fetch and
  // takes noticeably longer than the rest. Waiting a fixed short time made a
  // working IntelDashboard look unreachable — poll for the lane instead.
  const lane = async () =>
    (await page.locator('body').innerText()).match(/MISSION LANE:\s*\n?\s*(\w+)/)?.[1];

  // Apps are lazy-loaded, so the FIRST navigation is a cold chunk fetch and
  // takes noticeably longer than the rest. Poll rather than wait a fixed time.
  try {
    await expect.poll(lane, { timeout: 20_000 }).toBe(expectLane);
  } catch {
    // Still on the old lane: something took the click. Clear whatever is over
    // the nav and try once more, so a slow overlay costs a retry rather than
    // the test.
    await settleSupportFunnel(page);
    await inBar.click({ force: true });
    await expect.poll(lane, { timeout: 20_000 }).toBe(expectLane);
  }
}


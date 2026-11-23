import { test, expect, type Page } from '@playwright/test';
import { waitForGlobe, settleSupportFunnel, gotoApp } from './helpers/appReady';

/**
 * The whole product, walked once as a person meets it.
 *
 * Everything else in this repo tests a piece. This walks the spine the app
 * exists for — Report -> Case -> Mission -> Package -> Publish — because every
 * defect worth finding this cycle was reachability, not logic: a support modal
 * owning the first impression, a graph pane resolving to 150px of a 673px
 * container, a stored tab preference silently beating a deep-link, a
 * disclosure hidden behind the timeline. Unit tests passed through all of them.
 *
 * It asserts that each stage is REACHABLE and that its state is real, not that
 * the UI looks a particular way — the point is to notice when a stage stops
 * being reachable at all, which is the failure this codebase actually produces.
 */

test.describe('the intel pipeline, end to end', () => {
  // Only navigates. Each test then waits for exactly what it needs, because
  // the first-impression test has to observe the globe at the instant it
  // paints, and a shared wait in here would let the funnel appear first.
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  /** Everything except the first-impression test needs the funnel out of the way. */
  const clearChrome = async (page: Page) => {
    await waitForGlobe(page);
    await settleSupportFunnel(page);
  };

  test('the globe is the first thing a newcomer sees', async ({ page }) => {
    // Regression: the support funnel used to open immediately, occluding the
    // globe entirely and intercepting every control including the nav bar.
    //
    // Both facts are read IN THE SAME TICK, at the moment the globe first
    // paints. Sampling them separately — or after a fixed wait — measures
    // whichever happened to be true when the clock ran out, so a slow machine
    // failed this for arriving late rather than for showing the funnel first.
    // Precedence is the claim, so precedence is what gets measured.
    const atFirstPaint = await page.waitForFunction(() => {
      const globe = Math.max(0, ...[...document.querySelectorAll('canvas')]
        .map((c) => { const b = c.getBoundingClientRect(); return Math.round(b.width * b.height); }));
      if (globe <= 100_000) return null;
      return { globe, funnels: document.querySelectorAll('button[aria-label*="close support" i]').length };
    }, undefined, { timeout: 60_000 });

    const { globe, funnels } = await atFirstPaint.jsonValue() as { globe: number; funnels: number };
    expect(funnels, 'support funnel must not precede the globe').toBe(0);
    expect(globe, 'a rendered globe, not a blank canvas').toBeGreaterThan(100_000);
  });

  test('every pipeline stage is reachable from the nav', async ({ page }) => {
    await clearChrome(page);
    // Each of these owns a stage of the spine. A stage that cannot be opened
    // is the failure mode this walk exists to catch.
    // The lane must actually change. "No error boundary" passes even when the
    // click never navigated — the weak assertion this walk exists to avoid, and
    // one I wrote here first and had to correct.
    const stages: Array<[RegExp, string]> = [
      [/IntelDashboard/, 'INTELDASHBOARD'],
      [/IntelAnalyzer/, 'INTELANALYZER'],
      [/IntelWeb/, 'INTELWEB'],
      // Cases was absent from this list, which is the one stage that most needed
      // to be in it: it was unregistered for a long time and read as missing to
      // everyone outside, and a guard now exists specifically to catch that
      // recurrence. A test claiming "every pipeline stage" while skipping the
      // stage with that history is the weaker half of the same defect.
      [/Cases/, 'CASES'],
      [/Missions/, 'TEAMWORKSPACE'],
      [/NetRunner/, 'NETRUNNER'],
    ];
    for (const [app, lane] of stages) {
      await gotoApp(page, app, lane);
      const crashed = await page.getByText(/Something went wrong/i).count();
      expect(crashed, `${app} rendered an error boundary`).toBe(0);
    }
  });

  /**
   * The pipeline's ENTRY point, driven the way an agent would drive it.
   *
   * Test-id coverage was inverted: MissionsPanel had 15 and could be driven to
   * publication, while this console — where every pipeline run starts — had
   * none, so an agent could finish the pipeline but not begin it.
   *
   * Creating a report is also the one stage with no irreversible side effect,
   * which makes it the right place to prove drivability without publishing.
   */
  test('an intel report can be created through the console, as an agent would', async ({ page }) => {
    await clearChrome(page);
    await gotoApp(page, /IntelDashboard/, 'INTELDASHBOARD');

    await page.getByTestId('new-record').click();

    const title = `Agent-created report ${Date.now()}`;
    await page.getByTestId('record-title').fill(title);
    await page.getByTestId('record-content').fill('Created by the pipeline walk to prove the entry point is drivable.');
    // Coordinates matter: a report without them never reaches the globe, which
    // is the surface this whole pipeline feeds.
    await page.getByTestId('record-latitude').fill('51.5');
    await page.getByTestId('record-longitude').fill('-0.12');

    await page.getByTestId('create-record').click();

    // Addressable by its own id, not by position in the list.
    const row = page.locator('[data-testid="report-row"]', { hasText: title });
    await expect(row).toHaveCount(1, { timeout: 15_000 });
  });

  test('IntelWeb draws a graph in the space it was given', async ({ page }) => {
    await clearChrome(page);
    // Regression: the graph resolved to 840x150 inside a 673px-tall pane
    // because its container was sized by content that was sized by the
    // container. Non-zero is not the bar; using the pane is.
    await gotoApp(page, /IntelWeb/, 'INTELWEB');
    await page.waitForTimeout(6_000);

    const box = await page.evaluate(() => {
      const el = document.querySelector('.graph-engine-wrapper');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    expect(box, 'graph pane present').not.toBeNull();
    expect(box!.h, 'graph pane must use its container, not collapse into a strip').toBeGreaterThan(400);
  });

  test('the globe discloses what it is not showing, legibly', async ({ page }) => {
    await clearChrome(page);
    // The analysis layer is only defensible because its caveats are readable.
    // Regression: this sat under the temporal scrubber at a lower z-index.
    const status = page.locator('[data-testid="globe-intel-status"]');
    if (await status.count() === 0) test.skip(true, 'nothing to disclose in this working set');

    const box = await status.first().boundingBox();
    expect(box, 'disclosure has a real box').not.toBeNull();
    expect(box!.height, 'disclosure is not collapsed').toBeGreaterThan(10);

    // Nothing FOREIGN may sit on top of the thing that makes the layer honest.
    //
    // The disclosure sets pointer-events: none so it never blocks the globe
    // underneath, which means hit-testing skips it and returns its dock slot —
    // an ANCESTOR. An earlier version of this check accepted only self or a
    // descendant and so reported the panel as occluded by its own wrapper.
    // What actually matters is whether the topmost element belongs to the same
    // subtree; anything else genuinely covers it.
    const covered = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="globe-intel-status"]') as HTMLElement | null;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (!top) return true;
      return !(top === el || el.contains(top) || top.contains(el));
    });
    expect(covered, 'disclosure is occluded by other chrome').toBe(false);
  });
});

const { defineConfig, devices } = require('@playwright/test');

/**
 * There was no default Playwright config at all.
 *
 * Without one, `playwright test` used its built-in defaults: testDir = the
 * repo root, testMatch = every *.spec.* and *.test.* file in the tree. That
 * swept in the vitest suite and the visual specs (which have their own config
 * and loader), so the run collapsed on module-resolution errors — and then
 * reported "Total: 0 tests in 0 files" and EXITED 0.
 *
 * Which is how `npm run test:a11y` came to pass while running nothing. The
 * accessibility tests were real and present the whole time; nothing selected
 * them, and the runner called that success.
 *
 * The `--grep 'accessibility'` in that script could never have matched either:
 * grep filters test TITLES, the titles begin "Accessibility", and the match is
 * case-sensitive. The scripts now select by PATH, which fails loudly when a
 * file moves instead of silently matching nothing.
 *
 * CommonJS (.cjs), not .ts: package.json sets "type": "module", so a .ts or
 * .mjs config is loaded as ESM, and Playwright refused that below Node 18.19 —
 * which the project was on when this was written. It now requires >=22.12 and
 * a guard enforces it, so the constraint no longer binds; the file stays .cjs
 * because changing it buys nothing and the globalSetup beside it is .mjs
 * regardless, loaded by Playwright's own loader.
 */
const PORT = Number(process.env.PW_PORT ?? 4173);

module.exports = defineConfig({
  testDir: './src/testing/playwright',
  testIgnore: ['**/tests/visual/**'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PW_BASE_URL ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // The globe needs a GL context. Headless Chromium has no GPU, and
          // without these it reports "a WebGL context could not be created" —
          // which a previous investigation misread as the app being broken.
          args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        },
      },
    },
  ],
  /**
   * Starts the isolated relay, and points PW_MISSION_PUBLISH_RELAY at it, so
   * mission-publish.spec.ts runs by default instead of skipping itself.
   */
  globalSetup: require.resolve('./src/testing/playwright/globalSetup.mjs'),
  webServer: {
    /**
     * BUILT with the isolation env, not merely previewed.
     *
     * VITE_ variables are inlined at build time, so `vite preview` alone serves
     * whatever the last build baked in — which for a normal build is the public
     * relay set. The publish spec would then be aimed at real infrastructure.
     *
     * The build costs time on a cold run and none on a warm one, since
     * reuseExistingServer skips the whole command when a server is already up.
     * That reuse is also the one hole left here: a preview already running from
     * an unisolated build gets reused. The spec closes it by asserting the
     * destination disclosure BEFORE clicking publish — it names this relay and
     * says "nothing leaves your network", or the test fails without publishing.
     */
    /**
     * The heap bump is not optional: package.json's own build script carries
     * NODE_OPTIONS='--max-old-space-size=8192', and a bare `vite build` here
     * died with "Abort trap: 6" and a V8 heap trace partway through this run.
     * Playwright reports that as "Process from config.webServer was not able to
     * start", which reads like a port or command problem rather than an OOM.
     */
    command: `NODE_OPTIONS='--max-old-space-size=8192' npx vite build && npx vite preview --port ${PORT}`,
    env: {
      ...process.env,
      VITE_NOSTR_MISSION_RELAYS: process.env.PW_MISSION_PUBLISH_RELAY ?? 'ws://127.0.0.1:7447',
      VITE_NOSTR_MISSION_RELAYS_EXCLUSIVE: 'true',
      // Findings too. The analyzer's "Publish Finding" is one click from a
      // corroborated finding and used to have exactly one destination: five
      // public relays, hardcoded. Any browser test that reached that button
      // would have repeated the accidental publish this project already had.
      VITE_NOSTR_FINDING_RELAYS: process.env.PW_MISSION_PUBLISH_RELAY ?? 'ws://127.0.0.1:7447',
      VITE_NOSTR_FINDING_RELAYS_EXCLUSIVE: 'true',
    },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    // The command now BUILDS before it previews, and a cold vite build of this
    // app exceeds two minutes on a loaded machine. 120s was sized for a bare
    // preview and turned a slow build into "Timed out waiting from
    // config.webServer", which reads like a hung server rather than a build
    // still running.
    timeout: 420_000,
  },
});

/**
 * The default config, which is the stable config.
 *
 * ─── WHY THIS FILE NO LONGER HAS CONTENTS OF ITS OWN ───────────────────────
 *
 * It had a second copy of everything: its own alias list, its own exclude
 * list, its own runtime settings. Being the DEFAULT, it is what a bare
 * `npx vitest` picks up and what `npm run test:full` runs — so it was the
 * config a developer met first, and it was the worse of the two.
 *
 * By the time it was looked at properly it was wrong in four ways at once:
 *
 *   It excluded three Auth test globs that no longer match anything, because
 *   those files were deleted — they tested a wallet stack this project removed.
 *
 *   Its `deps.inline` named `wagmi` and `@rainbow-me/rainbowkit`, neither of
 *   which is a dependency any more, under `test.deps.inline` — the spelling
 *   Vitest replaced with `server.deps.inline` before version 2. Installed here
 *   is 3.2.7, so the whole block was almost certainly inert.
 *
 *   It carried none of the exclusions that were measured one file at a time:
 *   the two documented OOM crashers, the two 3D suites that throw unhandled
 *   three.js exceptions, the leaking deep-link test. Running it collected files
 *   already known to take the process down.
 *
 *   And `poolOptions.forks.singleFork: true` ran the entire suite in one
 *   process — which scripts/run-sharded-tests.sh exists precisely because it
 *   cannot survive. That is the most likely source of the "275 files failing"
 *   figure that verify.mjs asserted for months without a mechanism that could
 *   produce it.
 *
 * Two configs that are supposed to agree, and do not, is the drift the shared
 * quarantine list was already written to prevent. There is now one.
 *
 * ─── THE ONE THING WORTH KEEPING FROM THE OLD FILE ─────────────────────────
 *
 * It set `VITE_EIA_API_KEY` for tests, and that value was once a REAL, working
 * EIA credential sitting in a tracked file under the label "Mock env for
 * tests" — the label is why nobody looked at it. It was later replaced with an
 * obviously synthetic string, and is now simply absent: nothing needs it.
 * Tests touching EIA either mock the transport or assert the no-credential
 * path, which is production's actual state, and they pass without it.
 *
 * The incident is recorded here rather than deleted with the line, because the
 * lesson is about the label, not the key.
 */
export { default } from './vitest.stable.config';

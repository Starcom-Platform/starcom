# Intern tasks: ready to start

Written 22 November 2026 for the Starcom Academy cohort that starts on 1 December, and for whoever hands the tasks
out. Each task is small enough to finish, says why it matters, which files to read first, what to do, and how
anyone can tell it is done. A task is done when its check passes and a core reviewer has read the change, not when
the code compiles.

## How work is done here

- **Node 22.** The shell may default to Node 18, under which some tests hang. Use nvm's Node 22
  (`nvm use 22`), and check with `node -v`.
- **Checks before every commit:**
  - `npm run typecheck`. Not `npx tsc -p tsconfig.json`: the root config lists no files, so that command checks
    nothing and passes.
  - `npm run guards`.
  - The tests near what you changed, with `npx vitest run <folder>`, and the full suite, with `npx vitest run`,
    before you ask for review.
- **The walk.** The walk drives two real browsers through the people's stories (`docs/missions/03-pipeline/
  user-stories.md`) against a stand-in relay:
  1. Build and serve: `npx vite build && npx vite preview --port 5210`.
  2. Walk: `node scripts/audit-intern.mjs http://localhost:5210 --only=S35`.
- **The guards fail the build:**
  - A new file another file imports must be added to git.
  - A function exported only for a test is refused: test through what the app really calls.
- **Never publish to the public relays from a script,** except as the live check of 22 November did (see audit
  findings 20 to 23): with a throwaway key, a test tag that no Starcom globe reads, and everything deleted at the
  end. Never make a script pose as a browser to get past a relay's rules.
- **Words.** What a person sees is written in plain sentences, in all six languages (`src/i18n/app/`). Commit
  messages say what changed for people, and name the decision or finding they serve.

## The tasks

### 1. Measure the relay software for the desktop (work package D1)

- **Why:** Starcom Desktop will run a personal relay on the person's own computer (decision D-DR). The decision
  is to embed a proven relay, never one written here, chosen by measurement.
- **Read first:**
  - `docs/missions/01-architecture-decisions/desktop-relay.md` (DR3 and DR9);
  - `docs/missions/04-plan/relay-capability-work.md` (D1);
  - `desktop/docs/security/browsing-key-boundary.md`.
- **Do:** build and run nostr-rs-relay and khatru, and any other proven relay you find that fits, on macOS,
  Windows and Linux. For each, measure:
  - whether it builds on all three;
  - NIP-77;
  - a write policy hook;
  - whether it can refuse a connection by its `Origin` header (test with a page on `https://example.com` and
    with the origin `starcom://app`);
  - binding to 127.0.0.1 on a port it is given;
  - memory and disk at rest, and holding 100,000 notes;
  - start time;
  - its licence against AGPL-3.0.
- **Done when:** the measured table, the choice and the reason are in D-DR, with the exact build commands, so
  anyone can repeat them.
- **Size:** 3 to 5 days. **Suits** someone at home with Rust or Go builds.

### 2. Make the check of what Uplink signs without asking permanent (audit finding 15)

- **Why:** Starcom Uplink, the browser extension, signs some kinds of event without asking the person. It must
  never do that for anything public. Today the list is right, but nothing keeps it right.
- **Read first:**
  - `src/extension/uplink/signerRules.ts` (`QUIET_KINDS`);
  - `src/services/nostr/kindRegistry.ts` (`KIND_USE`);
  - `docs/missions/01-architecture-decisions/browser-extension.md` (E3, EX41);
  - finding 15 in `docs/missions/00-current-state/ein-transition-audit-2026-11-21.md`.
- **Do:** a test that fails unless every quiet kind is one of these:
  - ephemeral, which relays do not keep (20000 to 29999);
  - sealed or private (4, 13, 14, 1059);
  - signing in to a relay (22242).

  It must also fail if any quiet kind is one `KIND_USE` says Starcom publishes. Then mark finding 15 fixed in the
  audit.
- **Done when:** the test passes, and fails when you add a public kind such as 30023 to the quiet list (try it,
  then take it out).
- **Size:** half a day to a day.

### 3. A daily, read-only relay health check (audit findings 20 and 23)

- **Why:** relay.wellorder.net, one of the five relays reports go to, was down on 22 November. Whether to replace
  it, and with what, should rest on a week of measurement, not one afternoon.
- **Read first:**
  - findings 20 to 23 and "The live relay check" in the audit;
  - `src/services/nostr/publishTargets.ts`;
  - `scripts/guard-retired-relays.mjs`, which shows how a relay is retired.
- **Do:** `scripts/relay-health.mjs`. For each relay Starcom publishes to or reads from, it:
  - reads the relay's information (NIP-11);
  - opens a WebSocket;
  - asks for one note (`limit: 1`);
  - writes whether each step worked, and how long it took, to a dated JSON file.

  It publishes nothing, and it does not disguise itself. relay.damus.io refuses clients that are not browsers;
  record that as what it is. Run it daily for a week.
- **Done when:** the script is committed and a week of results is written up as a recommendation: keep
  relay.wellorder.net, or replace it with a named relay and the measurements behind it.
- **Size:** 1 to 2 days, then a few minutes a day.

### 4. Readable names in Entity Review (story S28, plan item 3.6)

- **Why:** IntelAnalyzer's Entity Review asks whether two records are one organisation. It shows each pair as two
  bare numbers (`31570010000000034433 ~ 31570010000000033463`), so nobody can judge.
- **Read first:**
  - `src/applications/intelanalyzer/panels/EntityResolutionPanel.tsx`;
  - story S28 in `docs/missions/03-pipeline/user-stories.md`;
  - plan item 3.6 in `docs/missions/04-plan/intern-readiness-plan.md`.
- **Do:**
  - show each record by its name and what it is, from the records themselves;
  - keep the identifiers behind a "Details" control;
  - put the words in all six languages.
- **Done when:** a component test with two named records shows their names, not their numbers.
- **Size:** 2 to 3 days.

### 5. A walk story for settling a report with no connection (work package W1b)

- **Why:** Settle and Challenge on a mission's reports now wait on the device when no relay answers. The unit
  tests cover it; no browser walk does yet.
- **Read first:** stories S31, S35 and S36 in `scripts/audit-intern.mjs`.
  - S31 sets up a report on a mission.
  - S35 and S36 cut the network with `h.refuseEvents(...)` and `context.setOffline(true)`.
- **Do:** S37. After S31, Priya cuts her connection and presses Settle. The report says her settlement waits to
  send. She comes back online, and the report reads "settled by its publisher". Add the story's row to
  `user-stories.md`.
- **Done when:** `--only=S31,S37` reports both WORKS.
- **Size:** 1 day.

### 6. The unused post-quantum key publisher (audit finding 12)

- **Why:** `src/services/crypto/PQCKeyPublisher.ts` (260 lines) has no caller. A mission's root capability grant
  is made (`mintRootGrantSigned`) but never published. Code nobody runs still has to be read, kept and trusted.
- **Read first:**
  - finding 12 in the audit;
  - `docs/missions/00-current-state/post-quantum.md`;
  - the history of both files, with `git log -S publishPQCPublicKey` and `git log -S mintRootGrantSigned`.
- **Do:** a one-page note in `docs/missions/00-current-state/`. It says what each was for, whether the interchange
  spec (`docs/spec/`) or NavCom expects either, and what to do: remove it, or publish it and say so in the spec.
  The owner decides. If removal is chosen, remove it.
- **Done when:** the note is written and decided. After a removal, `npm run typecheck`, `npm run guards` and the
  full suite pass.
- **Size:** 1 day, plus the decision.

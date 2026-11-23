# Open source and many instances: the work, scoped

Written 22 November 2026 against `a759b777`. It turns the "Many Starcoms" tab of the EIN plan ("EIN at global scale:
the plan, with Starcom as the reference") into work in this repository. That tab holds the reasoning: the players,
the incentives, and why each rule below makes many instances strengthen the EIN rather than split it. This file holds
the packages, each ending in a check.

## Where it stands

As of 22 Nov. What has happened since is under "Progress, 23 Nov" in step 1.

- **Licence.**
  - The repository is private, and licensed AGPL-3.0-only (`LICENSE`, `package.json`).
  - The specs in `docs/spec/` are Apache-2.0.
  - Which licence path the open version takes is the owner's decision (D-CS, CS4).
- **The public mirror.**
  - `scripts/publish-public-mirror.mjs` builds a fresh tree from HEAD, with no history. It leaves out archives, old
    docs and contracts, scans for secrets, and checks dependency licences and `THIRD-PARTY.md`.
  - It has never been pushed. Since 23 Nov its target is `Starcom-Platform/starcom`, one of four public repositories
    the owner made under two organizations (below).
  - The dry run on 22 Nov built 5,029 files (136 MB) and refused one thing: `THIRD-PARTY.md` still marks
    `public/eco-natural/volcanoes-baked.json` "TO VERIFY".
- **Desktop.** It is a submodule pointing at a private repository (`.gitmodules`). `git archive` leaves it empty, but
  `.gitmodules` still names it.
- **CI: none, by the owner's choice (23 Nov):** "No CI; we're using AI to build the app."
  - The workflow files are removed.
  - GitHub Actions are off on all seven repositories: the four public ones, `Jthora/starcom-app`,
    `Jthora/starcom-desktop` and `Jthora/starcom-desktop-releases`.
  - `npm run verify` is the gate, run locally. The release script's `--verify` runs it in the public tree as a fresh
    clone would.
- **Contributors.** There is a pull request template; there is no CONTRIBUTING, code of conduct, root SECURITY.md
  or issue template. `public/.well-known/security.txt` exists.
- **Instance identity.**
  - `scripts/publish-node-descriptor.mjs` defaults to Starcom's own node key (`NODE_NOSTR_PUBKEY` in
    `src/config/nodeIdentity.ts`), so any build describes itself as Starcom's node.
  - 27 source files assume the starcom.app address; Uplink answers only starcom.app (`src/extension/uplink/
    handlers.ts`).
- **Moving between instances.** Cases and missions travel as signed bundles (story S25); there is no export of a
  whole workspace.
- **Versions.** The app is at 0.1.2, with no tags, releases or changelog.

## The public repositories (23 Nov)

The owner's private repositories (`Jthora/starcom-app`, `Jthora/starcom-desktop`) stay the working ones; these four
receive the public works (decision 2).

| Repository | Licence | Holds |
|---|---|---|
| `Starcom-Platform/starcom` | AGPL-3.0, the FSF text word for word | The web app and Uplink, pushed by `scripts/publish-public-mirror.mjs` |
| `Earth-Intelligence-Network/ein-standards` | Apache-2.0, identical to `docs/spec/LICENSE` | The EIN's specs, vectors and kind registry, moved here in step 3 |
| `Starcom-Platform/starcom-desktop` | AGPL-3.0 | The desktop app, once published; its private repository is licensed AGPL-3.0-only since 23 Nov |
| `Starcom-Platform/starcom-desktop-releases` | (empty) | To be replaced by a transfer of `Jthora/starcom-desktop-releases`, which keeps v0.2.0 and v0.2.1 and redirects their links |

**Set on 23 Nov:**
- descriptions, websites and topics;
- wikis off, since the docs live in the repositories;
- GitHub's private vulnerability reporting on.

**Still to do:**
- **The transfer.** Removing the empty repository needs the CLI's `delete_repo` scope.
- **The organizations' policy** that only owners create public repositories. It needs the `admin:org` scope.
- **Two-factor authentication for members.** It is set only on each organization's settings page; there is no API
  for it.
- ~~Protect `main`~~: done on 23 Nov, in all three repositories with content, against force-pushes and deletion. There
  is no CI, so no check is required.

**The release script** builds on the public repository's history, and refuses to commit when the public repository
holds commits it did not make, such as a contributor's merged pull request. Those are brought into the private
repository first, so the next push cannot undo them.

## Step 1: release (now to mid-December)

| # | Package | Where | Done when | Size | Who |
|---|---|---|---|---|---|
| O1 | Verify the volcano data's terms (the Smithsonian's, an open item since October) and record them | `THIRD-PARTY.md`, `public/data/README.md` | The mirror's dry run says "Checks passed" | S | Owner reads the terms; core records them |
| O2 | Leave Starcom-only parts out of the mirror: `.gitmodules` and `desktop/` (until decision 4), and `attestation-publish.yml` | `scripts/publish-public-mirror.mjs` | The dry run lists them as left out; a test of the exclusion list | S | Core |
| O3 | ~~CI on every pull request~~: cancelled by the owner on 23 Nov (no CI) | | | | |
| O4 | Contributor files | `CONTRIBUTING.md` (from "How work is done here" in `intern-tasks.md`), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md` (pointing to `security.txt`), `.github/ISSUE_TEMPLATE/` (a bug, a story, a proposal) | Each exists, and the README links them | S | An intern, with core |
| O5 | Sign-off on every commit (DCO), adopted 23 Nov: checked by the maintainer before a merge, and required by GitHub for web edits | `CONTRIBUTING.md` | An unsigned commit is not merged | S | Core |
| O6 | A human read of the published docs: the 22 files under `docs/missions/` that discuss funding, grants or counsel, and anything else the owner would not publish | `docs/missions/` | Each is kept, edited or moved out of `DOCS_PUBLISHED` | S | Owner |
| O7 | The six intern tasks as the first public issues | GitHub | Each issue links its brief | S | Core |

**Gate:** the dry run passes; `--verify` passes; decisions 1 to 4 are made. Then the first push, with `--push`, on
the owner's go.

**Progress, 22 Nov.**
- **O1, drafted.** GVP's citation and terms are recorded in `THIRD-PARTY.md` and the source register (`gvp`), read
  through a search because GVP's pages refuse automated readers. Every card that draws the volcanoes credits GVP; it
  did not before. The commercial build leaves the volcanoes out until the terms are confirmed for it.
  - The "TO VERIFY" marker stays until the owner reads the terms in a browser and decides whether the database, "a
    product of U.S. government employees", is outside the Smithsonian's non-commercial term.
- **O2, done.** The mirror leaves out `.gitmodules`, `desktop/`, and any workflow, and names them.
- **O3, cancelled by the owner (23 Nov):** no CI. The fresh-clone check stays: `--verify` on the mirror script
  installs the public tree and runs `npm run verify` in it.
- **O4, done:** `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue templates, and a general pull request
  template in place of the globe-only checklist.
  - The contributor guide says outside pull requests wait on decision 1.
- **O13, begun:** `CHANGELOG.md` with the numbering rules. The first public release becomes 0.2.0 and gets the first
  tag.
- **Found on the way (O14):** the source register's test scanned only `public/data`, so the volcano data sat
  unregistered. The test now scans `public/eco-natural` too. `public/geopolitical` is still outside it, and its data
  (Natural Earth, USGS minerals, UN Comtrade trade routes, the ZSP Zones) has no register entry. So the commercial
  build cannot yet tell whether it may carry it: UN Comtrade's terms speak of a free application. Register those
  sources, and widen the test to `public/geopolitical`.

**Progress, 23 Nov.**
- **Released.** 0.2.0 is on `Starcom-Platform/starcom`, tagged `v0.2.0` with a release page, from one root commit
  whose author is the public identity. Discussions are on. `--verify` passed first, as a fresh clone.
- **O1, held back instead:** the volcano data stays out of the public tree until its terms are verified; its bake
  script is published.
- **O5, done:** sign-off is required by GitHub for web edits, and checked by the maintainer before a merge.
- **Documentation for outside developers** (the review "Starcom's public switch-over", Phase A):
  - new: `docs/ARCHITECTURE.md`, `docs/GLOSSARY.md`, `docs/TESTING.md`, `docs/LANGUAGES.md`, `extension/README.md`,
    `data/README.md`, `CITATION.cff`, an index of the decision records, and `docs/spec/kinds.md`, generated from the
    kind registry and held to it by `npm run guards`;
  - the README's "Start here" says which of six journeys works today; the spec index says where to start;
  - the mirror checks that every entry document's links resolve in the public tree, and drops empty folders.
- **Found on the way:**
  - The 30083 row in the interchange spec said "regular"; it is addressable. Corrected, with a note.
  - `npm test` skipped five folders (39 test files), among them the language test; the shards now name them.
  - `npm run test:live` collects no files and passes (`docs/TESTING.md`).
  - No check catches a translation that drops a `{placeholder}`.
  - The walk exits 0 with BROKEN stories.

## Step 2: instances (December to February)

| # | Package | Where | Done when | Size |
|---|---|---|---|---|
| O8 | One instance profile: name, address, node keys, relay sets, default lists, and the addresses Uplink may answer. starcom.app's is the default; another build supplies its own file | `src/config/instance.json` (as `publishers.json` is), read by `publicInfrastructure.ts`, `nodeIdentity.ts` and the scripts | The 27 files that name starcom.app read it, or say why they need not (a test lists any that name it outside the profile) | M |
| O9 | No build claims Starcom's node unless it is starcom.app: the descriptor script refuses Starcom's node key with any other address | `scripts/publish-node-descriptor.mjs`; a guard | A build with another address and no key of its own publishes no node identity, and says why | S |
| O10 | The descriptor states the spec revision, the profiles passed, the source commit, and how the instance's defaults differ from the reference set | `scripts/publish-node-descriptor.mjs` | The fields are present, and a guard checks them against the vectors that ran in the build | S |
| O11 | Export a whole workspace as signed bundles, and open it on another instance | `src/services/intel/bundles/`, Settings | A walk story moves a person's reports, cases and missions from one instance to another; no key leaves the device | M |
| O12 | Uplink answers another instance only when the person adds it, showing that instance's name and whether its build is attested | `src/extension/uplink/handlers.ts` (`isStarcomPage`), `extension/entrypoints/starcom-bridge.content.ts` (registered for the added address), `extension/permissions.json` (the reason, word for word) | Handler tests; the permissions guard passes; the store listing says so | M |
| O13 | Numbered releases: semantic versions, a changelog naming the spec revision each release speaks, tagged releases | `package.json`, `CHANGELOG.md`, `scripts/update-version.sh` | The next deploy carries a tag and a changelog entry | S |

**Gate:** a second instance, run by someone else, and starcom.app each read and publish the other's reports.

## Steps 3 and 4

Recorded on the tab, built later:

- **Step 3, compatibility and conformance:**
  - the compatibility suite (the Reader and Publisher vectors plus a subset of the walk);
  - the name policy;
  - an extension range in the kind registry;
  - the versioning policy, under which every release reads the current spec revision and the two before it;
  - scheduled node probes with published results, growing from intern task 3 and the live relay check of 22 Nov.
- **Step 4, federation:**
  - the standards in a neutral EIN home;
  - the directory and default lists signed by several members;
  - an instance directory;
  - the three-implementations rule for breaking changes.

## Decisions for the owner

These are the tab's own decisions:

1. **The licence path:** sign-off (recommended) or a contributor licence agreement, with counsel.
2. **Where development happens after release:** decided 23 Nov. The private repositories stay the working ones, and
   the public repositories receive the public works.
3. **The name:** "Starcom" for builds that pass the reference suite and keep the refusals (recommended).
4. **Starcom Desktop:** opened under the AGPL at its next release (recommended).
5. **The support window:** the current spec revision and the two before it (recommended).
6. **The first outside instance:** invite one partner to run it (recommended).

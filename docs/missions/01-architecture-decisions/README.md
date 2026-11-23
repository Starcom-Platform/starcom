# Architecture decisions

Each file here is a decision record. It says what was asked, what was found,
what was decided and why, and often what was built afterwards. Code comments,
tests, guards and commit messages cite records by their ID (for example,
`decision D-EX` in `extension/wxt.config.ts`), so the ID leads from a line of
code to the reasoning behind it. Some records are a page long. Others, such as
`globe-visualization.md`, `psi-watch.md` and `browser-extension.md`, are long
working logs, with step notes added as the work went on. Commit hashes cited
in the records refer to the history of Starcom's private working repository,
which the public repository does not contain.

The table lists all 54 records. They are sorted by ID: the `D-` records
alphabetically, then D1 and D2, the block G items, K5–K7 and RS44, and last
the four records with no ID, by title. "Status" and "Decided" give what each
record says about itself. "Not stated" means the record does not say. "Has
build notes" means the record has no status line but does have notes on what
was built. Two records are not in the public repository yet, so they are
listed without a link.

| ID | Title | Status | Decided | File |
|---|---|---|---|---|
| D-AW | Decision D-AW — AI Watch | started 2026-10-12; AW1–AW6 decided the same day; steps 1–4 live, step 5 later | 2026-10-12 | [ai-watch.md](ai-watch.md) |
| D-B | Decision D-B — a Mission is downstream of a Case | decided; supersedes the "Report → Case/Mission attachment" framing in `../03-pipeline/README.md` | not stated | [mission-downstream-of-case.md](mission-downstream-of-case.md) |
| D-BF | Decision D-BF — Four public-record feeds for the Opportunity Board (K11) | decided (BF1–BF6); building in the record's order | 2026-10-13 | [board-feeds.md](board-feeds.md) |
| D-C | Decision D-C — the globe is an evidentiary display | decided | not stated | [globe-is-an-evidentiary-display.md](globe-is-an-evidentiary-display.md) |
| D-CM | Compare any two (D-CM) | not stated; has build notes | 2026-11-04 | [compare.md](compare.md) |
| D-CP | The command palette (D-CP) | not stated; has build notes | 2026-11-04 | [command-palette.md](command-palette.md) |
| D-CS | A non-commercial and a commercial Starcom | not public yet | 2026-11-11 | `commercial-split.md`, not public yet |
| D-CT | Decision D-CT: click-through to sources, and the big-three filter | "built 2026-10-16 on branch `clickthrough-bigthree`, not pushed" (the work has since reached main) | not stated (built 2026-10-16) | [click-through-and-big-three.md](click-through-and-big-three.md) |
| D-CU | Decision D-CU — Civil Unrest | decided (CU1–CU4); plan H8, due Fri 13 Nov | 2026-10-26 | [civil-unrest.md](civil-unrest.md) |
| D-D | Decision D-D — Starcom is a faithful reader of the network | decided and implemented | not stated | [faithful-reader-of-the-network.md](faithful-reader-of-the-network.md) |
| D-DP | Decision D-DP — Diplomacy for education and investigation (K12) | decided (DP1–DP8); building in the record's order | 2026-10-13 | [diplomacy.md](diplomacy.md) |
| D-DR | Decision D-DR: The desktop app as a relay | proposed, stage 1 only; not built | not decided (proposed 2026-11-21) | [desktop-relay.md](desktop-relay.md) |
| D-E | Decision D-E — one model of time | decided | 2026-09-13 | [time-model.md](time-model.md) |
| D-EQ | Earthquakes: beyond Earthquake 3D (D-EQ) | not stated; has build notes | 2026-11-03 | [earthquakes.md](earthquakes.md) |
| D-EX | Decision D-EX — the Starcom browser extension | planned and decided; EX1–EX8 taken the same day | 2026-10-11 | [browser-extension.md](browser-extension.md) |
| D-F | Decision D-F — what the globe shows first, and what a card carries | decided | 2026-09-15 | [globe-visualization.md](globe-visualization.md) |
| D-FO | France's overseas regions as territories (D-FO) | not stated; has build notes (8 Nov 2026) | 2026-11-08 | [france-overseas.md](france-overseas.md) |
| D-GV | Decision record D-GV: the globe's visuals, overhauled | planned and decided (GV1–GV8) | 2026-10-23 | [globe-visuals-overhaul.md](globe-visuals-overhaul.md) |
| D-HW | Decision D-HW — Hero Watch | started 2026-10-10; HW1–HW9 decided the same day | 2026-10-10 | [hero-watch.md](hero-watch.md) |
| D-IW | Decision D-IW — IntelWeb's structure (K9) | decided (IW1–IW4); building in the record's order | 2026-10-12 | [intelweb.md](intelweb.md) |
| D-IWN | Decision D-IWN — The first view is Intel Watch | decided by the operator; built the same day | 2026-11-07 | [intel-watch-name.md](intel-watch-name.md) |
| D-KL | Decision D-KL — A passphrase lock on the browser's own key | decided by the owner; built the same day | 2026-11-20 | [key-lock.md](key-lock.md) |
| D-L | Data licensing | not public yet | 2026-10-05 | `data-licensing.md`, not public yet |
| D-LD | Decision D-LD — The Market Exchange becomes a lead desk (K10) | decided (LD1–LD3); building in the record's order | 2026-10-13 | [lead-desk.md](lead-desk.md) |
| D-LS | Decision D-LS — A real loading state for every layer (critique C4) | decided (LS1–LS7); built 2026-10-17 | 2026-10-16; 2026-10-17 | [loading-states.md](loading-states.md) |
| D-MF | Decision D-MF — Missions, where the first visit gives up (C1, C2) | diagnosed and decided (MF1–MF3); building in the record's order | 2026-10-16 | [missions-first-visit.md](missions-first-visit.md) |
| D-MG | Decision D-MG — the mini-globe | started 2026-10-11; MG1–MG3 decided the same day | 2026-10-11 | [mini-globe.md](mini-globe.md) |
| D-ML | Decision D-ML — Starcom in many languages | not stated; has build notes | 2026-10-12 | [multilingual.md](multilingual.md) |
| D-MX | Mission interchange with NavCom (decision D-MX) | decided (MX1–MX27), with MX28–MX32 added later | 2026-10-06 (MX28–MX32 to 2026-10-23) | [mission-interchange.md](mission-interchange.md) |
| D-NP | Decision D-NP — Names as published | decided by the operator (NP1–NP5, the recommended set) | 2026-10-13 | [names-as-published.md](names-as-published.md) |
| D-PW | Decision D-PW — Psi Watch, the PsiOps Briefing and PsiOps share | decided (PW1–PW8) | 2026-10-26 | [psi-watch.md](psi-watch.md) |
| D-RF | RLSH sign-up by NavCom's card (D-RF) | not stated; has build notes | 2026-11-10 | [rlsh-signup.md](rlsh-signup.md) |
| D-RP | Decision D-RP: Publishing one report to the globe | decided by the owner; built the same day; withdrawal (RP7) decided and built that evening | 2026-11-20 | [report-publishing.md](report-publishing.md) |
| D-RR | RLSH recurrence missions (D-RR) | decided; building | 2026-11-11 | [rlsh-recurrence.md](rlsh-recurrence.md) |
| D-RS | Decision D-RS — The roster: every kind of work, alone and together | decided (RS1–RS40); steps 1–7 built 2026-10-17 | 2026-10-16; 2026-10-17 | [roster.md](roster.md) |
| D-ST | Stories (D-ST) | not stated; has build notes | 2026-11-09; 2026-11-10 | [stories.md](stories.md) |
| D-SW | Space weather on the globe (decision D-SW) | not stated; has build notes | 2026-10-10 (later items to 2026-10-25) | [space-weather-visualization.md](space-weather-visualization.md) |
| D-W | Weather on the globe: heat, clouds, wind and rain (decision D-W) | decided by the owner (its opening line) | 2026-10-05 (WX8–WX12 2026-10-06) | [weather-visualization.md](weather-visualization.md) |
| D-WL | Watchlists and pings (D-WL) | not stated; has build notes | 2026-11-05; 2026-11-08 | [watchlists.md](watchlists.md) |
| D-ZR | Decision D-ZR: the whole globe, re-sliced | not stated; recorded to replace D-ZS's Zones once the new partition lands, and its notes record that swap done on 2026-10-26 | 2026-10-17 (later items to 2026-10-25) | [zones-reslice.md](zones-reslice.md) |
| D-ZS | Decision D-ZS: Zones, their Sectors, and Spheres | superseded for Zones by D-ZR (2026-10-17) | 2026-10-12 | [zones-and-spheres.md](zones-and-spheres.md) |
| D1 | Decision D1 — a Mission's position stays internal | decided; extends Locked Decision #7; amended 2026-10-06 for regions (D-MX, MX11) | not stated | [mission-position-boundary.md](mission-position-boundary.md) |
| D2 | D2 — what a Case's location is | decided: option C; built for Cases and for Missions | 2026-09-13 | [case-location-semantics.md](case-location-semantics.md) |
| block G, item 6.1 | Briefing playlists: the auto-tour (block G, item 6.1) | not stated; has build notes | 2026-10-09 (BP13 taken up 2026-10-10) | [briefing-playlists.md](briefing-playlists.md) |
| block G, item 6.2 | The theatre lens and war depth (block G, item 6.2) | not stated; has build notes | 2026-10-09 | [theatre-lens.md](theatre-lens.md) |
| block G, item 6.3 | Raver nights (block G, item 6.3) | not stated; has build notes | 2026-10-10 | [raver-nights.md](raver-nights.md) |
| K5 | Territories: a Classic style, and fine settings for every style (decision K5) | decided by the owner (its opening line) | 2026-10-01; in detail 2026-10-07 | [territories.md](territories.md) |
| K6 | The solar system at true sizes, with bloom (decision K6) | decided by the owner (its opening line); its notes say "K6 is built" | 2026-10-01; in detail 2026-10-07 | [solar-system.md](solar-system.md) |
| K7 | The Earth's maps, sharp close up (decision K7) | decided by the owner (its opening line) | 2026-10-01; in detail 2026-10-07 | [earth-textures.md](earth-textures.md) |
| RS44 | Map RS44 — Minors among RLSH: Starcom's features against the target | mapped; RS45–RS49 decided the same day; RS45 built, then superseded by RS49; RS47 and RS48 built | 2026-10-17 | [rlsh-minors.md](rlsh-minors.md) |
| — | Decision: Canonical Intel Report Path | not stated | not stated | [canonical-intel-report-path.md](canonical-intel-report-path.md) |
| — | Decision: Canonical Investigation/Case System | not stated | not stated | [canonical-investigation-case-system.md](canonical-investigation-case-system.md) |
| — | Decision: Intel\* App Boundaries | not stated | not stated | [intel-app-boundaries.md](intel-app-boundaries.md) |
| — | Decision: The 3D Globe's Role | not stated | not stated | [globe-role.md](globe-role.md) |

## Where the IDs come from

- **D-** followed by letters is the usual scheme for a record in this folder.
  D-A is the one exception: it has no file here, and is recorded in
  [`../04-plan/post-decision-plan.md`](../04-plan/post-decision-plan.md)
  beside D-B, D-C and D-D.
- **D1 and D2** are two earlier numbered decisions.
- **K5, K6 and K7** are items of the critique audit
  (`../00-current-state/critique-audit.md`). That audit's K9–K12 became D-IW,
  D-LD, D-BF and D-DP.
- **Block G** items are numbered as in the records' own titles.
- **RS44** is an item of D-RS (`roster.md`), mapped in a record of its own.
- Inside a record, numbered items such as EX3, MX11 or WX6 are that record's
  own decisions. Code cites them alongside the record's ID.

## Folders that hold a record's data

| Folder | What it holds | Record |
|---|---|---|
| [ai-watch/](ai-watch/) | A snapshot of the grid's AI Watch notes, 2026-10-12 | D-AW |
| [civil-unrest/](civil-unrest/) | A snapshot of the protest desk's notes, 2026-10-26 | D-CU |
| [hero-watch/](hero-watch/) | A snapshot of the grid's Hero Watch notes, 2026-10-10 | D-HW |
| [imaging/](imaging/) | The card templates, the contact sheet, and the golden images with their manifests | D-F; also cited by D-W |
| [intel-reports/](intel-reports/) | A snapshot of Intel Reports, 2026-10-04, used by the golden images in `imaging/` | D-F |
| [intelweb/](intelweb/) | The Intel notes read for IntelWeb's step 1, 2026-10-13 | D-IW |
| [raver-watch/](raver-watch/) | Raver Watch's schemas, test vectors and live snapshots | D-F |
| [war-conflict/](war-conflict/) | War & Conflict's vocabulary, vectors and live snapshots | D-F; also cited by block G, item 6.2 |

## How this folder began

The first records came from the audit in
[`../00-current-state/`](../00-current-state/). It found the same pattern again
and again: two or more separately built implementations of the same job, with
no migration path between them, and nothing but a sometimes-stale comment to
say which one was real. Each of the four records with no ID settles one such
case. It names one canonical implementation and a fate for the others
(retire with a redirect, harvest then delete, or delete outright), following
the precedent the codebase had already set once (`/case-manager` to
`/cases-dashboard`). Each one points to the `00-current-state/` file that
holds the full evidence.

| Record | Resolution |
|---|---|
| [Canonical Intel Report Path](canonical-intel-report-path.md) | `intelReportService` over `IntelWorkspaceManager` for persistence, and `IntelWorkspaceConsole` to browse and create |
| [Canonical Investigation/Case System](canonical-investigation-case-system.md) | `CasesDashboard` with `IntelCaseService` |
| [Intel\* App Boundaries](intel-app-boundaries.md) | IntelAnalyzer, IntelWeb and the Intel Dashboard stay separate. They do different jobs, and the duplication was among copies of each, not between them |
| [The 3D Globe's Role](globe-role.md) | A peer app and spatial anchor, not a gate in the pipeline |

These were treated as prerequisites, not optional cleanup. A Mission Package
screen that "attaches related Intel Reports" cannot be built while a report can
live in three places and an investigation in four.

# Decision D-CT: click-through to sources, and the big-three filter

**Status:** built 2026-10-16 on branch `clickthrough-bigthree`, not pushed. CT1 to CT7 below.

*Recorded by the session that built it, for the owner and for **D-ML**, which runs on another
machine and owns `src/i18n`. Nothing in `src/i18n` was touched.*

## The asks (the owner, 2026-10-16)

1. "There is a problem with content in Starcom related to mouse-over but not Click-through for
   many items that appear on the 3D globe. Basically, our Intel Reports and Mission Packages need
   follow throughs." And: "if there are URL sources ... users can follow through to the original
   sources where the information was made available."
2. "For International Death Cult, Cabals of Banking Cartels, and Transnational Crime Syndicates,
   we need a proper way for flagging and filtering the data so Starcom can focus in on those intel
   reports specifically."

The data side shipped the same day in Mecha Jono's Interchange 3.19: every note carries its
sources as `["r", url]` tags, the original first, up to 20; a Mission Package carries them on its
event, and a field package's source also sits in `metadata.mechaJono.source.link`. The lenses are
`t=lens:tcs`, `t=lens:idc` and `t=lens:cbc`. The contract's own line: "A lens sorts; it never
asserts that a syndicate, cult or cabal exists."

## The audit: what hovers, and what a click opens (CT1)

Measured by reading the code at `697a7b81` (origin/main, 16 October): every layer that registers
with the point-tooltip registry (`pointTooltipRegistry.ts`), every layer with its own hover, and
every handler that turns a click on the canvas into something opened (`pressOn`/`isGlobeClick`
in `globeClick.ts`, and `Enhanced3DGlobeInteractivity`). Not measured in the running app.

| Item on the globe | Layer / hook | Whose notes | Hover | A click before | A click now |
|---|---|---|---|---|---|
| A report's glyph | Intel Reports, `useGlobeIntelSprites` | Mecha Jono's `starcom_intel` notes, and any publisher's | IntelReportTooltip, and the point tooltip | The report popup, or the place's menu when several stand there. **No sources** | The same popup, with **Sources** and lens badges (CT2, CT6) |
| A report about a territory as a whole | Intel Reports, `useGlobeRegionMarks` (BA3, BA9) | the same | the territory named beside the pointer | its reports, by menu and popup. No sources | the same, with Sources |
| An RLSH marker | `useGlobeRLSH` via the sprites | not Mecha Jono's | tooltip | RLSH popup | unchanged |
| A Terminator Watch note at its point; a country's notes at its middle | AI Watch, `useGlobeAiWatch` | Mecha Jono | point tooltip | **nothing** (the panel lists them, titles linked to the first `r`) | **opens the note panel** (CT3) |
| A lifeboat station | Hero Watch, `useGlobeHeroWatch` | Mecha Jono | point tooltip | **nothing** | opens the note panel |
| A country's relief | Hero Watch | Mecha Jono | point tooltip | **nothing** | opens its operations and its count |
| A place's field missions (Mission Packages, kind 30079), and Raver missions | Hero Watch | Mecha Jono | point tooltip, with each mission's limits | **nothing** | opens each mission: **safety limits first**, then what it asks, then its sources (CT4) |
| Drug-check alerts, scene incidents, scene events, HeatRisk | Raver Watch, `useGlobeRaverWatch` | Mecha Jono | point tooltip | **nothing** | opens the mark's notes, soonest first |
| A conflict note at its point; a country's notes at its centre | War & Conflict, `useGlobeWarConflict` | Mecha Jono | point tooltip | **nothing** (the brief lists them) | opens the notes, newest first, with lens badges |
| An actor's arc to where it happened; the analysis layer's arcs | react-globe.gl arcs (War & Conflict, analysis) | drawn from Mecha Jono's notes; Starcom's analysis | arc label | nothing | **open** |
| A war's country fill | War & Conflict | Mecha Jono's war pages | none | nothing | unchanged |
| Diplomacy's marks | `useDiplomaticEvents3D` | not Mecha Jono's | tooltip | Diplomacy's drawer | unchanged |
| A Zone's Sector; a Sphere | `useZones3D`, `useSpheres3D` | ZSP documents and the area registry | chip | their panels | unchanged |
| A country | `useNationalTerritories3D` | not Mecha Jono's | country tooltip | country popup | unchanged |
| A communication hub | `useCommHubs3D` | not Mecha Jono's | hub tooltip | hub popup | unchanged |
| Earthquakes, fires, floods | `useGlobeEcoDisasterMarks` | not Mecha Jono's | point tooltip | nothing | **open** |
| Analysis marks (corroboration, contradiction) | `useGlobeIntelMarkers` | Starcom's own analysis | point tooltip | nothing | **open** |
| Cyber threat clusters | `useCyberAttacks3D` | not Mecha Jono's | point tooltip | nothing | **open** |
| Conflict Zones tallies | `useConflictZones3D` | not Mecha Jono's | point tooltip | nothing | **open** |
| Satellites | `useGlobeSatellites` | not Mecha Jono's | point tooltip | nothing | **open** |
| Readings: weather grid, sea ice, wind arrows, volcanoes, tide and river gauges, heat map, rain, wind flow, clouds | Earth Weather, volcano and gauge hooks | not Mecha Jono's | the reading | nothing | unchanged: a reading, not a note |
| Resource Zones | `useResourceZones3D` | not Mecha Jono's | none | nothing | unchanged |

Off the globe: a received Mission Package opens in the Missions panel's dialog
(`ReceivedPackagesPanel.tsx`). It read the package's tags and `metadata.mechaJono.format.limits`,
and showed **no source**. It shows them now (CT4).

## Decisions

| | Decision |
|---|---|
| **CT1** | **The audit above** is the list of what was hover-only. Every Mecha Jono layer on it now opens on a click. The rest, none of them Mecha Jono's notes, are listed as open below. |
| **CT2** | **Sources are a note's `r` tags, in tag order** (`services/intel/sourceLinks.ts`). The first is marked "Original source"; each is named by its host, the full link on hover. A link is kept only if `new URL` reads it with an `http:` or `https:` scheme; everything else is dropped. Each once, at most 20. Every link opens in a new tab with `rel="noopener noreferrer"`. Stored copies are read again when drawn: storage is untrusted too. One component shows them everywhere (`components/Intel/SourceLinks.tsx`). |
| **CT3** | **A click on a hover-only mark opens a note panel**, docked as the Zone panel is (`GlobeNotePanel.tsx`, dock slot `globeNote`, top-right, order 30). No new shell: the Dock and the Zone panel's look. A glyph layer hangs the notes its hover names on each mark (`opens`, beside `tooltip`); the point-tooltip hook reads the hover and the click from **the same hit**, so a click opens what the hover named. The click follows `globeClick.ts`'s three rules and claims the click as the nearest layer, so the country, Zone or Sphere under the mark does not open too. The hover says "Click to open, with its sources". The panel shows the title, the kind and time, the text **as text**, and Sources. A mark standing for several notes lists them to pick. Escape and the close button close it. |
| **CT4** | **Mission Packages follow through.** A field mission's sources are its event's `r` tags, or, when it has none, its manifest's `metadata.mechaJono.source.link` (every package on The Record before 3.19). On the globe its **safety limits come first** (D-HW: never shown without them). In the Missions dialog, the same sources sit above what the package rests on. |
| **CT5** | **The big-three filter.** All, then TCS, IDC and CBC, any together; the full names are the buttons' names and titles. Only reports carrying a chosen `t=lens:*` tag are drawn and listed. **Kept as the priority filter is**, in the CyberCommand settings in this browser (`intelReports.lenses`; absent is All, so no migration). **One choice, two places:** the Intel Reports settings (the sliders button on the left sub-rail while Intel Reports is on; its title now names the lenses) for the globe, and the Intel Dashboard's list. On the globe it is applied **before the cap**, so a cap of 50 draws 50 of the lens's reports; what it hides is said in the report notes ("N hidden by your lens filter"), with a button to show every report. A report reached by its own link is listed whatever the choice. The contract's line is the filter's help text. |
| **CT6** | **A lens badge** (TCS, IDC, CBC; the full name and the contract's line on hover) on a report that carries a lens: in its hover, its popup, its row and detail in the Intel Dashboard, and in the note panel for a conflict note. Not on the glyph itself (open). |
| **CT7** | **A note sent again redraws.** Every note gains its links when Mecha Jono next sends it; the globe's pipeline now redraws a mark when the version it holds changes (its `nostrEventId`), not only when its place does. Before, a re-sent note kept its old copy, without its sources, until a reload. |

## What was built

- `src/services/intel/sourceLinks.ts`: reading `r` tags, the package fallback, the safe link check.
- `src/services/intel/bigThreeLenses.ts`: the three lenses, reading and filtering by them.
- `src/components/Intel/SourceLinks.tsx`, `BigThreeLens.tsx` (badges, filter), `src/hooks/useLensChoice.ts`.
- `src/features/globe/noteDetail/globeNoteStore.ts` (what is open) and `globeNotesOf.ts` (each layer's note, as shown).
- `src/components/Globe/GlobeNotePanel.tsx`, mounted in `Globe.tsx`; its slot in `Dock/dockOrder.ts`.
- `useGlobePointTooltips.ts`: hover and click from one pick; `resolvePointOpens`. `intelReportSprites.ts`: `opens` per mark, in point order. `SimplePointTooltip.tsx`: the hint.
- The four Watch layers hang notes on their marks; their readers keep every `r` (`aiWatch.ts`, `heroWatch.ts`, `raverWatch.ts`, `warConflict.ts`; War & Conflict keeps its lenses too).
- Intel Reports: the ingest keeps `sourceLinks` (`NostrStarcomIntelIngest.ts`), through storage (`reportMappers.ts`) to the marker (`reportMarker.ts`), shown in `IntelReportPopup.tsx`; badges in the popup and `IntelReportTooltip.tsx`.
- The filter: `IntelReportVisualizationService.ts` (before the cap, counted), `useGlobeIntelReportPipeline.ts`, `GlobeReportNotes.tsx`, `Globe.tsx` (territory reports too), `IntelReportsSettingsPopup.tsx`, `IntelWorkspaceConsole.tsx`, `ReportDetailPanel.tsx`.
- `ReceivedPackagesPanel.tsx`: the package's sources.
- `uiSymbols.ts`: `note:filtered` now means "Hidden by your priority or lens filter" (the same funnel).

## For D-ML: the new English, not yet in the catalogue

Each is an English literal today, as D-ZS did, until the words are in `src/i18n/app/en.ts`. The
close button already reads `m.settings.close`. Lens codes and names are interface, not content.

| Where | English now |
|---|---|
| `SourceLinks.tsx` (popup, dashboard, note panel, Missions dialog) | "Sources"; "Original source"; "No source link was given." |
| `BigThreeLens.tsx`, the badges | "TCS", "IDC", "CBC"; "Transnational Crime Syndicates", "International Death Cults", "Cabals of Banking Cartels"; "Lens: {name}"; title "Lens: {name}. {help}" |
| `BigThreeLens.tsx`, the filter | "Focus on a lens"; "All"; "Every report, with a lens or without"; "Shows every report. Choose one or more lenses to show only reports sorted under them."; "Shows only reports sorted under {names}." (names joined by " or "); "{n} hidden here."; "A lens sorts; it never asserts that a syndicate, cult or cabal exists." |
| `GlobeNotePanel.tsx` | "{n} notes here"; "Notes at this mark"; "Safety limits"; "What it says"; "It says nothing beyond its title."; "no stated time" |
| `globeNotesOf.ts`, kinds | "AI Watch note", "Lifeboat station", "Relief operation", "Organisations at work", "Hero Watch week", "Field mission", "Field mission, {state}", "Scene event", "Raver Watch note", "War page", "Conflict note"; and "What it asks:" before a mission's asks |
| The marks' headings (the four Watch hooks) | "AI Watch", "AI Watch · {place}", "Lifeboats", "Relief · {country}", "Field missions · {place}", "Raver Watch · {layer}", "War & Conflict", "War & Conflict · {country}" |
| `SimplePointTooltip.tsx` | "Click to open, with its sources" |
| `ecoDisasterNote.ts` (critique C5) | "Reported by {feed}"; "Mock data, not a real event"; "an unnamed feed"; "Magnitude {m}"; "Depth {km} km"; "USGS review status: {status}"; "USGS tsunami flag set. For tsunami alerts, see tsunami.gov."; "Burned area: {n} acres"; "GDACS alert level: {level}"; "Status: {status}"; headings from the legend's hazard names |
| `formatters.ts`, the eco tooltip | "USGS tsunami flag set" (was "⚠ Tsunami warning issued") |
| `satelliteNote.ts` | "Satellites"; "Satellite, {role}"; "NORAD catalogue number {n}"; "Altitude about {km} km" (and SATELLITE_PREDICTED_NOTE) |
| `cyberClusterNote.ts` | "Cyber Threats · {code}"; "Threat lists"; "{n} listed address(es) in {code}"; "{list}: {n}"; "{n} of them also in AlienVault OTX community pulses"; "Malware families named there: {names}"; "A sample of each list, taken when this build was made, drawn at the country's middle." |
| `conflictZoneNotes.ts` | "Conflict Zones · {code}", ", the {n} newest of {total}"; "GDELT event, coded from the news"; "Where the report puts it: {place}"; "UNHCR population figures"; "{name}: {n} displaced people"; "Refugees it hosts: {n}"; "Asylum seekers it hosts: {n}"; "Displaced inside it: {n}"; "UNHCR's figures for {year}, by country of asylum." (the CAMEO, Goldstein, story, confidence and lead lines and the caveat are Diplomacy's, already catalogued) |
| `analysisMarkNote.ts` | "Analysis"; "Starcom's analysis: corroboration", "…: a contradiction", "Starcom's analysis, from fabricated data"; "{n} independent source(s)"; "Observed {from} to {to}"; "Weight {w} of 1, derived from source reliability, method and age"; "Computed by {producer}, version {n}"; "Unreachable when it was computed: {sources}"; "Built from fabricated (fixture) data: not a finding." |
| `GlobeReportNotes.tsx` | "{n} hidden by your lens filter"; "Show every report"; "Change this under Intel Reports settings, on the left rail." |
| `IntelWorkspaceConsole.tsx` | "No report here is sorted under the lens chosen." |
| `CyberCommandLeftSideSubRail.tsx`, the settings button's title | "Intel Reports settings: how many reports the globe draws, and which lenses" (was "…draws") |

## Open

- **Every point layer on this list opens now** (critique C5, 2026-10-16; see the critique's "Built, CR3"):
  earthquakes, fires and floods; satellites; cyber threat clusters; Conflict Zones' tallies and
  displacement rings; analysis marks. Left: the arcs.
- **Hover-only, not fixed** (none are Mecha Jono's notes): ~~earthquakes, fires and floods~~; ~~analysis
  marks~~; ~~cyber threat clusters~~; ~~Conflict Zones tallies~~; ~~satellites~~; the arcs (War & Conflict's are
  drawn from Mecha Jono's notes, whose own marks now open). Those point layers use `screenPoints.ts`,
  which does not collect `opens` yet: one line there, as in `intelReportSprites.ts`, then each
  layer's notes. Whether an eco-disaster mark carries its event's page was not checked. The arcs
  are react-globe.gl's, outside this path.
- **A lens on the glyph itself.** The badge is in the hover, the popup, the lists and the panel,
  not drawn on the WebGL glyph. Drawing it means the sprite atlas.
- **Where the filter does not reach:** War & Conflict's own layer and brief (its notes carry
  lenses, but the mode has its own theatre lens: whether the big three apply there is the owner's
  call); IntelWeb, IntelAnalyzer and Cases; a Zone's "Intel in this Zone" list; the place menu.
- **Old notes.** A note gains its `r` tags when Mecha Jono next sends it (3.19, decision 7 there).
  Until then an Intel Report shows no Sources, and a Watch note shows its first link only.
- **The note panel stays open when its layer is turned off,** unlike the Zone panel. Small.
- **Pinned layers overlapping:** a report's glyph and a Watch mark under one click both open.
- **Not checked in the running app.** Verified by tests, the typecheck and a production build.

## Verification (2026-10-16)

- `npx tsc -p tsconfig.app.json --noEmit`: clean.
- vitest: the new files (`sourceLinks`, `bigThreeLenses`, `IntelReportVisualizationService.lenses`,
  `NostrStarcomIntelIngest.sources`, `reportMappers.sources`, `GlobeNotePanel`,
  `IntelReportPopup.sources`, `ReceivedPackagesPanel.sources`, `ReportDetailPanel.sources`,
  `IntelWorkspaceConsole.lenses`) and the extended ones (`useGlobeIntelReportPipeline`,
  `useGlobePointTooltips`, `heroWatch`, `IntelReportsSettingsPopup`, `GlobeReportNotes`) pass, with
  every suite in the folders touched.
- Controls: four fixes were broken on purpose (the redraw of a re-sent note, the http and https
  check, the lens filter before the cap, a package's fallback to its manifest's source). A test
  failed each time, and each file was restored.
- The guards pass, but three that fail identically on origin/main: `guard-emoji` (753 against a
  ceiling of 752), `guard-z-index-ratchet` (61 against 60) and `guard-native-capabilities` (the
  desktop submodule is not checked out). This change adds no emoji and no z-index.
- `vite build --mode production`, then `guard-bundle-secrets`, `guard-absent-capabilities`,
  `check-bundle-budget` and `check-i18n`: pass.

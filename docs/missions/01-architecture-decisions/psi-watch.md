# Decision D-PW — Psi Watch, the PsiOps Briefing and PsiOps share

**Status:** decided 2026-10-26 (PW1–PW8, the owner). Built in parallel with Mecha Jono's and Beu's development AI's
handoff, which is still in the making; theirs slots in where this record says.

The owner's ask (2026-10-26): something involving astrology that uses the existing psionic field calculations, and
astrological investigations exploring **correlations, never causations**, around Intel Reports and global events;
the whole Psi Watch visualization system enabling a PsiOps Briefing and a PsiOps share, beside several Psi Watch
sub-visualizations. The standing rules from 17 Oct hold: the psionic layers are labelled **"Experimental"**, that one
word; Starcom never names the game whose repository a recent experiment came from, nor its lore.

## What exists (census of the owner's repositories, 2026-10-26, read only)

| Where | What it gives | Fit |
|---|---|---|
| The psionics experiment's repository (Python, numpy and scipy; some TypeScript) | The ψ field: a driven real Ginzburg–Landau field on the sphere, τ∂ψ/∂t = ξ²∇²ψ + [a − bψ²]ψ + ηJ, at steady state ψ ≈ √(max(ā,0)/b) on a 2° grid, ξ = 300 km; drive a = a0 + G + G·F(t) + S, G the mean of 350 km bands round the EGM96 geoid's persistence ridges and valleys, PB2002's spreading ridges, IGRF-14's core null-flux line and the coasts; F the Moon and Sun degree-2 tidal potential; S an eclipse's centre line. The game-only terms (its built sources, J, and its tuned weights) are the game's story and stay behind. Also: an IGRF-14 synthesis (n ≤ 13) with the dip equator, EGM96 to degree 36, a spherical-harmonic toolkit, an equal-area Fibonacci mesh (41,253 nodes), an SPDE/GMRF mapper with exceedance probabilities (about 0.4 GB at 60k nodes: offline), network models, and a ledger of 8 pre-registered tests (1 pass, which failed to replicate twice). Open data: IGRF-14 42 KB, EGM96 57 KB, PB2002 559 KB, Natural Earth 138 KB (public domain, ODC-By, CC BY). | Port, don't import: its scripts are tied to its own paths. No LICENSE file. |
| PlanetaryHarmonicsModule (Rust, in AstrologyCore) | JPL DE440 through RustSPICE, or a fitted 6 MB file for 1900–2100 (about 0.03″); geo-, helio- and barycentric; tropical to date and a sidereal helper; aspects as cos/sin(nΔλ) for n = 1–24 over every pair, declination parallels, retrogrades, stations, lunations, eclipses, an aspect-time root finder, tidal tensors; site angles (sidereal time, ASC, MC); a Schuster test with time-shift nulls. A browser WASM build (1.9 MB) with `charts()`, `features()` (about 9,800 named columns), `aspectTimes()`, `tidalTensors()`, `loadCompact()`. No houses. | The investigations' engine. Cargo says MIT OR Apache-2.0; no LICENSE file yet. |
| RustSPICE | NASA SPICE in Rust and WASM, with a TypeScript wrapper; DE440s (33 MB) fetched apart. | Behind the module above; its LICENSE (CC0) and its manifests (MIT OR Apache-2.0) disagree. |
| CosmicCypher (Swift, iOS) | 10 planets, nodes, angles, Arabic parts, a Galactic Centre ayanamsa, 24 aspect types with orb 30°/n. | A reference for the frame; its house code is unreliable. |
| The Timestream images (Swift, macOS), CosmicAstrology (Python) | Galactic Centre tables of unstated source. | Not used. |
| Starcom | `astronomy-engine` 2.1.19 (MIT) in the solar-system view; the OVATION aurora; Kp; Intel Reports, War & Conflict, Civil Unrest, Eco Disasters, each with a time and a place; the brief and share machinery. | The live sky and everything to chart. |

## Decisions (the owner, 2026-10-26)

| | Decision |
|---|---|
| **PW1** | **Psi Watch is a mode of its own,** beside AI Watch and Hero Watch: its sub-visualizations are sections pinned on or off, with its own brief panel and share subject. Investigations open from it. |
| **PW2** | **Both engines, by job.** `astronomy-engine` for the live sky and the globe's lines; PlanetaryHarmonicsModule's WASM, loaded in a worker when asked, for charts' depth and the investigations. Its repository needs a LICENSE file before it ships. |
| **PW3** | **Starcom computes the ψ field live,** labelled Experimental: the steady-state field in the browser from baked base textures (geoid ridges and valleys, spreading ridges, the IGRF null-flux line, coasts, all open data) and the live tidal term; the game-only terms left out. Not blocked on anyone; Mecha Jono films it through the share handle. |
| **PW4** | **A lab and a board, kept apart.** The lab explores any configuration against any event set with time-shift nulls and a warning, and claims nothing. The board holds pre-registered hypotheses, tested only on events after registration, false-discovery corrected, reported win or lose. Every result: its count, its effect size, its null, and "a correlation, not a cause". |
| **PW5** | **The Galactic Centre frame by default,** as the owner's own tools use it, computed from the Centre's own position (Sagittarius A*, precessed to the moment, at 0° Sagittarius), never from an astrologer's fixed offset; tropical selectable; every chart and card states its frame. No Lahiri or other Vedic ayanamsa (the owner, 2026-10-26: it came from the option text, never their ask). PlanetaryHarmonicsModule's own sidereal helper is Lahiri-style, so its sidereal output is never used: Starcom applies its own Galactic Centre frame. |
| **PW6** | **Houses now, Placidus included:** the angles (Ascendant, Midheaven, and their opposites) from sidereal time, whole-sign houses, and Placidus, tested against references before it ships; Placidus is undefined beyond the polar circles, and a chart there says so. |
| **PW7** | **First views, all four:** astrocartography lines (where each planet rises, sets and culminates, moving with time); the ψ field (Experimental); Earth's magnetic shield (IGRF and its pole drift, the South Atlantic Anomaly, the live auroral oval); a chart beside any Intel Report or global event, for when and where it happened. |
| **PW8** | **Starcom builds now, on test data;** a short note asks Mecha Jono and Beu's development AI for what only they can make (an event set for the board, the SPDE reference maps, any base layer they would rather bake), and their handoff slots in. |

## Mecha Jono's build kit v0 (read 2026-10-26)

Their handoff page ("Mecha Jono to Starcom", section "Sync with your Psi Watch build") answers the note of
26 Oct: Beu's development AI is Mecha Jono's own session, and Psi Beu is their engine. Their kit
(`kit/README.md`, `kit/schemas_psi.md`, `kit/schemas_rlsh.md`, fixtures and vectors; the vectors and fixtures are
copied in `src/services/psiWatch/kit-v0/`, where the deploy can read them: `docs/missions` never reaches it) asks Starcom to build every surface a person sees for PsiOps and for RLSH's
recurrence missions, behind a switch, from fixtures until live events start after the key change (Mon 9 Nov,
15:00 UTC, signed by their new key `86f824c3…402c` only). How it meets this record:

| Theirs | Ours |
|---|---|
| The Psi view | Psi Watch's mode (PW1) |
| PsiLines, checked against `vectors_psi.json` | Astrocartography (PW7) |
| PsiField: the measured readings (Kp, solar wind, X-rays and flares, aurora, the NIST beacon) from `psi_field` | A strip in the view; not the ψ field |
| PsiZones (`psi_scry_result`, by Zone), PsiRifts (`psi_alert`), PsiWindows (`psi_window`) | New layers, from fixtures |
| `psi_brief`, `psi_registration`, `psi_ledger` | List surfaces |
| `psi_mission_package` | The mission screen's psi variant |
| The ψ field, Earth's magnetic shield, event charts, the lab | Starcom's own (PW3, PW7, PW4) |
| One registry and ledger | The board (PW10) |

Their rules for every Psi surface: the one badge **Experimental**, small, once, in the layers' legend, and no other
badge, warning or alarm styling; never a person; no publisher's name in Starcom's words; each number in one line with
its window and its chance rate; a result shown as a result only from a sealed registration (`psi_scry_result`),
never recomputed; exploration shown as exploration.

**Conformance (2026-10-26):** against `vectors_psi.json`, astronomy-engine meets every tolerance: sidereal time within
0.0004°, places within 0.004°, MC and IC within 0.004°, ASC and DSC within 0.006° (their 0.05°), the null states
alike; the 40 aspect times within 15″ of exact (their 60″); every profile weight within 0.001. The Galactic Centre
frame, Sgr A* at its apparent place, gives 27.225027° at their sidereal ingress against their 27.225022°.

## Decisions on the kit (the owner, 2026-10-26)

| | Decision |
|---|---|
| **PW9** | **The kit's layer ids, in plain names:** PsiLines (Planet lines), PsiField (Field readings), PsiZones (Tested places), PsiRifts (Rifts), PsiWindows (Windows), and Starcom's PsiModel (ψ field) and MagneticShield (Magnetic shield). Event charts open from a report; they are no layer. |
| **PW10** | **One registry, Mecha Jono's.** The board shows their sealed registrations, results (met and missed alike) and weekly ledger; Starcom's form drafts a hypothesis, the owner seals it, their engine scores it on later events. Starcom's lab is exploration and never shows a result. Replaces PW4's board. |
| **PW11** | **PsiOps first, then RLSH;** the shared timeline built once for both. |
| **PW12** | **A URL switch, marked:** the kit's fixtures show on starcom.app only with `?psi=kit` (later `?rlsh=kit`), every invented value marked FIXTURE on screen and in captures; no relay is read for these families before the key change.  **Reading amended 3 Nov** (the owner: no waiting for the key change): Mecha Jono's live Psi notes are read from now, their new key's only, since only it signs them; the cut-over line in KEY_STARTS stays the old exposed key's retirement for every other reader (MX31). |
| **PW13** | **The sky catalogue's orbs** for Starcom's own charts: each pair's half-weight orb and cap as Mecha Jono's sky events carry them (from their fixtures until their table comes: 1° and 3° with the Moon or between outer planets, 2° and 6° otherwise; the major aspects). Classic and harmonic (30°/n) orbs stay selectable. |
| **PW14** | **The polar Ascendant as computed, said:** the ecliptic's rising point from the standard formula, which past the polar circles can stand west of the meridian; a chart says so when it does; whole-sign houses from it; Placidus refused there (PW6). |
| **PW15** | **D-ML as it is for strings:** Starcom writes its new strings into the catalogue in all six languages, marked machine-drafted (ML3), and lists them here for review. |
| **PW16** | **The reply posted** in the notes thread (4989e68d-376d): corrections (no Lahiri), conformance, layer ids, the board, the switch, answers to the kit's five questions (their own package family; lines ours and eclipse paths theirs; stepped clips; a Psi view of its own with its layers also in the menu; astronomy-engine now, `ph-wasm` later), an ask for the orb table and the polar Ascendant, strings, and the ψ field's definition to follow. |

| **PW17** | **Aqua glow, `#5CF5DA`,** for Psi Watch's lines, window curves and badge, chosen knowing its nearest neighbours, OK green and cyan 300, stand at 0.094 and 0.095 in OKLab (`DATA_SCALES.psiWatch`). |
| **PW18** | **Glyph Set A:** the mode `orbit`; Planet lines `spline`, Field readings `gauge`, Tested places `grid-2x2-check`, Rifts `split`, Windows `hourglass`, Magnetic shield `shield-half` (Lucide, ISC); the ψ field Starcom's own ψ mark. On the Glyph Lexicon sheet for review. |
| **PW19** | **The whole mode behind the switch** until the key change, Starcom's own layers too; then it opens to everyone in one launch. **Superseded 1 Nov** (the owner, critique-2026-11-01.md OR6): open to everyone now, ahead of the key change; `?psi=off` hides it for a tab, `?psi=kit` shows it again. The kit's invented values stay marked FIXTURE (PW12). |
| **PW20** | **Planet lines draw the chosen event's bodies,** as the kit has it: the bodies of the sky event open on the timeline (e.g. the Moon and Mars, eight lines); a switch in the panel draws all ten. |
| **PW21** | **At exact, or at the cursor inside the window:** the lines stand at the event's exact moment, the kit's default, and move with the shared cursor while it is inside the event's window. |
| **PW22** | **Labels and dashes, in one aqua:** MC solid, IC dashed, ASC and DSC thinner; each line labelled with its body and angle ("Mars MC") at its end and in its hover. |
| **PW23** | **The polar Ascendant always east,** as Mecha Jono's catalogue has it (revises PW14, whose option called the formula's western point "the rising point": a point on the western horizon is setting). The formula's point is turned 180° where it falls west, which happens only beyond the polar circles; the MC stays on the upper meridian, so the Ascendant always stands 0–180° past it; a chart says when the turn applies; whole-sign houses follow it; Placidus is refused there. |
| **PW24** | **Psi's places move to ZSP 2.0 with the swap:** Mecha Jono re-classes their event set, alerts, windows and new registrations on 2.0 ids; a registration sealed on ZSP 1.0 keeps its 1.0 places, and Starcom lists it with its result but draws it on no map. Asked of Mecha Jono, with the Maria labels the swap waits on (01a6eb26-e162). |
| **PW25** | **A lexicon first, the fancy terms later.** The owner, on "Rifts": Psi Watch's lexicon, taxonomy and ontology must grow, and the owner's wiki holds a starting point (Dimensional Rifts, Temporal Maelstroms, Nexus Events and other terms). Starcom is not ready to detect any of those; preparing for that capability belongs deep in the future, once the science, mathematics and physics are established with realistic grounding and practical methods of detection and calculation. For now, simpler things. The lexicon is worked out between Mecha Jono and Starcom in shared artifacts; Starcom's own words keep the rule of 17 Oct until the owner says otherwise. |
| **PW26** | **Psi Events and Psi Alerts,** the owner's words: the layer PsiRifts (`psi_alert`, several field channels high together in a Zone) shows as Psi Alerts, its glyph `merge` (channels meeting) in place of Set A's fork; Psi Event is the class word for any event the Psi layers mark. Convergence is left to the owner's ontology, where it names five continuity events. The lexicon is a shared doc both sides edit, [Psi Watch lexicon](https://claude.ai/artifact/2NpTSa7dVDWFs5Mnsee1sC), opened by Starcom; Mecha Jono invited (ca397994-e838). |
| **PW27** | **A Resonance Score: lexicon first, build later** (its three questions settled in PW68). Cosmic Cypher's web app (`src/resonanceScore.ts`) defines one for the sky: 0–100 from Aspect Harmony (resonant soft aspects against dissonant hard ones, by exactness and weight) and Elemental Coherence, 70/30, with a Cosmic Force overlap beside it, never averaged in. The owner's wiki's Resonant is a person, and Psi Watch never shows one. Before Starcom shows a sky Resonance Score, the lexicon settles its frame (its elements change with the frame), its orbs, and whether its signed valence is kept and how it is worded. |
| **PW28** | **Archetypes, not people.** The owner: Psi Watch and the Resonant Finder scry for archetypes, patterns of avatars that may or may not be real, and anything may be an archetype: a person, a place, a time, an event, an organisation, an idea. Real people are sought only later, in investigations, and only with their consent: "identify archetypes and search for real people", never "identify real people and scry into them". Resonance is one measure for every kind, the overlap of an instance's signature with an archetype's (the wiki's O(A,B)). Safeguards: a person-shaped archetype is never narrower than a crowd, never offered for a birth window inside the last 18 years, and never matched by a profile from public data; a person meets one only on their own device. |
| **PW29** | **Plain words on screens, the lore in the docs,** for the PsiOps tier too; the design is a shared doc, [Resonant Finder: a grounded prototype](https://claude.ai/artifact/8Y6yzau4HY7Z184TyCcsTU): the four surfaces on archetypes, the consent path, what each side shows early, and the first archetypes, two positive controls first (a plate-boundary Zone; the 27-day return of geomagnetic activity). |
| **PW30** | **Resonance Zones are not ZSP Zones** (the owner, 26 Oct): a Resonance Zone is a region a field draws, any shape and often across ZSP's lines, where a place archetype's signature resonates above a threshold; ZSP's Zones and Sectors only name where one lies. Tested places (PsiZones, `psi_scry_result`) stay ZSP Zones, as Mecha Jono's registrations pin them. Both shared docs say so, with Mecha Jono's notes of 26 Oct folded in: the overlap's range, rate-normalised tipping-point indicators, the two engines (the alert ladder and `psi_converge`), the two budgets, the crowd count, the beacon as a known null. |
| **PW31** | **Settled with Mecha Jono, the owner 26 Oct:** the Desk's 4 Alerts a UTC month are its share of the wiki's 40 false alarms per investigator a month, the Log taking the rest, each counted against its own null; either side adds terms to the lexicon directly, the owner settling each by comment, the notes thread kept for build sync; replies posted in all 13 of Mecha Jono's comment threads. |
| **PW32** | **One aqua, three ways** (the owner, 26 Oct, step 5): Psi Alerts the Zone's edge drawn bright with the merge glyph at its middle, while the alert holds; Windows the Zone filled, its strength the window's curve at the cursor (fading with the scrubber, a band at full strength); Tested places a thin dotted edge, nothing filled, the result only in the hover with "A correlation, not a cause." |
| **PW33** | **A psi item on a retired 1.0 Zone draws as its covering Zones** (the owner, 26 Oct), as every area has since the swap (ZR28); its hover says it was one of the first Zones and how many hold it now. It applies to sealed results too: PW24's "listed, never drawn" stays for what has no outline now, a first Zone's Sector (`zone:sahel/sector:…`), counted and listed only. |
| **PW34** | **Nothing but the badge** (the owner, 26 Oct): no text beyond the one "Experimental" badge anywhere in Psi Watch: no disclaimers, no self-debunking. "A correlation, not a cause" comes out of the panel, the tooltips and the legend, and out of PW4's every-result rule. |
| **PW35** | **Built for operatives scrying ahead** (the owner, 26 Oct): the people Psi Watch is designed for are Archangel Agency operatives using it to scry into the future, making predictions and finding correlations. The winter cohort uses it, but its programme rules do not shape the mode. |
| **PW36** | **Live from day one, no scores** (the owner, 26 Oct): Psi Watch works on live sky, field and Mecha Jono's live notes from its opening; no score, rank or tally is kept of anyone's calls. |
| **PW37** | **Any horizon, zoomable** (the owner, 26 Oct): one timeline that zooms from hours to decades, across the sky catalogue's 1930–2035, the globe following its cursor at every zoom. |
| **PW38** | **Cosmic Cypher's bottom drawer, advanced** (the owner, 26 Oct): under the globe, the Timestream, its graph charts and its scrubber, as Cosmic Cypher's web app has them (`cosmiccypher-frontend`, the owner's own), augmented for Psi Watch; its code may be taken directly, with judgement where Starcom's own pieces (the shared cursor, D-E; the window profiles; the theme) must win. |
| **PW39** | **Correlations two ways** (the owner, 26 Oct): **Echoes**, the past moments when the sky stood as it will in a coming window, and what happened then and where, side by side; and an **alignment chart**, past events of a kind stacked on a kind of sky event's exact moments, counted before and after. |
| **PW40** | **Sealed calls on the globe** (the owner, 26 Oct): an operative's call names a place, a window and what is expected (a kind of event or an archetype), signed and timestamped before its window opens; it waits on the globe as a faint outline, lights while its window is open, and afterwards links the events that fell in it, with no score (PW36). |
| **PW41** | **The element colours kept** (the owner, 26 Oct): the Timestream's lanes keep Cosmic Cypher's Fire red, Earth green, Air yellow and Water blue, their boundaries in the chart's frame (the Galactic Centre by default, PW5); Starcom's gunmetal frames them, and the psi lanes draw in aqua over them. |
| **PW42** | **Four kinds of lane on day one** (the owner, 26 Oct): the sky (18 bodies with retrograde and void-of-course marks, and the aspect lane); psi (windows, Psi Alerts, sealed calls); the field (Kp and the solar wind, measured behind the cursor and NOAA's 3-day forecast and 27-day outlook ahead); events (a chosen kind's density through time). |
| **PW43** | **Whose sky: the globe's centre, pinnable** (the owner, 26 Oct): the angle lanes and houses follow the place under the middle of the view; a pin holds one place (a Zone, an area or a city), named on the drawer. |
| **PW44** | **Calls sealed, revealed after** (the owner, 26 Oct): before a call's window opens only its fingerprint is posted, to a team relay the operative picks, proving when it was made; its words are revealed when the window closes, or kept private; others see a call on the globe only once revealed. |
| **PW45** | **Graphs as lanes on one time axis** (the owner, 26 Oct), drawn in the Timestream's own canvas (no Recharts): Cosmic Cypher's Resonance Score (lifting PW27's hold), tidal stress, the elements, modalities and Cosmic Force mix, and ψ at the pinned place once the ψ field is built. |
| **PW46** | **History for Echoes and alignments** (the owner, 26 Oct): Mecha Jono's event set as their page holds it, UCDP's one-day conflict events (119,143, 1989–2025, CC BY 4.0), USGS ComCat earthquakes M5.5 and up (12,160, 1976–2025, public domain) and GFZ's Kp storm days (2,985, 1932–2025, CC BY 4.0), placed in ZSP 2.0 Zones by Starcom from their coordinates; and Starcom's own Intel Reports, War & Conflict and Civil Unrest for the recent returns. |
| **PW47** | **Echoes stacked on the globe, picked in the drawer** (the owner, 26 Oct): every past return's events on the globe at once, each return a shade older; the returns as ticks on the Timestream, a click isolating one. |
| **PW48** | **No FIXTURE label** (the owner, 26 Oct, under PW34): the kit's invented sample notes carry no on-screen mark; the `?psi=kit` switch alone keeps them apart until Mecha Jono's live notes replace them. Supersedes PW12's marking; the switch stays. **Restored 2 Nov** (Mecha Jono's ask, 8d06bc67): opening the mode to everyone (OR6) had changed the one switch and so put the invented samples in front of every visitor; now the mode is everyone's and the samples, each file invented by its own `provenance`, show only in a tab opened with `?psi=kit` (`psiKitSamplesOn`, `loadPsiKit`). |
| **PW49** | **Echoes match by the event's own kind** (the owner, 27 Oct): an aspect by its pair and angle, a Galactic Centre contact by its body and angle, an ingress by its body entering the same sign in the same frame, a lunation by its phase with the Moon in the same sign, a lunar apsis by its kind, a node by the Moon crossing it the same way, a station by its planet turning the same way in the same sign. |
| **PW50** | **A brushed span highlights** (the owner, 27 Oct, L1): Shift-drag on the Timestream lights what falls in the span on the globe and in the panel at full strength, the rest dimmed but drawn. |
| **PW51** | **Fast lanes change form at wide zooms** (Z1): the Moon and the angles become new and full moon ticks past a few months; the aspect lane keeps slow pairs past a year (Mars outward), then Jupiter outward past a decade; Kp becomes daily maxima, then storm days, then storms a year; events count per day, week, year; graphs a mean with the range shaded. |
| **PW52** | **Busy, weighted by rarity** (B1, B2; the weighting SUPERSEDED by PW67, every window counts 1): every open window's curve summed into one lane named "Busy" (its peak "busiest"), each window weighted by how rarely its kind recurs, the weights set in the lexicon; on the globe, the Zones of overlapping windows deepen. |
| **PW53** | **Echo counts beside the usual** (E1): each return's count of events with a thin second bar, the count an ordinary window of the same length holds, drawn as data, no sentence. |
| **PW54** | **Echo places, switchable** (E2, the owner's own option): dots, a heat, filled Zones, and SVG icons from a roster of themed archetype glyphs, each distinct and saying its context, drawn from the Glyph Lexicon. |
| **PW55** | **The alignment chart is a drawer lane** (A1, A2): opened, it takes a lane with its axis in days from exact, a faint dotted "usual" line at the average day behind its bars. |
| **PW56** | **A call names a kind and its own words** (C1): a kind from a list (conflict, quakes M5.5+, a storm Kp 5+, unrest, an Intel Report category, a lexicon archetype), matched to what happened, with the operative's words beside it. |
| **PW57** | **The ψ field in four looks, each its own dimension** (F1, the owner's own option): heat for the field's value, contours for its isolines at fixed steps, relief for the slow base drive (the geoid's ridges and valleys, the spreading ridges, the null-flux line, the coasts), flow for its change with the cursor (the tidal term). The mapping is Starcom's proposal, the owner's to change. |
| **PW58** | **The poles' drift** (F2): both magnetic poles' tracks 1900–2030 drawn faintly with decade ticks, a bright dot where each stands at the cursor's year. |
| **PW59** | **Parans and line bands** (P1): where two bodies are angular at once, as faint latitude bands named for the pair; each line widened by its orb in kilometres, so events can fall on a line. |
| **PW60** | **Event charts, then and now first** (W1): the event's chart inside, the cursor's sky outside, the aspects between them drawn across; the single wheel and the overlay of many after. |
| **PW61** | **The Finder's positive controls right after Echoes** (R1): a plate-boundary Zone found from the quakes, and the 27-day return found in Kp, on the history baked for Echoes, before any archetype of the owner's is scried. |
| **PW62** | **A Timestream strip in any card** (S1): the share contract lets any card ask for a band of the Timestream under the globe, its span and lanes chosen. |
| **PW63** | **All four time tools** (M1): jump keys (N and P to the next or previous window, alert, station, eclipse or busiest moment), marks (moments pinned as flags on the ruler, kept for the next visit), side by side (the globe split, now and the cursor), and play by event ("one window a second"). |
| **PW64** | **Operatives' own sensors, planned for later** (I1): a field note for an operative's reading (a phone's magnetometer), agreed with Mecha Jono, and a layer of measured beside modelled, after the held-over steps. |
| **PW65** | **The live drawer's weak spots fixed before step 3** (the owner, 27 Oct, from the UX critique): room for the globe (the drawer's height a share of the screen, a collapse to a one-line strip, the globe re-centred in the room above, a one-row toolbar with a menu, a bottom sheet on phones); readable lanes (a hover readout of sign, degree and motion, sign ticks, the element key, a colour-blind-safe palette beside Cosmic Cypher's); one time control in Psi Watch (the drawer is the scrubber, TEMPORAL NAV's track hidden); the aspect lane labelled and clickable with a without-the-Moon chip, and the observer marked on the globe and named by its Zone. |
| **PW66** | **A second Psi hue** (the owner, 27 Oct): aqua for the sky (planet lines, windows, Busy), violet for what stands on the ground (Psi Alerts, tested places, calls, echoes). The drawer's retrograde mark leaves violet for a light hatch, so violet has one meaning. |
| **PW67** | **Every window counts 1 in Busy** (the owner, 27 Oct, on step 3's proposals; supersedes PW52's weighting): no weight by rarity; each window's curve still rises to 1 at its exact moment and falls towards its edges, the curves summed as PW52 has it, so "busiest" lands on a moment. How often each kind recurs shows only in Busy's hover ("about every 14 days"). The owner kept the rest as Starcom proposed: Busy's floor of 2, the Moon's eclipses alone past three years, the angles drawn plain past two months. |
| **PW68** | **The graph lanes' terms** (the owner, 27 Oct, settling PW27's three questions; in the lexicon): the Resonance Score and the element and modality lanes count signs in the drawer's frame (the Galactic Centre by default, tropical when switched), each readout naming it; the score uses Cosmic Cypher's own ten aspects, orbs and weights; its lean is kept in Cosmic Cypher's words, its headline descriptor (resonant above 60, dissonant below 40, neutral between); tidal stress is the Earth-wide tide, the Moon's and Sun's combined degree-2 forcing as a ratio to its mean. |
| **PW69** | **Echoes' terms** (the owner, 27 Oct): an Echo starts from a window's card (its sky event's kind, as PW49 has it); each return gathers the events lane's set, whichever it shows; the span gathered about each return is the window's own, from its opening to its end, so PW53's usual is the count any span that long holds; and every return is drawn, as PW47 has it, a fast kind's echo covering much of the record. |
| **PW70** | **The Finder's positive controls, as built** (the owner, 27 Oct): the Finder is a section of the Psi Watch panel, its archetypes listed and opened one at a time; a Zone's resonance with "a plate boundary" is the share of its area within 150 km of a PB2002 boundary, the Zones then ranked into ten groups by it; the 27-day control counts the storms that began each day 1 to 60 days after a storm; both are drawn as data, no sentence reading them, as Echoes are (PW53). |
| **PW71** | **The alignment lane's terms** (the owner, 27 Oct): it opens from the Echoes card, stacking that Echo's returns on their exact moments with the events lane's set; its axis runs 30 days either side of exact, a bar a day, the window's own span marked. |
| **PW72** | **Sealed calls' terms** (the owner, 28 Oct): a call is made from a window's card (the window is the call's; the place a Zone picked on the globe; the kind from PW56's list; the words typed); sealed before its window by a signed fingerprint, revealed after it closes with the exact text, which anyone can check; a call kept private keeps its words and salt only on the operative's device, the relay holding the fingerprint alone. The kind Starcom first proposed (1913) is superseded by PW75. |
| **PW73** | **Side by side, the Psi layers only** (the owner, 28 Oct): the globe split down the middle, the Psi layers (planet lines, Zones, Echoes) at now on one side and at the cursor on the other; the other layers drawn once, at the cursor. |
| **PW74** | **The order after calls** (the owner, 28 Oct): 9b and 9c, then the Psi layers in the share handle (11a), then side by side, then the rest of step 11; 9c links earthquakes and storms first, each other kind as its live feed is wired; Cosmic Cypher's North Node bug noted in Cosmic Cypher's own docs, no code change. |
| **PW75** | **On Mecha Jono's Console addendum** (the owner, 28 Oct): their test years (UCDP 2015–2025, Kp 1966–2025, ComCat 2000–2024) held back in every Psi view (Echoes, the alignment lane, the events lane, the Finder's controls, the Kp lane's history) until they post each released; calls take their `psi_call` shape (d tags), asking them to keep the seal to the fingerprint alone, as PW44 has it; the scoreboard shows only their machine's forecasts against the usual chance and NOAA's, never an operative's call (PW36); the Console's parts (today's focus, the atmosphere band, echo rings, Psi Events, the Vault) come after the share handle, on their fixtures. |
| **PW76** | **Teammates' calls** (the owner, 28 Oct): a teammate's revealed call is named by its team alone, never the person ("a call from Blue Team"); a seal not yet revealed shows nothing (PW44); a seal's time is the signer's own, trusted for now, a team relay that refuses back-dated notes (strfry's `rejectEventsOlderThanSeconds`) closing the gap; the follow-up telling Mecha Jono what Starcom sends is posted once 9a is live. |
| **PW77** | **Psi on cards** (the owner, 28 Oct, for 11a): the Timestream strip is drawn by the card itself, in 2D from the drawer's own data, so it works with the drawer closed; by default it spans the card's moment ±3 days with Windows, Kp and the event's two bodies, a card asking for others; the capture's own caveats stay on Psi cards, being about the capture and not about psi, the badge the only psi text; the PsiOps Briefing comes first as a card (the coming week's windows with their Zones, Kp's outlook, open Psi Alerts, a strip under the globe). |
| **PW78** | **The ψ field is the experiment's steady state** (the owner, 30 Oct, for PW57): its main script's v1, ported: the drive a = a0 + G + 0.45·G·F + 0.8·S on the 2° grid, smoothed over ξ = 300 km (a Gaussian kernel on the sphere, weighted by cell area), then ψ = √(max(ā, 0)/b), the cells past 78° left at 0. G is the mean of four 350 km Gaussian bands (the geoid's persistence ridges and valleys from EGM96 to degree 12, PB2002's spreading steps, the core null-flux line, Natural Earth's coasts), divided by its largest; F the Moon and Sun's degree-2 tidal potential over the grid, divided by its largest magnitude at that moment; S a 150 km band along a solar eclipse's centre line on its day. The later mesh version, stepped through time, may follow once this is live. |
| **PW79** | **The experiment's own weights** (the owner, 30 Oct): a0 −0.35, the bands 1.0, the tidal gate 0.45, the eclipse 0.8, b 1.0, as the experiment states them, so a second implementation can match them exactly; its built term (J) stays out, as PW3 says. |
| **PW80** | **The core null-flux line at the cursor's year** (the owner, 30 Oct): Br = 0 at the core's surface (3,485 km) from IGRF-14 for the year drawn, 1900–2030, as the magnetic shield is, where the experiment fixes it at 2032: the line drifts over the decades, and ψ with it. |
| **PW81** | **Parans at the crossings** (the owner, 10 Nov): at the moment the lines stand, a faint ring of latitude through each place where two of the open event's bodies' lines cross (one's MC or IC across the other's horizon, or the two horizons), named for the pair, moving with the cursor as the lines do. Only the event's own bodies, however many bodies' lines are drawn. |
| **PW82** | **A line's band is its body's orb, the kit's** (the owner, 10 Nov): the aspect class's half-width in kit-v0's orbs.json, the Moon 1°, the Sun, Mercury and Venus 2°, the rest 1°. An MC or IC band is that many degrees of longitude either side (about 111 km at the equator, narrowing toward the poles); a rising or setting band is the places where the body stands within that many degrees of the horizon. A paran's ring takes the smaller of its two bodies' orbs. |
| **PW83** | **An event on a band is said in the inspector** (the owner, 10 Nov): "Mars MC band: 60 km from the line, its orb 111 km, at <time>", for each band an item falls in while the lines and their bands are drawn. Nothing scored, ranked or counted. |
| **PW84** | **Bands and parans on by default, faint** (the owner, 10 Nov): two switches on the Planet lines rail (`psi:bands`, `psi:parans`), and choices on the share handle (v82). |
| **PW85** | **An event chart opens from the inspector** (the owner, 11 Nov): a "Chart" action beside Card, Link, Fly to and Its time, on any item with a time and a place, in every mode (PW7); hidden with `?psi=off`. |
| **PW86** | **A left panel, the wheel and its tables** (the owner, 11 Nov): docked left where Story and RLSH open, one of them at a time; the bi-wheel on top (the event's chart inside, the cursor's sky outside, the aspects across drawn through the middle), then the bodies, houses and aspects across as lists; the frame, houses and orbs stated, the frame switchable (Galactic Centre or tropical). |
| **PW87** | **A chart's card later** (the owner, 11 Nov): the wheel and its panel first; a card of a chart, and the share handle's, once the wheel is seen. |
| **PW88** | **A Lists panel on the left** (the owner, 11 Nov): one of the left panels (with Story, RLSH and a chart), tabs for the daily notes, the registrations, the ledger and Intel in a window; opened from the Psi panel's sections and the palette. |
| **PW89** | **Intel in a window is Intel Reports in its window** (the owner, 11 Nov): for the sky event or window open in the Psi panel, every Intel Report whose own time falls inside the window, nearest the exact moment first, each opening its popup and its chart; nothing scored or counted against chance. |
| **PW90** | **Every daily note read, newest first** (the owner, 11 Nov): live notes and the kit's real ones, a week at a time with older weeks below. |
| **PW91** | **A psi mission in Missions and in Psi Watch's lists** (the owner, 11 Nov): Missions' received list shows a `psi_mission_package` as a psi variant of the field mission's card (the Experimental badge, its window, its places), and the Lists panel gains a Missions tab that opens the same card. Every live package passes the checks every received mission passes, its own family's tag in place of `starcom_mission_package`; the kit's invented sample shows only with `?psi=kit`, said to be a sample and unsigned. |
| **PW92** | **The window on the time bar** (the owner, 11 Nov): while a psi mission is open (its card, or its row chosen in the Lists' Missions tab), the time bar, or in Psi Watch the Timestream, shades its window from start to end with the peak marked, the axis reaching it; "Go to the peak" moves the shared cursor there; the card says the window is ahead, in its window or passed at the cursor. From the Missions app, "Go to the peak" opens Psi Watch at the mission, where the band shows. |
| **PW93** | **Taken on, kept here** (the owner, 11 Nov): "Take this mission" as for any mission, kept on this device and listed with the taken missions, the window's state beside it; nothing is sent. A psi mission names no counts, so report back offers none. |
| **PW94** | **The lab, a left panel of its own** (the owner, 11 Nov): "Lab" opens docked left, one of the left panels: a sky configuration (its class, bodies, angle or phase, frame and sign), an event set (conflict, earthquakes, storms) and a window about each return; the exploration fills the panel. The held-back test years stay out (PW75). |
| **PW95** | **Observed against shifted, drawn** (the owner, 11 Nov): the events in the windows counted, and marked on a histogram of the counts the same windows hold under 1,000 random time shifts; no p-value and no verdict words; nothing reads as a result (PW10, PW34). |
| **PW96** | **The board's form drafts; the owner posts** (the owner, 11 Nov): the drafting form (the kit's 2.10: title, hypothesis, event set, sky class and its columns, window and unit, direction and threshold, place, sealed span) checks the draft and gives its JSON to copy; the owner posts it to the notes thread; Starcom sends nothing. |
| **PW97** | **The psi missions note posted** (the owner, 11 Nov: post as drafted): 13f3d545-7103 on the Psi thread, with the lists, and Intel in a window chosen by time, not `a` tags. |
| **PW98** | **A daily note opens what it names** (the owner's follow-ups sweep, 11 Nov; kit 2.3): under each note in the Lists, "It names" lists its items by their own titles. A sky event opens in the Psi panel, which keeps an opened event listed whenever it falls. The field readings open Psi Watch on Field readings. A result opens the registrations. An item Psi Watch does not hold is named by its address and offers nothing. |

## Build order (revised 2026-10-26, PW11)

PsiOps:

1. **The astrology core** (done): positions, the Galactic Centre and tropical frames, aspects, angles, whole-sign and
   Placidus houses, the polar refusal; PsiLines' lines; the window profiles. Checked against the kit.
2. **The shared timeline** (3 h): an event's window drawn from its profile, its state and its age; one component for
   PsiOps and RLSH.
3. **The Psi view** (4 h): Psi Watch's mode behind `?psi=kit`, its seven layers, the legend with Experimental once,
   the scrubber with the curve under the cursor, the fixtures read from the build, FIXTURE marked.
4. **Planet lines on the globe** (4 h), moving with the scrubber.
5. **Field readings, Tested places, Rifts and Windows** from the fixtures (5 h).
6. **Earth's magnetic shield** (5 h): IGRF-14 in TypeScript, the field's strength and dip equator, the poles' drift
   1900–2030, the South Atlantic Anomaly, the auroral oval Starcom already reads.
7. **The ψ field** (6 h): the base bands baked once from open data; the tidal and eclipse terms live; the field in a
   worker on the 2° grid; its definition sent to Mecha Jono for their second implementation.
8. **Event charts** (5 h): a chart wheel beside an Intel Report or a global event, its frame, houses and orbs stated.
9. **The lists** (3 h): the daily note, registrations, the ledger, intel in a window.
10. **The mission screen's psi variant** (3 h).
11. **Share** (4 h): `layersFor("psi.*")`, the shot subject `{ psiEvent, at }`, `whenReady` for psi addresses,
    stepped sweeps, a card with the small badge and its sources line; the PsiOps Briefing.
12. **The lab and the board** (6 h): exploration with time-shift nulls, never a result; the board's views of the
    registry and its drafting form. **Built 11 Nov (PW94–PW96):** the lab a left panel (PsiWatch/PsiLabPanel, opened by the
    Psi panel's "Lab" and the palette), its Explore tab a kind of sky event (aspect, Galactic Centre contact, ingress,
    lunation, lunar apsis, node, station; bodies, angle or phase, frame, sign) against an event set with a window about
    each moment, the moments from echoReturns.ts's `momentsOf` (Echoes' search, now from a spec), counted in
    lab/labExplore.ts on the open record alone (the held-back years and the record's ends leave a window out), the
    windows' count drawn on the counts under 1,000 seeded circular time shifts; its Draft tab the kit's 2.10 form
    (lab/hypothesisDraft.ts: E.adapter, S.class and its `where` columns, period_days, window, unit, direction,
    threshold, place, sealed span), its problems said, its JSON copied, nothing sent. The registry's views are the Lists
    (PW88). The left panels' background made opaque: the Psi panel's words showed through it.

Then RLSH, from `kit/schemas_rlsh.md`: the windows calendar, the recurrence layer, the mission screen's field variant,
the Case view, the coalition view; estimated when read.

## Build order (revised 27 Oct: the exploration, PW49–PW64)

Steps 0–9 are built and live (8 live dccdd9f6, 9a live 4d1e59d7; 6c waits on the Glyph Lexicon), step 10's play by event built. Next, in this order; hours are Starcom's work:

2b. **The live drawer's weak spots** (built, live 9cb1a99e, PW65, PW66): room for the globe, readable lanes, one time control, the
    aspect lane and the observer; the second Psi hue.

3. **The psi and field lanes** (built, live 6e316f01; calls wait for step 9): windows' curves, Psi Alerts and calls; Busy (PW52; every window counts 1, PW67); Kp
   measured, NOAA's 3-day forecast and 27-day outlook; each lane's form by zoom (PW51); a brushed span highlighting
   (PW50); jump keys and marks (PW63).
4. **The graph lanes** (built, live 5cf3acf6, PW45, PW68): the Resonance Score (ported and checked against Cosmic Cypher's own code),
   tidal stress, the elements and modalities; the Cosmic Force mix after its module is ported.
5. **History** (built, live 8251ca89, PW46): Mecha Jono's event set baked (`.local/psi-events/` to
   `public/data/psi-events-*.json`, JSON so it is served); the events lane.

6. **Echoes** (10 h, PW39, PW47, PW49, PW53, PW54, PW69): returns by kind, their ticks, the counts beside the usual
   (6a, live 1c6d4ee0); the places on the globe in three looks, each return a shade older (6b, live 3835c6e6); the
   archetype glyphs once the Glyph Lexicon's picks are in (6c).
7. **The Finder's positive controls** (built, live ab85a838, PW61, PW70): a plate-boundary Zone from the quakes, the 27-day return in Kp.
8. **The alignment lane** (built, live dccdd9f6, PW55, PW71).
9. **Sealed calls** (10 h, PW40, PW44, PW56, PW72, PW75): first built on a kind of Starcom's own (1913, 04c29721) and withdrawn before release, as Mecha Jono had already proposed their `psi_call` shape; rebuilt on it, the seal kept to the fingerprint (PW44), then 9b and 9c. **9a rebuilt 28 Oct:** `services/psiWatch/calls.ts` on their families' kind (30023) and tags (`psi_watch`, `psi_call`, `experimental`, `role:context`, `category:psi`, `category:psi.call`, `schema_version` 0); the seal `d psi-call-<id>` with an `x` tag (SHA-256 of the salt, then the call's text in sorted keys, no spaces) and nothing else; the reveal `d psi-call-<id>-reveal`, an `e` tag to the seal, a `salt` tag and the text as its content. The text holds the window (address, title, start and end in unix seconds), the place (the Zone's code and name), what is expected (PW56) and the words. The kind, the hash's order and the text's keys are asked of Mecha Jono (28 Oct) and live in that one file. Live 4d1e59d7; **9b and 9c built 28 Oct** (see Built).
10. **Side by side, and play by event** (4 h, PW63): play by event built 28 Oct; side by side built 29 Oct (PW73).
11. Then: Earth's magnetic shield with the poles' drift (6 h, PW58; built 30 Oct), the ψ field in its four looks (8 h, PW57; the experiment's steady state, its weights, the core line at the cursor's year: PW78–PW80; built 30 Oct, 11c.1–11c.4),
    parans and line bands (4 h, PW59, PW81–PW84; built 10 Nov: astro/lineBands.ts, the rail's `psi:bands` and `psi:parans`, the inspector's "on a band", share handle v82), event charts then and now (5 h, PW60, PW85–PW87; built 11 Nov: astro/biWheel.ts, PsiWatch/ChartWheel and EventChartPanel, the inspector's "Chart", left panels one at a time, leftPanels.ts; a chart's card PW87 built 11 Nov: `card.chart` on any shot, share handle v83, capture schema 38, chartCard.ts, the wheel's one geometry in features/psi/chartWheelGeometry.ts, the panel's Card), the lists (3 h, PW88–PW90; built 11 Nov: a Lists panel on the left, lists/psiLists.ts, the daily notes by week, registrations, the ledger, Intel in the open window shown in its popup through intelPopupRequests.ts or charted; "All lists" in the Psi panel and the palette), the mission screen's
    psi variant (3 h, PW91–PW93; built 11 Nov: psiWatch/missions/psiMissions.ts, each live package held to the received
    missions' checks with its own family's tag (verifyMissionPackageEvent's `appTag`), the kit's sample said to be one; the
    card's psi part PsiWatch/PsiMissionFacts with the shared window timeline; Missions' PsiMissionsList and the card's badge;
    the Lists' Missions tab; the window marked on the time bar and the Timestream, features/psi/missionWindowMark.ts;
    "Go to the peak" from Missions opening Psi Watch at the mission; a taken psi mission's window state), share with the Timestream strip in any card and the PsiOps Briefing (7 h, PW62, PW77; part 1 built
    28 Oct: the Psi layers, `layersFor`, the `psiEvent` subject and the `psi` card, live bb2d7dc2; part 2, the strip in
    any card, live 3cb9fa1e; part 3, the Briefing card, live b8964b61; part 4, longer and stepped sweeps, built
    28 Oct), the lab and
    the board (6 h), operatives' own sensors (later, PW64).

The ψ field, step by step (PW57, PW78–PW80; the experiment's scripts read, never copied: its `psi_field.py`,
`ley_field.py`, `ley_anchor.py`):

- **11c.1 The base, baked once** (built 30 Oct) (`npm run data:psi-base`, `scripts/psi/bake-psi-base.ts`): EGM96 to degree 12 (NGA,
  public domain; the GRS80 normal field's C20, C40 and C60 removed), PB2002's steps of class OSR and CRB (Bird 2003,
  ODC-By), Natural Earth's 1:110m land (public domain), each fetched once from its publisher into `.local/psi-field/`.
  The geoid's persistence ridges and valleys on the 41,253-node Fibonacci mesh (neighbours from the sphere's
  triangulation; pairs over 0.05 m; the 30 most persistent, two arcs each, valleys from −N), checked against the
  experiment's own: 13 ridge and 16 valley arcs, the most persistent 62.6, 28.9 and 17.5 m and 41.4, 37.3 and 22.1 m.
  Three static bands on the 2° grid (`exp(−d²/2w²)`, w 350 km, d to the nearest sample, polylines every 0.5°) into
  `public/data/psi-base.json`.
- **11c.2 The live terms, in a worker** (built 30 Oct): the core line for the cursor's year (Br = 0 at 3,485 km from the shield's
  IGRF synthesis, traced on a 1° grid, its band); G the four bands' mean over its largest; F from Astronomy Engine's
  sub-Moon and sub-Sun points (degree-2 potential, over its largest magnitude); S a 150 km band on an eclipse's day
  (its centre line every 5 s, ±4 h); the smoothing with the kernel cut at 3ξ; ψ and the value without the tides.
- **11c.3 The four looks** (PW57; built 30 Oct): heat for ψ, contours at fixed steps, relief for G, flow for the tides' change with
  the cursor; one on at a time or together, as the panel chooses.
- **11c.4 The layer** (built 30 Oct): PsiModel implemented, its key and credits (EGM96, PB2002, Natural Earth, IGRF-14, Astronomy
  Engine), the one Experimental badge; the panel's ψ at the observer; `layersFor`, contract v67; tests (a homogeneous
  drive gives √(a/b); the band at w; F's range from −½ to 1); the check in a built page.
- **11c.5 The definition to Mecha Jono** for their second implementation (the owner approves the text).

About 53 hours to side by side, then about 36.

## Built

- **The Timestream, first cut** (step 1, 26 Oct, PW37–PW38, PW41): a drawer above the time scrubber in Psi Watch,
  the work area stopping above it so docked panels shrink and scroll; a lane a body (the ten and the north node on,
  the south node, Lilith and the perigee beside them), coloured by its sign's element in the chart's frame,
  gradient or solid, a violet band at its foot while it moves backward; the UTC ruler (`utcTimeTicks`); zoom from
  an hour to a century about the pointer with Cosmic Cypher's presets and a decade and a century, drag to pan, a
  click or the arrow keys moving the shared cursor; play at a chosen rate, Now. All lanes in one WebGL2 canvas; the
  sky computed in a worker for the latest view only (`timestream/skyColumns.ts`, `Timestream/`). Then the lane
  manager (every lane on or off and moved, kept in this browser) and the frame's switch (Galactic Centre, tropical).
- **The sky lanes** (step 2, 27 Oct, PW42–PW43): the Ascendant and Midheaven on by default, the Descendant and Imum
  Coeli in the manager, cast for the globe's centre to half a degree as it turns, or for a pinned place, named on
  the drawer ("Sky over 12.5°N 3.0°W"); the aspect lane, each major aspect of the ten while in orb on the
  catalogue's orbs, found in the lanes' own columns (the kit's Moon–Mars square to three minutes), a bar across its
  window and a tick at exact, coloured by kind (`DATA_SCALES.aspects`), in six rows, the rest counted.
- **The live drawer's weak spots** (step 2b, 27 Oct, live 9cb1a99e, PW65–PW66): room for the globe (the drawer opens at 30% of
  the window, 160–340 px, collapses to its toolbar and opens so on phones; the globe and the work area stop at its
  measured edge); one time control (TEMPORAL NAV's track hidden in Psi Watch, Now saying Live while live); the
  toolbar on one row, frame and zoom as selects, a View menu holding the lanes, gradient or solid, and the palette,
  Cosmic Cypher's or Okabe and Ito's colour-blind-safe one (kept in this browser); readable lanes (the pointer reads
  a lane's body, sign and degree in the drawer's frame and its motion, a tap does on a touch screen; a dark tick
  where a body enters a sign, unless signs pass faster than one in 8 px; a key of the elements, the hatch and the
  tick under the lanes; sign and element names in six languages); the retrograde mark a light hatch, no hue of its
  own; the aspect lane in rows that grow to eight, 14 px each, a bar's name inside it where it fits, a click opening
  it (its exact moment, the window's edges the view holds) and putting the cursor on exact, a Moon chip taking the
  Moon's aspects out; the observer marked on the globe, a crosshair, dotted once pinned (`useGlobePsiObserver.ts`),
  and named by the Zone it lies in ("Sky over Chad, Darfur and the Sudanese Rifts Zone, 13.0°N 20.0°E";
  `timestream/observer.ts`). The second Psi hue: `DATA_SCALES.psiGround`, violet `#BC34FC`, for Psi Alerts and
  tested places on the globe and their legend swatches, windows staying aqua; the violet farthest from every point
  colour on the globe (0.136 from Operations, 0.137 from AI Watch in OKLab), 4.6 to 1 on gunmetal 950.

- **Side by side** (step 10, 29 Oct, PW63, PW73): the drawer's "Side by side" splits the globe down the middle, the
  Psi layers that change with the moment (Planet lines, Windows, Psi Alerts and Tested places, calls) at now on the
  left and at the cursor on the right, every other layer drawn once; a divider names each half's moment ("Now · …",
  "Cursor · …"). Each of those layers is drawn twice, its now copy in `PsiSplitNow.tsx` (its own minute clock, so the
  globe never re-renders for it), the two copies clipped to their halves by planes through the camera along its
  view, turned with it each render (`globe-engine/splitView.ts`), so the split stays down the screen's middle however
  the globe turns. Echoes and the Finder draw once: they show past returns and plates, the same at either moment. A
  card or a clip draws the cursor's globe whole (`onStill`); a hover answers only for its own half, and the key is the cursor's, as a card draws it. For this visit
  only. Seen in a built page with the cursor on the kit lunation: the Sahel's window lit on the cursor's half alone,
  the card made meanwhile whole.
- **The magnetic shield** (step 11, 30 Oct, PW7, PW58): Earth's field from IGRF-14 (IAGA's coefficients as NOAA NCEI
  serves them, public data: every epoch 1900–2025 and the forecast to 2030), baked with both dip poles' tracks into
  `public/data/psi-igrf14.json` (`npm run data:psi-igrf`) and read only while the layer shows. At the cursor's year:
  the field's strength every 5,000 nT, faint gunmetal; the South Atlantic Anomaly, the field under 30,000 nT, dashed in
  the ground violet, the 25,000 nT line inside it solid; the dip equator in aqua; both dip poles' tracks 1900–2030, ticked each decade, and a bright dot
  where each stands at the cursor (the tracks cased and the dots edged in dark gunmetal, legible over ice and cloud), moving between its yearly points. Synthesised in the browser as IGRF's own program
  does it (degree 13, places geodetic on WGS84 at sea level; `services/psiWatch/shield/`): the 2° grid's lines found
  once a year and kept for the last few, the weakest field found to a few hundredths of a degree, each pole where the
  field stands vertical, within 0.03° of latitude of NOAA's published 2025 positions. Each line's hover names it and
  its year; the panel gives both poles, how far each moves a year, and the weakest field. A cursor before 1900 or
  after 2030 is drawn at the nearer end and the panel says so; past 2025 the key says "forecast". While the timeline is
  live, NOAA SWPC's OVATION aurora forecast is drawn with it (PW7's live auroral oval), keyed and credited as Space
  Weather keys and credits it; paused, the panel says it shows only live. Drawn in both halves
  side by side; a card waits for it (`shieldReadiness`). Share contract v66 lists the layer.
- **The ψ field** (step 11, 30 Oct, PW57, PW78–PW80; 11c.1–11c.4): the experiment's steady state, ported and checked
  against it. The base baked once (`npm run data:psi-base` into `public/data/psi-base.json`, 280 KB): EGM96 to degree 12
  less GRS80's normal field, its persistence ridges and valleys on the 41,253-node Fibonacci mesh (delaunator on a
  stereographic projection, 3n − 6 edges), all 29 arcs identical to the experiment's point for point; PB2002's OSR and
  CRB steps (2,349, as the experiment's); Natural Earth's coasts; each a 350 km band on the 2° grid. Live, in a worker
  (`services/psiWatch/psiField/`): the core's null-flux line for the cursor's year at mid-year (Br = 0 at 3,485 km from
  the shield's IGRF-14, traced on a 1° grid and chained across the antimeridian, pieces under nine places dropped), its
  band; G the four bands' mean over its largest; F from Astronomy Engine's sub-points; S on a central eclipse's day;
  the drive smoothed with the kernel cut at exp(−12.5); ψ, and ψ without the tides for the flow. A moment in some
  40 ms, a new year or eclipse day 200–350 ms; the cursor's and now's requests each keep only their latest. At the
  experiment's two moments, the share of the globe below ψ at its own check place came out at 86.1 and 99.9 percent,
  against its 86.0 and 99.8 without its built term. One shell on the globe in four looks, alone or together as the
  panel chooses (heat in a new aqua ramp, `DATA_SCALES.psiField`; contours each tenth; relief of G in gunmetal; flow
  aqua and violet, crests drifting west, held by a still); the key swatches only the looks on; whenReady waits for
  the moment shown; side by side draws now's in the left half. The panel reads ψ at the observer, its share of the
  globe below, the tides' part, the core line's year and an eclipse's band. Contract v67.
- **Longer and stepped sweeps** (step 11a, part 4, 28 Oct, PW62; the kit's question 3; share contract v65, clip schema
  10): `recordClip({ sweep })` spans up to 400 days while neither Earth Weather nor Space Weather is drawn (their
  forecast hours keep a sweep to a day, every model step loaded first; a sweep without them loads only its ends), so a
  Psi window's weeks or a year of Kp sweep in one clip; `sweep.step` (whole seconds, a minute at least) makes the moment
  jump by it and hold between, as the kit's stepped clips would. The clip's record keeps the step and its caveat says
  "in steps of a day". The contract lists the sweep's fields and both limits.
- **The PsiOps Briefing card** (step 11a, part 3, 28 Oct, PW77; share contract v64, capture schema 32): a shot's subject
  `{ psiBriefing: "latest" }` (and in renderBatch) makes the week from the shot's moment, or now, a front page on the
  `psi` card (`capture/psiBriefing.ts`): the week's windows soonest first, each with its exact moment and its Zones,
  five named and the rest counted; Kp's largest in the week and its day, "expected" where forecast; each Psi Alert open
  at its start with its Zone and end; "No window in the week" and "No Psi Alert open" where so. The globe draws Windows
  with Planet lines and Psi Alerts beside it, the week's first sky event opened, facing the week's places; a Timestream
  strip over the week under it by default (`card.strip: false` drops it). A window of time is refused: the Briefing is the week from
  one moment.
- **The Timestream strip in any card** (step 11a, part 2, 28 Oct, PW62, PW77; share contract v63, capture schema 31):
  a shot's `card.strip` (`true`, or `{ from, until, lanes }`) draws a band at the picture's foot, the planet fitted to
  what is left and nothing else on the card moving (`shareCardLayout`'s `withTimestream`). Drawn by the card itself
  (`timestreamStrip.ts`, `drawTimestreamStrip.ts`) from the drawer's own data with the drawer closed: by default the
  card's moment ±3 days (PW77; at most 92 days) with Windows (each window's weight curve, the card's own event lit),
  Kp (each 3-hour value as the Kp lane draws it, the expected outlined; read through `kpLoad.ts`, kept half an hour)
  and the psi event's bodies (each lane in its sign's element colour, Cosmic Cypher's classic palette, in the
  Galactic Centre frame, hatched while backward); a UTC ruler; the card's moment a line; held-back years quiet
  (PW75). The moment is a psi event's, else the shot's time.at, tonight's start, the timeline window's end or now.
  As drawn the shot states the strip's span and lanes; the record keeps them with the bodies, the frame and the
  windows drawn; the Data line credits the JPL DE440s ephemeris, GFZ's Kp (CC BY 4.0) and NOAA SWPC, and Astronomy
  Engine. Refused while Psi Watch is off.
- **Psi in the share handle** (step 11a, part 1, 28 Oct, PW62, PW77; share contract v62, capture schema 30): the kit's
  share asks (`schemas_psi.md` §3.6). `listLayers()` lists PsiLines, PsiField, PsiZones, PsiRifts and PsiWindows only
  while Psi Watch is on (`?psi=kit` until the key change); `layersFor("psi.*")` puts each family on its layer (a call on
  none). A shot's subject `{ psiEvent: <address>, at: "exact" | <unix> }` (and in renderBatch) opens a kit sky event or
  window as a person would (`psiLinesStore`'s `opened`, which the panel now follows), pauses the timeline at its exact
  moment or a second inside its window (refused outside it), draws a sky event on Planet lines or a window on Windows
  with Planet lines beside it, and faces the window's places or the sky event's first body overhead
  (`capture/psiCard.ts`); `whenReady({ address })` knows a psi address once open. The `psi` template: the event's
  front page (title, exact moment and window in UTC, an ingress's signs, a window's places), the one EXPERIMENTAL
  badge in Psi aqua, the capture's caveats as on every card (PW77), the Data line crediting Astronomy Engine, the JPL
  DE440s ephemeris via Skyfield and, with Field readings, GFZ's Kp (CC BY 4.0), NOAA SWPC and the NIST beacon; no
  publisher named. The Timestream observer's crosshair stays off every capture (`onStill`). Seen in a built page: the
  Venus–Jupiter sextile's card on Venus's MC line, the kit window's card with the Sahel Zone lit and the Sun's and
  Moon's lines; off, no Psi layer is listed and a psi shot is refused with why.
- **Sealed calls** (step 9, 28 Oct, PW40, PW44, PW56, PW72, PW75, PW76; 9a live 4d1e59d7): a coming window's card
  offers "Make a call" (the window, the Zone under the observer, what is expected, the words, a joined team relay);
  Seal keeps the call on this device and sends, through the publish review, only its fingerprint, on Mecha Jono's
  `psi_call` shape (`services/psiWatch/calls.ts`; the note telling them what Starcom sends, 62c1629b-e437). Once the
  window closes the calls lane offers Reveal or Keep private. Teammates' calls (9b, `teamCalls.ts`): each joined team
  relay read for `psi_call` notes, signatures verified, a reveal shown once it holds to its seal, named by its team
  alone ("A call from Blue Team, revealed …"), a seal alone showing nothing; one read for every view, in bursts, read
  again on a change of access. On the globe a revealed call, one's own or a teammate's, lights its Zone while the
  cursor is inside its window. What fell in it (9c, `callLinks.ts`): once a window has closed, an earthquake call's
  card lists each M5.5+ in its Zone and window from USGS's FDSN query (over the Zone's box, then inside its shape;
  each ringed on the globe in its Zone while lit), a storm call's each storm, Kp 5 or more, in its window from the
  Kp lane's record (measured values only, a storm's consecutive slots one), "None of its kind fell in it" where none
  did; linked, never scored (PW36); no year held back is linked. Seen live in a browser with a team relay faked in
  the page: a real M5.7 off Tambolaka (3 Oct) ringed in the Wallacea Zone, the storms of 4–5 and 10–11 Oct (Kp 7+)
  listed.
- **The test years held back** (28 Oct, PW75; Mecha Jono's ask of 27 Oct on the handoff doc's Psi thread, widened
  by their Console addendum to every view): the years their sealed tests are scored on, read once, stay out of every
  Psi view until they post each released (`timestream/withheld.ts`): conflict (ucdp_exact) 2015–2025, storms and Kp
  1966–2025, earthquakes (comcat_m55) 2000–2024. Echoes and the alignment lane leave out every return whose span
  touches them, the globe's looks with them, the usual from the open years alone, the Echoes card saying which years
  are held back; the events lane and the Kp lane draw no bar in them, a quiet hatched band in their place saying
  "2015–2025 held back" (`HeldBand.tsx`), its words on hover; the Finder counts only open years, its plate control
  baked without the quakes of 2000–2024 (now 68.7 quakes per million km² in the most resonant group, 0.6 in the
  least, 11.4 usual) and its 27-day control on the storms of 1932–1965 (day 27 189 against 124.7 usual), each chart
  saying which years are held back. Echoes (6a, 6b) and the alignment lane (8) were live from 1c6d4ee0 and dccdd9f6
  without it, and the events lane, the Kp lane and the Finder showed every year: Starcom had not read the ask until
  28 Oct. The sky events themselves are not affected.
- **Play by event** (step 10, live a64bd672, 28 Oct, PW63): a play rate beside the hours, days and years, "One event a second":
  each second the cursor goes to the next moment N would jump to (a window's peak, an alert's start, a station in the
  drawn sky, an eclipse, the busiest moment in view, a mark), the view following, until none is left.
- **The alignment lane** (step 8, live dccdd9f6, 28 Oct, PW39, PW55, PW71): an Align button on the Echoes card opens a lane under
  the events lane (`AlignLane.tsx`, `timestream/alignment.ts`): the Echo's returns stacked on their exact moments,
  its own axis in days from exact, 30 either side, a bar a day of the events lane's set, the window's own span
  shaded behind, exact marked, a faint dotted usual (the count a day holds across the record, times the returns
  stacked). Only the returns whose whole sixty-one days lie inside the record are stacked, so no day is short of
  returns. A hover reads a day ("Day −28: 638, usual 652.4"); drawn as data. It closes with the Echo, and a new
  Echo starts with it closed. Strings in six languages.
- **The Finder's positive controls** (step 7, live ab85a838, 27 Oct, PW28, PW29, PW61, PW70): a Finder section in the Psi Watch
  panel (`FinderSection.tsx`) lists its archetypes, the two whose answers are known first, opened one at a time
  (`services/psiWatch/finder.ts`). **A Zone on a plate boundary** (place): `scripts/psi/bake-finder.ts`
  (`npm run data:psi-finder`) gives every ZSP 2.0 Zone its share within 150 km of a PB2002 boundary on a half-degree
  grid, with its area and the M5.5+ quakes it held (`public/data/psi-finder-plates.json`, 19 KB, all 12,160 quakes
  in a Zone); the panel draws the Zones in ten groups by that share, least to most, each group's quakes per million
  km² beside the usual (the rate across every Zone), and the globe fills every Zone by its share while the
  archetype is open (`useGlobePsiFinder.ts`, the fills shared with Echoes in `psiZoneFills.ts`). The machinery finds
  the known: the most resonant group holds 145 quakes per million km², the least 1.0, the usual 23.8. **A 27-day
  return of geomagnetic activity** (time): for every storm since 1932, the storms that began each day 1 to 60 days
  after it, day 27 marked, beside the usual (were they scattered at random); it finds the Sun's turn: days 26, 27 and
  28 hold 362, 405 and 373 against a usual of 259. Both drawn as data, a hover reading a bar (PW70). The panel's
  credits add Bird's plate boundaries. Strings in six languages.
- **Echoes on the globe** (step 6b, live 3835c6e6, 27 Oct, PW47, PW54, PW66): while an Echo is shown in Psi Watch, every return's
  gathering at once, the newest brightest, the oldest at a quarter, or the isolated return alone, in the ground's
  violet (`services/psiWatch/echoPlaces.ts`, `useGlobePsiEchoes.ts`); three of PW54's looks, chosen on the Echoes card
  and kept in this browser: **Dots**, each event a round dot; **Heat**, each a soft spot about 2.5° wide summed on a 2°
  grid, drawn as a shell of the grid's own vertices, violet paling in the warmest places, scaled so the warmest
  fiftieth of the warm cells stands at full (one crowded place would otherwise leave every other faint); **Zones**,
  each ZSP 2.0 Zone filled by how many fell in it, its count in the hover. The shell and the fills stand a little over
  the countries' own fills, which pull themselves forward, so the Echo is not lost under them; a Zone's fill takes
  its own copy of the cached material, its count set each time. The events lane's set is shared state now
  (`timestream/eventSetChoice.ts`), so the globe draws from the set the lane shows. The fourth look, the archetype
  glyphs, waits on the Glyph Lexicon (6c).
- **Echoes, in the drawer** (step 6a, live 1c6d4ee0, 27 Oct, PW39, PW47, PW49, PW53, PW69): a window's card offers Echoes where its
  sky event's kind is one Echoes find again (a focus window by the sky event it is on). The returns
  (`timestream/echoReturns.ts`, from the draft): an aspect by its pair at the same angle either side, a Galactic Centre
  contact by its body's angle from the Centre, an ingress by its body entering the same sign in the note's frame, a
  lunation by its phase with the Moon in the same sign, a perigee or apogee each time, a node crossed the same way, a
  station by its planet turning the same way in the same sign; a kind whose note names no frame counts its signs in
  the drawer's, and changing the frame finds them again. Stepped a day at a time (four days for the slower pairs) and
  bisected to a minute, from 1932 to now, in a worker (`echo.worker.ts`, `echoComputer.ts`; the latest request wins):
  a Moon–Mars square's 2,434 returns take 1.5 s, most kinds well under a second. The Echo is shared state
  (`timestream/echoes.ts`): each return inside the events lane's set's record gathers the set's events within the
  window's own span about it; the usual is the count any span that long holds across the record (PW53). **The Echoes
  card** (`EchoesCard.tsx`, over the lanes' right): the window, its returns since their first year and how many fall
  in the record, then a bar for each return's count with the usual beside it, a thin bar while there is room and a line
  where the returns are many, no sentence reading them; a hover gives a bar's date, count and the usual; a click
  isolates that return and puts the cursor there, All returns shows every one again, Close ends the Echo. While the
  returns are found the card says so with a running bar. **The events lane** ticks every return along its top, the
  newest brightest, the isolated one full height; a click on a tick isolates its return. Strings in six languages
  (Swahili's Echoes are "Marudio", returns, as "Mwangwi" already names Resonance).
- **History and the events lane** (step 5, live 8251ca89, 27 Oct, PW42, PW46, PW51): Mecha Jono's event set baked by
  `scripts/psi/bake-events.ts` (`npm run data:psi-events`) into `public/data/psi-events-{conflict,quakes,storms}.json`:
  UCDP's 119,143 one-day conflict episodes (1989–2025), ComCat's 12,160 declustered earthquakes of M5.5 and up
  (1976–2025) and GFZ's 2,985 storms (1932–2025), each file checked against the kit's manifest (sha256 and rows), its
  kind, licence and credit kept; times in order as steps, places to two decimals, each placed in its ZSP 2.0 Zone by
  Starcom from its own coordinates (the kit names ZSP 1.0's; UCDP's country-level places in none). 2.4 MB, 320 KB and
  22 KB (633, 116 and 5 KB compressed), each fetched only when its set is shown (`timestream/eventSets.ts`,
  `useEventSet.ts`). **The events lane** (`EventsLane.tsx`): the chosen set's events counted by day to two months,
  by week (from Monday) to three years, by year beyond, as bars scaled to the view's most, nothing drawn outside the
  set's record; conflict and earthquakes in the ground's violet (PW66), storms in Kp's storm colour; the lane's name
  is its set's chooser, the earthquakes at first (the lightest to fetch), the choice kept. The hover gives the count
  (episodes, never deaths, as the kit asks), the source and the bucket. Its storms a year match Mecha Jono's own
  (1940 39, 1980 22, 2020 2, 2025 32). The panel's credits name UCDP and USGS ComCat.
- **The graph lanes** (step 4, live 5cf3acf6, 27 Oct, PW45, PW51, PW68): four more psi lanes under Kp, computed in the sky worker
  with the lanes' columns (`timestream/graphColumns.ts`). **Resonance**: Cosmic Cypher's general Resonance Score,
  50 × (1 + 0.7 Aspect Harmony + 0.3 Elemental Coherence) over the ten and the north node with its ten aspects, orbs and
  weights, its signs in the drawer's frame; checked against Cosmic Cypher's own `resonanceScore.ts` run on the same
  longitudes at five dates, 1994–2026, to four decimals, its counts in orb exactly. A line from 20 to 80, faint lines
  at 50 and at Cosmic Cypher's 40 and 60; the hover gives the score and its word (resonant, neutral, dissonant), Aspect
  Harmony and Elemental Coherence, the aspects in orb for and against, and the frame. The node is the mean north node,
  as the North Node lane draws it; Cosmic Cypher's app takes the Moon's next node crossing either way, so about half
  the time its "North Node" stands at the south node (a finding for Cosmic Cypher, not ported). **Tidal stress**: the
  spread of the Moon's and Sun's combined degree-2 tidal potential over the Earth, (Tm + Ts) + √(Tm² + Ts² +
  2·Tm·Ts·cos 2θ) with T = GM/d³ and θ the angle between them, over its 1950–2050 mean (0.68 at the lowest neaps to
  1.38 at perigean springs); a line from 0.6 to 1.45, its mean marked. **Elements** and **Modalities**: each one's share
  of the eleven bodies, stacked, the elements in the drawer's palette and the modalities in three greys. A column wider
  than six hours takes up to sixteen samples (PW51), the Sun, the Moon, Mercury, Venus, Mars and the node exact at
  each, the slower planets at the column's middle: a wide view draws each column's mean with its range shaded and its
  hover gives the range. Resonance and Tidal stress are on at first, the shares off; a browser that saved its lanes
  before meets the new ones as at first (a second key lists the lanes it has been offered).
- **The psi and field lanes** (step 3, live 6e316f01, 27 Oct, PW42, PW50–PW52, PW63): over the sky's lanes, four more, each on or
  off in the View menu. **Busy** (`timestream/busy.ts`): every open window's curve summed, the sky's own aspects from
  the lanes' columns weighed as the catalogue weighs its windows, Mecha Jono's other windows (lunar distance, nodes,
  ingresses, stations, focus windows) from their profiles, an aspect the columns already hold counted once; each
  counting 1 at its exact moment (PW67; built first weighted by rarity, which the owner dropped). How often each
  kind recurs (`timestream/recurrence.ts`) comes from mean motions, a pair's synodic period as the sky shows it,
  and is said in the hover. Drawn to the view's busiest moment or a floor of 2, that moment ticked "busiest", no
  number shown (PW36); a hover names what is open, nearest its peak first, each "about every 14 days", "4 months",
  "20 years". **Windows** and **Psi Alerts**: the
  notes' windows as their curves (a band at full height), their peaks ticked, alerts as violet spans; a click opens
  one below its lane and puts the cursor on its peak or start (`SpanLane.tsx`, which the aspect lane now draws with).
  **Kp** (`timestream/kp.ts`, `KpLane.tsx`): GFZ Potsdam's 3-hourly Kp since 1932 baked into
  `public/data/psi-kp-gfz.json` (CC BY 4.0, its credit in the file; one punctuation character a slot, so no run of
  slots can read as a credential to the bundle's secret guard, which a digit-and-colon encoding once tripped), then
  NOAA SWPC's last 30 days, 3-day forecast and 27-day outlook, live every half hour while the lane shows; GFZ stands
  over NOAA, NOAA's observed over its estimate over its forecast. Bars by level (`DATA_SCALES.kpLevels`: quiet grey,
  Kp 4 yellow, G1 amber to G5 pale rose), measured solid, forecast and outlook outlined, a line at Kp 5; the hover
  gives Kp in thirds, its G level and its source. Its form by the zoom (PW51): 3-hourly to two months, each day's
  largest to three years, storm days to a decade, then storms a year, a storm's consecutive days one storm, as Mecha
  Jono's storm set counts them (the counts match theirs year for year, 1932–2025). **The other lanes by the zoom**
  (PW51): the aspect lane and Busy keep the slow pairs (Mars outward) from a year, Jupiter outward from a decade; the
  Moon's lane becomes new and full moons past four months and the eclipses alone past three years, solar gold and
  lunar copper (`DATA_SCALES.eclipses`), a total, annular or hybrid one at full height (`timestream/moonMarks.ts`, in
  the sky worker: a century's eclipses take half a second); the angles, which turn daily, are drawn plain past two
  months. **A brushed span** (PW50, `timestream/brush.ts`): Shift-drag across the lanes; outside it every lane under a
  shade, on the globe the alerts and windows outside it at a third of their strength and those touching it lit (a
  window at its strongest there), in the panel what lies outside at 0.45; Shift-click, Escape or the toolbar's
  "Clear span" clears it. **Jump keys and marks** (PW63, `timestream/jumps.ts`): N and P, or the toolbar's ‹ and ›,
  to the next or previous window peak, alert start, station in the drawn sky, eclipse (searched either way), the
  view's busiest moment or mark; M or "Mark" pins the cursor as a flag on the ruler, a click on it opens Remove; up to
  50 kept in this browser. On phones the toolbar drops the title, the observer's words and the play rate. Fixed with
  it: four places drew `GUNMETAL[50]`, a shade the tokens do not have (the aspect lane's names were drawn in their
  bar's own colour, the observer's crosshair without its light arms); `strict: false` let it through.
  Starcom's proposals: the owner dropped the rarity weights (PW67) and kept Busy's floor, the Moon's eclipses past
  three years and the angles drawn plain; the forms' other thresholds stand as built.
- **Field readings, Tested places, Psi Alerts and Windows** (step 5, 26 Oct, PW32–PW33): the readings strip and the
  three lists were in the panel since step 3; the three now draw on the globe (`useGlobePsiZones.ts`, placed by the pure
  `psiPlaces.ts`) from each place's area outline (`areas-lod0`), so a retired Zone is the Zones that hold it. Windows
  are built once and only their strength and words change as the cursor moves. Strings in six languages.

- **PW23 and the catalogue's orb table** (26 Oct): the Ascendant turned to the east past the polar circles, checked
  at 70°N, Svalbard and 70°S over a day (always on the eastern horizon, always 0–180° past the MC); the orbs by
  Mecha Jono's pair kinds, checked against `kit/orbs.json` for every pair.
- **The astrology core** (`src/services/psiWatch/astro/`): `sky.ts` (geocentric apparent places in the true ecliptic
  of date, the mean node, speeds and retrogrades), `frames.ts` (the Galactic Centre frame from Sgr A*'s apparent place;
  tropical), `aspects.ts` (three orb schemes, the catalogue's by default, each aspect's weight and whether it applies),
  `angles.ts`, `houses.ts` (whole sign; Placidus by semi-arcs, refused past the polar circles), `chart.ts` (a chart
  with its frame, houses, orbs and caveats), `lines.ts` (PsiLines' MC, IC, ASC and DSC). `windowProfile.ts`: the four
  profile kinds, bounded by an event's own window. Tested against Meeus's worked examples, the owner's Galactic Centre
  tables, Placidus's own definition and a second solver, and the kit's vectors.

- **The shared timeline** (`src/components/PsiWatch/WindowTimeline.tsx`, step 2): an event's window from its profile,
  bounded by its own window tag; its opening, exact or busiest moment and end in UTC, the viewer's own on hover; the
  shared cursor (D-E) with the weight under it, moved by a click or the keys; its state and its age; a station or an
  unknown kind as a band. The state follows `schemas_rlsh.md` §1.2 (`shownState`), checked against the kit's RLSH
  vectors with the weights.
- **The Psi view** (step 3): the mode `PsiWatch` and its seven layers on the rails, in quick access and in deeplinks,
  all only with `?psi=kit` (`psiKitSwitch.ts`, kept for the tab, `?psi=off` to leave); a stored Psi Watch opens the
  default without the switch. Its panel (`PsiWatchPanel.tsx`): the one Experimental badge; what the kit's values are;
  the layers on, and which draw nothing yet; the chosen layer's section first (field readings with ages, percentiles
  and credits; results as published with "A correlation, not a cause."; rifts; windows on the timeline); the sky's
  events for 30 days on the timeline; the daily note, registrations with whether a result exists, the ledger. The
  invented marked FIXTURE, never the sky, the field or the registration. The kit's fixtures load as their own chunks
  only when the view opens (`kitFixtures.ts`), each refused unless signed by the new key. The layers stay out of the
  share handle until step 11: its contract lists none of them.
- **Planet lines on the globe** (step 4, `useGlobePsiLines.ts`, `astro/lineGeometry.ts`, PW20–PW22): the bodies of
  the sky event open in the panel, or all ten on its switch, four lines each: the MC from pole to pole, solid; the
  IC, dashed; the ASC and DSC through every latitude where the body rises and sets, thinner, broken where it never
  does and at the antimeridian. At the event's exact moment, or at the shared cursor inside its window, by the
  minute. One aqua; each line labelled with its body and angle near 40°N and in its hover ("Mars MC: where Mars
  stands overhead, at 27 Oct 02:18Z"). The curves pass through the kit's horizon vectors within 0.05°, and every
  point stands where the globe places all others.

New English strings (PW15), in the catalogue under `psiWatch` in all six languages, machine-drafted: the timeline's
(`psiWatch.timeline`: the marks Opens, Exact, Busiest, Ends; the weight line; the band and outside lines; FIXTURE and
its note; the states On the schedule, Armed, Live, Closed and, for the sky, Ahead, In its window, Passed; Updated …
ago), the lines' (`psiWatch.lines`: the ten bodies' names, the four hover lines, the key's words) and the panel's (`psiWatch.panel`: Psi Watch, Experimental, the kit lines, the field channels' names, the
sections, sealed, result and ledger lines, "A correlation, not a cause.", "Lines for all ten bodies"). The layer names are the catalogue's, in
English, as every layer's is. The chart's caveats are in `chart.ts` and `houses.ts` until a view shows them.

**Fixed 2026-10-26, on the live site:** the fixtures first sat in `docs/missions`, which `.vercelignore` keeps out of
every deploy, so starcom.app built the kit's glob empty and showed no sky, while every local build had it. They moved
into `src/services/psiWatch/kit-v0/`, and the build-inputs guard now checks every `import.meta.glob` in src: it must
match a file here, and every file it matches must reach the deploy.

**Checked 2026-10-26, for the key change:** no reader of The Record takes Mecha Jono's notes by author alone, so
none would draw a `psi_` note outside Psi Watch: each filters by its topic (`#t`), Raver Watch's kind-31923 reader by
`raver_watch`, and mission packages by `starcom_mission_package`, which a psi package never carries (the kit's
question 1).

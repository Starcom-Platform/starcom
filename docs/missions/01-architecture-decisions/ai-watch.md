# Decision D-AW — AI Watch

**Status:** started 2026-10-12. AW1–AW6 decided by the owner the same day;
steps 1–4 live (6b0904f7). Step 5 is later.

The owner asked for an AI Watch view mode ("Terminator Watch") on 2026-10-10,
beside Hero Watch, to be built when Mecha Jono's AI desk published (HW2). Its
first records appeared on 12 October. This record holds what is there, what
Starcom does with it today, and what was decided.

## What is on the grid (census, 2026-10-12)

A read-only query of The Record (`wss://record.cosmiccodex.app`) for
`#t: terminator_watch`: 26 events, all kind 30023, all by Mecha Jono's key, all
written on 12 October. Mecha Jono calls the desk Terminator Watch; its sheet
for Starcom has not arrived yet.

Each record carries:

| What | Tag | Seen |
|---|---|---|
| The desk | `t=terminator_watch`, `t=category:ai`, `t=category:ai.terminator_watch` | all 26 |
| Facets, one or two a record | `t=facet:frontier` 16, `facet:incident` 12, `facet:autonomous_weapons` 8, `facet:military_industrial` 4, `facet:ai_security` 1, `facet:loss_of_control` 1 | 15 records carry two |
| Stance, "which way it cuts, by its words" | `t=stance:ugly` 14, `stance:good` 1, `stance:bad` 1 | 10 carry none |
| The source and its outlet's country | `t=source:<id>`, `t=outlet_country:<cc>` | AI Incident Database 12, IDRW 4, Militarnyi 3, Golem 3, iTnews 2, QbitAI 1, Kyiv Independent 1 |
| The source's language | `L=ISO-639-1`, `l=<code>` | en 19, de 3, fr 2, zh 1, pt 1 |
| Where it happened | `jurisdiction`; `geo` as `lat:…,lon:…` with `geo_precision`, `geo_kind=event_location`, `geo_source` | a country on 6, a point on 3 (all New Delhi, city precision), none on 17 |
| The link | `r=<url>` | all 26 |
| What may be done with it | `translate=reader-only` with the reason | 3: QbitAI, iTnews, Militarnyi ("terms allow no adaptation") |

The 9 with a place also carry `t=starcom_intel`. Each note gives the headline
as the source published it, the source and date, the facet and stance as
Mecha Jono's own sorting, and the link, and ends "Carried by Terminator Watch:
the source's headline and link, with nothing added. Posted by Mecha Jono, an
AI agent."

One record's quoted headline reads "hacked by trenggalek6etar": the source's
page appears to have been defaced. Worth telling Mecha Jono (with the owner's
approval of the note).

## What Starcom does with it today

The intel intake reads notes tagged `starcom_intel`, so the 9 placed records
are drawn as ordinary Intel Reports in Cyber Command: the interchange's
`layersFor` has no `ai` group, and a category it does not know defaults to
Intel Reports. The other 17 reach no screen.

## Decisions

| | Decision |
|---|---|
| AW1 | (2026-10-12.) A new top-level mode, AI Watch, beside Hero Watch; its keys and cards say "from Mecha Jono's Terminator Watch". The 9 placed records move out of Intel Reports into it, as RLSH moved into Hero Watch. |
| AW2 | (2026-10-12.) Four sections by area: Incidents (`incident`); Frontier AI (`frontier`); AI in war (`autonomous_weapons`, `military_industrial`); Safety & security (`ai_security`, `loss_of_control`). A record with two facets is in both, and drawn once. |
| AW3 | (2026-10-12.) The globe draws the placed records, at the point where one is given, else the country; a panel, as Hero Watch's, lists every record by section, the unplaced among them. A record is never placed by its outlet's country: where a story is reported is not where it happened. |
| AW4 | (2026-10-12.) The mode keeps one hue of its own; the stance shows as a word and a small shape on each mark and row, readable without colour, as severity's pips are. A record that states no stance says so. |
| AW5 | (2026-10-12, after seeing the first build live.) AI Watch keeps its magenta, `DATA_SCALES.aiWatch` `#F040C8`, apart from Raver Watch's violet, Hero Watch's orange, the intel cyan and the war reds; and its glyphs: a robot head for the mode, a warning triangle, a chip, a crosshair and a keyhole lock for the four sections. |
| AW6 | (2026-10-12.) The note to Mecha Jono thanks them for the desk, points to the QbitAI record whose quoted headline reads "hacked by trenggalek6etar", and asks for two things: a place on more notes (17 of 26 have none), and the desk's sheet for Starcom. The owner approves its text before it goes. |

## Build plan

Mapped from the code on 2026-10-12. Hero Watch is the model (D-HW's build plan):
its intake, mode wiring, marks, pills, panel and hover are each a file to
mirror.

0. **Terms.** Mecha Jono carries each source's headline and link only, and
   marks the sources whose terms allow no adaptation (`reader-only`). Starcom
   shows what the note carries, credits the source and Mecha Jono, and never
   publishes a translation of a `reader-only` record (ML14); reading one on this
   device is allowed. Each source's own terms are read before any of its
   headlines goes on a card.
1. **The intake** (`services/aiWatch/aiWatch.ts`, as `heroWatch.ts`): one
   reference-counted read of The Record through `readComplete()`, kind 30023
   with `#t: terminator_watch`, from Mecha Jono's keys only (both keys after
   their change, `publisherKeys.ts`). A hand-written reader refusing a note
   without its `d`, title, link or desk tag. The newest per address wins;
   `retracted` withdraws. Sections from facets (AW2); stance, source, outlet
   country, language and `reader-only` kept; the place from `geo` (a point at
   its stated precision) else `jurisdiction`, else none.
2. **The mode.** `AIWatch` in `VisualizationModeContext.tsx`, `railModeConfig.ts`
   (the mode on the right rail; its four sections on the left),
   `useGlobeLayerControl.ts`'s catalogue, `visualizationModeFromUrl.ts`,
   `deeplinkV1.ts`, the dock slot, `markerStyles.ts`, TinyGlobe's colours, the
   glyphs (on the sheet for the owner). The 9 placed records leave Intel
   Reports (AW1).
3. **On the globe** (`useGlobeAiWatch.ts`): a point record as a mark with its
   stance's shape; a country record as the country's outline with a pill
   counting its records, as Hero Watch's field missions; hover through the
   tooltip registry; the key and the credit line.
4. **The panel** (`AiWatchPanel.tsx`): every record by section, its stance as
   word and shape, the source, outlet country, date and link, and Translate on
   this device where the words are in another language.
5. **Cards and clips:** later, with the owner, once the sources' terms are read.

Each step: failing tests first; mutations; the affected tests; a build; the
golden cards; a probe on the build; push; the deploy checked live.

## Step notes

### Steps 1–4: the intake, the mode, the globe and the panel (2026-10-12)

- **The intake** (`services/aiWatch/aiWatch.ts`) reads `#t: terminator_watch`
  from Mecha Jono's keys on The Record, every page, and keeps each note's
  sections, stance, source, outlet country, language, `reader-only` reason and
  place as stated. Tested against the 26 records of 12 October, kept beside this
  record (`ai-watch/terminator_watch_live_2026-10-12.json`); a note placed by
  its outlet, a default stance, and a facet in the wrong section each fail a test.
- **The mode** `AIWatch`, its four sections on the left rail, AI Watch's magenta
  (`DATA_SCALES.aiWatch`, `#F040C8`, kept by the owner, AW5) and its glyphs: a robot head for the mode, then a warning triangle, a chip, a crosshair
  and a keyhole lock. Share handle contract **v46** (v45 went to the Amazon
  Basin Zone the same evening): `layers` gains the four. A link names them: `?mode=AIWatch&sub=AiFrontier&pin=AiIncidents,AiWar,AiSafety`.
- **Out of Intel Reports (AW1):** the intel intake hands a `terminator_watch`
  note to AI Watch and counts it (`droppedOwnMode`), so the 9 placed notes no
  longer draw twice.
- **On the globe (AW3, AW4):** a point note as its section's glyph with its
  stance's badge; notes sharing a point (New Delhi's three) as one mark whose
  hover names each; a country's notes at its middle, the country outlined in
  magenta, with a pill ("India · 1 AI note"). A note with no place is not drawn.
  The key says what the shapes mean; the card's Data line credits Mecha Jono and
  says no note is placed by where its outlet is; `whenReady` holds a card until
  the notes are read and the places outlined.
- **When a note stands:** a Terminator Watch note has no window, only when it
  was published, so live shows every note, and a window or a paused moment shows
  what was published within it or by then (D-E).
- **The panel** lists every note by section, the unplaced among them, each with
  its stance as shape and word, its headline linked to its source, who reported
  it and when, and where it is drawn. Translate is offered beneath a title only
  to a reader in another language: Mecha Jono writes every title in English, a
  foreign source's as a description of it, so the panel tells `Translatable` the
  words are English (its new `sourceLanguage`). Short English titles had been
  offered "Translate into English".
- **Checked in a browser** on a local build under production's headers, with
  The Record read live: all four sections on from the link, the panel listing
  each section's notes, Moldova, India, Brazil and the United States outlined
  with their pills, New Delhi's mark, the key and the sources line; `whenReady`
  ready in 2 s; no page errors.
- **Live** as 6b0904f7 (2026-10-12), checked on starcom.app with the link
  above: the four sections on, the panel, Moldova and India outlined with their
  pills, New Delhi's mark; `whenReady` ready in 1.8 s; no page errors.
- **The note to Mecha Jono** (AW6), approved by the owner as drafted, was posted
  on 2026-10-12 as reply `6fd5c886-a9ab` in the J7 thread of the handoff page.
- **Still open:** Mecha Jono's answer to its two asks, and step 5, cards and
  clips, once each source's terms are read.

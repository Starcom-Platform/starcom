# Decision D-E — one model of time

**Status:** decided 2026-09-13.

## The decision

Every surface that shows time, or filters by it, answers the same four
questions. Until now each answered them for itself. They are now answered once,
for the whole app.

1. **Which time a record has.** The time the thing happened: `eventDate` to
   `eventEndDate` on an intel item, `startDate` to `endDate` on a report,
   `observedFrom` to `observedTo` on an analysis mark. A record is a span, and it
   matches a window when the two overlap, which is the rule
   `marksWithinWindow` already uses. When no event time was given, the record
   falls back to its record time (`updatedAt ?? createdAt`), and the view says
   how many records fell back. An event time known only roughly is drawn as
   rough.
2. **How many cursors.** One. `TemporalContext` is the only owner of live mode
   and of the position, and every surface reads and writes it. In live mode the
   position is now, kept by one ticking clock.
3. **How a time is shown.** In UTC, marked `Z`, through one shared formatter,
   with local time on hover. A time shown in a view that spans more than a day
   carries its date.
4. **What comes before code.** This record, the inventory below, and tests that
   fail today on each measured contradiction.

**How closely an event time is known** (settled 2026-09-14, for step 4). A
report states it in `timePrecisionMs`, the field observations already use. Each
stated time is the start of a window that wide: a date given without a time is
that whole UTC day, stored as 00:00Z known to a day, not as its midnight. Month
and year windows follow the calendar. The composer takes the date and time in
UTC, marked `Z`, with the local time beside it, and says what it will record
before anything is saved. A NetRunner OSINT report carries its mission's
collection window, known to the second: the tools read the target's state
between the mission's start and finish. Starcom's signed Nostr intel broadcasts carry the
event time as optional fields
([change note](../../interchange/2026-09-14-nostr-intel-event-time.md)); a
note's `created_at` stays the time it was signed.

**What a record without an event time says** (settled 2026-09-14, for step 5).
Where time decides what is shown, a count says how many records were placed by
record time instead, how, and why, without guessing why no event time was given:
"31 of 31 reports placed by when they were written — no stated event time." It
appears beside the time controls while they are in use: the globe's status notes
while the cursor is paused, IntelAnalyzer's timeline and time filter, and
IntelWeb's time window once a range is set. In live mode the globe filters
nothing by time, so it says nothing. It is an info note, not a warning: falling
back is the rule, and today it applies to every report. Each record also says
which time placed it wherever its time is shown, "Written: 14 Sep 2026 09:05Z
(no stated event time)" rather than an unlabelled date. The sentences belong in
`services/epistemic/epistemicLanguage.ts` with the app's other disclosures.

**What a paused time selects** (settled 2026-09-14, for step 6). The shared time
state holds a window, a start and an end, not only a moment, so the globe, the
badge, the timeline and the scrubber cannot disagree about its width. A click or
a pause at a moment selects the calendar step the timeline axis shows that
contains it: the week of 27 Jul on a two-month span, the three hours from
18:00Z on a day-long one, where the axis ticks every three hours. The step is
worked out from the span of the data, whether or not
the timeline panel is open. Dragging across the timeline, or pulling the
scrubber into a two-handled range, selects any window; both write the same
shared window and show it as a band. Live mode selects no window and filters
nothing by time, as before, so the globe keeps every record on it.

**How the timeline shows spans and rough times** (settled 2026-09-14, for
step 7). An event with an end is a pin at its start and a bar in its colour
running to its end; a span thinner than the pin reads as a pin. A time is drawn
as rough where how closely it is known, the width of the window each stated time
starts, is wider than the pin at the current zoom: that window is drawn faintly
from the time, behind a hollow pin. A day-wide time on a two-month axis stays a
plain pin. An item's `isEstimated`, a yes or no with no width, draws a hollow
pin and is described as estimated; no width is guessed for it, and it does not
change which windows the item matches. The timeline takes keyboard focus: ← and
→ move between events in time order and ring the focused one. A card gives the
focused or hovered event's name, when it happened in UTC with local time beside,
its span and how closely it is known, and screen readers hear it. Choosing an
event, by clicking its pin or pressing Enter on it, selects the axis step
containing its start, the rule a click anywhere on the axis already follows.
The axis the timeline and the scrubber share runs from a little before the first
start to a little after the last end, so no bar is cut off at its edge.

**How eco playback and the analyzer share the time** (settled 2026-09-14, for
step 8). Eco-disaster playback follows the shared time. While it is paused, the
globe shows the last eco snapshot captured at or before the moment it is paused
at: the time clicked, the snapshot stepped to, or the end of a dragged window,
so nothing captured after that moment is drawn. The eco scrubber moves the
shared time from one captured snapshot to the next, and its LIVE is the shared
LIVE. Snapshots exist only for the time the app was open, the last 4,000
fetches, so paused before the first one the eco layer draws nothing and says
so, with the time of the first snapshot. A quake is recent when it happened
within the hour before the time the globe shows: the paused moment, or now in
live mode. IntelAnalyzer's range is the shared window: its brush, its date
inputs and a deep link's range set it, and clearing it returns to live. The
shared time state holds every screen, not only the globe's.

**How the remaining sites show time** (settled 2026-09-14, for step 9). Every
time on screen goes through the shared formatter, in UTC marked `Z`, with the
local time on hover wherever the time is an element of its own. A moment shows
its date and time, so a chat message or a notification from another day is not
read as today; a value that is a day, such as a case's start or a build date,
shows the date alone. Text that is saved or exported, such as an analysis
title, a fusion report or a draft's summary, writes the moment in UTC with its
year: "14 Sep 2026 19:33Z". IntelAnalyzer's filter panel takes its start and end
in UTC, marked `Z`, with the local time beside them, as the report composer
does. Counts go through one shared count formatter, so the search in step 9
finds only the time formatter once the step is done.

## Why it needed deciding

It started as a timeline axis that printed times of day (`17:56, 13:51, 09:45`)
across a range of more than two months. Following that led to the finding that
the app has no single idea of time.

Measured in the running app on 2026-09-13 (dev server, a fresh browser profile,
browser time zone America/Chicago, UTC−5), unless marked as read from code:

- **Five time readouts on one screen, in three conventions.** The corner clock
  read `04:37:54Z` (UTC). MISSION TIME read `23:37L` (local, marked). The time
  scrubber read `Sep 13, 23:37` (local, unmarked). The paused badge read
  `09:24Z – 09:24Z`: a 24-hour window shown as two identical times. The timeline
  axis printed local times of day at ticks 6.9 days apart.
- **The views disagreed about the data.** On a first visit the scrubber said
  `0 events` over an invented range (Jul 15 – Sep 13) for the whole session,
  while the timeline panel said 31 events over Jul 9 – Sep 16. After a reload
  the scrubber said 31. Each view loaded the events once, separately, and was
  never told about new ones; the adapter offered `subscribeToUpdates` and the
  loading hook did not use it (code). The scrubber padded its range by at least a
  day, the timeline by at least an hour (code).
- **The views disagreed about now.** The timeline's `CURRENT` marker sat at 50%
  of its axis while now was at 97%. After a click on the timeline the badge said
  SCRUB and the scrubber still said LIVE and kept ticking the real time; after a
  reload that restored the cursor, the same. In live mode the shared
  `currentTime` never moved after the provider mounted (code).
- **The layers disagreed about which time a record has.** See the inventory.
  Scrubbing to a date in July shows reports edited in July, not reports about
  July.

## Inventory (2026-09-13)

| Surface | Which time it uses | Cursor it follows | How it shows time | What a cursor selects |
|---|---|---|---|---|
| HUD timeline panel (`HUD/CyberCommandCenter/TimelineView`) | item `eventDate`; no end date, no estimate | the shared cursor when paused; `CURRENT` at 50% when live | local `HH:MM` ticks for any span; local dates at the ends | a click sets the shared cursor and leaves live mode |
| Time scrubber (`HUD/TimeScrubber`) | item `eventDate` | its own `isLive` and time, which it writes to the shared cursor | local `Sep 13, 23:37`, unmarked | the slider sets the shared cursor |
| Temporal badge (`HUD/Corners/CyberCommandBottomLeft`) | — | the shared cursor | UTC `HH:MMZ`, no date | shows the ±12 h window |
| Corner clock (`HUD/Corners/CyberCommandTopLeft`) | now | — | UTC `HH:MM:SSZ` | — |
| MISSION TIME (`MainPage/usePrimaryMarqueeData`) | now | — | local, marked `L` | — |
| Globe report pins (`services/intel/globe/reportMarker`, `useGlobeIntelReportPipeline`) | report `updatedAt ?? createdAt`, although reports carry `startDate`/`endDate` | the shared cursor when paused | — | a fixed ±12 h window, matched on that single time |
| Globe analysis marks (`useGlobeIntelMarkers`, `marksWithinWindow`) | `observedFrom`–`observedTo`, by overlap | the shared cursor when paused | — | a fixed ±12 h window; the hidden count is stated |
| Submarine cables (`useCommHubs3D`) | the year a cable entered service | the shared cursor's year, when paused | — | cables in service by that year |
| Eco disasters (`Globe`, `useEcoHistoryPlayback`, `EcoHistoryScrubber`) | when each snapshot was captured; "recent earthquake" by the real clock | its own scrubber and its own LIVE | UTC `YYYY-MM-DD HH:MM:SS UTC` | the latest snapshot at or before its own cursor |
| IntelAnalyzer (`adapters/eventsAdapter`, `FilterContext`, `TimelineHistogram`) | `updatedAt ?? createdAt`, for reports and items alike | its own `timeRange` filter | histogram ticks `%H:%M`; filter chip in local dates | a dragged range filters every view |
| IntelWeb graph (`IntelGraph`, `GraphControls`) | a file's `modifiedAt` | its own `timeRange` | UTC dates | a range filter |
| Case replay (`Intel/CaseReplayPanel`) | activity-log time, a record time by nature | its own step | — | one recorded action at a time |

Where records get an event time today:

- **Reports: nowhere.** No path that creates a report sets `startDate`: the
  workspace console, the new-report page, the NetRunner bridge, the analyzer's
  export, missions, and offline sync all leave it empty. Nostr ingest sets only
  `createdAt`, from the event's `created_at`, and uses the current time when that
  is missing. So under decision 1, every report falls back to record time until
  step 4 below.
- **Intel items:** `eventDate` is written by `timelineAdapter.addEvent` and read
  from vault frontmatter, nowhere else.
- **The ingest envelope already has the right shape.** `SourceObservation`
  carries `timestamp` with `timePrecisionMs`, the width of its uncertainty. That
  is how "known only roughly" should be carried, rather than the `isEstimated`
  flag on items.
- **Cases and Missions** default `startDate` to their creation time. For them
  that is a record time by design, and this decision does not change it.

Also found, from code:

- 63 files format dates for display themselves; there is no shared formatter.
- A scrubbed cursor always selects a fixed ±12 hours, whatever span is on screen.
- `TemporalContext`'s comment names `CyberCommandDataService` as a consumer;
  nothing passes it a time range.
- Every pin on the HUD timeline is white: the event types do not match the keys
  of its colour table.

## Build order

Each step ships on its own. A step is done when its `D-E:` tests stop failing
(turn each `it.fails` into `it` and delete its `today:` twin) and
`npm run probe:time` passes the checks it names.

1. **One formatter, and axis ticks on calendar boundaries.** UTC marked `Z`,
   local on hover, the date whenever a view spans days. HUD timeline, analyzer
   histogram and event bands, badge, scrubber, MISSION TIME.
   Tests: `TimelineView.timeModel`, `TimelineHistogram.timeModel`,
   `CyberCommandBottomLeft.timeModel`, the scrubber's zone test.
2. **One cursor, one clock.** The scrubber reads `TemporalContext` instead of
   keeping its own state; the live position ticks; `CURRENT` sits at now.
   Tests: `TimeScrubber.timeModel`, `TemporalContext.timeModel`, the timeline's
   `CURRENT` test; probe: `CURRENT` at now, a click lands where clicked, the
   scrubber and the badge agree.
3. **One event source.** A shared, subscribed timeline source, so every view
   shows the same events and the same range.
   Tests: `useTimelineData.timeModel`; probe: counts and ranges.
4. **Record event time where it is known.** A field on the report composer, and
   observation time carried from Nostr and OSINT results, with its precision.
   Tests are written with the step.
5. **Event time on every layer, with the fallback stated.** Report pins,
   IntelAnalyzer, IntelWeb, and a shared sentence for records that fell back.
   Tests: `reportMarker.timeModel`, `eventsAdapter.timeModel`.
6. **A window that fits the span, selected by dragging,** in place of the fixed
   ±12 hours.
7. **The timeline shows spans and uncertainty,** with hover and keyboard access.
8. **Eco playback and IntelAnalyzer's filter move onto the shared cursor and
   window,** or say plainly where they do not.
9. **The remaining display sites move onto the formatter** (`src/utils/utcTime.ts`).
   About sixty files format dates themselves; outside tests, the search
   `grep -rlE "toLocale(Date|Time)?String\(" src` should in the end find only the
   formatter.

Left open, for the step that needs each answer:


- How a view other than the HUD timeline draws an event time known only to a
  day or coarser (step 5). The HUD timeline's answer is settled above, for
  step 7.


## Checking where this stands

This record does not keep a status list; these commands derive it.

- `grep -rnE "^[[:space:]]*it\.fails\('D-E" src` lists every contradiction still
  unfixed. It reads only lines that start with the call, so the header comments
  that name `it.fails('D-E: …')` to explain the convention do not count.
- `npx vitest run --config vitest.stable.config.ts -t "time model"` runs the
  tests for them.
- `npm run probe:time -- http://localhost:5211/`, with the dev server running,
  measures the contradictions in the app and prints each check as passing or
  failing.

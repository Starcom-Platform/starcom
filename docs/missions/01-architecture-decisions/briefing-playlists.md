# Briefing playlists: the auto-tour (block G, item 6.1)

The globe tours one brief at a time, worst first, saying at each stop why it is
there. A person starts it with a button; a touch pauses it; when it ends, the
layers, the time window and the camera go back to how that person left them.

It is the first of the viewing experiences (IM3, IM8): "a Situation Room mode
that tours the day's War & Conflict brief, tonight's raves or the heat watch,
with captions". The owner asked for it on 2026-10-01: "animates between the
most important, critical and actionable items worldwide".

## What was there (surveyed 2026-10-09)

- **Camera tracks.** `buildCameraTrack` (cameraTrack.ts) eases between
  keyframes, takes the short way round in longitude and moves altitude
  geometrically. `planReportTour` (reportTour.ts) plans a tour by cluster size
  and nearness, never by importance. Neither has a caller in the app: they are
  reached through the share handle only.
- **Importance.** War & Conflict items carry a role (`critical`, `actionable`,
  `context`) and whether deaths were reported; `backingOf` makes that critical,
  deadly or a report. The brief orders theatres worst first, but its item ids
  are newest first. Raver Watch has red, amber and info levels, and HeatRisk
  0–4. Intel Reports have no roles yet: every relay report is Raw.
- **Captions.** Each layer already says what an item is, for a card
  (`featuredWarConflictFor`, `featuredRaverWatchFor`, `featuredReportFor`).
- **A person taking over** is the controls' `start` event, which code never
  fires. The camera never moves on its own today (SS5, `useTurnToFirstIntel`).
- **Missing:** a ranking, a live player, an on-screen caption and a way in.

## Decisions

The owner's (2026-10-09, multiple choice, all as recommended):

| | Decision |
| --- | --- |
| BP1 | One playlist per brief: War & Conflict today, Raver Watch tonight, the heat watch. A person picks one. |
| BP2 | Worst first, by region: critical before deadly before the rest (red before amber), grouped by theatre or region so the camera does not zigzag, nearest-next inside a group. |
| BP3 | A Tour button by the camera controls. Any drag, zoom or click pauses it, with a Resume; Esc ends it. What it switched is put back when it ends. |
| BP4 | Each stop says why it is shown, then the item's own lines, held for reading time: 4 s plus 1.2 s a line, at most 9 s, with flights of about 2.5 s. |

Mine (reversible):

| | Decision |
| --- | --- |
| BP5 | What each holds. War & Conflict: the newest day of the brief, its items with a place. Raves: tonight's red and amber drug-check alerts and scene incidents first, then tonight's scene events, soonest first (tonight is the next 12 hours, as the panel's Tonight); cancelled events and scene news are left out. Heat: HeatRisk Orange (2 of 4) and above, standing now or tonight. |
| BP6 | Groups. War & Conflict by theatre, and an item on no theatre by its country. Raves and heat by the state or country they name. An item naming neither stands in a 10° cell of its own. |
| BP7 | At most 12 stops. The caption says "3 of 12", and "of 40 today" when more were left out. |
| BP8 | Poses. The opening shows the whole planet (IM9), over the first stop. Each stop is at altitude 1.8, as Show on globe frames one item. A flight across more than 30° of arc rises to the whole planet on the way. |
| BP9 | The camera, the layers and the time window go back to how they were when it ends, by Esc or by its last stop. |
| BP10 | Reduced motion (the system's, or the territories' setting) cuts between stops instead of flying. Holds are unchanged. |
| BP11 | It never moves the camera while a card or clip is being made; the capture's hold pauses it. |
| BP12 | It plays the items it found when it started. Items that arrive later join the next run. |
| BP13 | Screen only for now. A playlist as a clip needs a track that changes the featured item, which clip provenance refuses today (a clip's featured item is constant). |

## A playlist as a clip (BP13 taken up, 2026-10-10)

What was there: `recordClip` renders each frame at an exact moment of a camera
track, at most 900 frames a call (30 s at 30 fps: every frame crosses the
automation boundary). A clip's featured item is constant, and its frames are the
globe alone. The playlist already plans its flights as camera keyframes; the tour
features nothing on screen; its caption is page text.

The owner's (2026-10-10, multiple choice, all as recommended):

| | Decision |
| --- | --- |
| BP14 | One clip at the screen's pace: the opening and as many of the worst stops as fit 30 s (usually 3), the caption saying how many there were in all. |
| BP15 | Captions burned into the frames as the screen shows them, so a clip posted alone says why each place is shown; the clip's record also lists them with their times. |
| BP16 | Recorded by Mecha Jono through the share handle: `recordTour({ playlist })`, returning frames as `recordClip` does (contract v39). The screen tour stays as it is. |

Mine (reversible):

| | Decision |
| --- | --- |
| BP17 | The clip starts on the opening, the whole planet with the playlist's caption, held 3 s, then each stop's flight and hold at the screen's times; stops are kept worst first while the footage fits the frame cap at the rate asked (30 fps: 30 s). |
| BP18 | Nothing is featured, as on screen: each caption names its item, and the record lists every stop's item with its times, as a `tour` track (clip schema 8). |
| BP19 | A caption is drawn as the screen's panel, at the foot of the frame and sized to its height as the end card is, in the same read as the frame. |
| BP20 | The playlist's layers and moment are shown as the screen tour shows them, and they and the camera are put back after, however the recording ends. |
| BP21 | It waits for the layer's read as the screen tour does, then records what arrived; the opening says so, and so does a caveat. |

## Build order

1. The playlist, pure: a brief's items, ranked, grouped and ordered, each with
   its pose, caption and hold. Failing tests first.
2. The player, pure: a state machine on a clock (opening, flying, holding,
   paused, ended), tested with a fake clock.
3. The wiring: the camera, the pause on a person's touch, the capture hold, the
   layers and time window switched and put back, reduced motion.
4. The screen: the Tour button and its playlist picker, the caption, Esc.
5. Seen in the app, then the step notes here.

## Step notes

### Step 1: the playlist (2026-10-09)

- `features/globe/tour/briefingPlaylist.ts`: the worst twelve of what a layer
  offers, by region, each with its pose and its hold, and the flight between
  two stops. Pure.
- `features/globe/tour/playlistSources.ts`: what each playlist holds, as its
  layer already says it for a card. War & Conflict ranks critical, deadly, then
  the rest, and among those its theatre's war, worst first. Raves rank red, then
  amber warnings, then tonight's scene events, soonest first. Heat ranks
  Magenta down to Orange.
- Scene events carry no level, so the first wording of BP5 (red and amber only)
  would have left the raves themselves off a rave tour: corrected before any
  code.
- 21 mutations, all killed (one after the nearest-next test was made to depend
  on nearness alone).

### Step 2: the player (2026-10-09)

- `features/globe/tour/tourPlayer.ts`: a schedule of flights and holds on a
  clock. The whole planet is held 3 s before the first stop. A flight gives a
  pose every tick; a hold gives one on its first tick, to land exactly, and then
  leaves the camera alone. Paused, it gives no pose and keeps its caption.
  Resumed, it flies from wherever the camera was left back to the stop it was
  on, holds it afresh, and goes on. With reduced motion every flight is a cut.
- 11 mutations, all killed (one after a test checked that each flight leaves
  from the stop before, not from where the tour began).

### Step 3: the tour on the globe (2026-10-09)

- `features/globe/tour/useBriefingTour.ts` starts a playlist: it shows the
  playlist's layers and moment, waits up to 20 s for the items to be read, then
  plays the tour a frame at a time. A person's touch (the controls' `start`)
  pauses it; Resume goes on. A card or clip being made pauses it, and it goes on
  after. Esc, the last stop or the globe going away ends it and puts the layers,
  the moment and the camera back. A playlist with nothing in it, or a layer that
  does not load in time, says so and moves nothing.
- The War & Conflict and Raver Watch hooks offer their own candidates
  (`tourCandidates`), and none while their layers are off or still reading The
  Record: a tour started cold waits for the items rather than finding nothing.
- 19 mutations, all killed (one after a test said a tour with nothing to show
  leaves the camera where it was).

### Step 4: the screen (2026-10-09)

- A **Tour** button sits with the camera's buttons. It opens a picker of the
  three playlists, each by its layer's glyph; while a tour runs it reads End
  tour. The caption sits where subtitles go, above the timeline: the playlist and
  "3 of 12 · 70 in all", the title (two lines at most, the whole on hover), why
  it is shown, the item's own lines, Pause or Resume, and End.
- `tourStage.ts` shows a playlist: its layer in front, the layers beside it
  pinned, War & Conflict live and the rest tonight; and puts back the layer in
  front, only the pins it added, and the moment (live, a chosen window or a
  paused moment).
- **Found in the app, not in a test:** Raver Watch marks itself read only once
  it has read every page of every kind, which took longer than 20 s here while
  its items drew within 15. Waiting for that, the rave and heat tours gave up.
  A layer now offers what has arrived and whether its read is done; the tour
  waits up to 20 s for a done read, then tours what has arrived and says so at
  its opening ("Still reading The Record: this tours what had arrived").
- **Seen in the dev server:** War & Conflict today (15 items, Eritrea first,
  critical, then Kramatorsk), Raver Watch tonight (70, red drug-check alerts
  first), the heat watch (25, Florida, then Texas). A drag paused each with its
  caption kept; Esc ended each, put the layers back, and brought the camera back
  to where it started. No page errors.
- 18 mutations, all killed.

### A playlist as a clip (BP13–BP21, 2026-10-10)

- `recordTour({ playlist })` on the share handle (contract v39): `tourClip.ts`
  plans the clip from the playlist, the opening and each stop's flight and hold
  at the screen's times, as many of the worst stops as fit one call's frames;
  `tourCaptionCard.ts` draws the screen's caption panel into each frame, in the
  same read as the render (`captureGlobeFrame`'s overlay); the clip's record has
  a `tour` track and `tour` with every caption and its times (clip schema 8),
  and its end card names the tour and each stop with its time. The caption's
  words are the screen's own (`tourCaption`, lifted out of the player).
- Its tour reaches the recorder only through `recordTour`, never a caller's
  argument; the public `captureFrame` drops an overlay, so a raw frame is the
  globe alone.
- Found on the build: the layers still read the tour's when the call returned,
  and a second later read as before; the put-back was React state not yet
  drawn. `recordTour` now resolves once the front layer, the pins and the
  moment read as before (6af81f58).
- Seen on the build: War & Conflict today, 3 stops at 2 fps, each frame's
  caption the screen's, the end card listing "0:03 …", "0:15 …", "0:26 …". On
  starcom.app: the heat watch at 1 fps, 12 of 25 stops in 2:21, toured from a
  partial read and saying so; layers and camera back as the call returned.
- 24 mutations, all killed. Check script: `.local/scripts/bp13-tour-clip.mjs`.


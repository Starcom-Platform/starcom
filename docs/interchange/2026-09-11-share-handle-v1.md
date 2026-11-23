# Share handle: `window.__starcomShareCard`

> **Superseded on 2026-10-05.** The handle is at v30 and this note describes v1. Read the spec served with
> every deployment at `https://starcom.app/spec/starcom-share-handle.spec.md` (its prose is
> `docs/spec/starcom-share-handle.spec.md`; its reference is built from the code).

**First published** 2026-09-11. **The current version is the one the deployed
contract states;** this note said "2" long after it moved on, which is why it no
longer names one.
**Affects** any agent that drives Starcom's globe to produce images — Mecha
Jono today.
**Action required:** fetch `/.well-known/starcom-share-contract.json` and check
`version` before calling. Do not hardcode the surface from this document.

## Why this note exists

The handle already existed and was already being used. What it did not have was
a version, a published shape, or anything that fails when the shape moves — so
a rename here would have been a silent outage on the other side: `compose`
becomes `undefined`, the run fails unattended, and nothing in this repository
noticed.

That is the condition this project already treats seriously for signed
manifests and NIP-23 bodies. A browser global crosses the same boundary.

## The authority is the deployment, not this file

```
GET https://starcom.app/.well-known/starcom-share-contract.json
```

It states the version, the methods, their argument counts, and the exact keys
each returns. It is generated at build time from
`src/features/globe/capture/shareHandleContract.ts`, which is also what the
running app builds its handle from — one declaration, no retyping.

This document deliberately does not restate the surface. A copy here would go
stale the first time the contract moved, and a reader believing a stale copy is
the failure the contract exists to prevent.

## Versions

Each entry says what the version added; `shareHandleContract.ts` keeps the full
reasons beside the constant.

- **8** (2026-09-29): Raver Watch (globe record, section 19). **Additive.**
  - Its six layers join `layers`.
  - `listReports` gains `layer`, and lists Raver Watch items: id
    `30023:<pubkey>:<d>`, the level as `variant`, time basis `applies`. So
    `frameReports`, `focusReport` and `planReportTour` work on them.
  - `setTimeWindow({ from, until })` moves the app's shared window in unix
    seconds, and `null` returns to live; `getTimeWindow()` reads it.
  - A card's provenance gains `link`, its view as a deeplink v1 that reads back
    as it, plus `window` and `raverWatchItems` (capture schema 10).
- **7**: `planReportTour`; `recordClip` takes `endCard` and `replay`. **Additive.**
- **6**: `describeView`, what is in the picture a card would cut. **Additive.**
- **5**: `listReports`, `frameReports` and `focusReport`; a card names the report
  it features. **Additive.**
- **4**: `listLayers`, `setLayer`, `pinLayers`, `setMarkerStyle` and
  `whenReady`, the controls that decide what is drawn. **Additive.**
- **3** — `recordClip`. **Additive.** Returns frames, not a video file — see
  below for why, and for the one command that turns them into a post.
- **2** — `options` declared per method, and `presets` listed. **Additive.**
  Every v1 call works unchanged; the bump says there is more surface, not that
  anything moved. Landed the same day as v1, before any consumer integrated, so
  there is no migration to do.
- **1** — `compose`, `captureFrame`, `getView`, `setView`.

## What the current version guarantees

- The handle is attached to `window` once the 3D globe view mounts. On a page
  without the globe it is simply absent; that is not a fault.
- Every method returns exactly the keys the contract declares — no more. An
  undeclared key is not a bonus; it is surface nobody agreed to support, and
  the smoke fails if one appears.
- `compose` accepts a `preset`. The published shapes are listed in the contract
  under `presets`.

## A note on what the shapes mean

A preset names the **image area**, not the finished card. `square` draws the
globe in a square; the card is taller, because the disclosure strip is added
below it and its height depends on how much there is to disclose.

That is not a compromise. The layout grows to fit every caveat and refuses
rather than truncating, so a fixed overall shape would mean either dropping
caveats or shrinking the globe toward nothing — and the captures with the most
to disclose are exactly the ones where neither is acceptable.

9:16 is deliberately absent. Reaching it is not a layout change: the globe's
on-screen size follows the camera's vertical field of view, so a tall frame
makes the globe wider than the frame and clips it at the sides. It needs a
camera decision, not a crop.

## Recording clips

`recordClip({ keyframes, fps, quality, settleMs })` returns JPEG frames: the
footage, where frame *i* depicts track time *i/fps* exactly, followed by an
**end card** carrying the clip's caveats. Assemble every frame at that rate:

```
ffmpeg -framerate <fps> -i f%04d.jpg \
  -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart clip.mp4
```

The scale filter makes the dimensions even, which H.264 requires and a
viewport does not guarantee. The result is the form X and Instagram accept.

**Why frames and not a video.** The first implementation used MediaRecorder
and returned webm. Checked with ffprobe, a 4.3 s camera path came out as
3.25 s of footage — the whole path, played a third too fast — because a
real-time encoder on a machine that cannot render in real time does not get
real time back. Every time range in a clip's provenance would then have
pointed at the wrong moment. It also managed about 6.8 fps; headless Chromium
usually has no GPU, so an agent would have produced unpostable footage.

Rendering frame by frame fixes both. Footage time is track time by
construction, and frame rate is a choice rather than a property of the
machine. On the machine this was verified on, 3 s of 30 fps footage took 74 s
to render — slow, and exactly right. When rendering takes much longer than the
footage, the provenance says so, because the world was observed across that
longer span.

**The end card is in `frames` on purpose.** A still share card cannot be
published without its caveats — they are drawn into the image. Video had no
such property until the end card: provenance came back as data beside the
frames, and a clip posted without that data had no caveats at all. Now the
closing frames carry them, over the clip's own final frame, dimmed. Assembling
the video includes them because assembling it includes everything; dropping
them takes a deliberate truncation of the array. `stats.footageFrames` says
where the footage ends, if you need to know.

Each page is held long enough to read, scaled by how many caveats it carries.
Too many to fit on three pages is refused rather than truncated — the same rule
as the still card, for the same reason.

The frames are duplicated to make the hold, which enlarges the return value.
That cost is local — frames are generated in the browser and cross only the
connection between the agent and its own Chromium, never the network. The
alternative, a single card frame with a hold count, would let an assembler that
writes `frames` in order flash the caveats for one thirtieth of a second.

The whole camera path is visited before frame 0, so no region loads its
geometry on camera. A clip in which the layers change is refused; a feed that
changes while rendering is disclosed at the footage moment it affected. See
`clipProvenance.ts` for the rule those follow from.

Limit: 900 frames per call — every frame crosses the automation boundary as an
image. Longer footage is several clips.

## Two versions, and they move independently

- **`version`** — this API. How a picture is obtained.
- **`schemaVersion`** inside a card's `provenance` — the payload. What the
  picture says about itself. The authority is `GLOBE_CAPTURE_SCHEMA_VERSION`
  in `shareCardProvenance.ts`; this line said "Currently `3`" and went stale
  the day it was written. `4` (2026-09-11) is additive: a feed may carry a
  standing `note` about the nature of its data — GDELT's, that its events are
  machine-coded — which also appears once among the `caveats`. `5`
  (2026-09-12) is additive too: `appearance` says how the planet was drawn
  (`skin`) and where its light came from (`lightMode`: `sun`, `headlamp` or
  `flat`). `sun` is the real subsolar point for `capturedAt`; the other two
  are not, and each raises a caveat saying the day and night sides in that
  image are not real. Absent on cards from before `5`. `6` (2026-09-12) adds
  `build.treeDirty`: whether the build came from a tree with uncommitted
  changes. True raises a caveat naming the sha, because a sha with
  uncommitted work behind it invites a reader to fetch that commit and check
  the image against code it was not drawn by. Null means the question could
  not be asked, which is not the same as clean.

Adding a caveat field changes what a card says without changing how it is
obtained; adding a method does the reverse. One number for both would force
false bumps in both directions.

## How a change is prevented from being silent

Three mechanisms, covering different mistakes:

- The **build** fails if the `ShareHandle` interface and the declared contract
  stop describing the same set of names, in either direction.
- A **test** fails if the declaration is edited without its fingerprint being
  updated, which is the moment to decide whether the change is additive or
  breaking and bump the version.
- The **publish step** refuses to emit a contract whose fingerprint does not
  match, so an unreviewed promise cannot reach a public URL.
- The **smoke** fetches the published contract from the running deployment and
  compares it to the live handle, key by key — the only one of the four that
  can catch a bundling or wiring failure.

## If you are integrating

Read `version`. If it is higher than the one you were written against, the
surface may have changed in a way that matters; the contract document tells you
what is there now. If the handle is missing entirely, the globe has not
mounted — wait, rather than concluding the deployment is broken.

Hold one page open and call `setView` between captures rather than reloading.
Measured on this build: a cold load transfers ~10 MB before a frame can be
captured, and a revisited view costs ~0.1 KB.

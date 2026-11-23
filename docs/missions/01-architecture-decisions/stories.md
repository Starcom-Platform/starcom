# Stories (D-ST)

UX plan phase E, item E4 ([`../04-plan/ux-expansion-plan-2026-11.md`](../04-plan/ux-expansion-plan-2026-11.md)):
"a story is steps, each a framing, layers, their choices, a moment, a caption and a hold. Played in the app; exported
as a clip through the tour and clip machinery; shared as a link." OR34 (1 Nov): a story exports as all three: a clip
of the tour, a card for each step, and a link that replays it in Starcom.

## What was there (9 Nov 2026)
Briefing playlists (D-BP, G6.1): a Tour button by the camera controls plays a brief's stops, worst first, each with a
caption, any touch pausing it and Esc ending it, what it switched put back; `recordTour({ playlist })` records one as a
clip of up to 30 s with its captions burned in (v39). Cards are made of one view at a time (compose, a card's window
of the screen); a link carries one view (deeplink v1/v2) and, since A5, an item to open. Nothing lets a person put
views together in an order of their own, say why each is there, and hand that on.

## Decisions
| | |
|---|---|
| **ST1** | **A step is the view as it is** (the owner, 9 Nov): "Add this view" in the Story panel takes the framing, the layers drawn and their choices, and the moment, as they are; the person types a caption and picks a hold (4, 6 or 10 s). Steps reorder up and down; any step can be taken again from the view. |
| **ST2** | **Kept in this browser; the link carries the story** (the owner, 9 Nov): a story is kept as watches are, and its link holds the whole story in its address, so it opens anywhere with nothing published (about 200 characters a step). |
| **ST3** | **A clip runs up to 60 s** (the owner, 9 Nov): every step that fits, each held as set, flights about 2.5 s between; the clip says when steps were left out. |
| **ST4** | **Opened from the palette and by the camera controls** (the owner, 9 Nov): "New story" and each kept story in the palette; a Story button beside the Tour button, where tours play. |
| **ST5** | **The cards come out as one zip** (the owner, 10 Nov): "Cards of every step" makes each step's card in turn, its caption on it, and downloads one .zip (step-01.png …). |
| **ST6** | **A story's link opens on its first step, Play ready** (the owner, 10 Nov): the globe goes to the first step and the Story panel opens with the steps listed; nothing moves until Play. |
| **ST7** | **A story's clip runs at 30 fps** (the owner, 10 Nov): up to 1,800 frames for a story only (other clips keep 900); about twice the time to record and twice the file. |
| **ST8** | **The clip from the handle and in the app** (the owner, 10 Nov): `recordStory({ story })` on the share handle (contract v81) for agents, as tours have `recordTour`; and a Clip button in the Story panel that encodes the same frames to an mp4 in the browser (WebCodecs, not real time, so the timing is exact) with a small muxer loaded only when used. A browser without WebCodecs sees the button greyed, with the reason. |

## Steps
1. The story kept, made and played: the Story panel, "Add this view", captions and holds, the player, the palette's
   commands, the link (ST1, ST2, ST4, ST6).
2. A card of every step, one zip (ST5).
3. The clip: up to 60 s at 30 fps, captions burned in, the steps' layers and windows changing in one clip (ST3, ST7).

## Built
**Step 1 (10 Nov 2026).** features/story/story.ts: a step read and set through the share handle, as a link is: the
camera (to 0.01), the layer and its pins, each drawn layer's choices in force, the window or live; set back in that
order, its choices for this page only (setLayerChoices) and given back to the person's when a story ends. A moment
paused with no window reads as live through the handle, so a step cannot hold one. Kept in this browser
(`starcom:stories`, twenty stories, twelve steps each); the link (`?story=`) carries the whole story deflated
(CompressionStream deflate-raw) in base64url: three steps with their choices come to under 600 characters.
useStoryPlayer.ts plays it as a tour is played: each step set and flown to over 2.5 s (a cut where motion is
reduced), held for its hold; a hand on the globe pauses it, Resume sets the step again and holds it in full, Esc or End
ends it; ended, the view before Play is put back and every layer's choices given back. One player at a time: a story
ends a running tour and a tour a running story. The Story panel (components/Story/) beside Tour: the stories kept, a
story's title, its steps with their caption (280 characters), hold (4, 6, 10 s), up, down, Show, "Take again from the
view" (keeping its caption and hold) and Remove, "Add this view", Play, "Copy link". The palette: "New story", "Open
story: …", "Play story: …". A story's link keeps the story, opens its panel and sets its first step, Play ready (ST6).
Words in six languages; the glyph Lucide's book-open. Seen on the preview (10 Nov, .local/scripts/story-view.mjs): a
story of two views made from the Story button and played, each step reached with its caption, the view before Play
put back exactly when it ended; its link (476 characters) opened in a fresh browser on its first step, the panel open,
"Press Play to start", the story kept. The panel now ends above the caption, which it had covered.

**Step 2 (10 Nov 2026).** "Cards of every step" (storyCards.ts, ST5): each step set and its card made as the Share
button makes one, its caption drawn over the picture as a clip's captions are (layoutTourCaption), the card's record
written back into the file with a caveat that the caption is the story's author's words, and the cards zipped as
step-01.png … with story.txt (each step's caption, the story's link); the view put back after.

**Step 3 (10 Nov 2026).** The clip (storyClip.ts, ST3, ST7, ST8). Planned as a tour's: the footage opens on the first
step held for its hold, each later step a flight of 2.5 s (rising to the whole planet over a long way) and its hold;
each step's span runs from its flight's start to its hold's end, its caption burned in under the story's title and
the step's number, its layers, choices and window set from the span's start (applyTime), the camera left to the track.
Up to 1,800 frames, a minute at 30 fps, for a story only (recordGlobeClip's `maxFrames`, `STORY_FRAMES_LIMIT`); every
other clip keeps 900. Clip schema 14: a `story` track and record (each step's span, layers, window, caption), the
only track that drives layers, so the layers and feeds that change at each step are reported as a sweep's are, with
when; caveats that the captions are the author's and how many steps were shown. Share handle v81:
`recordStory({ story, fps?, quality?, settleMs?, endCard? })`, the view before put back after. In the Story panel,
"Clip (mp4)" records the same clip with each frame streamed (recordGlobeClip's `onFrame`, `keepFrames: false`) into an
H.264 encoder (WebCodecs through Mediabunny 1.65.2, MPL-2.0, loaded only when used; storyMp4.ts), so a minute's frames
are never held at once, each stamped at i / fps; greyed with the reason where the browser cannot encode H.264. Seen
on the preview (10 Nov, .local/scripts/story-clip-check.mjs): recordStory of two steps at 10 fps made 106 frames of
footage, Japan under Eco Disasters with step 1's caption, then the Andes under Earth Weather with step 2's, its record
naming both steps' spans and layers, the view before put back; in Chrome the panel's "Clip (mp4)" made an H.264 file
of 1280 × 660 at 30 fps, 850 frames (10.5 s of footage and the end card), which ffprobe and ffmpeg read whole.

E4 is done: a story kept and played, its link, its cards and its clip.

# The interface upgrade

Written 2026-09-26 for decision D6. The brief, in the owner's words:

> a very awesome Earth Alliance Space Force Cyber Command "Starcom" interface
> that is streamlined and professional looking. Very "power-tool", like we're
> using Photoshop, but for Cyber Investigations and Strategic Intelligence
> Operations. Cyan and Gun-Metal color schemes indeed. (think: EVA UX/UI vibes
> from C&C Tiberian Sun Firestorm)

It also asks for sub-themes per section, colour coding that clearly carries
meaning, glyphs everywhere, careful fonts, and loaders that are practical and
realistic.

The current state is in
[`../00-current-state/visual-system.md`](../00-current-state/visual-system.md):

- 746 distinct colours, and token files nobody uses;
- "critical" drawn in ten colours;
- six fonts named that are never loaded;
- a globe loader that waits on a timer;
- 1,300 emoji.

## What "EVA" should mean here

*Tiberian Sun*'s GDI sidebar in play is brass-trimmed gunmetal: steel-teal
buttons, gold glyphs and an LED power bar. The cyan and lime look belongs to its
menu screens (Operations Manual, pp. 37–43; the C&C wiki's sidebar and EVA
pages). What made it feel like a command interface was its behaviour.

| EVA did this | Starcom does this |
|---|---|
| A permanent rail of build jobs; progress sweeps across each job's icon; "READY" on completion; right-click cancels; queues of five | **A job rail:** every running job (a publish, a fetch, a recon run, an import) is a tile with its own progress, queue count, hold and cancel |
| A power bar: output against demand, going green, yellow or red | **A capacity gauge** for what the work depends on: relays answering against relays needed, an API's remaining quota |
| A radar that shows the faction logo until it is powered, and goes dead in an ion storm | **Panels show live data or say the source is down.** Stale data is never shown as live. |
| Short spoken cues naming a state and an object: "Construction complete", "Unit lost" | **Notifications in that grammar:** "Mission Package published", "Relay lost", "Signature verified". Announced to screen readers, with sound optional and off by default. |
| Hairline frames grouping controls | **Hairline frames,** with bevels only on primary frames |

**Left out, as kitsch:** rivets, grime, chrome pillars, bevels everywhere,
scanlines and static, all-caps pixel type at small sizes, lime body text, a
voice line for every event, and boot sequences with no work behind them.

## A power tool

What makes Photoshop, Blender, IDA, Maltego and i2 feel professional: quiet
chrome, so the content carries the colour; everything in a fixed place; every
action reachable by keyboard and by search; layouts saved per task; nothing
moving unless the state changed.

- **Workspaces per task:** Situation (the globe), Collect, Investigate (cases),
  Assemble (missions), Analyse, Publish. Each keeps its panel layout, as
  Photoshop and Blender do.
- **Fixed, resizable docks:** tools on the left, the work in the centre, the
  inspector on the right. Figma went back to fixed panels because floating ones
  "slowed people down".
- **An inspector split the way Starcom already thinks.** Maltego separates
  "Detail View", what a source returned, from "Property View", what the analyst
  asserts. Starcom's epistemics draw the same line, so the inspector gets two
  labelled parts: **what the source said** and **what I assert**.
- **A command palette that teaches.** Every action is findable, and its shortcut
  is shown where it runs.
- **Linked views.** Selecting a report selects it on the globe, in its case and in
  IntelWeb, as Palantir's views share one data foundation.

## Colour that carries meaning

**One rule: a hue means one kind of thing, everywhere.** Colour is never the only
signal. Every state also has a glyph and a word, because under deuteranopia
(a common red-green deficiency) the "ok" green and "caution" amber are only
0.07 apart in OKLab colour distance (Machado 2009 simulation).

| Hue | Means | Never used for |
|---|---|---|
| **Cyan** | ours, interactive, selected, focus; friend in MIL-STD-2525 | status |
| **Green** | permitted, healthy, done | decoration, brand |
| **Amber** | caution, restricted | "medium", loading |
| **Red** | danger, hostile, failed | brand |
| **Violet** | encrypted, protected | "critical" |
| **Grey** | unknown, stale, not judged | "bad" |

**Standards behind the encodings:**
- **Distribution follows the Traffic Light Protocol (TLP 2.0):** coloured text on
  a black chip, in a fixed place.
  - Public = TLP:CLEAR, "no limit on disclosure".
  - Limited = TLP:GREEN, "within their community": the internal relays.
  - Private = TLP:RED, "for the eyes and ears of individual recipients only":
    it never leaves the workspace.
- **Provenance borrows MIL-STD-2525's frames,** where colour is always backed by
  shape:
  - your own work: a solid cyan frame;
  - a peer's: a dashed cyan frame (2525's "assumed friend");
  - unknown: a yellow quatrefoil with "?";
  - impersonation: a red diamond.
- **Severity is a warm ramp,** from sand through orange to red, with 0–4 pips and
  the word. It has no green, because low harm is not "good". The scale matches
  CVSS's None, Low, Medium, High and Critical.
- **Assessment always prints its Admiralty code** (B2): reliability A–F, and
  information 1–6. It uses lightness steps within one hue; F and 6 are hatched
  grey, because "cannot be judged" is not "bad". Likelihood uses the UK PHIA
  words, and confidence is its own tag.
- **Relay health:** ● ok, ◐ degraded, ✕ down, ◌ stale, each with "checked 40 s
  ago". A light turns grey by itself when its check is old.
- **Encryption:**
  - open: no mark;
  - careful: an amber "redact" mark;
  - protected: a violet lock;
  - decryption failed: a red broken lock;
  - signature verified: a cyan seal.

## The palette

**How it is built.** The palette is built in OKLCH (gunmetal at hue 225, cyan at
210) and converted to sRGB. Contrast is checked with the WCAG 2.2 formula; as a
calibration, `#767676` on white gives the published 4.54.

**Gunmetal:**

| 950 | 900 | 800 | 700 | 600 | 500 | 400 | 300 | 200 | 100 |
|---|---|---|---|---|---|---|---|---|---|
| `#0A1113` | `#131B1E` | `#1C262A` | `#283439` | `#3A474D` | `#5D6C72` | `#818F94` | `#A1ADB2` | `#C7CFD3` | `#E9EEF0` |

**Cyan:**

| 900 | 800 | 700 | 600 | 500 | 400 | 300 | 200 | 100 | 50 |
|---|---|---|---|---|---|---|---|---|---|
| `#002F36` | `#004952` | `#006774` | `#008797` | `#00A5B9` | `#00C3DB` | `#3ADAF2` | `#7CEBFE` | `#B8F4FF` | `#E2FAFF` |

**Roles:**
- **Surfaces:** 950 behind the globe, 900 the app's frame, 800 panels, 700 inputs
  and hover, 600 dividers.
- **Text:** 100 headings, 200 body, 300 secondary, 400 muted.
- **Accent:** cyan 400 is the accent and the focus ring. Cyan 500 fills buttons,
  with gunmetal 950 labels (6.42:1).

**Semantic colours:**
- ok `#6CE98D`
- caution `#FFB848`
- danger `#FF7266`
- unknown `#F3E749`
- protected `#C9ACFF`
- severity 1–4: `#EACF83`, `#FAAB3F`, `#FD8537`, `#FB594D`

**Checked contrast (text on panel gunmetal 800):**

| Colour | Ratio |
|---|---|
| body 200 | 9.77 |
| secondary 300 | 6.72 |
| muted 400 | 4.62 |
| cyan 400 | 7.23 |
| ok | 10.06 |
| caution | 8.97 |
| danger | 5.77 |
| protected | 7.96 |
| severity 1–3 | 6.3 or better |

**Where contrast fails:**
- Muted 400 and cyan 500 fail on inputs (700) as text.
- TLP red fails on panels, so TLP chips keep their own black fill, as TLP
  specifies.
- Input borders on panels need gunmetal 400 (4.62:1); gunmetal 500 reaches only
  2.83:1.

## Type

All three pairings use fonts under the SIL Open Font License, self-hosted once.
Today Orbitron and Rajdhani load twice.

| Pairing | Display | Text | Data | Character |
|---|---|---|---|---|
| **A** | Oxanium 600–700 (x-height .52; tabular figures and slashed zero by default) | IBM Plex Sans (tabular figures and slashed zero by default) | JetBrains Mono (slashed zero) | Closest to EVA and the most legible small. Oxanium says it stays readable "at small sizes and quick glances". |
| **B** | Saira, condensed through its width axis | Source Sans 3 (tabular figures and slashed zero by default) | IBM Plex Mono | Calm and dense |
| **C** | Chakra Petch | Barlow / Barlow Semi Condensed | IBM Plex Mono | More military, like road-sign lettering |

**Why not Inter.** The research measured Inter and rated it highly, but it reads as
generic product UI. IBM Plex Sans and Source Sans 3 carry the same tabular
figures and slashed zero, with a more engineering tone.

**The options, drawn:** the
[Starcom Interface Direction canvas](https://claude.ai/artifact/Kkan7bB9tj7rfQoWA7sNv2)
has six boards:

- a mock Investigate workspace, whose Tweaks switch the type pairing, the
  sub-theme and the EVA strength;
- the colour meaning system;
- the tokens;
- the three pairings side by side;
- real loaders;
- the two sub-theme options.

**Rules in every pairing:**
- **Aldrich stays for the Starcom wordmark only.** With one weight and no tabular
  figures, it cannot carry hierarchy or line up numbers.
- **Nothing under 11 px.** 321 sizes are smaller today.
- **Sentence case,** except labels of three words or fewer.
- **No glowing text.**
- **Keys and hashes always in a mono with a slashed zero.**

## Loaders that are real

**Remove:**
- the globe's fixed 3-second hold, its scripted "ESTABLISHING QUANTUM ENCRYPTED
  CHANNELS" lines and random "matrix" characters;
- the 2.5-second minimum splash;
- IntelWeb's simulated 500 ms delay;
- every hard-coded "ready" light.

**Use:**
- **Stages with counts,** for example "Signed · published to 4 of 6 relays".
- **One row per source,** driven by the protocol's own events. `EOSE` marks the end
  of stored events, `OK` accepts or refuses each publish, and `CLOSED` gives the
  reason. Each row has a timeout. The geopolitical layers popup already works
  this way; it is the pattern to spread.
- **A skeleton** only for a whole view that takes 1–10 s, shaped like what will
  appear.
- **Elapsed time, and a Cancel that really stops the work.** An estimate appears
  only when it is measured.
- **Every status light names its source and when it last checked,** and turns grey
  when that check is old.

## Sub-themes

Each section gets its own look without breaking the colour rule. Two ways:

- **Tint in the frame only.** Each section has a low-chroma tint, used only in its
  header rule, its place in the navigation and its workspace name, never on data
  or status. Missions could take the brass of the GDI sidebar; Collect a steel
  blue.
- **Glyph and label only.** Cyan everywhere; sections differ by their glyph, their
  layout and their name.

## Glyphs

Follow the reference set in `RaveLite-App/RaveLiteApp/src/components/icons`:

- **A symbol registry.** Every meaning has a name, and the name picks the icon and
  its hue as one choice (`Symbol.tsx`), so no call site chooses a colour.
- **One drawing grid:** 24 units, one stroke weight, round caps and joins.
- **The Starcom mark as SVG.**
- **A test that fails any hue too dark** for its background.
- **Order:** the app switcher, the pipeline screens and the HUD first. Those are
  542 of the 1,300 emoji.

## How the change lands

- **8.1 Tokens.** One token file generates the CSS custom properties and the MUI
  theme. This fixes the light palette in Cases and IntelAnalyzer. A new
  `guard-hardcoded-colors.mjs` counts hex and rgb values in `src/` and lets the
  number only go down.
- **8.2 Type.** The chosen families, self-hosted once, plus the rules above.
- **8.3 Loaders.** The fakes go, and the per-source status row becomes a shared
  component.
- **8.4 Semantic components,** used everywhere:
  - `DistributionChip`, `SeverityBadge`, `AssessmentCode`;
  - `RelayHealth`, `EncryptionMark`, `ProvenanceFrame`;
  - `StatusStepper`, `JobRail`, `CapacityGauge`, `SourceStatusList`.
- **8.5 The restyle, section by section:**
  1. Cases, the furthest from the rest;
  2. Missions in OpsCenter;
  3. the report dashboard;
  4. NetRunner;
  5. IntelAnalyzer;
  6. IntelWeb;
  7. the Exchange;
  8. the HUD.
- **8.6 Glyphs,** by the registry.

8.1–8.3 come before the cohort, because every screen built afterwards uses them.
The restyle can continue while the cohort runs.

## Decided 2026-09-26

- **Type:** pairing A, Oxanium, IBM Plex Sans and JetBrains Mono. Aldrich is kept
  for the wordmark.
- **Sub-themes:** a tint in the frame only: header rule, navigation marker and
  workspace name.
- **EVA:** its behaviour with restrained chrome. Bevels on primary frames only;
  sound off by default.

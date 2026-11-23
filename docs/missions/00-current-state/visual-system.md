# The visual system

Audited 2026-09-26, by reading the styles and counting, before the app-wide
interface upgrade (decision D6). Counts leave out tests. Every search was scoped
to `src/`, `public/`, `index.html`, `package.json`, `docs/` and
`tailwind.config.js`.

## Verdict

There is no system. Each app chose its own colours, fonts and loaders, and the
token files that exist go almost unused. Meaning is carried by colour, but
inconsistently: "critical" is drawn in ten different colours, and one amber
means eight unrelated things.

## Colour

- **Hard-coded values:** 3,054 hex, 2,222 rgb/rgba and 134 three.js values, adding
  up to 746 distinct colours:
  - cyans: 95 distinct, 1,381 uses;
  - greens: 75;
  - reds: 65;
  - ambers: 81.

  The most frequent: `#ffffff` 149, `#00c4ff` 142 (plus `rgb(0,196,255)` 238),
  `#00ff88` 124, `#00ff41` 115, `#00f5ff` 103.
- **Tokens nobody uses:**
  - `starcom-cyberpunk.css` defines 101 variables that have 0 uses outside the
    file.
  - `quantum-cyber-design-system.css` defines 110 and is imported nowhere.
  - The most-used variable family, `--intel-*` (116 uses in IntelWeb), is never
    defined.
- **Three MUI themes.** The base theme sets only z-index, so Cases and
  IntelAnalyzer render MUI's default *light* palette inside a dark app.

**One meaning, many colours:**

- **"Critical"** appears as `#ff4d4f`, `#ff4444`, `#ef4444`, `#e44141`, `#F44336`,
  magenta `#d500f9`, purple `#9C27B0` and `0xbd0026`.
- **Two maps are both called `SEVERITY_COLORS`,** with the same keys and
  different scales (`types/CyberAttacks.ts:350`, `hooks/useCyberAttacks3D.ts:121`).
- **"Low"** is cyan in Cases, green elsewhere and amber on resource zones.
  **"High"** has nine values.
- **Mission status** is hex in one panel and MUI colour names in another.
- **No colour at all:** reliability grades, relay health and distribution.

**One colour, many meanings:**

- **Amber:** warning, medium, actionable, ready to package, analysing, loading,
  a disputed line of control, a trade agreement and a tropical storm.
- **Cyan:** the brand, info, a summit, a cable landing, an assessed report, a
  packaged mission, Cases "low" and a C-class solar flare.
- **Green:** success, profit, NetRunner's brand, dispatched and low.
  `0x33dd88` means both a treaty and streamflow.
- **`#ff4444`:** error, market loss, OpsCenter "high" and "critical" elsewhere.

## Fonts

- **Aldrich** is the body default. **Orbitron** and **Rajdhani** are loaded twice,
  self-hosted and from Google Fonts.
- **What text is actually set in** (by the first family named): Courier New 116,
  Aldrich 96, Orbitron 35, Fira Code 13.
- **Named but never loaded:** Fira Code, Inter, JetBrains Mono, Audiowide, IBM
  Plex and Source Code Pro, so each falls back without saying so. Cases and
  IntelAnalyzer get MUI's Roboto stack, which is not loaded either.
- **NetRunner** redefines its two font constants in four files.

## Themes

- **The globe skins are the only working switch:** Blue Marble, day and night,
  cyber Earth, terrain and auto, with sun, headlamp or flat lighting
  (`globeAppearance.ts:18`).
- **Sub-theme scaffolding exists, and none of it works:**
  - the Settings "Color Scheme" is saved but never read;
  - the `[data-screen]` themes are never applied;
  - the per-app `--app-primary` colours are read only by a demo page.
- **How screens are styled:** 99 CSS modules, 16 global stylesheets, 923 MUI
  `sx=` props, 520 inline styles.

## Loaders

- **No real progress:** 14 spinners, all indeterminate; 5 progress bars, only 2
  of them determinate; no skeletons.
- **Real status exists in a few places,** and it is the pattern to spread: the
  geopolitical layers popup (per layer: loading, paused, live, snapshot), the
  marquee's data points, and the globe's degraded-source notice.
- **Fake:**
  - The globe loader holds for a fixed 3 seconds after the globe is ready,
    showing scripted lines such as "ESTABLISHING QUANTUM ENCRYPTED CHANNELS" and
    random "matrix" characters (`GlobeLoadingManager.tsx:71-147`). Its "loaded
    before" flag lives in memory, so it plays on every visit.
  - A 2.5-second minimum splash waits for the page's load event, not the app
    (`PreloaderManager.tsx:23`, `68-83`).
  - IntelWeb adds a deliberate 500 ms "Simulate loading delay"
    (`IntelWebApplication.tsx:329-330`).
  - The Intelligence Dashboard's "INTELLIGENCE SYSTEM READY" is hard-coded
    green.

## Icons

- **1,300 emoji in 177 files.** 542 are in visible UI, 301 of them in the HUD. The
  app switcher's icons are emoji.
- **Libraries:** lucide-react, 124 uses in 19 files; MUI icons, 27 uses.
- **Real glyphs:** the globe's report markers are drawn as SVG pages: text bars,
  an exclamation mark, a chevron, a blank page, a person
  (`intelReportSprites.ts:120-207`).
- **Never used:** 20 raster JPG icons.

**The reference set** named by the iconography directive is
`RaveLite-App/RaveLiteApp/src/components/icons`:
- `Symbol.tsx` maps 110 meaning-based names to a Lucide icon and a hue. Its rule:
  a symbol and its colour are one choice.
- It adds hand-drawn marks (`ElementGlyph`, 9), pictograms (`MoveIcon`, 33),
  and the Starcom mark as SVG.
- The marks sit on a 24-unit grid with a single 1.75 stroke.
- A test fails any hue too dark to read on its background.

## Readability

- **Small type:** 321 of 1,325 font sizes are under 11 px, down to 5–7 px. The
  HUD has 124 of them and NetRunner 84.
- **Uppercase and glow:** 107 CSS uppercase rules and 47 glowing text-shadows.
  Both MUI themes force uppercase buttons.
- **Contrast:** about 112 text colours fall below 4.5:1 on `#0a0a0a`. For example,
  `#666` gives 3.45:1 and `#64748b` on `#0f172a` gives 3.75:1. By contrast,
  `#00c4ff` on `#0a1520` passes at 9.06:1.
- **The keyboard focus ring** is an off-palette teal.

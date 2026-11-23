import type { Corner } from './DockHost';

/**
 * Who sits where, in one file.
 *
 * ─── WHY A REGISTRY AND NOT PROPS AT THE CALL SITE ─────────────────────────
 *
 * Placement only means something in comparison. A corner and an order written
 * inside SecureChatManager tell you nothing about whether it should sit above or
 * below the settings indicator, because the settings indicator is in another
 * file and nobody reads both at once. That is how six components ended up at
 * `top: 20px; right: 20px` — each was individually reasonable.
 *
 * Reading this file is the entire arrangement. Changing it is the entire
 * rearrangement: moving something to another corner, or above its neighbour, is
 * one line here and nothing else — no CSS, no component touched.
 *
 * ─── THE PRINCIPLE BEHIND THE ORDERS ───────────────────────────────────────
 *
 * Persistent things sit nearest the corner so they never move. A component that
 * comes and goes near the corner shoves everything below it, and a status
 * readout that jumps 40px whenever something else appears is harder to read than
 * one further out that stays put.
 *
 * Notifications are the deliberate exception: transient, and the thing most
 * worth seeing. On a short viewport a notification stacked beneath four status
 * chips is one nobody reads, so it takes the corner and everything else accepts
 * being pushed down while one is up.
 *
 * Onboarding goes last. It is first-run only and should not displace working
 * chrome.
 *
 * Gaps of ten, so something can be slotted between two neighbours without
 * renumbering — renumbering is what makes people write 9999 instead.
 */
export const DOCK_SLOTS = {
  // ── top-center ───────────────────────────────────────────────────────────
  // The globe's loading status, under the mode bar (decision D-LS, LS1).
  globeLoadStatus:    { corner: 'top-center', order: 0 },
  // Two layers side by side (D-CM): the bar naming each half, under the loading status, never under it.
  globeCompare:       { corner: 'top-center', order: 10 },

  // ── top-right ────────────────────────────────────────────────────────────
  // Eight components claimed this corner, six of them at the same pixel.
  notifications:      { corner: 'top-right', order: 0 },
  /**
   * The inspector (critique-2026-11-01, OR16, OR20): what a click on the globe opened. Above a Zone's
   * panel, since it is what was clicked last; the adaptive chip at 40 draws nothing. A fixed slot,
   * not one that fits the dock: it is what the person is reading, so the key in the bottom-right
   * corner gives way to it (DockHost publishes the room fixed slots take), and it caps its own
   * height and scrolls inside. Fitting the dock, it was given no room whenever the key was open:
   * the corner's height came to nothing, and the panel ran out under the pipeline chip.
   */
  globeNote:          { corner: 'top-right', order: 30 },
  adaptiveUI:         { corner: 'top-right', order: 40 },
  /**
   * A Zone or a Sector, open (ZSP 1.0): what it is, its ground, and the reports
   * about it. Only while one is open, and long, so it takes the height left in
   * the corner and scrolls inside. Under the notifications, which stay nearest.
   */
  globeZone:          { corner: 'top-right', order: 50, fitsDock: true },
  /** A Sphere, open: its states, its source, and the other Spheres where it was opened. Below a Zone's panel. */
  globeSphere:        { corner: 'top-right', order: 60, fitsDock: true },
  /** An Organisation, open: its members, its source, and the reports about it (D-ZR, ZR10). Shown alone, as Spheres are. */
  globeOrganisation:  { corner: 'top-right', order: 70, fitsDock: true },
  phaseTransition:    { corner: 'top-right', order: 80 },
  /**
   * Takes only the height left in its corner, and scrolls inside. Expanded, the
   * pipeline guide is taller than a 1280×720 corner has room for, and ran onto the
   * bottom bar (decision D-F, step 3).
   */
  newUserHint:        { corner: 'top-right', order: 90, fitsDock: true },

  // ── top-left ────────────────────────────────────────────────────────────
  /**
   * The UTC clock, the current mode, and TinyGlobe, the orientation minimap.
   *
   * Was a HUD corner the layout placed at the top-left of its own area (left 0,
   * top 0), outside the dock. The left rail's buttons sat over the minimap's
   * left edge, and the clock and mode label sat under the top bar, showing only
   * as faint text behind the marquee. Docked, the work area places it clear of
   * the rail, the sub-rail and the bar.
   */
  globeOrientation:   { corner: 'top-left', order: 0 },
  /**
   * How to move the globe, for at most 8 seconds after it loads. At the globe's
   * top centre it sat on the clock on a phone (K16); in the top-right dock, at
   * the notification tier, it drew over a dialog opened in those seconds. Here,
   * under the minimap, it is at the HUD's tier, below every dialog.
   */
  globeNavHint:       { corner: 'top-left', order: 10 },

  // ── bottom-left ──────────────────────────────────────────────────────────
  /**
   * What the globe is NOT showing you.
   *
   * Was absolutely positioned at bottom-left with z-index 20, which put it
   * UNDER the temporal scrubber (z-index 100, same region) — so the disclosure
   * that makes the analysis layer honest was partly unreadable. A caveat you
   * cannot read is not a caveat, and this is the exact collision the dock was
   * built to end.
   */
  globeIntelStatus:   { corner: 'bottom-left', order: 0 },
  /**
   * How much of the network, the work and the planet this node can see — the
   * corpus rather than the current view.
   *
   * Beside the intel status because both are statements about what is NOT
   * here, but it is deliberately its own slot: the status describes this
   * globe's layers, and coverage describes the whole corpus, including axes
   * with nothing to do with the map. Folding them together would let a reader
   * take "0 cells" for "the globe is broken".
   *
   * `fitsDock` (BD4): folded it is one line, but opened on a short window it
   * scrolls inside the room the clock and the minimap leave.
   */
  coverage:           { corner: 'bottom-left', order: 4, fitsDock: true },
  /**
   * The report layer's notes: reports past the cap, reports the priority filter
   * dropped, and, while the cursor is paused, reports placed by when they were
   * written.
   *
   * Was absolutely positioned at bottom 20px, right 20px inside the globe, where
   * the time scrubber covered the lower half of every note: "7 of 7 reports
   * placed by when they" was all a paused globe showed (screenshot, 2026-09-14).
   * It had rarely rendered before that note, so nothing showed the collision.
   * Beside the intel status, since both say what the globe is not showing, or how
   * it placed what it is.
   */
  globeReportNotes:   { corner: 'bottom-left', order: 1 },
  /**
   * LIVE or SCRUB, and the time the globe is showing.
   *
   * Was a HUD corner the layout placed by percentage (left 3%, bottom 2%),
   * outside the dock, so nothing here could avoid it. When the work area began
   * clearing the left rail, the camera controls moved right by the rail's
   * width and landed on top of it; with the sub-rail showing it sat under that
   * too. Docked, it stacks with the rest of the corner instead.
   */
  globeTemporalPosition: { corner: 'bottom-left', order: 2 },
  /**
   * Why eco disasters are not drawn while the shared time is paused before the
   * first eco snapshot, and when that snapshot was captured (decision D-E).
   *
   * Just above the time badge, since it says what that time means for eco. Like
   * the report notes it comes and goes, here with the paused time.
   */
  globeEcoNotes:      { corner: 'bottom-left', order: 3 },
  /**
   * The Case or Mission the globe is showing, what of it is not drawn, and the
   * way back to every report.
   *
   * Above the intel status and below the camera buttons. The status describes
   * the analysis layer; this describes which reports are on the globe at all,
   * and it is the only one of the two with a button.
   */
  globeShownRecord:   { corner: 'bottom-left', order: 5 },
  /**
   * Raver Watch's panel: Live, Tonight, This weekend and the next seven days,
   * which set the shared window, and the notes it cannot draw, listed.
   *
   * Above the shown record and below the camera buttons, and only while a
   * Raver Watch layer is on. Its lists are closed until opened, and scroll
   * inside, so it adds two lines to the corner, not a column.
   */
  raverWatch:         { corner: 'bottom-left', order: 6 },
  /**
   * The area outlined on the globe with no report naming it (BA24), and the
   * way to clear it. Only while one is lit, so further out than the panels
   * that stay, and inside the camera buttons.
   */
  globeLitArea:       { corner: 'bottom-left', order: 7 },
  /**
   * The War & Conflict Brief (WC3): the day's items under each theatre, folded
   * to one line until opened, scrolling inside the room the corner has. Only
   * while the War & Conflict layer is on, so out from the panels that stay.
   */
  warConflictBrief:   { corner: 'bottom-left', order: 8, fitsDock: true },
  /**
   * Hero Watch's panel (D-HW, step 6): the week's summary, relief by country,
   * and what it cannot draw, each folded to one line until opened and
   * scrolling inside. Only while a Hero Watch section is on, so out from the
   * panels that stay, and inside the camera buttons.
   */
  heroWatch:          { corner: 'bottom-left', order: 9, fitsDock: true },
  /**
   * AI Watch's panel (D-AW, AW3): every Terminator Watch note by area, the
   * ones naming no place among them, each folded under its area and
   * scrolling inside. Only while an AI Watch section is on: just past Hero
   * Watch's, which shows in its own mode.
   */
  aiWatch:            { corner: 'bottom-left', order: 9.5, fitsDock: true },
  /**
   * Missions' panel (D-MF, step 5): the missions done from anywhere, or a
   * place's missions once its clipboard is clicked, each opening the
   * mission to take it. Only in Missions mode, so it shares AI Watch's place
   * in the order, scrolling inside the room the corner has.
   */
  missions:           { corner: 'bottom-left', order: 9.6, fitsDock: true },
  /**
   * The Safety windows' calendar (D-RR, RR1): the windows round recurring nights, grouped by their local day. In
   * Missions mode, beside the open missions' panel when both are on, scrolling inside the room the corner has.
   */
  safetyWindows:      { corner: 'bottom-left', order: 9.62, fitsDock: true },
  /**
   * Psi Watch's panel (D-PW, step 3): the legend with its one Experimental badge, the field's readings, the sky's
   * events with their windows, and the daily note, registrations and ledger. Only in Psi Watch, so it shares the
   * place of the other modes' panels, scrolling inside the room the corner has.
   */
  psiWatch:           { corner: 'bottom-left', order: 9.65, fitsDock: true },
  /**
   * Diplomacy's drawer (D-DP, DP8): a place's events with CAMEO's words, Goldstein on its scale and
   * each report, and the primer. Only while Diplomacy is drawn where events happened: just past AI
   * Watch's, scrolling inside the room the corner has.
   */
  diplomacy:          { corner: 'bottom-left', order: 9.7, fitsDock: true },
  /**
   * The globe's zoom / reset / share buttons.
   *
   * Absolutely positioned at `bottom: 20px; left: 20px` with z-index 1000,
   * which is the same corner and the same gutter this dock uses — so the
   * bottom-most button sat underneath globeIntelStatus and could not be
   * clicked. Not a near miss: elementFromPoint at the button's own centre
   * returned the status slot.
   *
   * It had been that way and nobody noticed, because the covered button was
   * "Reset view" and a reset that does nothing reads as a globe that did not
   * need resetting. Adding a fourth button moved the problem onto the new one,
   * which is how it surfaced.
   *
   * Order 10, so the buttons sit above the status readout: the status text
   * grows and shrinks with what the layer is withholding, and controls that
   * slide around under the pointer are worse than a caveat that moves.
   */
  globeCameraControls: { corner: 'bottom-left', order: 10 },
  /**
   * How the layer in front draws its marks — three icon buttons
   * (decision D-F, step 6).
   *
   * Order 11, so it sits FURTHER from the corner than the camera buttons rather
   * than beside them. It comes and goes: it is absent on a layer that does not
   * read a mark style, which is ResourceZones permanently and the un-wired
   * layers for now. This corner's own rule is that something transient near the
   * corner shoves everything below it, and the camera buttons are the one thing
   * here a person aims at by muscle memory — moving them by 34px whenever the
   * sub-mode changes is worse than a control that appears one row out.
   */
  globeMarkStyle:     { corner: 'bottom-left', order: 11 },
  /**
   * The debris clouds' spread since each breakup, played as a modelled lapse (D-GV GV2, step 6). Present only while
   * Satellites draws debris, so it sits beyond the style buttons for the same reason they sit beyond the camera's:
   * what comes and goes goes furthest from the corner.
   */
  globeDebrisLapse:   { corner: 'bottom-left', order: 12 },

  // ── bottom-right ─────────────────────────────────────────────────────────
  /**
   * The "1 LAYER" button that opens the Layers panel.
   *
   * Was a HUD corner placed by percentage in an invisible box a fifth of the
   * layout wide and tall, which took clicks and drags meant for the globe
   * wherever the button was not. Persistent, so it sits nearest the corner;
   * diagnostics, feature unlocks, the identity notice and the coach come and go
   * further out.
   */
  globeLayerCount:    { corner: 'bottom-right', order: 10 },
  /**
   * NetRunner's word that a report went out, or did not (K16). Fixed at the
   * bottom centre, 32px up, it sat on the shell's bottom bar. A notification, so
   * it takes the corner, as the top-right's does.
   */
  snackbar:           { corner: 'bottom-right', order: 0 },
  /**
   * The key to what the marks on the globe mean, from globeLegendStore.
   *
   * Just above the layers button, because it explains what that button turned
   * on. `fitsDock`, like newUserHint: with several layers drawing it is the
   * tallest thing in any corner — every active layer contributes a block of
   * encodings and a row of swatches — so it takes the height left and scrolls
   * inside rather than running onto the bottom bar.
   *
   * It went in at 15 first, on a misreading of the rule above: the gaps are not
   * spare numbers to spend, they are the room the NEXT person needs, and
   * Dock.test.tsx enforces that they stay at ten. Diagnostics and feature
   * unlocks moved out by ten instead — which is the renumbering this corner is
   * meant to absorb, and it touches nothing outside this file.
   */
  globeLegend:        { corner: 'bottom-right', order: 20, fitsDock: true },
  diagnostics:        { corner: 'bottom-right', order: 30 },
  featureUnlocks:     { corner: 'bottom-right', order: 40 },
  /**
   * The notice that this browser made a signing key (K16). It sat fixed at the
   * screen's bottom-right, at z 3200, on Support Ops, the layer count and the key.
   * It comes once and goes when read, so it stacks out here.
   */
  identityNotice:     { corner: 'bottom-right', order: 50 },
  /**
   * The coach's card when the control it means is not on screen (K16); pointing
   * at a control, it stays beside that control. Fixed at bottom 88 it sat on the
   * right rail, the Layers button and the time scrubber.
   */
  coach:              { corner: 'bottom-right', order: 60 },
} as const satisfies Record<string, { corner: Corner; order: number; fitsDock?: true }>;

export type DockSlotName = keyof typeof DOCK_SLOTS;

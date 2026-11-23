/**
 * The stacking order, as values JavaScript can read.
 *
 * ─── WHY THIS EXISTS ALONGSIDE z-index.css ─────────────────────────────────
 *
 * CSS custom properties are invisible to JavaScript at module scope, and MUI's
 * theme needs numbers. So the scale lives here, styles/z-index.css mirrors it
 * for CSS consumers, and a test asserts the two agree. One source, two
 * representations, checked — rather than two sources that drift.
 *
 * ─── THE MUI COLLISION THIS FIXES ──────────────────────────────────────────
 *
 * Sixty-three files import MUI and the app sets no zIndex override, so MUI's
 * own scale was live alongside ours:
 *
 *     MUI   mobileStepper 1000 · fab 1050 · appBar 1100 · drawer 1200
 *           modal 1300 · snackbar 1400 · tooltip 1500
 *
 * Our --z-tooltip was 1500 — tying exactly with MUI's tooltip, so those two
 * stacked by DOM order, which is the bug the scale exists to remove. And a MUI
 * Dialog at 1300 rendered BEHIND our modals at 3100.
 *
 * Only five MUI overlay roles are actually used here: Dialog and Select (both
 * zIndex.modal), Tooltip, Snackbar and one Fab. Those are mapped onto our tiers
 * below; the rest keep MUI's defaults because nothing renders them.
 *
 * ─── AN ORDERING ERROR MUI EXPOSED IN OUR OWN SCALE ────────────────────────
 *
 * The first version put tooltip BELOW modal. MUI puts it above, and MUI is
 * right: a tooltip on a control inside a modal has to be readable, and one
 * rendered behind the thing it explains is worse than none. Reconciling with a
 * mature scale caught a mistake that reasoning from first principles did not.
 *
 * ─── WHY THE NUMBERS ARE HIGH ──────────────────────────────────────────────
 *
 * There are still 151 raw z-index values in the app, ranging from 100 to 10001,
 * and any scale interleaves with them until migration finishes. The tiers are
 * placed so a MIGRATED component beats the common raw values — 1000 appears 57
 * times, 3200 eleven times — because the alternative is that moving a modal onto
 * the scale makes it render behind an un-migrated widget, which would teach
 * everyone that migrating breaks things.
 *
 * The 9999/10000 band is the exception, and those are preloaders and popup
 * managers that belong near the top anyway.
 *
 * ─── NESTED OVERLAYS, STATED AS A LIMIT ────────────────────────────────────
 *
 * A flat scale cannot express "a menu opened from inside a modal". Both MUI and
 * this scale rely on portal order for that: the menu portals after the modal, so
 * it wins on DOM order at the same tier. That works and it is not a design, and
 * it should be revisited when <Surface> lands rather than quietly depended on.
 */

export const LAYERS = {
  /** Below the content. Backdrops, ambient effects, the globe canvas. */
  behind: -1,
  /** Ordinary in-flow content. */
  base: 0,
  /** Lifted within its own section — cards, rows, floating action buttons. */
  raised: 10,
  /** Persistent chrome: HUD bars, rails, the globe's own furniture. */
  hud: 100,
  /** Floating panes the user opened or positioned. */
  panel: 2000,
  /** Anchored to a control, dismissed by moving away: menus, context menus. */
  dropdown: 3000,
  /** The dimmed backing behind a modal. Named so the two cannot drift apart. */
  modalBackdrop: 4000,
  /** Demands attention and blocks what is behind it. */
  modal: 4100,
  /** Outranks modals: it may be reporting that the modal's action failed. */
  notification: 5000,
  /** Annotates whatever is on top, so it goes above everything interactive. */
  tooltip: 6000,
  /** The application is not usable yet, so nothing below needs to be visible. */
  preloader: 9000,
  /** Must be seen even when the app is broken. Deliberately almost empty. */
  critical: 9900,
} as const;

export type LayerName = keyof typeof LAYERS;

/**
 * MUI's zIndex block, expressed in our tiers.
 *
 * Spread into every createTheme call so MUI obeys this scale rather than
 * running a parallel one. Only the roles this app renders are remapped;
 * MUI's relative ordering among them — modal < snackbar < tooltip — is
 * preserved, because it was right.
 */
export const muiZIndex = {
  fab: LAYERS.raised,
  speedDial: LAYERS.raised,
  appBar: LAYERS.hud,
  drawer: LAYERS.panel,
  /** Dialog, Menu, Popover and Select all resolve to this. */
  modal: LAYERS.modal,
  snackbar: LAYERS.notification,
  tooltip: LAYERS.tooltip,
  mobileStepper: LAYERS.raised,
} as const;

import { useEffect, useRef } from 'react';

/**
 * Publishes the usable work area as CSS custom properties on :root.
 *
 * ─── THE PROBLEM ───────────────────────────────────────────────────────────
 *
 * The shell already knows where the work area is — `.workArea` in
 * CyberCommandHUDLayout.module.css computes it from the rail widths, the
 * sub-rail's presence and the breakpoint. (It measured `.center` until
 * 2026-09-13. In embedded mode `.center` is the globe's full-bleed area, so the
 * right and left insets came out as 0 and docked items sat under the rails.) But a CSS module class only cascades
 * to its own descendants, and most of the things that need this answer are not
 * descendants: notifications, floating panels, popups, anything portalled, and
 * every `position: fixed` widget in the app.
 *
 * So they guess. Measured before writing this: eight components pinned to
 * `top: 20px` and twelve to `right: 20px` — roughly ten things stacked in one
 * corner, each having independently decided how much chrome to clear.
 *
 * ─── WHY IT MEASURES INSTEAD OF RE-DECLARING ───────────────────────────────
 *
 * The obvious implementation is a second set of constants: chrome is 48 tall,
 * rails are 32 and 36 wide, do the arithmetic. That is how this codebase got
 * three different hardcoded widths for one sidebar — 110px in BottomBar (whose
 * comment says "Respect LeftSideBar width (110px)"), 120px in
 * DeepSettingsPanel, against the sidebar's actual 128px. Every copy was right
 * when written and wrong afterwards.
 *
 * This reads the element the CSS already positioned. CSS stays the one place
 * the geometry is decided; this only publishes the result somewhere the rest of
 * the app can reach. Breakpoints, embedded mode and the sub-rail toggle come
 * out correct without being enumerated here, because they were never computed
 * here.
 *
 * ─── WHAT IT PUBLISHES ─────────────────────────────────────────────────────
 *
 *   --work-top / --work-right / --work-bottom / --work-left   insets, px
 *   --work-width / --work-height                              extents, px
 *
 * Insets are from the viewport edge, so a component clears the chrome with
 * `top: var(--work-top)` — the same shape as the `top: 20px` it replaces.
 *
 * ─── A BUG THIS EXPOSES ────────────────────────────────────────────────────
 *
 * `.center` uses `top: 5%` with the comment "Below TopBar", but the TopBar is
 * 48px. 5% clears it at 960px tall and does not below that — at 800px the work
 * area starts 40px down and the bar ends at 48px, so the top 8px of every
 * centred thing sits under it. Because this measures, the strut reports the
 * overlap truthfully rather than papering over it; the fix belongs in the CSS
 * where `5%` is written.
 */

/**
 * Fired on window whenever a strut changes.
 *
 * CSS consumers need nothing — `var(--work-top)` updates on its own. JavaScript
 * consumers do, and there is no way to observe a custom property changing.
 *
 * This exists because a floating panel clamped itself against the struts on
 * mount, ran before the first measurement landed, read the CSS fallbacks, and
 * placed its title bar 44px above the top of the screen — where its own close
 * button could not be reached. It had no way to learn it had been given
 * provisional numbers.
 */
export const WORK_AREA_EVENT = 'starcom:workarea';

/** Only touch the DOM when a number actually moved. */
const publish = (el: HTMLElement, name: string, value: number, last: Map<string, number>) => {
  const rounded = Math.round(value);
  if (last.get(name) === rounded) return false;
  last.set(name, rounded);
  el.style.setProperty(name, `${rounded}px`);
  return true;
};

/**
 * One screen owns the work area at a time (decision D-F, step 3.2). The globe's layout
 * publishes the area inside its HUD, and an application screen publishes its own; the
 * one not showing passes `enabled: false`. Two publishers at once would each keep
 * their own last numbers and never correct the other's.
 */
export const useWorkArea = <T extends HTMLElement = HTMLDivElement>({ enabled = true }: { enabled?: boolean } = {}) => {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;

    const root = document.documentElement;
    const last = new Map<string, number>();

    const sync = () => {
      const r = el.getBoundingClientRect();
      // Nothing laid out yet (the preloader is still up): a zero rect would
      // publish the whole viewport width as the right inset. Keep the last real
      // numbers, or the fallbacks in struts.css, until there is a real rect.
      if (r.width === 0 && r.height === 0) return;
      // Bitwise-or, not ||, so every property is published rather than
      // short-circuiting after the first one that moved.
      const changed =
        +publish(root, '--work-top', r.top, last) |
        +publish(root, '--work-left', r.left, last) |
        +publish(root, '--work-right', window.innerWidth - r.right, last) |
        +publish(root, '--work-bottom', window.innerHeight - r.bottom, last) |
        +publish(root, '--work-width', r.width, last) |
        +publish(root, '--work-height', r.height, last);

      if (changed) window.dispatchEvent(new CustomEvent(WORK_AREA_EVENT));
    };

    sync();

    // ResizeObserver catches the element changing size; it does NOT fire when
    // the element merely moves, which is what a sub-rail toggle does to the
    // left inset. Watching the viewport covers the rest.
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener('resize', sync);

    // The rails animate, and a rect read during a transition is a lie that
    // sticks until something else moves. Sample until it settles.
    const settle = window.setInterval(sync, 250);
    const stop = window.setTimeout(() => window.clearInterval(settle), 2000);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
      window.clearInterval(settle);
      window.clearTimeout(stop);
      // Deliberately NOT clearing the properties. The shell unmounting does not
      // mean the work area became unknowable, and clearing them would collapse
      // every consumer to 0 during a route change.
    };
  }, [enabled]);

  return ref;
};

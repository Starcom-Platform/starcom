import React, { createContext, useContext, useMemo, useRef, useState, useEffect } from 'react';
import styles from './Dock.module.css';

/**
 * Four corner docks that anything in the app can put a component into.
 *
 * ─── WHAT THIS REPLACES ────────────────────────────────────────────────────
 *
 * Measured: eight components pin themselves to `top: 20px` and twelve to
 * `right: 20px`. Roughly ten things claim the same corner, each having
 * independently decided how far in to sit, and the one that ends up visible is
 * whichever mounted last. Nothing errors, nothing logs, and it differs by route.
 *
 * components/HUD/Corners looked like the existing answer and is not. Those four
 * files — CyberCommandTopLeft, TopRight, BottomLeft, BottomRight — are content
 * components (an intel status readout, a map selector) that the layout happens
 * to place in corner slots. There is no primitive there for anything else to
 * join, which is why nothing else joined it.
 *
 * ─── WHY A PORTAL AND NOT A WRAPPER ────────────────────────────────────────
 *
 * The components that need docking are scattered through the tree — a chat
 * window inside a provider stack, a status indicator beside the globe, a popup
 * from a manager mounted near the root. Requiring them to become children of a
 * layout element would mean moving them, and moving them would separate each
 * from the context it reads. `<Docked>` leaves a component exactly where it is
 * in the React tree and only changes where it lands on screen.
 *
 * ─── ORDER IS DECLARED, NOT INHERITED ──────────────────────────────────────
 *
 * `order` is required. The bug being fixed is that arrangement was decided by
 * mount order; an optional prop would default straight back to it. A number at
 * the call site is a claim someone can disagree with, which is the point — see
 * DOCK_ORDER for the numbers currently in use.
 *
 * ─── THE DOCK NEVER EATS A CLICK ───────────────────────────────────────────
 *
 * The containers are pointer-events: none and only their children re-enable it.
 * A corner dock spans a real area of screen and the globe underneath has to stay
 * draggable through the empty parts of it.
 */

export const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center'] as const;
export type Corner = (typeof CORNERS)[number];

const BOTTOM_CORNERS = ['bottom-left', 'bottom-right'] as const;
const TOP_CORNERS = ['top-left', 'top-right'] as const;
/** The gap a top dock leaves above the bottom dock on its side, the same as between docked items. */
const DOCK_GAP_PX = 8;

type Nodes = Partial<Record<Corner, HTMLElement>>;

const DockContext = createContext<Nodes | null>(null);

/** Whether a `<Docked>` will find a home. */
export const useDockAvailable = () => useContext(DockContext) !== null;

export const useDockNode = (corner: Corner): HTMLElement | undefined =>
  useContext(DockContext)?.[corner];

export const DockHost: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const refs = useRef<Nodes>({});
  const [nodes, setNodes] = useState<Nodes>({});

  // The refs are populated during commit; publishing them needs a second render
  // so consumers portalling into them see a node rather than undefined.
  useEffect(() => { setNodes({ ...refs.current }); }, []);

  /**
   * Keeps the two docks on each side clear of each other.
   *
   * Every dock was capped only by the work area, so a tall top dock reached down over
   * the bottom one: the pipeline guide, opened, covered the Layers button in the
   * bottom-right corner (decision D-F, step 3). The room each bottom dock takes, its
   * height and the gap above it, is published for the top dock on its side to leave.
   *
   * The bottom docks grew too: at 1280×720 the bottom-left column ran up over the
   * clock and the minimap (BD4). So each top dock also publishes the room its fixed
   * slots keep, their heights and gaps, and the bottom dock on its side leaves that.
   * Only the fixed slots: they are the same height whatever either dock is allowed,
   * so neither limit depends on the other, and a slot that fits its dock gives way
   * by itself.
   *
   * Across the bottom, the left dock takes the width the right one leaves (K2).
   * Each was capped at half the work area, and on a phone the left column wrapped
   * a line to a word beside a right corner a third as wide. One way only, again.
   */
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const root = document.documentElement.style;
    const space = (height: number) => (height > 0 ? Math.ceil(height) + DOCK_GAP_PX : 0);
    const publish = () => {
      for (const corner of BOTTOM_CORNERS) {
        const rect = refs.current[corner]?.getBoundingClientRect();
        root.setProperty(`--dock-${corner}-space`, `${space(rect?.height ?? 0)}px`);
      }
      // The bottom-right dock's width, which the bottom-left one leaves it (K2).
      const right = refs.current['bottom-right']?.getBoundingClientRect();
      root.setProperty('--dock-bottom-right-width', `${right && right.height > 0 ? space(right.width) : 0}px`);
      for (const corner of TOP_CORNERS) {
        const slots = Array.from(refs.current[corner]?.children ?? []) as HTMLElement[];
        const fixed = slots
          .filter((slot) => slot.dataset.dockFit !== 'true')
          .reduce((sum, slot) => sum + space(slot.getBoundingClientRect().height), 0);
        root.setProperty(`--dock-${corner}-fixed`, `${fixed}px`);
      }
    };
    const observer = new ResizeObserver(publish);
    // A top dock's slots come and go; each is watched as it arrives.
    const watchSlots = () => {
      for (const corner of TOP_CORNERS) {
        for (const slot of Array.from(refs.current[corner]?.children ?? [])) observer.observe(slot);
      }
    };
    const arrivals = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => { watchSlots(); publish(); });
    for (const corner of BOTTOM_CORNERS) {
      const node = refs.current[corner];
      if (node) observer.observe(node);
    }
    for (const corner of TOP_CORNERS) {
      const node = refs.current[corner];
      if (node) arrivals?.observe(node, { childList: true });
    }
    watchSlots();
    publish();
    return () => {
      observer.disconnect();
      arrivals?.disconnect();
      for (const corner of BOTTOM_CORNERS) root.removeProperty(`--dock-${corner}-space`);
      for (const corner of TOP_CORNERS) root.removeProperty(`--dock-${corner}-fixed`);
      root.removeProperty('--dock-bottom-right-width');
    };
  }, []);

  const value = useMemo(() => nodes, [nodes]);

  return (
    <DockContext.Provider value={value}>
      {children}
      {CORNERS.map((corner) => (
        <div
          key={corner}
          data-dock={corner}
          className={`${styles.dock} ${styles[toClass(corner)]}`}
          ref={(el) => { if (el) refs.current[corner] = el; }}
        />
      ))}
    </DockContext.Provider>
  );
};

const toClass = (c: Corner) =>
  c.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase()) as keyof typeof styles;

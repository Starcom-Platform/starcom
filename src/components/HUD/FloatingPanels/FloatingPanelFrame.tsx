import React, { useLayoutEffect, useRef, useState, useCallback } from 'react';
import { FloatingPanel } from './FloatingPanelContext';
import { WORK_AREA_EVENT } from '../../../layouts/CyberCommandHUDLayout/useWorkArea';
import { readWorkArea, resolveAnchor } from './panelAnchor';
import styles from './FloatingPanelManager.module.css';

/**
 * One floating panel: its chrome, and its right to stay on screen.
 *
 * ─── WHY PLACEMENT MOVED OUT OF THE MANAGER ────────────────────────────────
 *
 * The manager positioned every panel with `left: x; top: y` plus
 * `translate(-50%, -50%)` and nothing else. Centring on an anchor means half the
 * panel sits above and left of it, so the Intelligence Dashboard — anchored at
 * y=140, 419px tall — rendered its top edge 70px ABOVE the viewport. Its title
 * bar, and therefore its close button and its drag handle, were unreachable.
 * The only way to recover it was a reload.
 *
 * A panel cannot be clamped without knowing how big it is, and only the panel
 * knows that. So each one measures itself and places itself.
 *
 * ─── WHAT "RESPONSIVE" MEANS FOR A PANEL ───────────────────────────────────
 *
 * Not a breakpoint. Three guarantees, on every viewport:
 *
 *   1. The header is always reachable. Whatever else is clipped, the row with
 *      the close button stays inside the work area — otherwise a panel can
 *      strand itself with no way back.
 *   2. The panel never covers the chrome. It clamps into `--work-*`, which
 *      useWorkArea measures from the live layout, so it respects the rails and
 *      the top bar without being told where they are.
 *   3. It shrinks before it overflows. Width and height are capped against the
 *      work area in CSS, and the body scrolls inside.
 *
 * ─── WHAT IT DELIBERATELY DOES NOT DO ──────────────────────────────────────
 *
 * It does not re-clamp while the user is dragging. Someone dragging a panel
 * toward an edge is expressing an intent, and a panel that fights the cursor
 * feels broken. It clamps when the drag ends.
 */

const GUTTER = 16;

/** How much of the header must remain inside the work area, in px. */
const HEADER_KEEP = 44;

interface Props {
  panel: FloatingPanel;
  /** Where the panel's anchor resolved to, before clamping. */
  anchor: { x: number; y: number };
  isDragging: boolean;
  onDragStart: (e: React.MouseEvent) => void;
  onToggleMinimize: () => void;
  onClose: () => void;
}

export const FloatingPanelFrame: React.FC<Props> = ({
  panel, anchor, isDragging, onDragStart, onToggleMinimize, onClose,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [placed, setPlaced] = useState<{ x: number; y: number } | null>(null);

  const clamp = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    const work = readWorkArea();
    // Layout size, not getBoundingClientRect. The entrance animation starts a
    // panel at scale(0.8), and a rect measured through that transform placed a
    // 760px panel as if it were 608px wide: 76px off centre and 94px past the
    // bottom of the work area. A transform never resizes the element, so the
    // ResizeObserver never corrected it.
    const width = el.offsetWidth;
    const height = el.offsetHeight;

    // The anchor names a point the panel is about, so it starts centred on it —
    // then gets moved rather than allowed to hang off the edge. A work-area anchor
    // is a proportion of the work area, re-read on every clamp, so the panel
    // follows a resize instead of the viewport it happened to open on.
    const target = panel.position.anchorTo === 'work-area' ? resolveAnchor(panel.position) : anchor;
    let x = target.x - width / 2;
    let y = target.y - height / 2;

    // Horizontal: keep the whole panel in when it fits, otherwise pin to the left
    // edge so the reading order still starts where the eye does.
    const maxX = work.right - width - GUTTER;
    const minX = work.left + GUTTER;
    x = maxX < minX ? minX : Math.min(Math.max(x, minX), maxX);

    // Vertical: the top edge is the one that must never leave, because the header
    // lives there and the header is how the panel gets closed.
    const minY = work.top + GUTTER;
    const maxY = Math.max(minY, work.bottom - Math.max(height, HEADER_KEEP) - GUTTER);
    y = Math.min(Math.max(y, minY), maxY);

    // The top-right dock stays above panels because it holds notifications, and a
    // panel's close button sits at the panel's own top-right. When the header
    // would pass under that dock, drop the panel below it; if the panel is too
    // tall to go lower, move it left of the dock instead.
    const dock = document.querySelector('[data-dock="top-right"]')?.getBoundingClientRect();
    if (dock && dock.width > 0 && dock.height > 0) {
      const headerUnderDock = () =>
        x < dock.right && dock.left < x + width && y < dock.bottom && dock.top < y + HEADER_KEEP;
      if (headerUnderDock()) y = Math.min(Math.max(y, dock.bottom + GUTTER), maxY);
      if (headerUnderDock()) x = Math.max(minX, Math.min(x, dock.left - GUTTER - width));
    }

    setPlaced((prev) =>
      prev && Math.abs(prev.x - x) < 0.5 && Math.abs(prev.y - y) < 0.5
        ? prev
        : { x: Math.round(x), y: Math.round(y) },
    );
  }, [anchor.x, anchor.y, panel.position]);

  useLayoutEffect(() => {
    // Dragging is an intent. A panel that fights the cursor feels broken, so the
    // clamp waits for the drag to finish.
    if (isDragging) return;

    clamp();

    // The panel's own size changes when it minimises or its content loads, and
    // both change where it is allowed to sit.
    const ro = new ResizeObserver(clamp);
    if (ref.current) ro.observe(ref.current);
    // A chip appearing in the top-right dock (a relay warning, a notification)
    // can newly cover the header, so the panel re-places when that dock resizes.
    const topRightDock = document.querySelector('[data-dock="top-right"]');
    if (topRightDock) ro.observe(topRightDock);
    window.addEventListener('resize', clamp);

    // The struts are measured asynchronously and arrive after the first paint.
    // Clamping once on mount reads the CSS fallbacks instead of the real work
    // area — which put this panel's title bar above the top of the screen on a
    // wide viewport, with its close button out of reach.
    window.addEventListener(WORK_AREA_EVENT, clamp);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', clamp);
      window.removeEventListener(WORK_AREA_EVENT, clamp);
    };
  }, [clamp, isDragging]);

  // While dragged, the panel follows the pointer exactly, unclamped. It used to be
  // drawn at `placed`, which the clamp above leaves alone mid-drag, so a dragged
  // panel stayed where it was and jumped when let go. The clamp still waits for the
  // drop, because a panel that snaps away from the cursor reads as broken too.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!isDragging || !el) return;
    const x = Math.round(anchor.x - el.offsetWidth / 2);
    const y = Math.round(anchor.y - el.offsetHeight / 2);
    setPlaced((prev) => (prev && prev.x === x && prev.y === y ? prev : { x, y }));
  }, [isDragging, anchor.x, anchor.y]);

  const PanelComponent = panel.component;

  return (
    <div
      ref={ref}
      data-panel-id={panel.id}
      className={[
        styles.floatingPanel,
        styles[panel.type],
        isDragging ? styles.dragging : '',
        panel.isMinimized ? styles.minimized : '',
      ].filter(Boolean).join(' ')}
      style={{
        left: placed ? placed.x : anchor.x,
        top: placed ? placed.y : anchor.y,
        zIndex: panel.zIndex,
        // Hidden for the single frame between mounting and measuring. Without
        // this the panel visibly jumps from its raw anchor to its clamped spot.
        visibility: placed ? 'visible' : 'hidden',
      }}
      role="dialog"
      aria-label={panel.title}
    >
      <div
        className={styles.panelHeader}
        onMouseDown={onDragStart}
        onDoubleClick={onToggleMinimize}
        style={{ cursor: 'grab' }}
      >
        <div className={styles.dragHandle}>
          <span className={styles.dragIcon} aria-hidden="true">⋮⋮</span>
          <span className={styles.panelTitle}>{panel.title}</span>
        </div>
        <div className={styles.headerButtons}>
          <button
            className={styles.minimizeBtn}
            onClick={(e) => { e.stopPropagation(); onToggleMinimize(); }}
            title={panel.isMinimized ? 'Maximize' : 'Minimize'}
            aria-label={panel.isMinimized ? `Maximize ${panel.title}` : `Minimize ${panel.title}`}
          >
            {panel.isMinimized ? '□' : '−'}
          </button>
          <button
            className={styles.closeBtn}
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            title="Close"
            aria-label={`Close ${panel.title}`}
          >
            ×
          </button>
        </div>
      </div>
      {!panel.isMinimized && (
        <div className={styles.panelContent}>
          <PanelComponent data={panel.data} />
        </div>
      )}
    </div>
  );
};

export default FloatingPanelFrame;

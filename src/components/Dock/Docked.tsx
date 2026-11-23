import React from 'react';
import { createPortal } from 'react-dom';
import { useDockNode, useDockAvailable } from './DockHost';
import { DOCK_SLOTS, DockSlotName } from './dockOrder';
import styles from './Dock.module.css';

/**
 * Puts a component where the registry says it goes.
 *
 *     <Docked slot="notifications">
 *       <NotificationList />
 *     </Docked>
 *
 * One name, and dockOrder.ts decides both which corner and what order. The call
 * site deliberately cannot say "top-right, 20" — that is the arrangement, and
 * spreading the arrangement across ten files is what produced six components at
 * one pixel.
 *
 * The component keeps its place in the React tree, and therefore every context
 * it reads; it loses only its `position: fixed` and its guess at how much chrome
 * to clear. See DockHost for why this is a portal.
 */
export const Docked: React.FC<{
  slot: DockSlotName;
  children: React.ReactNode;
}> = ({ slot, children }) => {
  const entry = DOCK_SLOTS[slot];
  const { corner, order } = entry;
  const fitsDock = 'fitsDock' in entry && entry.fitsDock;
  const node = useDockNode(corner);
  const hasHost = useDockAvailable();

  if (!node) {
    // Two situations, and neither is worth destroying the render over.
    //
    // No host at all means something rendered outside the shell — in practice a
    // test, or a component mounted above DockHost. The first version of this
    // returned null, on the reasoning that a component appearing in the wrong
    // place reads as a layout bug while nothing at all points at the missing
    // provider. That was wrong, and an existing NewUserHint test proved it
    // within the hour: the component vanished and the test failed on a missing
    // button, which points nowhere near a dock. Rendering in place is the
    // gentler failure — the content is still there, just unpositioned — and it
    // means adopting <Docked> never removes anything from a page.
    //
    // A host that exists but has not published its nodes is the first render and
    // resolves on the next one. Not worth a warning.
    if (!hasHost && import.meta.env.DEV) {
      console.warn(
        `<Docked slot="${slot}"> rendered with no <DockHost> above it. ` +
        'It is rendering in place, unpositioned. Mount DockHost in the shell.',
      );
    }
    return <>{children}</>;
  }

  return createPortal(
    <div className={styles.slot} style={{ order }} data-dock-slot={slot} data-dock-order={order} data-dock-fit={fitsDock ? 'true' : undefined}>
      {children}
    </div>,
    node,
  );
};

export default Docked;

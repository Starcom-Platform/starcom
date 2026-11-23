import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock, useFocusTrap } from '../Popup/modalBehavior';
import { LAYERS } from '../../styles/layers';

/**
 * A backdrop that is actually a dialog.
 *
 * ─── WHAT THIS ALREADY DID, AND WHAT WAS ADDED ─────────────────────────────
 *
 * This component was already the best modal in the app: role="dialog",
 * aria-modal, Escape, a focus trap, and three callers using it. What it lacked
 * was background scroll lock, focus restore on close, a portal, and any way for
 * a component with its own backdrop styling to adopt it.
 *
 * The last one is why nineteen other components never used it. Each of them has
 * its own full-viewport backdrop — different blurs, tints and centring — and
 * this one hard-codes a plain 50% black. Adopting it meant losing their look, so
 * nobody did, and nineteen backdrops shipped with no dialog semantics at all.
 *
 * `className` fixes that: pass your own backdrop class and keep your visuals,
 * or pass nothing and get the default styling the three existing callers rely on.
 *
 * The focus trap and scroll lock now come from Popup/modalBehavior, shared with
 * PopupManager, so there is one implementation of "keep Tab inside" rather than
 * the two that were drifting.
 *
 * ─── WHY THE ROLE SITS ON THE BACKDROP ─────────────────────────────────────
 *
 * Where this component already had it. An inner wrapper would be tidier in
 * principle, but these backdrops centre their child with flex and inserting a
 * div breaks that differently in each one; `display: contents` avoids the layout
 * change and drops the element out of the accessibility tree in several
 * browsers, which defeats the point. The backdrop covers the viewport and holds
 * only the dialog, so naming it the dialog costs nothing.
 */
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * What this dialog is called. A dialog with no accessible name is announced
   * as "dialog" and nothing else — that something opened, but not what.
   */
  ariaLabel?: string;
  /**
   * The caller's own backdrop class. When given, the default inline styling is
   * dropped entirely and the class is responsible for covering the viewport and
   * positioning the content.
   */
  className?: string;
  /**
   * Whether clicking the backdrop closes it. Off by default, preserving the
   * behaviour the three existing callers have; the components being migrated
   * pass true because that is what their own backdrops did.
   */
  dismissOnBackdrop?: boolean;
}

const Modal: React.FC<ModalProps> = ({
  isOpen, onClose, children, ariaLabel, className, dismissOnBackdrop = false,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  // The trap and the lock are shared with PopupManager. This component had its
  // own trap, correct but separate; two implementations of the same rule drift.
  useScrollLock(isOpen);
  useFocusTrap(modalRef, isOpen);

  // Put focus back where it came from. Without this, closing drops focus onto
  // document.body and the next Tab restarts at the top of the page.
  useEffect(() => {
    if (!isOpen) return;
    restoreTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const el = restoreTo.current;
      if (el && document.contains(el)) el.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const onBackdropClick = (e: React.MouseEvent) => {
    // Only a click on the backdrop itself, never one bubbling up from the
    // content — a drag starting inside and ending outside would otherwise close
    // the dialog mid-gesture.
    if (dismissOnBackdrop && e.target === e.currentTarget) onClose();
  };

  // Portalled so a dialog is never clipped by an ancestor's overflow and never
  // inherits a stacking context from one.
  return createPortal(
    <div
      ref={modalRef}
      className={className ?? 'modal-overlay'}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || 'Dialog'}
      tabIndex={-1}
      onClick={onBackdropClick}
      style={
        className
          ? { zIndex: LAYERS.modal }
          : {
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: LAYERS.modal,
            }
      }
    >
      {className ? children : (
        <div
          className="modal-content"
          style={{
            background: 'transparent',
            borderRadius: '8px',
            padding: '0',
            minWidth: '320px',
            maxWidth: '90vw',
            boxShadow: 'none',
          }}
        >
          {children}
        </div>
      )}
    </div>,
    document.body,
  );
};

export default Modal;

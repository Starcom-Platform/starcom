import React, { createContext, useContext, useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './PopupManager.module.css';
import { LAYERS } from '../../styles/layers';
import { useScrollLock, useFocusTrap } from './modalBehavior';
import { playSfx } from '../../services/audio/sfxLibrary';

interface Popup {
  id: string;
  /**
   * What this dialog is called, for anyone who cannot see it.
   *
   * Optional so existing callers keep working, but a dialog with no name is
   * announced as "dialog" and nothing else, which tells a screen-reader user
   * that something opened and not what. Every call site should pass one.
   */
  label?: string;
  component: React.ComponentType<{ onClose: () => void; [key: string]: unknown }>;
  props?: Record<string, unknown>;
  zIndex?: number;
  backdrop?: boolean;
  onClose?: () => void;
  restoreFocusTo?: HTMLElement | null;
}

interface PopupContextValue {
  showPopup: (popup: Omit<Popup, 'id'>) => string;
  hidePopup: (id: string) => void;
  hideAllPopups: () => void;
  activePopups: Popup[];
}

const PopupContext = createContext<PopupContextValue | null>(null);

export const usePopup = () => {
  const context = useContext(PopupContext);
  if (!context) {
    throw new Error('usePopup must be used within a PopupProvider');
  }
  return context;
};

interface PopupProviderProps {
  children: React.ReactNode;
}

/**
 * One popup, rendered as an actual dialog.
 *
 * Split out of the provider's render because the focus trap needs a ref and a
 * hook per popup, and hooks cannot be called inside a map.
 */
const PopupFrame: React.FC<{
  popup: Popup;
  isTopmost: boolean;
  onClose: () => void;
}> = ({ popup, isTopmost, onClose }) => {
  const contentRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(contentRef, isTopmost);

  // Every dialog sounds as it opens and as it closes, if sound is on. In the
  // commit, not after paint, so the click that opened it is the same moment and
  // only the opening plays (sfxLibrary.ts).
  useLayoutEffect(() => {
    playSfx('open');
    return () => playSfx('close');
  }, []);

  const PopupComponent = popup.component;

  return (
    <div className={styles.popupContainer} style={{ zIndex: popup.zIndex }}>
      {popup.backdrop && (
        <div
          className={styles.popupBackdrop}
          onClick={onClose}
          // The backdrop is a convenience, not the way out. Escape and the
          // dialog's own close button are; a bare div would otherwise appear in
          // the tab order as an unlabelled stop.
          aria-hidden="true"
        />
      )}
      <div
        ref={contentRef}
        className={styles.popupContent}
        role="dialog"
        aria-modal={isTopmost || undefined}
        aria-label={popup.label}
      >
        <PopupComponent {...popup.props} onClose={onClose} />
      </div>
    </div>
  );
};

export const PopupProvider: React.FC<PopupProviderProps> = ({ children }) => {
  const [popups, setPopups] = useState<Map<string, Popup>>(new Map());

  const showPopup = useCallback((popupData: Omit<Popup, 'id'>) => {
    const id = `popup_${Date.now()}_${Math.random()}`;
    const restoreFocusTo = typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const popup: Popup = {
      id,
      // Was a raw 3000. --z-modal, via the shared scale, so a popup and a
      // floating panel and a MUI Dialog are all ordered by one set of numbers
      // instead of three. See styles/layers.ts.
      zIndex: LAYERS.modal + popups.size,
      backdrop: true,
      restoreFocusTo,
      ...popupData,
    };

    setPopups(prev => new Map(prev).set(id, popup));
    return id;
  }, [popups.size]);

  const hidePopup = useCallback((id: string) => {
    setPopups(prev => {
      const newMap = new Map(prev);
      const popup = newMap.get(id);
      if (popup?.onClose) {
        popup.onClose();
      }

      if (popup?.restoreFocusTo && typeof popup.restoreFocusTo.focus === 'function') {
        popup.restoreFocusTo.focus();
      }

      newMap.delete(id);
      return newMap;
    });
  }, []);

  const hideAllPopups = useCallback(() => {
    popups.forEach(popup => {
      if (popup.onClose) {
        popup.onClose();
      }
    });
    setPopups(new Map());
  }, [popups]);

  const activePopups = Array.from(popups.values());

  // The page behind a modal must not scroll. Counted inside the hook, so an
  // inner popup closing does not unlock the page under the outer one.
  useScrollLock(activePopups.length > 0);

  useEffect(() => {
    if (activePopups.length === 0) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      const topmostPopup = activePopups[activePopups.length - 1];
      if (!topmostPopup) {
        return;
      }

      event.preventDefault();
      hidePopup(topmostPopup.id);
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [activePopups, hidePopup]);

  const contextValue: PopupContextValue = {
    showPopup,
    hidePopup,
    hideAllPopups,
    activePopups,
  };

  const renderPopups = () => {
    if (activePopups.length === 0) return null;

    return createPortal(
      <div className={styles.popupLayer}>
        {activePopups.map((popup, i) => (
          <PopupFrame
            key={popup.id}
            popup={popup}
            // Only the topmost traps focus. Two traps at once means whichever
            // handler runs second wins, which is neither of them.
            isTopmost={i === activePopups.length - 1}
            onClose={() => hidePopup(popup.id)}
          />
        ))}
      </div>,
      document.body
    );
  };

  return (
    <PopupContext.Provider value={contextValue}>
      {children}
      {renderPopups()}
    </PopupContext.Provider>
  );
};

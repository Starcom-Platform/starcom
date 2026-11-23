import { useEffect, useState } from 'react';

/**
 * Whether a modal dialog is open: MUI's dialogs and the shared Modal both set
 * aria-modal. Shared by the surfaces that must keep out of a dialog's way — the
 * identity notice waits until the dialog closes, and the Undo bar moves clear
 * of the dialog's buttons.
 */
const hasOpenModal = (): boolean =>
  typeof document !== 'undefined' && document.querySelector('[aria-modal="true"]') !== null;

/** True while a modal dialog is open. Watches only while there is something to hold back. */
export function useModalOpen(watching: boolean): boolean {
  const [open, setOpen] = useState(hasOpenModal);
  useEffect(() => {
    if (!watching || typeof MutationObserver === 'undefined') return;
    const update = () => setOpen(hasOpenModal());
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal'] });
    update();
    return () => observer.disconnect();
  }, [watching]);
  return open;
}

import { useEffect, RefObject } from 'react';

/**
 * The behaviours that separate a dialog from a div with a dark background.
 *
 * ─── WHAT WAS MISSING ──────────────────────────────────────────────────────
 *
 * Nineteen components in this app render their own full-viewport backdrop. Not
 * one sets `role="dialog"` or `aria-modal`. Not one locks background scroll.
 * Most handle neither Escape nor focus. For anyone not using a mouse they are
 * not dialogs at all: Tab walks straight out the back into the page behind,
 * where the focused control is invisible under the backdrop, and a screen reader
 * is never told anything opened.
 *
 * PopupManager was closer — it already had Escape and focus restore — and these
 * are the rest.
 *
 * ─── WHY A TRAP AND NOT JUST AN ANNOUNCEMENT ───────────────────────────────
 *
 * `aria-modal` tells assistive technology that the rest of the page is inert. It
 * does not make it inert. Without a trap the two disagree, and the reading a
 * screen-reader user gets stops matching where the keyboard actually is — which
 * is worse than no announcement, because it is confidently wrong.
 */

/** Everything the browser will focus, minus the things it should not. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

const focusableWithin = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) =>
      // A control inside a collapsed section is in the DOM and not reachable.
      // offsetParent is null for display:none; the rect check catches
      // visibility:hidden and zero-size wrappers.
      el.offsetParent !== null && el.getBoundingClientRect().width > 0,
  );

/**
 * Stops the page behind a modal from scrolling.
 *
 * Counted rather than boolean, because two modals can be open at once and the
 * inner one closing must not unlock the page under the outer one.
 */
let scrollLocks = 0;
let previousOverflow = '';
let previousPaddingRight = '';

export const useScrollLock = (active: boolean) => {
  useEffect(() => {
    if (!active) return;

    if (scrollLocks === 0) {
      const body = document.body;
      previousOverflow = body.style.overflow;
      previousPaddingRight = body.style.paddingRight;

      // Hiding the scrollbar makes the page wider by its width, and everything
      // shifts sideways as the modal opens. Compensate with padding so the
      // content behind the backdrop stays exactly where it was.
      const gap = window.innerWidth - document.documentElement.clientWidth;
      if (gap > 0) {
        const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
        body.style.paddingRight = `${current + gap}px`;
      }
      body.style.overflow = 'hidden';
    }
    scrollLocks += 1;

    return () => {
      scrollLocks -= 1;
      if (scrollLocks === 0) {
        document.body.style.overflow = previousOverflow;
        document.body.style.paddingRight = previousPaddingRight;
      }
    };
  }, [active]);
};

/**
 * Keeps Tab inside the dialog, and puts focus there to begin with.
 *
 * `active` should be true only for the TOPMOST dialog. Trapping in two places
 * at once means whichever handler runs second wins, which is neither.
 */
export const useFocusTrap = (ref: RefObject<HTMLElement | null>, active: boolean) => {
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;

    // Focus something inside, or the dialog itself. Without this, Escape works
    // but Tab starts from wherever focus happened to be — usually the button
    // that opened the dialog, which is now behind the backdrop.
    const initial = focusableWithin(root)[0];
    if (initial) {
      initial.focus();
    } else {
      // No controls at all — an alert or a read-only panel. The container takes
      // focus so the trap has somewhere to hold it and a screen reader lands
      // on the dialog rather than staying outside it.
      if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
      root.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const items = focusableWithin(root);
      if (items.length === 0) {
        // Nothing to move between, so Tab must not leave.
        e.preventDefault();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;

      // Focus escaping entirely — a click on the backdrop, or a control that
      // removed itself — is recovered rather than left outside.
      if (!activeEl || !root.contains(activeEl)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }

      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // Capture phase: a dialog's own content may stop propagation on keydown,
    // and the trap has to hold regardless of what the content does.
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [ref, active]);
};

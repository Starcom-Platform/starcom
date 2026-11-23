/**
 * A modal that a keyboard cannot leave, and cannot be left behind by.
 *
 * These cover the three things nineteen hand-rolled backdrops in this app all
 * omitted: the page behind must not scroll, Tab must not walk out the back, and
 * the dialog must say what it is.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React, { useRef } from 'react';
import { useScrollLock, useFocusTrap } from '../modalBehavior';

// jsdom reports every element as unrendered; the trap filters on that, so the
// checks it uses are stubbed to "visible".
//
// These patch HTMLElement.prototype, which SHADOWS Element.prototype — so
// leaving them in place breaks any later test file that stubs the rect on
// Element instead. That is not hypothetical: it silently failed four
// useWorkArea tests, but only when the whole suite ran, and only in that order.
// Hence restoreReal().
// Captured as DESCRIPTORS, not values. jsdom defines getBoundingClientRect on
// Element.prototype, so HTMLElement.prototype merely inherits it — and restoring
// by assignment (`HTMLElement.prototype.getBoundingClientRect = saved`) creates
// an own property on HTMLElement.prototype that shadows Element.prototype for
// the rest of the process. That is the exact leak this cleanup exists to
// prevent, reintroduced by the cleanup. Deleting is the only real undo.
const ownRect = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect');
const ownOffsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent');

const makeVisible = () => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() { return this.parentNode; },
  });
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20,
             x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
};

const restoreOwn = (key: string, own: PropertyDescriptor | undefined) => {
  if (own) Object.defineProperty(HTMLElement.prototype, key, own);
  else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
};

const restoreReal = () => {
  restoreOwn('getBoundingClientRect', ownRect);
  restoreOwn('offsetParent', ownOffsetParent);
};

const Lock: React.FC<{ active: boolean }> = ({ active }) => {
  useScrollLock(active);
  return <div>locked?</div>;
};

const Trap: React.FC<{ active?: boolean; empty?: boolean }> = ({ active = true, empty }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useFocusTrap(ref, active);
  return (
    <div>
      <button>outside before</button>
      <div ref={ref} role="dialog" aria-label="Test dialog">
        {!empty && (
          <>
            <button>first</button>
            <button>middle</button>
            <button>last</button>
          </>
        )}
      </div>
      <button>outside after</button>
    </div>
  );
};

describe('useScrollLock', () => {
  afterEach(() => { document.body.style.overflow = ''; document.body.style.paddingRight = ''; });

  it('stops the page behind from scrolling', () => {
    render(<Lock active />);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('gives the page back when the modal closes', () => {
    const { unmount } = render(<Lock active />);
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('stays locked while a second modal is still open', () => {
    // An inner popup closing must not unlock the page under the outer one —
    // which is why the lock counts rather than toggles.
    const outer = render(<Lock active />);
    const inner = render(<Lock active />);
    inner.unmount();
    expect(document.body.style.overflow).toBe('hidden');
    outer.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('does nothing when inactive', () => {
    render(<Lock active={false} />);
    expect(document.body.style.overflow).toBe('');
  });
});

describe('useFocusTrap', () => {
  beforeEach(makeVisible);
  afterEach(restoreReal);

  it('moves focus into the dialog when it opens', () => {
    // Otherwise Tab starts from the button that opened it, which is now behind
    // the backdrop and invisible.
    render(<Trap />);
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('wraps forwards from the last control', () => {
    render(<Trap />);
    screen.getByText('last').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('wraps backwards from the first control', () => {
    render(<Trap />);
    screen.getByText('first').focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByText('last'));
  });

  it('leaves movement inside the dialog alone', () => {
    render(<Trap />);
    screen.getByText('first').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // Not at an edge, so the browser's own Tab handling should run.
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('recovers focus that escaped the dialog', () => {
    render(<Trap />);
    screen.getByText('outside after').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('first'));
  });

  it('holds focus in a dialog with no controls', () => {
    render(<Trap empty />);
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(dialog);
  });

  it('does not trap when it is not the topmost dialog', () => {
    // Two traps at once means whichever handler runs second wins.
    render(<Trap active={false} />);
    screen.getByText('outside after').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('outside after'));
  });
});

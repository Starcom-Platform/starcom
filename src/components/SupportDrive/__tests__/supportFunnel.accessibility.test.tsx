import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import SupportFunnelModal from '../SupportFunnelModal';

/**
 * jsdom does no layout, and the focus trap depends on layout.
 *
 * useFocusTrap picks the first focusable element via focusableWithin, which
 * filters on `offsetParent !== null` and `getBoundingClientRect().width > 0` —
 * deliberately, so a control inside a collapsed section is treated as
 * unreachable. In jsdom offsetParent is ALWAYS null and every rect is 0x0, so
 * that filter returns nothing, the trap falls back to focusing the container,
 * and this suite failed while the trap itself was fine.
 *
 * So the layout is stubbed rather than the trap loosened. The precondition —
 * these buttons are visible and have size — is true in every real browser; it
 * simply has to be stated here for the assertion to be able to observe
 * anything at all.
 */
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() { return this.parentNode ?? null; },
  });
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { width: 120, height: 32, top: 0, left: 0, right: 120, bottom: 32, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
});

describe('SupportFunnelModal accessibility', () => {
  const baseProps = {
    isOpen: true,
    headline: 'Test',
    subhead: 'Sub',
    disclosure: 'disc',
    onClose: vi.fn(),
    onSnooze: vi.fn(),
    onDismiss: vi.fn(),
    onOpenNostr: vi.fn(),
    onOpenFund: vi.fn(),
    onLearnMore: vi.fn(),
    onCopyInvite: vi.fn(),
    fallbackLink: null,
    learnMoreOpen: false,
    learnMoreBody: 'body',
    copyToast: false,
    offline: false,
  };

  it('focuses first control on open and traps focus with Shift+Tab', () => {
    render(<SupportFunnelModal {...baseProps} />);
    const closeBtn = screen.getByRole('button', { name: /close support modal/i });
    const learnToggle = screen.getByRole('button', { name: /why this matters/i });

    // initial focus set to first focusable
    expect(closeBtn).toHaveFocus();

    // shift+tab from first goes to last
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(learnToggle).toHaveFocus();

    // tab from last loops back to first
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(closeBtn).toHaveFocus();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<SupportFunnelModal {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('respects reduced-motion flag for tests and sets accessibility labels', () => {
    render(<SupportFunnelModal {...baseProps} forceReducedMotion />);
    const overlay = screen.getByRole('dialog');
    expect(overlay).toHaveAttribute('data-reduced-motion', 'true');

    // screen reader labels present
    expect(overlay).toHaveAttribute('aria-modal', 'true');
    expect(overlay).toHaveAttribute('aria-label', baseProps.headline);
    expect(screen.getByRole('button', { name: /close support modal/i })).toBeInTheDocument();
  });
});

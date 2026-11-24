import { render, screen } from '@testing-library/react';
import React from 'react';
import SupportFunnelModal from '../SupportFunnelModal';

describe('SupportFunnelModal URL guards', () => {
  const baseProps = {
    isOpen: true,
    headline: 'Test',
    subhead: 'Sub',
    disclosure: 'disc',
    onClose: () => {},
    onSnooze: () => {},
    onDismiss: () => {},
    onOpenNostr: () => {},
    onOpenFund: () => {},
    onLearnMore: () => {},
    onCopyInvite: () => {},
    fallbackLink: null,
    learnMoreOpen: false,
    learnMoreBody: 'body',
    copyToast: false,
    offline: false,
  };

  it('disables fund CTA when missing URL', () => {
    render(<SupportFunnelModal {...baseProps} disableFund />);
    // By testid, not by copy. These asserted /fund the mission/i and /join the
    // nostr ops/i; the buttons were then "Fund The Alliance" and "Join Coms
    // Uplink", so both suites were failing on a rename while the behaviour they
    // check — disabled when no URL is configured — still held.
    const fundBtn = screen.getByTestId('support-funnel-fund');
    expect(fundBtn).toBeDisabled();
  });

  it('disables nostr CTA when missing URL', () => {
    render(<SupportFunnelModal {...baseProps} disableNostr />);
    const nostrBtn = screen.getByTestId('support-funnel-nostr');
    expect(nostrBtn).toBeDisabled();
  });

  it('shows fallback link when provided', () => {
    render(<SupportFunnelModal {...baseProps} fallbackLink="https://example.com/fallback" />);
    expect(screen.getByText(/pop-up blocked—open link/i)).toBeInTheDocument();
  });
});

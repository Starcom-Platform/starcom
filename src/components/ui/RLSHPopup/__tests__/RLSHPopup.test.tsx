import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RLSHPopup } from '../RLSHPopup';
import { resetRlshPanelForTests, rlshPanel } from '../../../../features/rlsh/rlshPanel';
import { vi } from 'vitest';

const emitSpy = vi.fn();

vi.mock('../../../../services/RLSHTelemetryService', () => ({
  rlshTelemetryService: {
    emit: (...args: unknown[]) => emitSpy(...args)
  }
}));

describe('RLSHPopup UI and deeplink behavior', () => {
  beforeEach(() => {
    emitSpy.mockClear();
    Object.defineProperty(window, 'open', { value: vi.fn(), writable: true });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true
    });
  });

  const baseMarker = {
    schemaVersion: '1.0.0',
    id: 'rlsh-1',
    displayName: 'Night Beacon',
    summary: 'Community patrol and aid.',
    canonicalUrl: '',
    latitude: 40.7128,
    longitude: -74.006,
    updatedAt: new Date(Date.now() - 35 * 86400000).toISOString(),
    source: { provider: 'primary_wiki', sourceId: 'night-beacon' },
    geoConfidence: 'country' as const,
    tags: ['RLSH'],
    aliases: [],
    riskFlags: [],
    lastVerifiedAt: '',
    imageUrl: ''
  };

  /** The value beside each label with exactly this text, in the order they appear. */
  const valuesOf = (label: string) =>
    screen.getAllByText(label, { exact: true })
      .map((el) => el.nextElementSibling?.textContent ?? null)
      .filter((value): value is string => value !== null);

  /** The badges under the popup's title. */
  const headerTags = (container: HTMLElement) =>
    [...(container.querySelector('#rlsh-popup-title')?.parentElement?.lastElementChild?.children ?? [])]
      .map((el) => el.textContent);

  it('renders disabled reason when canonical URL is missing and disables deep-link actions', () => {
    render(
      <RLSHPopup
        marker={baseMarker}
        visible={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Deep-link disabled')).toBeInTheDocument();
    expect(screen.getByText('No canonical source URL is available for this entity.')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Open Source' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Copy Source URL' })).toBeDisabled();
  });

  it('opens allowlisted URL and emits successful deeplink telemetry', () => {
    render(
      <RLSHPopup
        marker={{ ...baseMarker, canonicalUrl: 'https://example.org/rlsh/night-beacon' }}
        visible={true}
        onClose={vi.fn()}
      />
    );

    const openButton = screen.getByRole('button', { name: 'Open Source' });
    expect(openButton).toBeEnabled();

    fireEvent.click(openButton);

    expect(window.open).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith('rlsh_deeplink_click', expect.objectContaining({ result: 'success' }));
  });

  it('handles Escape key to close popup', () => {
    const onClose = vi.fn();
    vi.useFakeTimers();

    render(
      <RLSHPopup
        marker={baseMarker}
        visible={true}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => {
      vi.runAllTimers();
    });
    expect(onClose).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('renders extended profile metadata fields in defined order', () => {
    render(
      <RLSHPopup
        marker={{
          ...baseMarker,
          aliases: ['Beacon', 'NB-01'],
          riskFlags: ['UNVERIFIED_ALIAS'],
          lastVerifiedAt: new Date().toISOString(),
          imageUrl: 'https://example.org/rlsh/night-beacon.jpg'
        }}
        visible={true}
        onClose={vi.fn()}
      />
    );

    const labels = screen.getAllByText(/Aliases|Last Verified|Risk Flags|Media URL|Entity ID/).map((node) => node.textContent);
    expect(labels).toEqual(['Aliases', 'Last Verified', 'Risk Flags', 'Media URL', 'Entity ID']);

    expect(screen.getByText('Beacon, NB-01')).toBeInTheDocument();
    expect(screen.getByText('UNVERIFIED_ALIAS')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open media' })).toHaveAttribute('href', 'https://example.org/rlsh/night-beacon.jpg');
  });

  it('renders fallback metadata values when optional fields are missing', () => {
    render(
      <RLSHPopup
        marker={{
          ...baseMarker,
          aliases: [],
          riskFlags: [],
          lastVerifiedAt: '',
          imageUrl: ''
        }}
        visible={true}
        onClose={vi.fn()}
      />
    );

    expect(valuesOf('Aliases')).toEqual(['Not recorded']);
    expect(valuesOf('Last Verified')).toEqual(['Not recorded']);
    expect(valuesOf('Risk Flags')).toEqual(['Not recorded']);
    expect(screen.getByText('No media URL provided')).toBeInTheDocument();
  });

  it('renders provenance drill-down attribution, timestamp, and confidence context', () => {
    render(
      <RLSHPopup
        marker={{
          ...baseMarker,
          canonicalUrl: 'https://example.org/rlsh/night-beacon',
          geoConfidence: 'city',
          updatedAt: new Date('2026-02-14T10:00:00.000Z').toISOString()
        }}
        visible={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Attribution')).toBeInTheDocument();
    expect(screen.getByText('Source: primary_wiki · ID: night-beacon')).toBeInTheDocument();
    // Listed is not vouched for (RS45): being on the list buys no benefit of the doubt.
    expect(screen.getByText('A profile its hero submitted. Starcom has not vetted or endorsed anyone here.')).toBeInTheDocument();
    expect(screen.getByText('Source Updated')).toBeInTheDocument();
    expect(screen.getByText('Confidence Context')).toBeInTheDocument();
    expect(screen.getAllByText('City').length).toBeGreaterThan(0);
  });

  it('keeps metadata panel readable with long optional field values', () => {
    render(
      <RLSHPopup
        marker={{
          ...baseMarker,
          aliases: ['A'.repeat(120), 'B'.repeat(120)],
          riskFlags: ['LONG_FLAG_' + 'X'.repeat(80)],
          imageUrl: 'https://example.org/assets/' + 'media-file-'.repeat(12) + '.jpg'
        }}
        visible={true}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Profile Metadata')).toBeInTheDocument();
    expect(screen.getByText('Open Source')).toBeInTheDocument();
    expect(screen.getByText('Copy Source URL')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open media' })).toBeInTheDocument();
  });

  it('copies npub when available and emits contact-intent success telemetry', async () => {
    render(
      <RLSHPopup
        marker={{
          ...baseMarker,
          canonicalUrl: 'https://example.org/rlsh/night-beacon',
          nostrNpub: 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'
        }}
        visible={true}
        onClose={vi.fn()}
      />
    );

    const copyNpubButton = screen.getByRole('button', { name: 'Copy npub' });
    expect(copyNpubButton).toBeEnabled();

    await act(async () => {
      fireEvent.click(copyNpubButton);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq');
    expect(emitSpy).toHaveBeenCalledWith('rlsh_contact_intent', expect.objectContaining({ result: 'success', reason: 'npub-copied' }));
  });

  it('emits blocked DM telemetry when direct message placeholder is clicked', () => {
    render(
      <RLSHPopup
        marker={{
          ...baseMarker,
          canonicalUrl: 'https://example.org/rlsh/night-beacon'
        }}
        visible={true}
        onClose={vi.fn()}
      />
    );

    const dmButton = screen.getByRole('button', { name: 'Direct Message (Soon)' });
    fireEvent.click(dmButton);

    // Not built, for everyone: there is no wallet sign-in to ask for (plan item 4.4).
    expect(emitSpy).toHaveBeenCalledWith('rlsh_dm_blocked', expect.objectContaining({
      result: 'degraded',
      reason: 'dm-feature-not-enabled'
    }));
  });

  it('says direct messages are not built yet, and asks nobody to sign in with a wallet', () => {
    render(<RLSHPopup marker={{ ...baseMarker, canonicalUrl: 'https://example.org/rlsh/night-beacon' }} visible={true} onClose={vi.fn()} />);
    expect(screen.getByText('Direct Nostr messages are not built yet.')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Web3|sign in with Starcom/i);
  });

  it('offers the hero their own card in the RLSH panel, never a form elsewhere (D-RF)', () => {
    resetRlshPanelForTests();
    render(<RLSHPopup marker={baseMarker} visible={true} onClose={vi.fn()} />);
    expect(screen.queryByRole('link', { name: /register/i })).toBeNull();
    expect(document.body.innerHTML).not.toMatch(/formbricks/i);
    fireEvent.click(screen.getByTestId('rlsh-popup-card'));
    expect(rlshPanel()).toEqual({ open: true, tab: 'mine' });
  });

  it('shows an empty field as not recorded, never as a value the field can really hold', () => {
    render(
      <RLSHPopup
        marker={{ ...baseMarker, status: '', identity: '', category: '', foes: '', team: [], affiliates: [] }}
        visible={true}
        onClose={vi.fn()}
      />
    );

    for (const label of ['Status', 'Identity', 'Category', 'Foes', 'Team', 'Affiliates']) {
      const values = valuesOf(label);
      expect(values.length).toBeGreaterThan(0);
      for (const value of values) expect(value).toBe('Not recorded');
    }
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
    expect(screen.queryByText('Unspecified')).not.toBeInTheDocument();
  });

  it('still says Unknown where the record says Unknown, which is a real status', () => {
    render(<RLSHPopup marker={{ ...baseMarker, status: 'Unknown' }} visible={true} onClose={vi.fn()} />);

    const values = valuesOf('Status');
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(value).toBe('Unknown');
  });

  it('gives the header and the Registration card one answer about registration', () => {
    const { container, rerender } = render(<RLSHPopup marker={baseMarker} visible={true} onClose={vi.fn()} />);
    expect(headerTags(container)).toContain('Not registered');
    expect(headerTags(container)).not.toContain('Pending');
    expect(valuesOf('Registration')[0]).toMatch(/^Not registered/);

    rerender(<RLSHPopup marker={{ ...baseMarker, registrationStatus: 'submitted' }} visible={true} onClose={vi.fn()} />);
    expect(headerTags(container)).toContain('Submitted');
    expect(valuesOf('Registration')[0]).toMatch(/^Submitted/);

    rerender(<RLSHPopup marker={{ ...baseMarker, registrationApproved: true }} visible={true} onClose={vi.fn()} />);
    expect(headerTags(container)).toContain('Approved');
    expect(valuesOf('Registration')[0]).toBe('Approved');
  });

  it('says no update time was given rather than calling the record stale', () => {
    const { container, rerender } = render(
      <RLSHPopup marker={{ ...baseMarker, updatedAt: 'not a date' }} visible={true} onClose={vi.fn()} />
    );
    expect(headerTags(container)).toContain('No stated update time');
    expect(headerTags(container).join(' ')).not.toMatch(/Stale|Fresh/);
    expect(valuesOf('Updated')).toEqual(['Not recorded']);

    rerender(
      <RLSHPopup
        marker={{ ...baseMarker, updatedAt: new Date(Date.now() - 40 * 86400000).toISOString() }}
        visible={true}
        onClose={vi.fn()}
      />
    );
    expect(headerTags(container)).toContain('Stale (40d)');
  });

  it('shows an unstated geocode precision as unstated, not as a tier', () => {
    const { container } = render(
      <RLSHPopup marker={{ ...baseMarker, geoConfidence: 'unknown' as const }} visible={true} onClose={vi.fn()} />
    );
    expect(headerTags(container)).toContain('No stated precision');
    expect(valuesOf('Geo Confidence')).toEqual(['No stated precision']);
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
  });
});

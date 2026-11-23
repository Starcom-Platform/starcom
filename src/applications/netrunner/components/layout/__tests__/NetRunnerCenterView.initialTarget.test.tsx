/**
 * The receiving half of the analysis -> collection loop-back.
 *
 * NetRunner previously took the application context and only logged it, so a
 * handoff from another app arrived with nothing pre-filled — the operator had
 * to retype the subject they had just clicked. These pin that the target is
 * SEEDED (editable, not forced) and that arriving never fires a scan on its
 * own: landing on a screen that has already sent network requests at a target
 * you did not confirm is a surprise, not a handoff.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NetRunnerCenterView from '../NetRunnerCenterView';

const scanWebsite = vi.fn();
vi.mock('../../../services/WebsiteScanner', () => ({
  WebsiteScannerService: class { scanWebsite(...a: unknown[]) { return scanWebsite(...a); } },
  websiteScanner: { scanWebsite: (...a: unknown[]) => scanWebsite(...a) },
}));

const renderView = (initialTarget?: string) =>
  render(<NetRunnerCenterView width="100%" height="100%" initialTarget={initialTarget} />);

describe('NetRunnerCenterView — handed-over search target', () => {
  it('seeds the OSINT target from the application context', () => {
    renderView('Globex Ltd');
    expect(screen.getByDisplayValue('Globex Ltd')).toBeTruthy();
  });

  it('leaves the target empty when nothing was handed over', () => {
    renderView();
    expect(screen.queryByDisplayValue('Globex Ltd')).toBeNull();
  });

  it('seeds rather than forces — the operator can edit it immediately', () => {
    renderView('Globex Ltd');
    const input = screen.getByDisplayValue('Globex Ltd') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'Acme Corp' } });

    expect((screen.getByDisplayValue('Acme Corp') as HTMLInputElement).value).toBe('Acme Corp');
  });

  it('does not scan on arrival — a handoff pre-fills, it does not act', () => {
    renderView('Globex Ltd');
    expect(scanWebsite).not.toHaveBeenCalled();
  });

  it('shows a scan as the step it is on, not an invented percentage (plan item 8.3b)', async () => {
    scanWebsite.mockImplementation((_t: string, onStep: (s: { step: number; of: number; label: string }) => void) => {
      onStep({ step: 1, of: 5, label: 'Fetching the page' });
      return new Promise(() => {});
    });
    // A page scan runs in the desktop app (decision B9).
    (window as unknown as Record<string, unknown>).starcomNative = { isNative: true };
    try {
      renderView('https://example.invalid');
      fireEvent.click(screen.getByText('SCAN'));
      expect(await screen.findByText('Step 1 of 5')).toBeTruthy();
      expect(screen.getByText('Fetching the page')).toBeTruthy();
      expect(screen.queryByText(/%/)).toBeNull();
    } finally {
      delete (window as unknown as Record<string, unknown>).starcomNative;
    }
  });
});

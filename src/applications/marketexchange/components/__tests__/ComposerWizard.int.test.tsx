import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../../services/intel/IntelReportService', () => {
  return {
    intelReportService: {
      getReport: vi.fn(),
      listReports: vi.fn(),
    },
  };
});

vi.mock('../../../../services/exchange/PackageComposer', () => {
  return {
    packageComposer: {
      composeZip: vi.fn(),
    },
  };
});

vi.mock('../../../../services/exchange/PublishAdapter', () => {
  return {
    publishAdapter: {
      publish: vi.fn(),
    },
  };
});

vi.mock('../../../../services/exchange/telemetry', () => {
  return {
    emitComposeEvent: vi.fn(),
  };
});

import { intelReportService } from '../../../../services/intel/IntelReportService';
import { packageComposer } from '../../../../services/exchange/PackageComposer';
import { publishAdapter } from '../../../../services/exchange/PublishAdapter';
import { emitComposeEvent } from '../../../../services/exchange/telemetry';
import { ComposerWizard } from '../ComposerWizard';
import PublishReviewRoot from '../../../../components/Publishing/PublishReviewRoot';

describe('ComposerWizard integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset localStorage between tests
    localStorage.clear();
  });

  it('publishes from Draft path and calls onPublished with mock id/url', async () => {
    // Mock listReports with a recent DRAFT
    const report = {
      id: 'draft-1',
      title: 'Sample Draft',
      summary: 'S1',
      status: 'DRAFT',
      updatedAt: new Date(),
    } as any;
    (intelReportService.listReports as any).mockResolvedValue([report]);
    // Carries the chosen distribution, as the real composer does.
    (packageComposer.composeZip as any).mockImplementation(async (input: { visibility?: string }) => ({
      manifest: { id: 'pkg-123', assets: [], visibility: input.visibility },
      blob: new Blob(['zip']),
    }));
    (publishAdapter.publish as any).mockResolvedValue({ id: 'pub-1', url: 'https://example.test/p/pub-1' });

    const onPublished = vi.fn();
    render(<><ComposerWizard open onClose={() => {}} onPublished={onPublished} /><PublishReviewRoot /></>);

    // Wait for initial draft to load
    await screen.findByText(/Using draft\/report: Sample Draft/i);

    // Walk through steps to Publish, saying who may receive it on the way:
    // the draft does not, and nothing is chosen for it (plan item 0.5).
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('radio', { name: /^Public/ }));
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: /next/i }));
    }

    await user.click(screen.getByRole('button', { name: /publish/i }));

    // Plan item 0.1: the package and both destinations are reviewed first.
    const confirm = await screen.findByTestId('publish-review-confirm');
    expect(confirm.textContent).toMatch(/^Publish package to .*IPFS$/);
    expect(publishAdapter.publish).not.toHaveBeenCalled();
    const understand = screen.queryByRole('checkbox', { name: 'I understand' });
    if (understand) await user.click(understand);
    await user.click(confirm);

    await waitFor(() => expect(onPublished).toHaveBeenCalledWith({ id: 'pub-1', url: 'https://example.test/p/pub-1' }));

    // Telemetry should be emitted for started/validated/published
    const events = (emitComposeEvent as any).mock.calls.map((c: any[]) => c[0]?.type);
    expect(events).toContain('compose_started');
    expect(events).toContain('compose_validated');
    expect(events).toContain('compose_published');
  });

  /*
   * Plan item 0.4. The Exchange puts every package on IPFS, where anyone
   * holding the address can read it, so only a Public package goes through
   * it. Distribution was "a statement of intent, not a control" here.
   */
  it('publishes only a Public package, and says why before the click', async () => {
    (intelReportService.listReports as any).mockResolvedValue([
      { id: 'draft-2', title: 'Team Draft', summary: 'S2', status: 'DRAFT', updatedAt: new Date() },
    ]);
    render(<><ComposerWizard open onClose={() => {}} /><PublishReviewRoot /></>);
    await screen.findByText(/Using draft\/report: Team Draft/i);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /next/i }));
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.checked)).toEqual([false, false, false]);
    await user.click(screen.getByRole('radio', { name: /^Limited/ }));
    expect(screen.getByTestId('package-distribution-consequence').textContent).toMatch(/IPFS/);
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: /next/i }));

    expect((screen.getByRole('button', { name: /^publish$/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('package-refusal').textContent).toMatch(/only a Public package/);
    expect(publishAdapter.publish).not.toHaveBeenCalled();
  });

  it('shows error when Board pins source has no pins', async () => {
    // Switch to boardPins and try publishing
    (packageComposer.composeZip as any).mockResolvedValue({
      manifest: { id: 'pkg-123', assets: [] },
      blob: new Blob(['zip']),
    });
    (publishAdapter.publish as any).mockResolvedValue({ id: 'pub-1' });

    render(<ComposerWizard open onClose={() => {}} />);

    // Change source to Board pins
    const user = userEvent.setup();
    const boardPinsRadio = await screen.findByRole('radio', { name: /use active board pins/i });
    await user.click(boardPinsRadio);

    // Advance to publish, marked Public so the refusal is about the pins
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('radio', { name: /^Public/ }));
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: /next/i }));
    }
    await user.click(screen.getByRole('button', { name: /publish/i }));

    // Expect an error about missing boards or pins
    await screen.findByText(/no boards found|no pinned items/i);
  });
});

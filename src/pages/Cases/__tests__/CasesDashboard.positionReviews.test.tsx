/**
 * A case's published position can be reviewed from the case page (plan item
 * 5.1): it is a claim on the relays like any other, found in the ledger of
 * what this node published.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';
import { intelCaseService } from '../../../services/intel/IntelCaseService';
import { publishedFindingsLedger } from '../../../services/intel/findings/PublishedFindingsLedger';
import { intelWorkspaceManager } from '../../../services/intel/IntelWorkspaceManager';

vi.mock('../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
vi.mock('../../../services/reviews/reviewBroadcast', () => ({ fetchReviews: async () => [] }));

/** A case that states a position, as one must before it can be published. */
const seed = async (title: string) => {
  const id = (await caseManagerAdapter.addCase({ title, description: 'Body' }))!;
  const c = (await intelCaseService.getCase(id))!;
  await intelWorkspaceManager.updateCase({ ...c, position: { statement: 'It is loading at night.', verdict: 'supported', adjudicatedBy: 'k', adjudicatedAt: '2026-09-27T00:00:00Z' } } as never);
  return (await intelCaseService.getCase(id))!;
};

describe('CasesDashboard — reviews of a published position', () => {
  it('offers them once the position is published, and not before', async () => {
    const published = await seed('Published position');
    publishedFindingsLedger.record({
      claim: { subjectRef: 'Berth 4', attribute: `case-adjudication:${published.caseNumber}` }, publishedAt: '2026-09-27T00:00:00Z',
    } as never, { eventId: 'e'.repeat(64), relaysOk: 1, nostrPubkey: 'f'.repeat(64) });
    const { unmount } = render(<CasesDashboard selectCaseId={published.id} />);
    expect(await screen.findByTestId('case-position-reviews')).toBeTruthy();
    unmount();

    const unpublished = await seed('Unpublished position');
    render(<CasesDashboard selectCaseId={unpublished.id} />);
    await screen.findByTestId('case-detail');
    expect(screen.queryByTestId('case-position-reviews')).toBeNull();
  });
});

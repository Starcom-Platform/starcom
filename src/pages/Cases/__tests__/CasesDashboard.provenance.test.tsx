/**
 * Whose each record is, in Cases (BD19–BD21, decided 2026-10-05), and a case's
 * page in two labelled parts, what the sources said and what I assert (BD20).
 * Evidence was a row of plain chips: a report you wrote, one a peer sent and
 * one nobody signed read the same.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';
import { intelWorkspaceManager } from '../../../services/intel/IntelWorkspaceManager';
import { intelReportService } from '../../../services/intel/IntelReportService';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

const PRIYA = 'c'.repeat(64);
const SENT = { pubkey: PRIYA, sentAt: '2026-10-03T09:00:00.000Z' };
const tag = () => Math.random().toString(36).slice(2, 8);

async function caseWithThreeReports() {
  const t = tag();
  const mine = await intelReportService.createReport({ title: `Mine ${t}`, content: 'Body', category: 'GENERAL', tags: [] });
  // As a bundle's import leaves it. A save stores only what it sees change, so the
  // title changes with it; the import itself is tested end to end in bundleRoundTrip.
  const theirs = await intelReportService.createReport({ title: `Theirs (draft) ${t}`, content: 'Body', category: 'GENERAL', tags: [] });
  await intelReportService.saveReport({ ...theirs, title: `Theirs ${t}`, receivedFrom: SENT });
  const nobodys = await intelReportService.createReport({ title: `Nobody's ${t}`, content: 'Body', category: 'GENERAL', tags: [] }, 'anonymous');
  const id = await caseManagerAdapter.addCase({ title: `Three sources ${t}`, description: 'Body', relatedEntities: [mine.id, theirs.id, nobodys.id] });
  return { id: id!, t };
}

const frameOf = (el: HTMLElement) => el.closest('[data-testid="provenance-frame"]');

describe('Cases — whose each record is', () => {
  it('frames each linked report by whose it is: yours, a peer\'s, or nobody\'s', async () => {
    const { id, t } = await caseWithThreeReports();
    render(<CasesDashboard selectCaseId={id} />);
    const list = await screen.findByTestId('linked-evidence-list', {}, { timeout: 5000 });
    expect(frameOf(within(list).getByText(`Report: Mine ${t}`))?.getAttribute('data-provenance')).toBe('own');
    expect(frameOf(within(list).getByText(`Report: Theirs ${t}`))?.getAttribute('data-provenance')).toBe('peer');
    expect(frameOf(within(list).getByText(`Report: Nobody's ${t}`))?.getAttribute('data-provenance')).toBe('unknown');
    // Unlinking is where it was.
    expect(within(list).getByRole('button', { name: `Unlink Mine ${t}` })).toBeTruthy();
  });

  it("frames a received case's From line as a peer's", async () => {
    const id = await caseManagerAdapter.addCase({ title: `Received ${tag()}`, description: 'Body' });
    const stored = intelWorkspaceManager.getCase(id!)!;
    await intelWorkspaceManager.putFromBundle('case', { ...stored, receivedFrom: SENT } as unknown as Record<string, unknown>);
    render(<CasesDashboard selectCaseId={id!} />);
    const page = await screen.findByTestId('case-detail');
    expect(frameOf(within(page).getByTestId('received-from'))?.getAttribute('data-provenance')).toBe('peer');
  });

  it('frames a list row that came from someone else, and leaves your own unframed', async () => {
    const received = `From Priya ${tag()}`;
    const own = `Made here ${tag()}`;
    const id = await caseManagerAdapter.addCase({ title: received, description: 'Body' });
    await intelWorkspaceManager.putFromBundle('case', { ...intelWorkspaceManager.getCase(id!)!, receivedFrom: SENT } as unknown as Record<string, unknown>);
    await caseManagerAdapter.addCase({ title: own, description: 'Body' });
    render(<CasesDashboard />);
    const receivedRow = (await screen.findByText(received)).closest('tr')!;
    expect(within(receivedRow).getByTestId('provenance-frame').getAttribute('data-provenance')).toBe('peer');
    expect(within(screen.getByText(own).closest('tr')!).queryByTestId('provenance-frame')).toBeNull();
  });
});

describe("Cases — a case's page in two parts (BD20)", () => {
  it('puts the evidence under what the sources said, and the position under what I assert', async () => {
    const { id, t } = await caseWithThreeReports();
    render(<CasesDashboard selectCaseId={id} />);
    const said = await screen.findByRole('region', { name: 'What the sources said' });
    const assert = screen.getByRole('region', { name: 'What I assert' });
    expect(await within(said).findByText(`Report: Mine ${t}`)).toBeTruthy();
    expect(within(said).getByText('Contradicting evidence')).toBeTruthy();
    expect(within(assert).getByText(/^Position/)).toBeTruthy();
    expect(within(assert).getByText('Still needed')).toBeTruthy();
    expect(within(assert).getByText('Missions built from this case')).toBeTruthy();
    expect(within(said).queryByText(/^Position/)).toBeNull();
  });
});

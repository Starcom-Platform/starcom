/**
 * A case's position waiting in the outbox reads "Queued" when the case is
 * opened again (plan item 9.4). It was the page's own state, so a reload wiped
 * it while the position still sat in the outbox.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { signFinding } from '../../../services/intel/findings/signFinding';
import { caseAdjudicationAttribute } from '../../../services/intel/findings/caseAdjudication';

vi.mock('../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));
vi.mock('../../../services/intel/outbox/PublishOutbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/intel/outbox/PublishOutbox')>();
  const { MemoryOutboxStore } = await import('../../../services/intel/outbox/OutboxStore');
  return { ...actual, publishOutbox: new actual.PublishOutbox(new MemoryOutboxStore()) };
});

import CasesDashboard from '../CasesDashboard';
import { publishOutbox } from '../../../services/intel/outbox/PublishOutbox';
import { intelCaseService } from '../../../services/intel/IntelCaseService';

const keys = ml_dsa65.keygen();

describe("CasesDashboard — a case's position waiting in the outbox", () => {
  it('reads Queued when the case is opened, with nothing clicked', async () => {
    render(<CasesDashboard />);
    const title = 'Camden warming centres';
    fireEvent.click(await screen.findByRole('button', { name: /new case/i }));
    const form = await screen.findByRole('dialog');
    fireEvent.change(within(form).getByLabelText(/^title/i), { target: { value: title } });
    fireEvent.change(within(form).getByLabelText(/^description/i), { target: { value: 'Body' } });
    fireEvent.click(within(form).getByRole('radio', { name: /^Public/ }));
    fireEvent.click(within(form).getByRole('button', { name: /^create$/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 5000 });
    await screen.findByText(title);

    // As a reload finds it: the position was queued in an earlier session.
    const record = (await intelCaseService.listCases()).find((c) => c.title === title)!;
    await publishOutbox.enqueue(signFinding({
      schemaVersion: 2,
      claim: { subjectRef: 'Camden warming centre network', subjectKind: 'organization', attribute: caseAdjudicationAttribute(record.caseNumber), value: 'substantiated' },
      publishedAt: '2026-09-26T00:00:00.000Z',
    } as never, keys.secretKey));

    fireEvent.click(screen.getByRole('button', { name: `View ${title}` }));
    const dialog = await screen.findByTestId('case-detail');
    fireEvent.change(within(dialog).getByTestId('position-input'), { target: { value: 'Three of the four are open.' } });
    fireEvent.change(within(dialog).getByTestId('verdict-select'), { target: { value: 'substantiated' } });
    fireEvent.click(within(dialog).getByTestId('state-position'));
    const button = await within(dialog).findByTestId('publish-position');
    await waitFor(() => expect(button.textContent).toBe('Queued — not yet public'));
  });
});

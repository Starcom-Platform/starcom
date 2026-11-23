/**
 * The report editor in the language chosen (decision D-ML, L3): its heading, its help, what is wrong with
 * what was entered, and why its author cannot approve it.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { setLanguage } from '../../../i18n/app/i18n';

const service = vi.hoisted(() => ({ saveReport: vi.fn(), getReport: vi.fn(), updateStatus: vi.fn(), deleteReport: vi.fn() }));
vi.mock('../../../services/intel/IntelReportService', () => ({ intelReportService: service }));
vi.mock('../../../services/identity/NostrIdentityService', () => ({ nostrIdentityService: { getPubkey: () => 'my-key', signerPubkey: () => 'my-key' } }));

import ReportEditPanel from '../ReportEditPanel';

afterEach(async () => { await setLanguage('en', false); });

const report: IntelReportUI = {
  id: 'r1', title: 'Bridge', content: 'Long enough content', author: 'my-key', category: 'GENERAL',
  tags: [], createdAt: new Date(), updatedAt: new Date(), status: 'REVIEWED',
};

describe('The report editor, in another language', () => {
  it('speaks Ukrainian: its heading, its help, what is wrong, and why its author cannot approve it', async () => {
    await setLanguage('uk', false);
    render(<ReportEditPanel report={report} onCancel={() => {}} onSaved={() => {}} onStatusChanged={() => {}} />);

    expect(screen.getByRole('heading', { name: 'Редагувати звіт' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Короткий заголовок звіту (довідка)' })).toBeTruthy();
    expect(screen.getByTestId('blocked-APPROVED').textContent).toMatch(/хтось інший, не той, хто його написав/);

    fireEvent.change(screen.getByDisplayValue('Bridge'), { target: { value: '' } });
    expect(screen.getByText('Потрібна назва')).toBeTruthy();
  });
});

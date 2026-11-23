/**
 * A case's page in the language chosen (decision D-ML, L3): its two parts named in that language, each
 * linked record said as "kind: title" in that language's words, and the verdict choices offered in it.
 */
import React from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import CasesDashboard from '../CasesDashboard';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';
import { intelReportService } from '../../../services/intel/IntelReportService';
import { setLanguage } from '../../../i18n/app/i18n';

vi.mock('../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));
vi.mock('../../../hooks/useShowOnGlobe', () => ({ useShowOnGlobe: () => async () => undefined }));

afterEach(async () => { await setLanguage('en', false); });

describe("A case's page, in another language", () => {
  it('names its two parts, its records and its verdicts in Ukrainian', async () => {
    const report = await intelReportService.createReport({ title: 'Рівень води біля мосту', content: 'Body', category: 'GENERAL', tags: [] });
    const id = await caseManagerAdapter.addCase({ title: 'Повінь', description: 'Body', relatedEntities: [report.id] });
    await setLanguage('uk', false);
    render(<CasesDashboard selectCaseId={id!} />);

    const said = await screen.findByRole('region', { name: 'Що сказали джерела' });
    const assert = screen.getByRole('region', { name: 'Що я стверджую' });
    expect(await within(said).findByText('Звіт: Рівень води біля мосту')).toBeTruthy();
    expect(within(said).getByText('Докази проти')).toBeTruthy();
    expect(within(assert).getByText('Ще потрібно')).toBeTruthy();
    const verdicts = within(assert).getByTestId('verdict-select') as HTMLSelectElement;
    expect([...verdicts.options].map((o) => o.textContent)).toEqual(['Вердикт…', 'Підтверджено', 'Не підтверджено', 'Без висновку']);
  });
});

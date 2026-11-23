/**
 * A report's page in the language chosen (decision D-ML, L3): its parts and lines in that language, its
 * dates as the language writes them with the time still UTC and marked Z (D-E), and how closely the event's
 * time is known said in that language's grammar.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, it, expect } from 'vitest';
import ReportDetailPanel from '../ReportDetailPanel';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { setLanguage } from '../../../i18n/app/i18n';

afterEach(async () => { await setLanguage('en', false); });

const created = Date.UTC(2026, 8, 14, 9, 5);
const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 'r1',
  title: 'Report',
  content: 'Body',
  author: 'a',
  category: 'GENERAL',
  tags: [],
  createdAt: new Date(created),
  updatedAt: new Date(created),
  status: 'SUBMITTED',
  collaborators: [],
  history: [{ timestamp: new Date(created).toISOString(), action: 'STATUS_CHANGED', fromStatus: 'DRAFT', toStatus: 'SUBMITTED' }],
  ...over,
});
const renderPanel = (r: IntelReportUI) =>
  render(<ReportDetailPanel report={r} onClose={() => {}} onEnterEdit={() => {}} onAddCollaborator={async () => {}} />);
const day = (lang: string, ms: number) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(ms);

describe("A report's page, in another language", () => {
  it('names its parts in German, and writes when it was written as German does, in UTC marked Z', async () => {
    await setLanguage('de', false);
    renderPanel(report());

    expect(screen.getByRole('heading', { name: 'Inhalt' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mitwirkende' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Den Bericht schließen' })).toBeInTheDocument();
    expect(screen.getByText(`Erstellt: ${day('de', created)} 09:05Z`)).toHaveAttribute('title', expect.stringMatching(/^Ortszeit: /));
    expect(screen.queryByText(/14 Sep 2026/)).not.toBeInTheDocument();
  });

  it('says in Ukrainian how closely the event is known, in the genitive its grammar asks', async () => {
    await setLanguage('uk', false);
    // Three days wide, starting at noon: no calendar precision, so its width is said.
    const start = Date.UTC(2026, 6, 27, 12);
    renderPanel(report({ startDate: new Date(start), timePrecisionMs: 3 * 86_400_000 }));

    expect(screen.getByText(`Сталося: ${day('uk', start)} 12:00Z, з точністю до 3 днів`)).toBeInTheDocument();
  });
});

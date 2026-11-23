/**
 * The words every screen shares, in the language chosen (decision D-ML, L3): a status and what it means,
 * how serious something is, and who may receive a record, asked as one whole question in each language
 * rather than an English phrase dropped into it.
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setLanguage } from '../../../i18n/app/i18n';
import StatusChip from '../StatusChip';
import SeverityBadge from '../SeverityBadge';
import DistributionChoice from '../DistributionChoice';
import StatusSteps from '../../Steps/StatusSteps';

afterEach(async () => { await setLanguage('en', false); });

describe('the shared words, in another language', () => {
  it('names a status and says what it means', async () => {
    await setLanguage('uk', false);
    render(<StatusChip kind="case" status="PENDING" />);
    const chip = screen.getByTestId('status-chip');
    expect(chip.textContent).toBe('Відкладена');
    expect(chip.getAttribute('title')).toBe('Чекає на щось, перш ніж робота продовжиться.');
  });

  it('offers a case\'s moves in its words', async () => {
    await setLanguage('de', false);
    render(<StatusSteps kind="case" status="OPEN" onMove={() => undefined} />);
    expect(screen.getByTestId('transition-to-IN_PROGRESS').textContent).toBe('Arbeit beginnen');
    expect(screen.getByTestId('transition-to-PENDING').textContent).toBe('Zurückstellen');
  });

  it('says how serious something is, and when nobody has said', async () => {
    await setLanguage('pt-BR', false);
    const { rerender } = render(<SeverityBadge level="critical" />);
    expect(screen.getByTestId('severity-badge').textContent).toBe('Crítica');
    rerender(<SeverityBadge level="unset" />);
    expect(screen.getByTestId('severity-badge').textContent).toBe('Não avaliada');
  });

  it('asks who may receive a record as one question, with nothing chosen', async () => {
    await setLanguage('hi', false);
    render(<DistributionChoice what="case" value={undefined} onChange={() => undefined} testId="dist" />);
    expect(screen.getByTestId('dist').textContent).toContain('यह केस कौन पा सकता है?');
    expect(screen.getByTestId('dist-consequence').textContent).toBe('एक चुनें। जब तक कोई नहीं चुनता, कुछ भी प्रकाशित नहीं होता।');
    expect(screen.getAllByRole('radio').map((r) => (r as HTMLInputElement).checked)).toEqual([false, false, false]);
  });
});

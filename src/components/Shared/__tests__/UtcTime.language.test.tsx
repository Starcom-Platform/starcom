/**
 * A time on screen in the language shown (decision D-ML, L3): the date as the language writes it, still
 * in UTC, the time still marked Z, and the local time on hover introduced in that language.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, it, expect } from 'vitest';
import UtcTime from '../UtcTime';
import { setLanguage } from '../../../i18n/app/i18n';

const at = Date.UTC(2026, 8, 14, 23, 33);

afterEach(async () => { await setLanguage('en', false); });

describe('UtcTime, in another language', () => {
  it('writes the date as Ukrainian does, in UTC, and keeps the time marked Z', async () => {
    await setLanguage('uk', false);
    render(<UtcTime at={at} year />);
    const el = screen.getByText('14 вер. 2026 р. 23:33Z');
    expect(el.tagName).toBe('TIME');
    expect(el.getAttribute('title')).toMatch(/^Місцевий час: /);
  });

  it('gives a day alone in the language, with no local time', async () => {
    await setLanguage('de', false);
    render(<UtcTime at="2026-09-14" day year />);
    expect(screen.getByText('14. Sept. 2026')).not.toHaveAttribute('title');
  });
});

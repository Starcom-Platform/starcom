/**
 * A value that is a day shows the date alone, in UTC (decision D-E, settled
 * 2026-09-14 for step 9).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import UtcTime from '../UtcTime';

describe('UtcTime: a day', () => {
  it('shows the UTC date alone, with no local time claimed', () => {
    // 02:00Z is still the day before in the Americas.
    render(<UtcTime at={Date.UTC(2026, 6, 26, 2)} day year />);
    const el = screen.getByText('26 Jul 2026');

    expect(el.tagName).toBe('TIME');
    expect(el).toHaveAttribute('datetime', '2026-07-26');
    expect(el).not.toHaveAttribute('title');
  });
});

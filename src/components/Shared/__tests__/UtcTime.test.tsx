/**
 * A time as Starcom shows it: in UTC marked Z, with the viewer's local time on
 * hover (decision D-E, settled 2026-09-14 for step 9).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import UtcTime from '../UtcTime';
import { localTimeTitle } from '../../../utils/utcTime';

const at = Date.UTC(2026, 8, 14, 19, 33);

describe('UtcTime', () => {
  it('shows a moment in UTC with its date, and its local time on hover', () => {
    render(<UtcTime at={at} />);
    const el = screen.getByText('14 Sep 19:33Z');

    expect(el.tagName).toBe('TIME');
    expect(el).toHaveAttribute('datetime', new Date(at).toISOString());
    expect(el).toHaveAttribute('title', localTimeTitle(at));
  });

  it('adds the year when asked', () => {
    render(<UtcTime at={at} year />);
    expect(screen.getByText('14 Sep 2026 19:33Z')).toBeInTheDocument();
  });

  it('reads a Date, an ISO string and milliseconds alike', () => {
    render(
      <>
        <UtcTime at={new Date(at)} year />
        <UtcTime at={new Date(at).toISOString()} year />
        <UtcTime at={at} year />
      </>,
    );
    expect(screen.getAllByText('14 Sep 2026 19:33Z')).toHaveLength(3);
  });

  it('shows a value it cannot read as it was stored, with no local time claimed', () => {
    render(<UtcTime at="not a time" year />);
    const el = screen.getByText('not a time');

    expect(el).not.toHaveAttribute('title');
    expect(screen.queryByText(/Invalid Date|NaN/)).not.toBeInTheDocument();
  });
});

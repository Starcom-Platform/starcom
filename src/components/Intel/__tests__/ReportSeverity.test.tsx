/**
 * How serious a report is, shown one way everywhere (plan item 1.9, story S7):
 * the word on the Cases' scale with pips on the warm ramp, "Not assessed" when
 * nobody said, and what the author stated before any tag.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReportSeverity from '../ReportSeverity';

describe('ReportSeverity', () => {
  it('shows the stated severity as a word with pips, as the author\'s', () => {
    render(<ReportSeverity priority="HIGH" />);
    const shown = screen.getByTestId('report-severity');
    expect(shown.textContent).toContain('High');
    expect(shown.getAttribute('data-level')).toBe('high');
    expect(shown.querySelectorAll('[data-pip="on"]')).toHaveLength(3);
    expect(shown.getAttribute('title')).toMatch(/by its author/i);
  });

  it('says Not assessed when nobody said, never a default level', () => {
    render(<ReportSeverity />);
    expect(screen.getByTestId('report-severity').textContent).toBe('Not assessed');
  });

  it("reads a peer's hashtag when nothing was stated, and what was stated before it", () => {
    const { rerender } = render(<ReportSeverity tags={['critical']} />);
    expect(screen.getByTestId('report-severity').textContent).toContain('Critical');
    rerender(<ReportSeverity priority="LOW" tags={['critical']} />);
    expect(screen.getByTestId('report-severity').textContent).toContain('Low');
  });
});

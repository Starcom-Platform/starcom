/**
 * The Starcom mark as SVG (K3, BD7): the winged mark the header's animated GIF
 * showed, 305 KB, traced to one path.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StarcomMark, STARCOM_MARK_PATH } from '../StarcomMark';

describe('StarcomMark', () => {
  it('is one path of seven shapes: two wings a side, the star and two chevrons', () => {
    expect(STARCOM_MARK_PATH.match(/M/g)).toHaveLength(7);
    expect(STARCOM_MARK_PATH).toMatch(/^M[\d. LMZ]+Z$/);
  });

  it('is named Starcom to a screen reader when titled, and drawn in the colour it sits in', () => {
    render(<StarcomMark title="Starcom" />);
    const mark = screen.getByRole('img', { name: 'Starcom' });
    expect(mark.querySelector('path')!.getAttribute('fill')).toBe('currentColor');
  });

  it('keeps its proportions whatever height it is given', () => {
    const { container } = render(<StarcomMark />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 160 99.7');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });
});

/**
 * Who may receive a record, drawn one way everywhere (BD3, decided BD15 on
 * 2026-10-05): Starcom's word in the Traffic Light Protocol's colours on its
 * black chip, with the TLP label and what the choice does in the hover. A
 * record nobody decided on is grey and dashed, which means not judged, and
 * goes nowhere. It was drawn six ways before: raw words, outlined chips, a
 * table cell reading "undecided", and nothing at all on a report.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import DistributionChip from '../DistributionChip';

const chip = () => screen.getByTestId('distribution-chip');

describe('DistributionChip', () => {
  it.each([
    ['public', 'Public', 'TLP:CLEAR', /anyone can read it/],
    ['limited', 'Limited', 'TLP:GREEN', /internal relay/],
    ['private', 'Private', 'TLP:RED', /never published/],
  ] as const)('%s reads as its word, with its TLP label and what it does in the hover', (visibility, word, tlp, does) => {
    render(<DistributionChip visibility={visibility} />);
    expect(chip().getAttribute('data-distribution')).toBe(visibility);
    expect(within(chip()).getByText(word)).toBeTruthy();
    expect(chip().getAttribute('title')).toMatch(new RegExp(`^${tlp} · `));
    expect(chip().getAttribute('title')).toMatch(does);
  });

  it('reads Undecided when nobody chose, and says it goes nowhere until someone does', () => {
    render(<DistributionChip visibility={undefined} what="mission" />);
    expect(chip().getAttribute('data-distribution')).toBe('undecided');
    expect(within(chip()).getByText('Undecided')).toBeTruthy();
    expect(chip().getAttribute('title')).toBe('Nobody has chosen who may receive this mission: it goes nowhere until someone does.');
  });

  it('names what it is to a screen reader, and keeps a test id where one is given', () => {
    render(<DistributionChip visibility="private" testId="card-distribution" />);
    expect(screen.getByTestId('card-distribution').textContent).toBe('Distribution: Private');
  });

  it("draws each in TLP's own colour, on black, and undecided in the grey of not judged", () => {
    const css = readFileSync(join(__dirname, '..', 'DistributionChip.module.css'), 'utf8');
    const rule = (value: string) => css.match(new RegExp(`\\[data-distribution='${value}'\\]\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('public')).toMatch(/var\(--sc-tlp-clear\)/);
    expect(rule('limited')).toMatch(/var\(--sc-tlp-green\)/);
    expect(rule('private')).toMatch(/var\(--sc-tlp-red\)/);
    expect(rule('undecided')).toMatch(/var\(--sc-text-secondary\)/);
    expect(rule('undecided')).toMatch(/dashed/);
    expect(css).toMatch(/background:\s*var\(--sc-tlp-black\)/);
  });
});

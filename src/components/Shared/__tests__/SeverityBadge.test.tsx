/**
 * How serious something is, drawn one way everywhere (BD3): the word on the
 * Cases' scale with pips on the warm ramp, and "Not assessed" in grey when
 * nobody said, which is not a low level. Reports drew it so; the cases list
 * drew its own coloured chip from a colour map of its own.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SeverityBadge from '../SeverityBadge';
import { severityLevel } from '../severityLevel';

const badge = () => screen.getByTestId('severity-badge');

describe('SeverityBadge', () => {
  it.each([
    ['low', 'Low', 1],
    ['medium', 'Medium', 2],
    ['high', 'High', 3],
    ['critical', 'Critical', 4],
  ] as const)('%s reads as its word with %s of four pips lit', (level, word, lit) => {
    render(<SeverityBadge level={level} />);
    expect(badge().getAttribute('data-level')).toBe(level);
    expect(badge().textContent).toBe(word);
    expect(badge().querySelectorAll('[data-pip="on"]')).toHaveLength(lit);
    expect(badge().querySelectorAll('[data-pip="off"]')).toHaveLength(4 - lit);
  });

  it('says Not assessed when nobody said, with no pips, never a default level', () => {
    render(<SeverityBadge level="unset" />);
    expect(badge().textContent).toBe('Not assessed');
    expect(badge().querySelectorAll('[data-pip]')).toHaveLength(0);
    expect(badge().getAttribute('title')).toBe('Nobody has said how serious this is');
  });

  it('says whose word it is in the hover, where that is given', () => {
    const { rerender } = render(<SeverityBadge level="high" said="by its author" />);
    expect(badge().getAttribute('title')).toBe('High, by its author');
    rerender(<SeverityBadge level="high" />);
    expect(badge().getAttribute('title')).toBe('High');
  });

  it('reads any stored value onto the scale, and nothing as not assessed', () => {
    expect(severityLevel('HIGH')).toBe('high');
    expect(severityLevel('critical')).toBe('critical');
    expect(severityLevel('IMMEDIATE')).toBe('critical');
    expect(severityLevel(undefined)).toBe('unset');
    expect(severityLevel('urgent')).toBe('unset');
  });

  it('colours the ramp from the tokens, sand to red, and not assessed in grey', () => {
    const css = readFileSync(join(__dirname, '..', 'SeverityBadge.module.css'), 'utf8');
    const rule = (level: string) => css.match(new RegExp(`\\[data-level='${level}'\\]\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('low')).toMatch(/var\(--sc-severity-1\)/);
    expect(rule('medium')).toMatch(/var\(--sc-severity-2\)/);
    expect(rule('high')).toMatch(/var\(--sc-severity-3\)/);
    expect(rule('critical')).toMatch(/var\(--sc-severity-4\)/);
    expect(rule('unset')).toMatch(/var\(--sc-text-secondary\)/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

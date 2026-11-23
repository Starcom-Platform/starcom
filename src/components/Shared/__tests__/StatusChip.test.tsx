/**
 * Where a record stands, drawn one way everywhere (BD3, BD24): its word, and a
 * shape and colour for what it means. Working is plain with an open ring,
 * waiting amber with a half ring, done green with a check, closed grey with a
 * filled square. Missions coloured its statuses from a map of its own (Packaged
 * blue, Ready amber), the cases list from another, and a report's badge had
 * fills that were never drawn.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusChip from '../StatusChip';

const chip = () => screen.getByTestId('status-chip');

describe('StatusChip', () => {
  it.each([
    ['mission', 'PLANNING', 'Planning', 'working', 'ring'],
    ['case', 'PENDING', 'On hold', 'waiting', 'half'],
    ['mission', 'DISPATCHED', 'Dispatched', 'done', 'check'],
    ['report', 'ARCHIVED', 'Archived', 'closed', 'square'],
  ] as const)('draws %s %s as its word with the %s shape', (kind, status, word, tone, shape) => {
    render(<StatusChip kind={kind} status={status} />);
    expect(chip().textContent).toBe(word);
    expect(chip().getAttribute('data-status')).toBe(status);
    expect(chip().getAttribute('data-tone')).toBe(tone);
    expect(chip().querySelector('[data-mark]')?.getAttribute('data-mark')).toBe(shape);
    expect(chip().getAttribute('title')).toBeTruthy();
  });

  it('keeps a test id where one is given', () => {
    render(<StatusChip kind="mission" status="PLANNING" testId="mission-status-chip" />);
    expect(screen.getByTestId('mission-status-chip').getAttribute('data-status')).toBe('PLANNING');
  });

  it('colours each tone by its meaning from the tokens, and never in cyan', () => {
    const css = readFileSync(join(__dirname, '..', 'StatusChip.module.css'), 'utf8');
    const rule = (tone: string) => css.match(new RegExp(`\\[data-tone='${tone}'\\]\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('working')).toMatch(/var\(--sc-text-body\)/);
    expect(rule('waiting')).toMatch(/var\(--sc-caution\)/);
    expect(rule('done')).toMatch(/var\(--sc-ok\)/);
    expect(rule('closed')).toMatch(/var\(--sc-text-muted\)/);
    expect(css).not.toMatch(/--sc-(accent|cyan|focus)/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

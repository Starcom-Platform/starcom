/**
 * Whose a record is, drawn one way everywhere (BD3, BD19): MIL-STD-2525's
 * frames, where colour is always backed by shape. Yours a solid cyan frame, a
 * peer's a dashed one, unknown a yellow quatrefoil with "?", an impersonation
 * a red diamond. Each says in words, in its hover and to a screen reader.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProvenanceFrame from '../ProvenanceFrame';
import type { Provenance } from '../../../services/intel/provenance/provenance';

const PRIYA = 'c'.repeat(64);
const frame = () => screen.getByTestId('provenance-frame');

describe('ProvenanceFrame', () => {
  it.each([
    [{ whose: 'own', how: 'written-here' }, 'Yours.', /^Yours: written under your key\.$/, null],
    [{ whose: 'peer', how: 'bundle', from: PRIYA }, 'From a peer.', /^From .+: in a bundle they signed\.$/, null],
    [{ whose: 'unknown', how: 'no-author' }, 'Unknown origin.', /^Nobody is recorded as its author\.$/, 'unknown'],
    [{ whose: 'impersonation', how: 'mismatch', claims: PRIYA, from: 'd'.repeat(64) }, 'Impersonation.', /^Says it is from .+, but .+ signed it\.$/, 'impersonation'],
  ] as Array<[Provenance, string, RegExp, string | null]>)('draws %o with its words and its shape', (provenance, said, hover, mark) => {
    render(<ProvenanceFrame provenance={provenance}><span>Report: Pier 4</span></ProvenanceFrame>);
    expect(frame().getAttribute('data-provenance')).toBe(provenance.whose);
    expect(frame().getAttribute('title')).toMatch(hover);
    // Said first to a screen reader; the mark is drawn, not written.
    expect(frame().textContent).toBe(`${said} Report: Pier 4`);
    const shape = frame().querySelector('[data-mark]');
    expect(shape?.getAttribute('data-mark') ?? null).toBe(mark);
  });

  it('names the peer it is from by the name learned for their key', () => {
    render(<ProvenanceFrame provenance={{ whose: 'peer', how: 'relay', from: PRIYA }}><span>x</span></ProvenanceFrame>);
    expect(frame().getAttribute('title')).toMatch(/^From npub1/);
  });

  it('draws each frame from the tokens: solid and dashed cyan, the unknown yellow, the danger red', () => {
    const css = readFileSync(join(__dirname, '..', 'ProvenanceFrame.module.css'), 'utf8');
    const rule = (whose: string) => css.match(new RegExp(`\\[data-provenance='${whose}'\\]\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('own')).toMatch(/1px solid var\(--sc-accent\)/);
    expect(rule('peer')).toMatch(/1px dashed var\(--sc-accent\)/);
    expect(rule('unknown')).toMatch(/var\(--sc-unknown\)/);
    expect(rule('impersonation')).toMatch(/var\(--sc-danger\)/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

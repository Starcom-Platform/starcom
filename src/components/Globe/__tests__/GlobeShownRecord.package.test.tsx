/**
 * The panel, for a received package and for what a key published (plan item
 * 9.14, decision G6): what the package cites and what of it was found here,
 * and a key's own reports labelled as what it published, not as what any
 * package rests on.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlobeShownRecord } from '../GlobeShownRecord';
import type { ShownRecord } from '../Hooks/useShownRecord';

const pin = (id: string) => ({ pubkey: id, title: id, content: '', author: 'a', timestamp: 0, latitude: 1, longitude: 2, tags: [] });
const MECHA = 'a'.repeat(64);
const PACKAGE = { kind: 'package' as const, id: 'evt-1', signer: MECHA, name: 'Harm reduction at Nova', cites: ['ic-1', 'ic-2', 'ic-9'] };
const PUBLISHER = { kind: 'publisher' as const, id: MECHA };

const show = (shown: ShownRecord) => render(<GlobeShownRecord shown={shown} onShowAll={vi.fn()} />);
const text = () => screen.getByTestId('globe-shown-record').textContent ?? '';

describe('GlobeShownRecord: a package', () => {
  it('names it, says what it cites and what was found and drawn, and what was not found', () => {
    show({
      status: 'ready', target: PACKAGE, label: 'Harm reduction at Nova',
      placement: { linkedCount: 2, markers: [pin('x')], notDrawn: { count: 1, byReason: { 'no-coordinates': 1 } }, cameraTarget: null },
      citations: { cited: 3, found: 2, unresolved: ['ic-9'] },
    });
    expect(screen.getByLabelText('Package shown on the globe')).toBeTruthy();
    expect(text()).toContain('Harm reduction at Nova');
    expect(text()).toContain('Cites 3 reports: 2 found here, 1 drawn.');
    expect(text()).toContain('1 found report names no place, so it is not drawn.');
    expect(text()).toContain('Not found among what its signer published here: ic-9. It may not have arrived yet, or it names a report in a way this node cannot read.');
    expect(text()).toContain('What the package cites, found among reports signed by the same key.');
  });

  it('says so while it is being read', () => {
    show({ status: 'loading', target: PACKAGE });
    expect(text()).toContain("Reading this package's cited reports…");
  });
});

describe('GlobeShownRecord: what a key published', () => {
  it('labels it as what that key published, never as what a package rests on', () => {
    show({
      status: 'ready', target: PUBLISHER, label: 'Mecha Jono',
      placement: { linkedCount: 3, markers: [pin('x'), pin('y')], notDrawn: { count: 1, byReason: { 'no-coordinates': 1 } }, cameraTarget: null },
      published: 3,
    });
    expect(screen.getByLabelText('What a key published, shown on the globe')).toBeTruthy();
    expect(text()).toContain('Mecha Jono');
    expect(text()).toContain('3 reports found here, 2 drawn.');
    expect(text()).toContain('Everything this key published that has arrived here: not what any package rests on.');
  });

  it('says nothing has arrived yet, rather than that nothing exists', () => {
    show({
      status: 'ready', target: PUBLISHER, label: 'Mecha Jono',
      placement: { linkedCount: 0, markers: [], notDrawn: { count: 0, byReason: {} }, cameraTarget: null },
      published: 0,
    });
    expect(text()).toContain('Nothing this key published has arrived here yet. Reports appear as the relays answer.');
  });
});

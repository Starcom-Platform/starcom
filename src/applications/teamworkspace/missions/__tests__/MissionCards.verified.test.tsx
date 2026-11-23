/**
 * Who posted it, read from the posts (decision D-MF, MF4): a card names its signer by the name the key gives
 * itself, with the domain that lists the key, once that is checked; never before. A package claiming the
 * name from another key is then an impersonation (BD25).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { AcceptedPackage } from '../../../../services/intel/MissionPackageIngest';
import { forgetNames, rememberVerifiedName } from '../../../../services/identity/names';

const MECHA = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const OTHER = 'f'.repeat(64);
const asked = vi.hoisted(() => [] as string[][]);

vi.mock('../../../../services/identity/signerProfiles', () => ({
  // The domain lists Mecha Jono's key and no other.
  verifySigners: vi.fn(async (keys: string[]) => {
    asked.push([...keys]);
    for (const key of keys) if (key === MECHA) rememberVerifiedName(key, 'Mecha Jono', 'mecha.jono.archangel.agency');
  }),
}));

import MissionCards from '../MissionCards';

const pkg = (d: string, pubkey: string): AcceptedPackage => ({
  event: { id: `evt-${d}`, pubkey, created_at: 1_790_000_000, kind: 30079, tags: [['d', d]], content: '', sig: '' },
  check: {
    ok: true,
    manifest: {
      id: d, name: d, version: '1.0.0', description: '', author: 'Mecha Jono', createdAt: '2026-10-16T09:00:00Z',
      license: 'CC-BY-4.0', visibility: 'public', reports: [], intel: [], assets: [], metadata: {}, objectives: [],
    },
  } as AcceptedPackage['check'],
  relay: 'wss://record.example',
});

const card = (headline: string) => screen.getAllByTestId('received-package-row')
  .find((c) => within(c).getByRole('heading', { level: 3 }).textContent === headline)!;

describe('MissionCards, who posted it', () => {
  beforeEach(() => { forgetNames(); asked.length = 0; });

  it('asks after each signer, and names the verified one with the domain that lists its key', async () => {
    render(<MissionCards onOpen={() => {}} accepted={[pkg('real', MECHA), pkg('copy', OTHER)]} />);
    expect(asked[0]).toEqual([MECHA, OTHER]);
    const real = card('real');
    expect(await within(real).findByTestId('mission-card-verified')).toHaveTextContent('mecha.jono.archangel.agency');
    // Verified, and an AI agent's key, labelled as such (the legal review of 2026-10-17).
    expect(within(real).getByTestId('key-name').textContent).toBe('Mecha Jono ✓ · AI agent');
    expect(within(real).getByTestId('provenance-frame').getAttribute('data-provenance')).toBe('peer');
  });

  it('shows a key no domain lists by its npub, and its claim to the verified name as an impersonation', async () => {
    render(<MissionCards onOpen={() => {}} accepted={[pkg('real', MECHA), pkg('copy', OTHER)]} />);
    await within(card('real')).findByTestId('mission-card-verified');
    const copy = card('copy');
    expect(within(copy).queryByTestId('mission-card-verified')).toBeNull();
    expect(within(copy).getByTestId('key-name').textContent).toMatch(/^npub1/);
    expect(within(copy).getByTestId('provenance-frame').getAttribute('data-provenance')).toBe('impersonation');
  });
});

/**
 * Who is taking part in a package, as its publisher counts it (NavCom's taking_part, D-MX MX28): that count leads,
 * since only the publisher sees private claims; the public claims seen follow it, as before.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { takingPartOf } from '../../../../services/intel/packageProfile';

vi.mock('../../../../components/Identity/KeyName', () => ({ default: ({ pubkey }: { pubkey: string }) => <span>{pubkey.slice(0, 4)}</span> }));
import PackageClaims from '../PackageClaims';

describe('takingPartOf', () => {
  it('reads the publisher\'s count of people and agents, and nothing that is not two whole numbers', () => {
    expect(takingPartOf({ tags: [['taking_part', '12', '3']] })).toEqual({ operators: 12, agents: 3 });
    expect(takingPartOf({ tags: [['taking_part', '5']] })).toEqual({ operators: 5, agents: 0 });
    expect(takingPartOf({ tags: [['taking_part', 'many', '1']] })).toBeNull();
    expect(takingPartOf({ tags: [['taking_part', '-1', '0']] })).toBeNull();
    expect(takingPartOf({ tags: [] })).toBeNull();
  });
});

describe('PackageClaims with the publisher\'s count', () => {
  it('leads with the publisher\'s count, then the public claims seen', () => {
    render(<PackageClaims claims={[{ pubkey: 'abcd'.repeat(16), at: 1 }]} answered takingPart={{ operators: 12, agents: 1 }} />);
    expect(screen.getByTestId('package-claims-taking-part').textContent).toBe('12 people and 1 agent taking part, as its publisher counts');
    expect(screen.getByTestId('package-claims').textContent).toMatch(/^1 public claim: abcd/);
  });

  it('says the count alone when no public claim is seen', () => {
    render(<PackageClaims claims={[]} answered takingPart={{ operators: 0, agents: 0 }} />);
    expect(screen.getByTestId('package-claims-taking-part').textContent).toBe('0 people and 0 agents taking part, as its publisher counts');
    expect(screen.queryByTestId('package-claims')).toBeNull();
  });
});

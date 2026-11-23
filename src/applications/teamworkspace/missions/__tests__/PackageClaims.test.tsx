/**
 * Who has publicly taken up a package (D-MX, MX1): one entry per key, an
 * agent said as one, and nothing said before a relay has answered.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PackageClaims from '../PackageClaims';

describe('PackageClaims', () => {
  it('says nothing before a relay has sent all it holds: no claims seen then means nothing', () => {
    const { container } = render(<PackageClaims claims={[]} answered={false} />);
    expect(container.textContent).toBe('');
  });

  it('says no public claims were seen once a relay has answered', () => {
    render(<PackageClaims claims={[]} answered />);
    expect(screen.getByTestId('package-claims').textContent).toBe('No public claims seen on the relays read.');
  });

  it('counts public claims, one per key, naming each, and an agent as one', () => {
    render(<PackageClaims claims={[{ pubkey: 'a'.repeat(64), at: 1 }, { pubkey: 'b'.repeat(64), at: 2, agent: 'scout' }]} answered />);
    const line = screen.getByTestId('package-claims').textContent ?? '';
    expect(line).toMatch(/^2 public claims: /);
    expect(line).toMatch(/\(an agent, scout\)$/);
  });
});

// Keeps the JSX runtime import used under the project's lint rules.
void React;

/**
 * The demo vault opens when asked, with no simulated wait (plan item 8.3). It
 * is built in memory, and IntelWeb waited 500 ms "to simulate loading" before
 * showing it, behind a spinner that described work nobody was doing.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { IntelWebApplication } from '../IntelWebApplication';

describe('IntelWebApplication — the demo vault', () => {
  afterEach(() => vi.useRealTimers());

  it('opens without a timer having to run', async () => {
    vi.useFakeTimers();
    render(<IntelWebApplication />);
    fireEvent.click(screen.getByRole('button', { name: /Load Demo Intelligence Vault/ }));
    // Let promises settle, but no timer run.
    await act(async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); });
    expect(screen.queryByText(/Loading Intelligence Vault/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Load Demo Intelligence Vault/ })).toBeNull();
  });
});

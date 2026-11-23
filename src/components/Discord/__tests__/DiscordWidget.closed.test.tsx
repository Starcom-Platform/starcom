/**
 * A closed Discord widget fetches nothing (plan item 4.5). It is mounted in the
 * header for the whole visit, and its stats hook polled Discord every two
 * minutes from page load, open or not.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const doubles = vi.hoisted(() => ({ getServerStats: vi.fn(async () => ({ presence_count: 1, members: [] })) }));
vi.mock('../../../services/DiscordService', () => ({ DiscordService: { getServerStats: doubles.getServerStats } }));

import DiscordWidget from '../DiscordWidget';

describe('DiscordWidget, closed', () => {
  it('makes no request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<DiscordWidget isOpen={false} onClose={() => {}} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(doubles.getServerStats).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

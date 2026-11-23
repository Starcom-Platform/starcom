/**
 * The team workspace gives when a member joined and was last active in UTC, with
 * the year (decision D-E, settled 2026-09-14 for step 9). Both printed the
 * browser's local time with no zone.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import TeamWorkspaceApplication from '../TeamWorkspaceApplication';
import { realTimeTeamService } from '../../../services/RealTimeTeamService';
import { localTimeTitle } from '../../../utils/utcTime';

vi.mock('../../../communication/context/useSecureChat', () => ({
  useSecureChat: () => ({ chatProvider: null, sendMessage: vi.fn(), createChannel: vi.fn() }),
}));

const DAY = 86_400_000;
const created = Date.UTC(2026, 8, 4, 19, 33);

afterEach(() => {
  vi.useRealTimers();
});

describe('TeamWorkspace: when members joined and were last active', () => {
  it('says when a member joined more than a week ago in UTC, with the year', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(created);
    await realTimeTeamService.createTeam({ name: 'Night Watch', specializations: ['threat-hunting'] }, 'wallet-abc123');
    vi.setSystemTime(created + 10 * DAY);

    render(<MemoryRouter><TeamWorkspaceApplication initialTab="overview" /></MemoryRouter>);

    expect(await screen.findByText('Joined 4 Sep 2026 19:33Z')).toBeInTheDocument();
  });

  it('says when a member was last active in UTC, with the year and the local time on hover', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(created);
    await realTimeTeamService.createTeam({ name: 'Day Watch', specializations: ['osint'] }, 'wallet-def456');

    render(<MemoryRouter><TeamWorkspaceApplication /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /^operatives$/i }));

    const [shown] = await screen.findAllByText('4 Sep 2026 19:33Z');
    expect(shown).toHaveAttribute('title', localTimeTitle(created));
  });
});

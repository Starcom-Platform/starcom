/**
 * One community menu (plan item 4.5, decision D5): Discord, the Telegram group
 * and the source code behind one button. Discord's online count is fetched when
 * the menu opens. It was fetched on every page load and every two minutes after,
 * by the header and again by the closed Discord widget, for a number nobody had
 * asked to see.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const doubles = vi.hoisted(() => ({ getServerStats: vi.fn() }));
vi.mock('../../../services/DiscordService', () => ({ DiscordService: { getServerStats: doubles.getServerStats } }));
vi.mock('../../../utils/discordNotifications', () => ({ DiscordNotifications: { showHighActivity: vi.fn(), showMemberJoined: vi.fn() } }));
vi.mock('../../Discord/DiscordWidget', () => ({ default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="discord-widget" /> : null) }));
vi.mock('../../Telegram/TelegramWidget', () => ({ default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="telegram-widget" /> : null) }));
vi.mock('../../GitHub/GitHubWidget', () => ({ default: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="github-widget" /> : null) }));

import CommunityMenu from '../CommunityMenu';

describe('CommunityMenu', () => {
  beforeEach(() => { doubles.getServerStats.mockReset(); });

  it('fetches nothing until it is opened', async () => {
    render(<CommunityMenu />);
    await new Promise((r) => setTimeout(r, 50));
    expect(doubles.getServerStats).not.toHaveBeenCalled();
  });

  it('opens on Discord, the Telegram group and the source code, and counts Discord then', async () => {
    doubles.getServerStats.mockResolvedValue({ presence_count: 12, members: [] });
    render(<CommunityMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Community' }));
    expect(await screen.findByRole('menuitem', { name: 'Discord: 12 online' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Telegram group' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Source code on GitHub' })).toBeInTheDocument();
    expect(doubles.getServerStats).toHaveBeenCalledTimes(1);
  });

  it('says so when the count cannot be read, rather than showing none online', async () => {
    doubles.getServerStats.mockRejectedValue(new Error('blocked'));
    render(<CommunityMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Community' }));
    expect(await screen.findByRole('menuitem', { name: 'Discord: online count not available' })).toBeInTheDocument();
  });

  it('opens the one chosen, and closes the menu', async () => {
    doubles.getServerStats.mockResolvedValue({ presence_count: 3, members: [] });
    render(<CommunityMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Community' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Telegram group' }));
    expect(screen.getByTestId('telegram-widget')).toBeInTheDocument();
    expect(screen.queryByTestId('discord-widget')).toBeNull();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});

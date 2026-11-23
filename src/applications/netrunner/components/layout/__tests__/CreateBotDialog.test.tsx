import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BotRosterService } from '../../../services/BotRosterService';
import CreateBotDialog from '../CreateBotDialog';

function makeBotService(): BotRosterService {
  return {
    createCustomBot: vi.fn(() => 'custom-1'),
    getCapabilitiesForSpecialization: vi.fn(() => ['collection', 'analysis']),
    getAutonomyForSpecialization: vi.fn(() => 'supervised'),
    getAvatarForSpecialization: vi.fn(() => '🤖')
  } as unknown as BotRosterService;
}

describe('CreateBotDialog', () => {
  let botService: BotRosterService;
  let onBotCreated: Mock<(...args: any[]) => void>;
  let onClose: Mock<(...args: any[]) => void>;

  beforeEach(() => {
    botService = makeBotService();
    onBotCreated = vi.fn();
    onClose = vi.fn();
  });

  function renderDialog() {
    return render(
      <CreateBotDialog open={true} onClose={onClose} botService={botService} onBotCreated={onBotCreated} />
    );
  }

  it('says which tools a mission runs, from the list the executor selects by, and promises nothing autonomous', () => {
    renderDialog();

    // The default specialization is identity, which the executor runs as theHarvester and Intel Analyzer.
    expect(screen.getByText(/Runs theHarvester, Intel Analyzer against the target/)).toBeTruthy();
    expect(screen.getByText(/nothing runs on its own yet/)).toBeTruthy();
    expect(screen.queryByText(/Real OSINT tool execution|Phase 1|autonomous (mission|intelligence)|Fully independent operation/i)).toBeNull();
  });

  it('DEPLOY BOT is disabled for a whitespace-only name — was previously only checked for truthiness', async () => {
    renderDialog();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/bot name/i), '   ');

    expect(screen.getByRole('button', { name: /deploy bot/i })).toBeDisabled();
  });

  it('DEPLOY BOT is enabled once a real (non-whitespace) name and specialization are set', async () => {
    renderDialog();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/bot name/i), 'Real Bot');

    expect(screen.getByRole('button', { name: /deploy bot/i })).toBeEnabled();
  });

  it('trims the name before creating the bot, so whitespace never lands in a persisted name', async () => {
    renderDialog();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/bot name/i), '  Real Bot  ');
    await user.click(screen.getByRole('button', { name: /deploy bot/i }));

    expect(botService.createCustomBot).toHaveBeenCalledWith(
      'Real Bot', 'identity', expect.any(String), expect.any(String)
    );
  });

  it('caps the bot name at 60 characters — a longer name used to blow out the roster card layout', async () => {
    renderDialog();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/bot name/i), 'X'.repeat(80));

    expect((screen.getByLabelText(/bot name/i) as HTMLInputElement).value).toHaveLength(60);
  });
});

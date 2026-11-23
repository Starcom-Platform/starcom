import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BotInstance } from '../../../services/BotRosterService';
import type { WorkflowEngine } from '../../../integration/WorkflowEngine';
import CreateWorkflowDialog from '../CreateWorkflowDialog';

function makeBots(): BotInstance[] {
  return [
    { id: 'bot-1', name: 'WebSpider Alpha', type: 'default', category: 'crawler', status: 'idle', icon: () => null, description: '', tasksCompleted: 0, autonomyLevel: 50, aiControlled: false, capabilities: [] },
    { id: 'bot-2', name: 'ReconBot Beta', type: 'default', category: 'recon', status: 'idle', icon: () => null, description: '', tasksCompleted: 0, autonomyLevel: 50, aiControlled: false, capabilities: [] }
  ];
}

function makeWorkflowEngine(): WorkflowEngine {
  return { createWorkflow: vi.fn(() => ({ id: 'workflow-1' })) } as unknown as WorkflowEngine;
}

async function fillStep(user: ReturnType<typeof userEvent.setup>, stepBox: HTMLElement, botName: string, target: string) {
  // The Bot/Mission Type <Select>s here have no explicit labelId/id pairing,
  // so getByLabelText can't associate them — query by role instead. Bot is
  // always the first combobox in a step box, Mission Type the second.
  const [botSelect] = within(stepBox).getAllByRole('combobox');
  await user.click(botSelect);
  await user.click(await screen.findByRole('option', { name: botName }));
  await user.type(within(stepBox).getByLabelText(/target/i), target);
}

describe('CreateWorkflowDialog', () => {
  let workflowEngine: WorkflowEngine;
  let onWorkflowCreated: Mock<(...args: any[]) => void>;
  let onClose: Mock<(...args: any[]) => void>;

  beforeEach(() => {
    workflowEngine = makeWorkflowEngine();
    onWorkflowCreated = vi.fn();
    onClose = vi.fn();
  });

  function renderDialog() {
    return render(
      <CreateWorkflowDialog
        open={true}
        onClose={onClose}
        bots={makeBots()}
        workflowEngine={workflowEngine}
        onWorkflowCreated={onWorkflowCreated}
      />
    );
  }

  it('Create Workflow is disabled until a name is entered', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: /create workflow/i })).toBeDisabled();
  });

  it('Create Workflow stays disabled for a whitespace-only name', async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/workflow name/i), '   ');
    expect(screen.getByRole('button', { name: /create workflow/i })).toBeDisabled();
  });

  it('Create Workflow stays disabled while any step is missing a bot or target', async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/workflow name/i), 'My Chain');
    expect(screen.getByRole('button', { name: /create workflow/i })).toBeDisabled();
  });

  it('Create Workflow is enabled once the name and both default steps are filled in', async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/workflow name/i), 'My Chain');

    const stepBoxes = screen.getAllByText(/^Step \d$/).map(el => el.closest('div')!.parentElement as HTMLElement);
    await fillStep(user, stepBoxes[0], 'WebSpider Alpha', 'acme.com');
    await fillStep(user, stepBoxes[1], 'ReconBot Beta', 'beta.com');

    expect(screen.getByRole('button', { name: /create workflow/i })).toBeEnabled();
  });

  it('creates a sequential workflow with each step depending on the previous one', async () => {
    renderDialog();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/workflow name/i), 'My Chain');

    const stepBoxes = screen.getAllByText(/^Step \d$/).map(el => el.closest('div')!.parentElement as HTMLElement);
    await fillStep(user, stepBoxes[0], 'WebSpider Alpha', 'acme.com');
    await fillStep(user, stepBoxes[1], 'ReconBot Beta', 'beta.com');

    await user.click(screen.getByRole('button', { name: /create workflow/i }));

    expect(workflowEngine.createWorkflow).toHaveBeenCalledTimes(1);
    const [workflowData] = (workflowEngine.createWorkflow as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(workflowData.name).toBe('My Chain');
    expect(workflowData.steps).toHaveLength(2);
    expect(workflowData.steps[0].botId).toBe('bot-1');
    expect(workflowData.steps[0].parameters.target).toBe('acme.com');
    expect(workflowData.steps[0].dependsOn).toEqual([]);
    expect(workflowData.steps[1].botId).toBe('bot-2');
    expect(workflowData.steps[1].dependsOn).toEqual([workflowData.steps[0].id]);
    expect(onWorkflowCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('Add Step appends a third step, capped at 5', async () => {
    renderDialog();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /add step/i }));
    expect(screen.getAllByText(/^Step \d$/)).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: /add step/i }));
    await user.click(screen.getByRole('button', { name: /add step/i }));
    expect(screen.getAllByText(/^Step \d$/)).toHaveLength(5);
    expect(screen.getByRole('button', { name: /add step/i })).toBeDisabled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Workflow, WorkflowExecutionState } from '../../../integration/WorkflowEngine';
import type { EnhancedMissionResult } from '../../../execution/BotMissionExecutor';

const ensureInitialized = vi.fn();
const getBots = vi.fn();
vi.mock('../../../services/BotRosterService', () => ({
  BotRosterService: vi.fn()
}));

const getWorkflows = vi.fn();
const hydrateWorkflows = vi.fn();
const executeWorkflow = vi.fn();
const deleteWorkflow = vi.fn();
vi.mock('../../../integration/WorkflowEngine', () => ({
  WorkflowEngine: vi.fn()
}));

const loadWorkflowDefinitions = vi.fn();
const loadWorkflowExecutions = vi.fn();
vi.mock('../../../services/persistence/NetRunnerPersistence', () => ({
  loadWorkflowDefinitions: (...args: unknown[]) => loadWorkflowDefinitions(...args),
  loadWorkflowExecutions: (...args: unknown[]) => loadWorkflowExecutions(...args)
}));

vi.mock('../CreateWorkflowDialog', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="create-dialog" /> : null)
}));

import WorkflowPanel from '../WorkflowPanel';
import { BotRosterService } from '../../../services/BotRosterService';
import { WorkflowEngine } from '../../../integration/WorkflowEngine';
import { localTimeTitle } from '../../../../../utils/utcTime';

function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: 'workflow-1', name: 'Domain Recon Chain', description: '',
    steps: [
      { id: 'step-1', name: 'Step 1', description: '', botId: 'bot-1', parameters: { target: 'acme.com' }, requiredCapabilities: [], dependsOn: [], timeout: 300, retryCount: 0, retryDelay: 0 }
    ],
    parallelExecution: false, triggers: [], botIds: ['bot-1'],
    created: '2026-01-01T00:00:00.000Z', updated: '2026-01-01T00:00:00.000Z',
    status: 'inactive', tags: [], owner: 'system', executionCount: 0, averageDuration: 0,
    configuration: { timeout: 3600, maxConcurrentSteps: 1, errorHandling: 'continue', notifyOnCompletion: true, notifyOnError: true, saveResultsAutomatically: true, priority: 'medium', customParameters: {} },
    dataFlow: { mergeResults: true, transformations: [], outputFormat: 'intel_report', outputDestination: 'intel_library', shareWorkflowMetadata: false },
    ...overrides
  };
}

function makeMissionResult(overrides: Partial<EnhancedMissionResult> = {}): EnhancedMissionResult {
  return {
    missionId: 'm1', botId: 'bot-1', target: 'acme.com', status: 'success',
    intelCollected: 3, operationsPerformed: [], duration: 500, completedAt: Date.now(),
    errors: [], usedMockData: false, qualityScore: 80, confidenceLevel: 0.8, specializedFindings: {},
    toolsUsed: [], processingStages: [], rawDataGenerated: 0, observationsCreated: 0,
    correlationOpportunities: [], suggestedNextActions: [],
    ...overrides
  };
}

function makeExecution(overrides: Partial<WorkflowExecutionState> = {}): WorkflowExecutionState {
  return {
    workflowId: 'workflow-1', executionId: 'exec-1', startTime: '2026-01-02T00:00:00.000Z',
    endTime: '2026-01-02T00:05:00.000Z', status: 'completed', progress: 100,
    completedSteps: ['step-1'], failedSteps: [], results: { 'step-1': makeMissionResult() },
    errors: [], logs: [], botAssignments: { 'step-1': 'bot-1' },
    ...overrides
  };
}

describe('WorkflowPanel', () => {
  beforeEach(() => {
    ensureInitialized.mockReset().mockResolvedValue(undefined);
    getBots.mockReset().mockReturnValue([{ id: 'bot-1', name: 'WebSpider Alpha' }]);
    getWorkflows.mockReset().mockReturnValue([]);
    hydrateWorkflows.mockReset();
    executeWorkflow.mockReset();
    deleteWorkflow.mockReset().mockReturnValue(true);
    loadWorkflowDefinitions.mockReset().mockResolvedValue([]);
    loadWorkflowExecutions.mockReset().mockResolvedValue([]);

    // The global afterEach hook calls vi.restoreAllMocks(), which wipes any
    // mockImplementation() set outside a beforeEach — so these constructor
    // mocks are re-applied fresh every test rather than once at module load.
    (BotRosterService as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () { return ({ ensureInitialized, getBots }); });
    (WorkflowEngine as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () { return ({
      getWorkflows, hydrateWorkflows, executeWorkflow, deleteWorkflow
    }); });
  });

  it('hydrates persisted workflows on mount and lists them', async () => {
    const workflow = makeWorkflow();
    loadWorkflowDefinitions.mockResolvedValue([workflow]);
    getWorkflows.mockReturnValue([workflow]);

    render(<WorkflowPanel />);

    await waitFor(() => expect(hydrateWorkflows).toHaveBeenCalledWith([workflow]));
    expect(await screen.findByText('Domain Recon Chain')).toBeInTheDocument();
  });

  it('shows the Create Workflow prompt and opens the dialog on click', async () => {
    render(<WorkflowPanel />);
    const user = userEvent.setup();

    expect(screen.queryByTestId('create-dialog')).not.toBeInTheDocument();
    await user.click(screen.getByText(/create workflow/i));
    expect(screen.getByTestId('create-dialog')).toBeInTheDocument();
  });

  it('selecting a workflow shows its steps, and Run executes it and displays a successful result', async () => {
    const workflow = makeWorkflow();
    getWorkflows.mockReturnValue([workflow]);
    executeWorkflow.mockResolvedValue(makeExecution());

    render(<WorkflowPanel />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Domain Recon Chain'));
    expect(screen.getByText(/WebSpider Alpha.*acme\.com/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /run workflow/i }));
    await waitFor(() => expect(executeWorkflow).toHaveBeenCalledWith('workflow-1'));
  });

  it('says when a workflow last ran in UTC, with the year and the local time on hover', async () => {
    // It printed the browser's local time with no zone (decision D-E, step 9).
    const lastRun = Date.UTC(2026, 8, 14, 19, 33);
    getWorkflows.mockReturnValue([makeWorkflow({ lastRun: new Date(lastRun).toISOString() } as Partial<Workflow>)]);
    render(<WorkflowPanel />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Domain Recon Chain'));
    expect(screen.getByText('14 Sep 2026 19:33Z')).toHaveAttribute('title', localTimeTitle(lastRun));
  });

  it('a failed step shows the real error, not a swallowed failure', async () => {
    const workflow = makeWorkflow();
    getWorkflows.mockReturnValue([workflow]);
    executeWorkflow.mockResolvedValue(makeExecution({
      failedSteps: ['step-1'],
      results: { 'step-1': makeMissionResult({ status: 'failed', errors: ['Tool execution timed out after 10000ms'] }) }
    }));

    render(<WorkflowPanel />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Domain Recon Chain'));
    await user.click(screen.getByRole('button', { name: /run workflow/i }));

    expect(await screen.findByText('Tool execution timed out after 10000ms')).toBeInTheDocument();
  });

  it('marks a step result that used mock data', async () => {
    const workflow = makeWorkflow();
    getWorkflows.mockReturnValue([workflow]);
    executeWorkflow.mockResolvedValue(makeExecution({
      results: { 'step-1': makeMissionResult({ usedMockData: true }) }
    }));

    render(<WorkflowPanel />);
    const user = userEvent.setup();

    await user.click(await screen.findByText('Domain Recon Chain'));
    await user.click(screen.getByRole('button', { name: /run workflow/i }));

    expect(await screen.findByText('mock')).toBeInTheDocument();
  });

  it('deletes a workflow and removes it from the list', async () => {
    // getWorkflows is called more than once as the panel's internal engine
    // gets rebuilt once real bots finish loading — model it as real state
    // (mutated by deleteWorkflow) rather than a canned return-value sequence,
    // so the test isn't coupled to exactly how many times it's called.
    let currentWorkflows = [makeWorkflow()];
    getWorkflows.mockImplementation(() => currentWorkflows);
    deleteWorkflow.mockImplementation((id: string) => {
      currentWorkflows = currentWorkflows.filter(w => w.id !== id);
      return true;
    });

    render(<WorkflowPanel />);
    const user = userEvent.setup();

    await screen.findByText('Domain Recon Chain');
    await user.click(screen.getByRole('button', { name: /delete workflow domain recon chain/i }));

    expect(deleteWorkflow).toHaveBeenCalledWith('workflow-1');
    await waitFor(() => expect(screen.queryByText('Domain Recon Chain')).not.toBeInTheDocument());
  });
});

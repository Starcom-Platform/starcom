import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OsintBot } from '../BotRosterIntegration';
import type { EnhancedMissionResult } from '../../execution/BotMissionExecutor';
import type { WorkflowStep } from '../WorkflowEngine';

const executeEnhancedMission = vi.fn();
vi.mock('../../execution/BotMissionExecutor', () => ({
  botMissionExecutor: {
    executeEnhancedMission: (...args: unknown[]) => executeEnhancedMission(...args)
  }
}));

const saveWorkflowDefinition = vi.fn();
const deleteWorkflowDefinition = vi.fn();
const saveWorkflowExecution = vi.fn();
vi.mock('../../services/persistence/NetRunnerPersistence', () => ({
  saveWorkflowDefinition: (...args: unknown[]) => saveWorkflowDefinition(...args),
  deleteWorkflowDefinition: (...args: unknown[]) => deleteWorkflowDefinition(...args),
  saveWorkflowExecution: (...args: unknown[]) => saveWorkflowExecution(...args)
}));

import { WorkflowEngine } from '../WorkflowEngine';

function makeBot(overrides: Partial<OsintBot> = {}): OsintBot {
  return {
    id: 'bot-1', name: 'Test Bot', description: 'desc', avatar: '🤖',
    capabilities: ['collection'], compatibleTools: [], specializations: ['identity'],
    autonomyLevel: 'supervised', scope: 'general', author: 'User', version: '1.0.0',
    created: '2026-01-01T00:00:00.000Z', updated: '2026-01-01T00:00:00.000Z',
    performance: { accuracy: 0, speed: 0, successRate: 0, intelQualityScore: 0, totalOperations: 0, totalIntelGenerated: 0, lastEvaluation: '2026-01-01T00:00:00.000Z' },
    status: 'active',
    configuration: { maxConcurrentOperations: 1, maxDailyOperations: 100, rateLimiting: true, proxyRotation: false, obfuscation: false, loggingLevel: 'standard', notifyOnCompletion: true, saveResultsAutomatically: true, customParameters: {} },
    ...overrides
  };
}

function makeStep(overrides: Partial<WorkflowStep> = {}): WorkflowStep {
  return {
    id: 'step-1', name: 'Step 1', description: '', botId: 'bot-1',
    parameters: { target: 'example.com' }, requiredCapabilities: [],
    dependsOn: [], timeout: 300, retryCount: 0, retryDelay: 0,
    ...overrides
  };
}

function makeResult(overrides: Partial<EnhancedMissionResult> = {}): EnhancedMissionResult {
  return {
    missionId: 'm1', botId: 'bot-1', target: 'example.com', status: 'success',
    intelCollected: 3, operationsPerformed: [], duration: 500, completedAt: Date.now(),
    errors: [], usedMockData: false, qualityScore: 80, confidenceLevel: 0.8, specializedFindings: {},
    toolsUsed: [], processingStages: [], rawDataGenerated: 0, observationsCreated: 0,
    correlationOpportunities: [], suggestedNextActions: [],
    ...overrides
  };
}

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    executeEnhancedMission.mockReset().mockResolvedValue(makeResult());
    saveWorkflowDefinition.mockReset().mockResolvedValue(undefined);
    deleteWorkflowDefinition.mockReset().mockResolvedValue(undefined);
    saveWorkflowExecution.mockReset().mockResolvedValue(undefined);
    engine = new WorkflowEngine([makeBot()], []);
  });

  describe('CRUD', () => {
    it('createWorkflow assigns an id and defaults, and persists the definition', () => {
      const workflow = engine.createWorkflow({ name: 'My Workflow', botIds: ['bot-1'] });

      expect(workflow.id).toBeTruthy();
      expect(workflow.name).toBe('My Workflow');
      expect(workflow.status).toBe('inactive');
      expect(engine.getWorkflow(workflow.id)).toEqual(workflow);
      expect(saveWorkflowDefinition).toHaveBeenCalledWith(workflow);
    });

    it('updateWorkflow merges updates and re-persists', () => {
      const workflow = engine.createWorkflow({ name: 'Original' });
      const updated = engine.updateWorkflow(workflow.id, { name: 'Renamed' });

      expect(updated?.name).toBe('Renamed');
      expect(engine.getWorkflow(workflow.id)?.name).toBe('Renamed');
      expect(saveWorkflowDefinition).toHaveBeenLastCalledWith(updated);
    });

    it('updateWorkflow on an unknown id returns null and does not persist', () => {
      saveWorkflowDefinition.mockClear();
      expect(engine.updateWorkflow('nope', { name: 'X' })).toBeNull();
      expect(saveWorkflowDefinition).not.toHaveBeenCalled();
    });

    it('deleteWorkflow removes the workflow and deletes the persisted copy, only if it existed', () => {
      const workflow = engine.createWorkflow({ name: 'To Delete' });

      expect(engine.deleteWorkflow(workflow.id)).toBe(true);
      expect(engine.getWorkflow(workflow.id)).toBeUndefined();
      expect(deleteWorkflowDefinition).toHaveBeenCalledWith(workflow.id);

      deleteWorkflowDefinition.mockClear();
      expect(engine.deleteWorkflow('never-existed')).toBe(false);
      expect(deleteWorkflowDefinition).not.toHaveBeenCalled();
    });
  });

  describe('hydrateWorkflows', () => {
    it('loads persisted workflows into the in-memory list', () => {
      const persisted = engine.createWorkflow({ name: 'Persisted' });
      const fresh = new WorkflowEngine([makeBot()], []);

      fresh.hydrateWorkflows([persisted]);

      expect(fresh.getWorkflow(persisted.id)).toEqual(persisted);
    });

    it('is idempotent — skips workflows whose id is already present', () => {
      const workflow = engine.createWorkflow({ name: 'Original' });
      engine.hydrateWorkflows([{ ...workflow, name: 'Should not overwrite' }]);

      expect(engine.getWorkflow(workflow.id)?.name).toBe('Original');
      expect(engine.getWorkflows().length).toBe(1);
    });
  });

  describe('executeWorkflow — step execution via botMissionExecutor', () => {
    it('calls executeEnhancedMission with the assigned bot, target, and mission type', async () => {
      const workflow = engine.createWorkflow({
        name: 'Recon', botIds: ['bot-1'],
        steps: [makeStep({ parameters: { target: 'acme.com', missionType: 'assessment' } })]
      });

      await engine.executeWorkflow(workflow.id);

      expect(executeEnhancedMission).toHaveBeenCalledTimes(1);
      const [bot, target, missionType] = executeEnhancedMission.mock.calls[0];
      expect(bot.id).toBe('bot-1');
      expect(target).toBe('acme.com');
      expect(missionType).toBe('assessment');
    });

    it('defaults mission type to reconnaissance when not specified', async () => {
      const workflow = engine.createWorkflow({
        name: 'Recon', botIds: ['bot-1'],
        steps: [makeStep({ parameters: { target: 'acme.com' } })]
      });

      await engine.executeWorkflow(workflow.id);

      expect(executeEnhancedMission.mock.calls[0][2]).toBe('reconnaissance');
    });

    it('persists the execution state after a run', async () => {
      const workflow = engine.createWorkflow({ name: 'Recon', botIds: ['bot-1'], steps: [makeStep()] });

      const execution = await engine.executeWorkflow(workflow.id);

      expect(saveWorkflowExecution).toHaveBeenCalledWith(execution);
    });

    it('records a failed step honestly — not dropped from results/failedSteps', async () => {
      executeEnhancedMission.mockResolvedValue(makeResult({ status: 'failed', errors: ['timed out'] }));
      const workflow = engine.createWorkflow({
        name: 'Recon', botIds: ['bot-1'], steps: [makeStep()],
        configuration: {
          timeout: 3600, maxConcurrentSteps: 1, errorHandling: 'continue',
          notifyOnCompletion: true, notifyOnError: true, saveResultsAutomatically: true,
          priority: 'medium', customParameters: {}
        }
      });

      const execution = await engine.executeWorkflow(workflow.id);

      expect(execution.failedSteps).toContain('step-1');
      expect(execution.results['step-1'].status).toBe('failed');
      expect(execution.results['step-1'].errors).toEqual(['timed out']);
    });

    it('a "partial" result counts as completed, not failed', async () => {
      executeEnhancedMission.mockResolvedValue(makeResult({ status: 'partial' }));
      const workflow = engine.createWorkflow({ name: 'Recon', botIds: ['bot-1'], steps: [makeStep()] });

      const execution = await engine.executeWorkflow(workflow.id);

      expect(execution.completedSteps).toContain('step-1');
      expect(execution.failedSteps).not.toContain('step-1');
    });

    it('errorHandling "stop" halts later steps after a failure', async () => {
      executeEnhancedMission.mockResolvedValue(makeResult({ status: 'failed', errors: ['boom'] }));
      const workflow = engine.createWorkflow({
        name: 'Recon', botIds: ['bot-1'],
        steps: [
          makeStep({ id: 'step-1', parameters: { target: 'a.com' } }),
          makeStep({ id: 'step-2', parameters: { target: 'b.com' }, dependsOn: [] })
        ],
        configuration: {
          timeout: 3600, maxConcurrentSteps: 1, errorHandling: 'stop',
          notifyOnCompletion: true, notifyOnError: true, saveResultsAutomatically: true,
          priority: 'medium', customParameters: {}
        }
      });

      await engine.executeWorkflow(workflow.id);

      expect(executeEnhancedMission).toHaveBeenCalledTimes(1);
    });

    it('errorHandling "continue" runs later steps after a failure', async () => {
      executeEnhancedMission.mockResolvedValue(makeResult({ status: 'failed', errors: ['boom'] }));
      const workflow = engine.createWorkflow({
        name: 'Recon', botIds: ['bot-1'],
        steps: [
          makeStep({ id: 'step-1', parameters: { target: 'a.com' } }),
          makeStep({ id: 'step-2', parameters: { target: 'b.com' }, dependsOn: [] })
        ],
        configuration: {
          timeout: 3600, maxConcurrentSteps: 1, errorHandling: 'continue',
          notifyOnCompletion: true, notifyOnError: true, saveResultsAutomatically: true,
          priority: 'medium', customParameters: {}
        }
      });

      await engine.executeWorkflow(workflow.id);

      expect(executeEnhancedMission).toHaveBeenCalledTimes(2);
    });

    it('retries a failed step up to retryCount, returning the final result', async () => {
      executeEnhancedMission
        .mockResolvedValueOnce(makeResult({ status: 'failed', errors: ['first attempt failed'] }))
        .mockResolvedValueOnce(makeResult({ status: 'success' }));

      const workflow = engine.createWorkflow({
        name: 'Recon', botIds: ['bot-1'],
        steps: [makeStep({ retryCount: 1, retryDelay: 0 })]
      });

      const execution = await engine.executeWorkflow(workflow.id);

      expect(executeEnhancedMission).toHaveBeenCalledTimes(2);
      expect(execution.results['step-1'].status).toBe('success');
      expect(execution.completedSteps).toContain('step-1');
    });

    it('no bot assigned for a step is recorded as a real failure, not silently skipped', async () => {
      const workflow = engine.createWorkflow({
        name: 'Recon', botIds: [],
        steps: [makeStep({ botId: undefined })]
      });

      const execution = await engine.executeWorkflow(workflow.id);

      expect(execution.failedSteps).toContain('step-1');
      expect(executeEnhancedMission).not.toHaveBeenCalled();
      expect(execution.errors.some(e => e.stepId === 'step-1')).toBe(true);
    });

    it('skips a step whose dependencies were never completed', async () => {
      executeEnhancedMission.mockResolvedValue(makeResult({ status: 'failed', errors: ['dep failed'] }));
      const workflow = engine.createWorkflow({
        name: 'Recon', botIds: ['bot-1'],
        steps: [
          makeStep({ id: 'step-1' }),
          makeStep({ id: 'step-2', dependsOn: ['step-1'] })
        ],
        configuration: {
          timeout: 3600, maxConcurrentSteps: 1, errorHandling: 'continue',
          notifyOnCompletion: true, notifyOnError: true, saveResultsAutomatically: true,
          priority: 'medium', customParameters: {}
        }
      });

      await engine.executeWorkflow(workflow.id);

      // step-1 failed, so step-2's dependency was never satisfied and it must
      // never reach botMissionExecutor.
      expect(executeEnhancedMission).toHaveBeenCalledTimes(1);
      expect(executeEnhancedMission).toHaveBeenCalledWith(expect.anything(), 'example.com', 'reconnaissance');
    });

    it('a step condition the evaluator does not understand fails closed — the step is skipped, not silently run', async () => {
      const workflow = engine.createWorkflow({
        name: 'Conditional', botIds: ['bot-1'],
        steps: [makeStep({ condition: { type: 'expression', value: 'some.custom.expression' } })]
      });

      await engine.executeWorkflow(workflow.id);

      expect(executeEnhancedMission).not.toHaveBeenCalled();
    });

    it('a step condition of exactly "true" runs the step', async () => {
      const workflow = engine.createWorkflow({
        name: 'Conditional', botIds: ['bot-1'],
        steps: [makeStep({ condition: { type: 'expression', value: 'true' } })]
      });

      await engine.executeWorkflow(workflow.id);

      expect(executeEnhancedMission).toHaveBeenCalledTimes(1);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OsintBot } from '../../../integration/BotRosterIntegration';
import type { EnhancedMissionResult } from '../../../execution/BotMissionExecutor';
import type { Workflow, WorkflowExecutionState } from '../../../integration/WorkflowEngine';

const storeEntity = vi.fn();
const deleteEntity = vi.fn();
const queryEntities = vi.fn();

vi.mock('../../../../../core/intel/storage/storageOrchestrator', () => ({
  storageOrchestrator: {
    storeEntity: (...args: unknown[]) => storeEntity(...args),
    deleteEntity: (...args: unknown[]) => deleteEntity(...args),
    queryEntities: (...args: unknown[]) => queryEntities(...args)
  }
}));

import {
  saveBotDefinition,
  deleteBotDefinition,
  loadBotDefinitions,
  saveMissionResult,
  loadMissionHistory,
  saveWorkflowDefinition,
  deleteWorkflowDefinition,
  loadWorkflowDefinitions,
  saveWorkflowExecution,
  loadWorkflowExecutions
} from '../NetRunnerPersistence';

function makeBot(overrides: Partial<OsintBot> = {}): OsintBot {
  return {
    id: 'custom-1', name: 'Test Bot', description: 'desc', avatar: '🤖',
    capabilities: ['collection'], compatibleTools: [], specializations: ['identity'],
    autonomyLevel: 'supervised', scope: 'general', author: 'User', version: '1.0.0',
    created: '2026-01-01T00:00:00.000Z', updated: '2026-01-02T00:00:00.000Z',
    performance: { accuracy: 0, speed: 0, successRate: 0, intelQualityScore: 0, totalOperations: 0, totalIntelGenerated: 0, lastEvaluation: '2026-01-01T00:00:00.000Z' },
    status: 'active',
    configuration: { maxConcurrentOperations: 1, maxDailyOperations: 100, rateLimiting: true, proxyRotation: false, obfuscation: false, loggingLevel: 'standard', notifyOnCompletion: true, saveResultsAutomatically: true, customParameters: {} },
    ...overrides
  };
}

function makeResult(overrides: Partial<EnhancedMissionResult> = {}): EnhancedMissionResult {
  return {
    missionId: 'mission-1', botId: 'bot-1', target: 'example.com', status: 'success',
    intelCollected: 3, operationsPerformed: [], duration: 500, completedAt: 1_700_000_000_000,
    errors: [], usedMockData: false, qualityScore: 80, confidenceLevel: 0.8, specializedFindings: {},
    toolsUsed: [], processingStages: [], rawDataGenerated: 0, observationsCreated: 0,
    correlationOpportunities: [], suggestedNextActions: [],
    ...overrides
  };
}

function makeWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    id: 'workflow-1', name: 'Test Workflow', description: '', steps: [],
    parallelExecution: false, triggers: [], botIds: ['bot-1'],
    created: '2026-01-01T00:00:00.000Z', updated: '2026-01-02T00:00:00.000Z',
    status: 'inactive', tags: ['recon'], owner: 'system',
    executionCount: 0, averageDuration: 0,
    configuration: {
      timeout: 3600, maxConcurrentSteps: 1, errorHandling: 'continue',
      notifyOnCompletion: true, notifyOnError: true, saveResultsAutomatically: true,
      priority: 'medium', customParameters: {}
    },
    dataFlow: {
      mergeResults: true, transformations: [], outputFormat: 'intel_report',
      outputDestination: 'intel_library', shareWorkflowMetadata: false
    },
    ...overrides
  };
}

function makeExecutionState(overrides: Partial<WorkflowExecutionState> = {}): WorkflowExecutionState {
  return {
    workflowId: 'workflow-1', executionId: 'exec-1',
    startTime: '2026-01-03T00:00:00.000Z', endTime: '2026-01-03T00:05:00.000Z',
    status: 'completed', progress: 100, completedSteps: [], failedSteps: [],
    results: {}, errors: [], logs: [], botAssignments: {},
    ...overrides
  };
}

describe('NetRunnerPersistence', () => {
  beforeEach(() => {
    storeEntity.mockReset().mockResolvedValue({ success: true });
    deleteEntity.mockReset().mockResolvedValue({ success: true });
    queryEntities.mockReset().mockResolvedValue({ success: true, data: [] });
  });

  describe('bot definitions', () => {
    it('saveBotDefinition wraps the bot as a netrunner_bot entity, reusing the bot id', async () => {
      const bot = makeBot();
      await saveBotDefinition(bot);

      expect(storeEntity).toHaveBeenCalledTimes(1);
      const [entity] = storeEntity.mock.calls[0];
      expect(entity).toMatchObject({
        id: 'custom-1',
        type: 'netrunner_bot',
        createdAt: bot.created,
        updatedAt: bot.updated,
        createdBy: bot.author,
        bot
      });
    });

    it('a failed store is logged, not thrown', async () => {
      storeEntity.mockResolvedValue({ success: false, error: 'disk full' });
      await expect(saveBotDefinition(makeBot())).resolves.toBeUndefined();
    });

    it('deleteBotDefinition deletes by bot id', async () => {
      await deleteBotDefinition('custom-1');
      expect(deleteEntity).toHaveBeenCalledWith('custom-1');
    });

    it('deleteBotDefinition on a never-persisted (default) bot does not throw', async () => {
      deleteEntity.mockResolvedValue({ success: false, error: 'Entity with ID spider-01 not found' });
      await expect(deleteBotDefinition('spider-01')).resolves.toBeUndefined();
    });

    it('loadBotDefinitions unwraps the bot payload from each stored entity, querying by type', async () => {
      const bot = makeBot();
      queryEntities.mockResolvedValue({ success: true, data: [{ id: bot.id, type: 'netrunner_bot', bot }] });

      const bots = await loadBotDefinitions();

      // forceRefresh: true matters specifically because storageOrchestrator's
      // queryEntities() returns straight from its shared in-memory cache
      // without ever checking IndexedDB if that cache is already non-empty
      // for this entity type — without it, a bot persisted in a prior
      // session could be silently dropped the moment anything else writes a
      // netrunner_bot entity into that cache first.
      expect(queryEntities).toHaveBeenCalledWith({ types: ['netrunner_bot'], forceRefresh: true });
      expect(bots).toEqual([bot]);
    });

    it('loadBotDefinitions returns an empty list (not an error) when storage is unavailable', async () => {
      queryEntities.mockResolvedValue({ success: false, error: 'indexedDB is not defined' });
      expect(await loadBotDefinitions()).toEqual([]);
    });
  });

  describe('mission history', () => {
    it('saveMissionResult tags the entity with the mission botId for later per-bot queries', async () => {
      const result = makeResult({ botId: 'bot-42' });
      await saveMissionResult(result);

      const [entity] = storeEntity.mock.calls[0];
      expect(entity).toMatchObject({
        id: 'mission-1',
        type: 'netrunner_mission',
        tags: ['bot-42'],
        result
      });
    });

    it('loadMissionHistory(botId) queries scoped to that bot via the tag filter, forcing a real storage read', async () => {
      await loadMissionHistory('bot-42');
      expect(queryEntities).toHaveBeenCalledWith({ types: ['netrunner_mission'], tags: ['bot-42'], forceRefresh: true });
    });

    it('loadMissionHistory() with no botId loads across every bot, forcing a real storage read', async () => {
      await loadMissionHistory();
      expect(queryEntities).toHaveBeenCalledWith({ types: ['netrunner_mission'], tags: undefined, forceRefresh: true });
    });

    it('returns results sorted ascending by completedAt, oldest first', async () => {
      const newer = makeResult({ missionId: 'm-new', completedAt: 2000 });
      const older = makeResult({ missionId: 'm-old', completedAt: 1000 });
      queryEntities.mockResolvedValue({
        success: true,
        data: [{ id: 'e1', result: newer }, { id: 'e2', result: older }]
      });

      const history = await loadMissionHistory();
      expect(history.map(r => r.missionId)).toEqual(['m-old', 'm-new']);
    });
  });

  describe('workflow definitions', () => {
    it('saveWorkflowDefinition wraps the workflow as a netrunner_workflow entity, reusing the workflow id', async () => {
      const workflow = makeWorkflow();
      await saveWorkflowDefinition(workflow);

      expect(storeEntity).toHaveBeenCalledTimes(1);
      const [entity] = storeEntity.mock.calls[0];
      expect(entity).toMatchObject({
        id: 'workflow-1',
        type: 'netrunner_workflow',
        createdAt: workflow.created,
        updatedAt: workflow.updated,
        createdBy: workflow.owner,
        tags: workflow.tags,
        workflow
      });
    });

    it('a failed store is logged, not thrown', async () => {
      storeEntity.mockResolvedValue({ success: false, error: 'disk full' });
      await expect(saveWorkflowDefinition(makeWorkflow())).resolves.toBeUndefined();
    });

    it('deleteWorkflowDefinition deletes by workflow id', async () => {
      await deleteWorkflowDefinition('workflow-1');
      expect(deleteEntity).toHaveBeenCalledWith('workflow-1');
    });

    it('deleteWorkflowDefinition on a never-persisted workflow does not throw', async () => {
      deleteEntity.mockResolvedValue({ success: false, error: 'Entity with ID workflow-1 not found' });
      await expect(deleteWorkflowDefinition('workflow-1')).resolves.toBeUndefined();
    });

    it('loadWorkflowDefinitions unwraps the workflow payload from each stored entity, forcing a real storage read', async () => {
      const workflow = makeWorkflow();
      queryEntities.mockResolvedValue({ success: true, data: [{ id: workflow.id, type: 'netrunner_workflow', workflow }] });

      const workflows = await loadWorkflowDefinitions();

      expect(queryEntities).toHaveBeenCalledWith({ types: ['netrunner_workflow'], forceRefresh: true });
      expect(workflows).toEqual([workflow]);
    });

    it('loadWorkflowDefinitions returns an empty list (not an error) when storage is unavailable', async () => {
      queryEntities.mockResolvedValue({ success: false, error: 'indexedDB is not defined' });
      expect(await loadWorkflowDefinitions()).toEqual([]);
    });
  });

  describe('workflow executions', () => {
    it('saveWorkflowExecution tags the entity with the workflowId for later per-workflow queries', async () => {
      const execution = makeExecutionState({ workflowId: 'workflow-42' });
      await saveWorkflowExecution(execution);

      const [entity] = storeEntity.mock.calls[0];
      expect(entity).toMatchObject({
        id: 'exec-1',
        type: 'netrunner_workflow_execution',
        tags: ['workflow-42'],
        execution
      });
    });

    it('a failed store is logged, not thrown', async () => {
      storeEntity.mockResolvedValue({ success: false, error: 'disk full' });
      await expect(saveWorkflowExecution(makeExecutionState())).resolves.toBeUndefined();
    });

    it('loadWorkflowExecutions(workflowId) queries scoped to that workflow via the tag filter, forcing a real storage read', async () => {
      await loadWorkflowExecutions('workflow-42');
      expect(queryEntities).toHaveBeenCalledWith({ types: ['netrunner_workflow_execution'], tags: ['workflow-42'], forceRefresh: true });
    });

    it('loadWorkflowExecutions() with no workflowId loads across every workflow, forcing a real storage read', async () => {
      await loadWorkflowExecutions();
      expect(queryEntities).toHaveBeenCalledWith({ types: ['netrunner_workflow_execution'], tags: undefined, forceRefresh: true });
    });

    it('returns executions sorted ascending by startTime, oldest first', async () => {
      const newer = makeExecutionState({ executionId: 'e-new', startTime: '2026-01-02T00:00:00.000Z' });
      const older = makeExecutionState({ executionId: 'e-old', startTime: '2026-01-01T00:00:00.000Z' });
      queryEntities.mockResolvedValue({
        success: true,
        data: [{ id: 'x1', execution: newer }, { id: 'x2', execution: older }]
      });

      const executions = await loadWorkflowExecutions();
      expect(executions.map(e => e.executionId)).toEqual(['e-old', 'e-new']);
    });
  });
});

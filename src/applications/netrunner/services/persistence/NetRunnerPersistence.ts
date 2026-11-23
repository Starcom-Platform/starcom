/**
 * NetRunnerPersistence — durable storage for bot definitions and mission history.
 *
 * Before this, BotRosterService's custom bots and BotMissionExecutor's mission
 * history were plain in-memory Maps: a page reload silently erased both. This
 * routes them through storageOrchestrator (the same IndexedDB-backed entity
 * store already used for Intel Reports elsewhere in the app), so a shift
 * change, a crashed tab, or a closed browser no longer means starting over.
 *
 * Callers treat storage as best-effort and fire-and-forget on writes — local
 * in-memory state stays the source of truth for the current session; a failed
 * persistence write is logged, not thrown, so it never blocks a mission from
 * completing or a bot from being created.
 */

import { storageOrchestrator } from '../../../../core/intel/storage/storageOrchestrator';
import type { BaseEntity } from '../../../../core/intel/types/intelDataModels';
import type { OsintBot } from '../../integration/BotRosterIntegration';
import type { EnhancedMissionResult } from '../../execution/BotMissionExecutor';
import type { Workflow, WorkflowExecutionState } from '../../integration/WorkflowEngine';

const BOT_ENTITY_TYPE = 'netrunner_bot';
const MISSION_ENTITY_TYPE = 'netrunner_mission';
const WORKFLOW_ENTITY_TYPE = 'netrunner_workflow';
const WORKFLOW_EXECUTION_ENTITY_TYPE = 'netrunner_workflow_execution';

interface NetRunnerBotEntity extends BaseEntity {
  type: typeof BOT_ENTITY_TYPE;
  bot: OsintBot;
}

interface NetRunnerMissionEntity extends BaseEntity {
  type: typeof MISSION_ENTITY_TYPE;
  result: EnhancedMissionResult;
}

interface NetRunnerWorkflowEntity extends BaseEntity {
  type: typeof WORKFLOW_ENTITY_TYPE;
  workflow: Workflow;
}

interface NetRunnerWorkflowExecutionEntity extends BaseEntity {
  type: typeof WORKFLOW_EXECUTION_ENTITY_TYPE;
  execution: WorkflowExecutionState;
}

/** Persist (create or overwrite) a custom bot definition. */
export async function saveBotDefinition(bot: OsintBot): Promise<void> {
  const entity: Partial<NetRunnerBotEntity> = {
    id: bot.id,
    type: BOT_ENTITY_TYPE,
    createdAt: bot.created,
    updatedAt: bot.updated,
    createdBy: bot.author,
    tags: [],
    metadata: {},
    bot
  };
  const result = await storageOrchestrator.storeEntity<NetRunnerBotEntity>(entity);
  if (!result.success) {
    console.error(`[NetRunnerPersistence] Failed to persist bot definition ${bot.id}:`, result.error);
  }
}

/** Remove a persisted bot definition. A no-op (logged at debug, not error) for bots that were never persisted — the three default bots aren't. */
export async function deleteBotDefinition(botId: string): Promise<void> {
  const result = await storageOrchestrator.deleteEntity(botId);
  if (!result.success) {
    console.debug(`[NetRunnerPersistence] No persisted bot definition to delete for ${botId} (${result.error})`);
  }
}

/** Load every persisted custom bot definition. Default bots are never stored, so this never returns them. */
export async function loadBotDefinitions(): Promise<OsintBot[]> {
  const result = await storageOrchestrator.queryEntities<NetRunnerBotEntity>({
    types: [BOT_ENTITY_TYPE],
    // storageOrchestrator.queryEntities() returns straight from its in-memory
    // cache if it's non-empty for this type, never consulting IndexedDB at
    // all in that case. If anything of this type gets written into that
    // shared cache this session before this call resolves, the result here
    // would silently miss everything actually persisted from a prior
    // session. forceRefresh forces the real IndexedDB read every time.
    forceRefresh: true
  });
  if (!result.success || !result.data) return [];
  return result.data.map(entity => entity.bot);
}

/** Persist a completed mission result, tagged by botId for later per-bot queries. */
export async function saveMissionResult(result: EnhancedMissionResult): Promise<void> {
  const completedAtIso = new Date(result.completedAt).toISOString();
  const entity: Partial<NetRunnerMissionEntity> = {
    id: result.missionId,
    type: MISSION_ENTITY_TYPE,
    createdAt: completedAtIso,
    updatedAt: completedAtIso,
    createdBy: `netrunner-bot-${result.botId}`,
    tags: [result.botId],
    metadata: {},
    result
  };
  const stored = await storageOrchestrator.storeEntity<NetRunnerMissionEntity>(entity);
  if (!stored.success) {
    console.error(`[NetRunnerPersistence] Failed to persist mission result ${result.missionId}:`, stored.error);
  }
}

/**
 * Load persisted mission history, optionally scoped to one bot.
 * Unlike the in-memory `missionHistory` Map (capped at 10 per bot for
 * runtime efficiency), this returns the full persisted set — e.g. for a
 * long-horizon case file spanning months of missions.
 */
export async function loadMissionHistory(botId?: string): Promise<EnhancedMissionResult[]> {
  const result = await storageOrchestrator.queryEntities<NetRunnerMissionEntity>({
    types: [MISSION_ENTITY_TYPE],
    tags: botId ? [botId] : undefined,
    // See loadBotDefinitions() — without this, a mission saved into the
    // shared in-memory cache earlier this session (e.g. one that completes
    // before this very call resolves) makes the cache non-empty and skips
    // IndexedDB entirely, silently dropping every mission from prior sessions.
    forceRefresh: true
  });
  if (!result.success || !result.data) return [];
  return result.data
    .map(entity => entity.result)
    .sort((a, b) => a.completedAt - b.completedAt);
}

/** Persist (create or overwrite) a workflow definition. */
export async function saveWorkflowDefinition(workflow: Workflow): Promise<void> {
  const entity: Partial<NetRunnerWorkflowEntity> = {
    id: workflow.id,
    type: WORKFLOW_ENTITY_TYPE,
    createdAt: workflow.created,
    updatedAt: workflow.updated,
    createdBy: workflow.owner,
    tags: workflow.tags,
    metadata: {},
    workflow
  };
  const result = await storageOrchestrator.storeEntity<NetRunnerWorkflowEntity>(entity);
  if (!result.success) {
    console.error(`[NetRunnerPersistence] Failed to persist workflow definition ${workflow.id}:`, result.error);
  }
}

/** Remove a persisted workflow definition. */
export async function deleteWorkflowDefinition(workflowId: string): Promise<void> {
  const result = await storageOrchestrator.deleteEntity(workflowId);
  if (!result.success) {
    console.debug(`[NetRunnerPersistence] No persisted workflow definition to delete for ${workflowId} (${result.error})`);
  }
}

/** Load every persisted workflow definition. */
export async function loadWorkflowDefinitions(): Promise<Workflow[]> {
  const result = await storageOrchestrator.queryEntities<NetRunnerWorkflowEntity>({
    types: [WORKFLOW_ENTITY_TYPE],
    // See loadBotDefinitions() — forces the real IndexedDB read every time.
    forceRefresh: true
  });
  if (!result.success || !result.data) return [];
  return result.data.map(entity => entity.workflow);
}

/** Persist a completed (or failed) workflow execution, tagged by workflowId for later per-workflow queries. */
export async function saveWorkflowExecution(execution: WorkflowExecutionState): Promise<void> {
  const entity: Partial<NetRunnerWorkflowExecutionEntity> = {
    id: execution.executionId,
    type: WORKFLOW_EXECUTION_ENTITY_TYPE,
    createdAt: execution.startTime,
    updatedAt: execution.endTime ?? execution.startTime,
    createdBy: `netrunner-workflow-${execution.workflowId}`,
    tags: [execution.workflowId],
    metadata: {},
    execution
  };
  const result = await storageOrchestrator.storeEntity<NetRunnerWorkflowExecutionEntity>(entity);
  if (!result.success) {
    console.error(`[NetRunnerPersistence] Failed to persist workflow execution ${execution.executionId}:`, result.error);
  }
}

/** Load persisted workflow executions, optionally scoped to one workflow, oldest first. */
export async function loadWorkflowExecutions(workflowId?: string): Promise<WorkflowExecutionState[]> {
  const result = await storageOrchestrator.queryEntities<NetRunnerWorkflowExecutionEntity>({
    types: [WORKFLOW_EXECUTION_ENTITY_TYPE],
    tags: workflowId ? [workflowId] : undefined,
    forceRefresh: true
  });
  if (!result.success || !result.data) return [];
  return result.data
    .map(entity => entity.execution)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
}

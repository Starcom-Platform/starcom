import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EnhancedMissionResult } from '../../execution/BotMissionExecutor';
import type { OsintBot } from '../../integration/BotRosterIntegration';

const isRunning = vi.fn();
const getBotMetrics = vi.fn();
const getMissionHistory = vi.fn();

vi.mock('../../execution/BotMissionExecutor', () => ({
  botMissionExecutor: {
    isRunning: (...args: unknown[]) => isRunning(...args),
    getBotMetrics: (...args: unknown[]) => getBotMetrics(...args),
    getMissionHistory: (...args: unknown[]) => getMissionHistory(...args)
  }
}));

const saveBotDefinition = vi.fn();
const deleteBotDefinition = vi.fn();
const loadBotDefinitions = vi.fn();

vi.mock('../persistence/NetRunnerPersistence', () => ({
  saveBotDefinition: (...args: unknown[]) => saveBotDefinition(...args),
  deleteBotDefinition: (...args: unknown[]) => deleteBotDefinition(...args),
  loadBotDefinitions: (...args: unknown[]) => loadBotDefinitions(...args)
}));

import { BotRosterService } from '../BotRosterService';

function makeBot(overrides: Partial<OsintBot> = {}): OsintBot {
  return {
    id: 'custom-persisted-1', name: 'Persisted Bot', description: 'from a previous session',
    avatar: '🤖', capabilities: ['collection'], compatibleTools: [], specializations: ['identity'],
    autonomyLevel: 'supervised', scope: 'general', author: 'User', version: '1.0.0',
    created: new Date().toISOString(), updated: new Date().toISOString(),
    performance: { accuracy: 0, speed: 0, successRate: 0, intelQualityScore: 0, totalOperations: 0, totalIntelGenerated: 0, lastEvaluation: new Date().toISOString() },
    status: 'active',
    configuration: { maxConcurrentOperations: 1, maxDailyOperations: 100, rateLimiting: true, proxyRotation: false, obfuscation: false, loggingLevel: 'standard', notifyOnCompletion: true, saveResultsAutomatically: true, customParameters: {} },
    ...overrides
  };
}

function makeResult(overrides: Partial<EnhancedMissionResult> = {}): EnhancedMissionResult {
  return {
    missionId: 'm1', botId: 'spider-01', target: 'example.com', status: 'success',
    intelCollected: 3, operationsPerformed: [], duration: 500, completedAt: Date.now(),
    errors: [], usedMockData: false, qualityScore: 80, confidenceLevel: 0.8, specializedFindings: {},
    toolsUsed: [], processingStages: [], rawDataGenerated: 0, observationsCreated: 0,
    correlationOpportunities: [], suggestedNextActions: [],
    ...overrides
  };
}

describe('BotRosterService — real state delegation', () => {
  let service: BotRosterService;

  beforeEach(() => {
    isRunning.mockReset().mockReturnValue(false);
    getBotMetrics.mockReset().mockReturnValue({ totalMissions: 0, successfulMissions: 0, averageQuality: 0, averageConfidence: 0, totalIntelGenerated: 0 });
    getMissionHistory.mockReset().mockReturnValue([]);
    saveBotDefinition.mockReset().mockResolvedValue(undefined);
    deleteBotDefinition.mockReset().mockResolvedValue(undefined);
    loadBotDefinitions.mockReset().mockResolvedValue([]);
    service = new BotRosterService();
  });

  it('gives each bot card the specialization its missions run as, not a blank the card reads as identity', () => {
    const bySpecialization = Object.fromEntries(service.getBots().map(b => [b.name, b.specialization]));

    expect(bySpecialization).toEqual({
      'WebSpider Alpha': 'network',
      'ReconBot Beta': 'identity',
      'DataMiner Delta': 'financial',
    });
  });

  it('a bot with no mission history reports an honest zero state, not fabricated numbers', () => {
    const [bot] = service.getBots();
    const metrics = service.getBotMetrics(bot.id);

    expect(metrics.operationsCompleted).toBe(0);
    expect(metrics.successRate).toBe(0);
    expect(metrics.healthStatus).toBe('good'); // neutral, not an unearned "excellent"
    expect(service.getBotCurrentActivity(bot.id)).toBe('No missions run yet');
  });

  it('reflects a real in-flight mission as status active with a genuine activity string', () => {
    isRunning.mockReturnValue(true);
    const bots = service.getBots();
    const bot = bots[0];

    expect(bot.status).toBe('active');
    expect(service.getBotCurrentActivity(bot.id)).toBe('Mission in progress...');
    expect(service.getBotMetrics(bot.id).currentLoad).toBe(100);
  });

  it('derives success rate and ops count from real executor metrics, not randomized values', () => {
    getBotMetrics.mockReturnValue({ totalMissions: 4, successfulMissions: 3, averageQuality: 75, averageConfidence: 0.7, totalIntelGenerated: 12 });
    const [bot] = service.getBots();

    const metrics = service.getBotMetrics(bot.id);
    expect(metrics.operationsCompleted).toBe(4);
    expect(metrics.successRate).toBe(75); // 3/4 = 75%, deterministic
    expect(bot.tasksCompleted).toBe(4);
  });

  it('summarizes the most recent real mission when idle with history', () => {
    getMissionHistory.mockReturnValue([
      makeResult({ target: 'first.com', status: 'success' }),
      makeResult({ target: 'second.com', status: 'partial', completedAt: Date.now() - 5 * 60_000 })
    ]);

    const [bot] = service.getBots();
    expect(service.getBotCurrentActivity(bot.id)).toContain('second.com');
    expect(service.getBotCurrentActivity(bot.id)).toContain('partial');
  });

  it('includes the real failure reason when the last mission failed, not just the word "failed"', () => {
    getMissionHistory.mockReturnValue([
      makeResult({ target: 'timeout.com', status: 'failed', errors: ['Tool execution timed out after 10000ms'] })
    ]);

    const [bot] = service.getBots();
    const activity = service.getBotCurrentActivity(bot.id);
    expect(activity).toContain('timeout.com');
    expect(activity).toContain('Tool execution timed out after 10000ms');
  });

  it('marks the activity summary when the last mission used mock data', () => {
    getMissionHistory.mockReturnValue([
      makeResult({ target: 'acme.com', status: 'success', usedMockData: true })
    ]);

    const [bot] = service.getBots();
    expect(service.getBotCurrentActivity(bot.id)).toContain('mock data');
  });

  it('does not mention mock data for a genuinely real result', () => {
    getMissionHistory.mockReturnValue([
      makeResult({ target: 'acme.com', status: 'success', usedMockData: false })
    ]);

    const [bot] = service.getBots();
    expect(service.getBotCurrentActivity(bot.id)).not.toContain('mock data');
  });

  it('bot definition CRUD (create/delete) still works — this part was always real', () => {
    const id = service.createCustomBot('Test Bot', 'network', 'desc', 'supervised');
    expect(service.getBot(id)?.name).toBe('Test Bot');

    expect(service.deleteBot(id)).toBe(true);
    expect(service.getBot(id)).toBeUndefined();
  });

  it('createCustomBot persists the new bot durably (fire-and-forget)', () => {
    const id = service.createCustomBot('Test Bot', 'network', 'desc', 'supervised');

    expect(saveBotDefinition).toHaveBeenCalledTimes(1);
    expect(saveBotDefinition.mock.calls[0][0]).toMatchObject({ id, name: 'Test Bot' });
  });

  it('deleteBot removes the persisted copy, but only when a bot actually existed', () => {
    const id = service.createCustomBot('Test Bot', 'network', 'desc', 'supervised');
    saveBotDefinition.mockClear();

    expect(service.deleteBot(id)).toBe(true);
    expect(deleteBotDefinition).toHaveBeenCalledWith(id);

    deleteBotDefinition.mockClear();
    expect(service.deleteBot('never-existed')).toBe(false);
    expect(deleteBotDefinition).not.toHaveBeenCalled();
  });

  it('ensureInitialized() loads persisted custom bots from a previous session into the live roster', async () => {
    loadBotDefinitions.mockResolvedValue([makeBot({ id: 'custom-persisted-1', name: 'Inherited Bot' })]);

    const before = service.getBots().find(b => b.id === 'custom-persisted-1');
    expect(before).toBeUndefined(); // not there yet — only the 3 defaults exist synchronously

    await service.ensureInitialized();

    const after = service.getBots().find(b => b.id === 'custom-persisted-1');
    expect(after?.name).toBe('Inherited Bot');
    expect(after?.type).toBe('custom');
  });

  it('ensureInitialized() is idempotent — a second call does not reload from storage', async () => {
    loadBotDefinitions.mockResolvedValue([makeBot()]);

    await service.ensureInitialized();
    await service.ensureInitialized();

    expect(loadBotDefinitions).toHaveBeenCalledTimes(1);
  });

  it('ensureInitialized() degrades gracefully if storage is unavailable — defaults still work', async () => {
    loadBotDefinitions.mockRejectedValue(new Error('indexedDB is not defined'));

    await expect(service.ensureInitialized()).resolves.toBeUndefined();
    expect(service.getBots().length).toBe(3); // the 3 default bots, unaffected
  });

  it('a bot deleted via one instance is not resurrected by a fresh instance created right after (cross-instance/remount race)', async () => {
    // NetRunnerBottomBar builds a brand-new BotRosterService on every mount
    // (no cross-mount cache) — instance A here stands in for "the roster
    // before the user navigated away", instance B for "the roster after
    // navigating back". A's delete-from-storage write is fire-and-forget, so
    // it can still be in flight when B's own storage load runs.
    loadBotDefinitions.mockResolvedValue([]);
    const instanceA = new BotRosterService();
    const doomedId = instanceA.createCustomBot('Doomed Bot', 'network', 'desc', 'supervised');
    expect(instanceA.deleteBot(doomedId)).toBe(true);

    // Instance B's load snapshot still contains the bot — e.g. it was fetched
    // from storage before instance A's deleteBotDefinition() write landed.
    loadBotDefinitions.mockResolvedValue([makeBot({ id: doomedId, name: 'Doomed Bot' })]);
    const instanceB = new BotRosterService();
    await instanceB.ensureInitialized();

    expect(instanceB.getBot(doomedId)).toBeUndefined();
  });
});

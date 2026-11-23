import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OsintBot } from '../../integration/BotRosterIntegration';
import type { EnhancedMissionResult } from '../BotMissionExecutor';

// Empty adapter registry — mission runs with zero tools, completing almost
// instantly with no real network calls. Sufficient to test isRunning()'s
// state tracking without needing to mock individual adapter internals.
vi.mock('../../tools/adapters/AdapterRegistry', () => ({
  getAllAdapters: vi.fn(() => []),
  hasAdapter: vi.fn(() => false),
  getAdapter: vi.fn(() => undefined),
  initializeAdapters: vi.fn(async () => {})
}));

vi.mock('../../tools/adapters/IntelAnalyzerAdapter', () => ({
  packageTypeForIntelType: vi.fn(() => 'entity_extraction')
}));

const saveMissionResult = vi.fn();
const loadMissionHistory = vi.fn();

vi.mock('../../services/persistence/NetRunnerPersistence', () => ({
  saveMissionResult: (...args: unknown[]) => saveMissionResult(...args),
  loadMissionHistory: (...args: unknown[]) => loadMissionHistory(...args)
}));

import { BotMissionExecutor, botMissionExecutor } from '../BotMissionExecutor';
import { getAllAdapters, getAdapter, hasAdapter } from '../../tools/adapters/AdapterRegistry';

function makeResult(overrides: Partial<EnhancedMissionResult> = {}): EnhancedMissionResult {
  return {
    missionId: 'persisted-1', botId: 'bot-history', target: 'inherited.com', status: 'success',
    intelCollected: 2, operationsPerformed: [], duration: 300, completedAt: Date.now() - 60_000,
    errors: [], usedMockData: false, qualityScore: 90, confidenceLevel: 0.9, specializedFindings: {},
    toolsUsed: [], processingStages: [], rawDataGenerated: 0, observationsCreated: 0,
    correlationOpportunities: [], suggestedNextActions: [],
    ...overrides
  };
}

function makeBot(id: string, specializations: OsintBot['specializations'] = ['identity']): OsintBot {
  return {
    id,
    name: `Bot ${id}`,
    description: 'test bot',
    avatar: '🤖',
    status: 'active',
    capabilities: ['collection'],
    compatibleTools: [],
    specializations,
    scope: 'specialized',
    autonomyLevel: 'supervised',
    author: 'test',
    version: '1.0.0',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    performance: {
      accuracy: 0, speed: 0, successRate: 0, intelQualityScore: 0,
      totalOperations: 0, totalIntelGenerated: 0, lastEvaluation: new Date().toISOString()
    },
    configuration: {
      maxConcurrentOperations: 1, maxDailyOperations: 100, rateLimiting: true,
      proxyRotation: false, obfuscation: false, loggingLevel: 'standard',
      notifyOnCompletion: true, saveResultsAutomatically: true, customParameters: {}
    }
  };
}

describe('BotMissionExecutor.isRunning', () => {
  beforeEach(() => {
    vi.mocked(getAllAdapters).mockReturnValue([]);
    saveMissionResult.mockReset().mockResolvedValue(undefined);
    loadMissionHistory.mockReset().mockResolvedValue([]);
  });

  it('is false before a mission starts and false again after it completes successfully', async () => {
    const executor = new BotMissionExecutor();
    const bot = makeBot('bot-success');

    expect(executor.isRunning(bot.id)).toBe(false);

    const missionPromise = executor.executeSimpleMission(bot, 'example.com');
    expect(executor.isRunning(bot.id)).toBe(true);

    await missionPromise;
    expect(executor.isRunning(bot.id)).toBe(false);
  });

  it('clears the running flag even when tool selection throws', async () => {
    vi.mocked(getAllAdapters).mockImplementation(() => {
      throw new Error('registry unavailable');
    });

    const executor = new BotMissionExecutor();
    const bot = makeBot('bot-failure');

    const missionPromise = executor.executeSimpleMission(bot, 'example.com');
    expect(executor.isRunning(bot.id)).toBe(true);

    const result = await missionPromise;
    expect(result.status).toBe('failed');
    expect(executor.isRunning(bot.id)).toBe(false);
  });

  it('a failed mission is recorded exactly like a successful one — history, metrics, and durable persistence', async () => {
    vi.mocked(getAllAdapters).mockImplementation(() => {
      throw new Error('registry unavailable');
    });

    const executor = new BotMissionExecutor();
    const bot = makeBot('bot-failure-recorded');

    const result = await executor.executeSimpleMission(bot, 'example.com');
    expect(result.status).toBe('failed');

    // Before this fix, a thrown mission left no trace anywhere: not in
    // in-memory history, not in metrics, not persisted.
    const history = executor.getMissionHistory(bot.id);
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('failed');
    expect(history[0].errors[0]).toBe('registry unavailable');

    expect(executor.getBotMetrics(bot.id).totalMissions).toBe(1);
    expect(saveMissionResult).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed', botId: bot.id }));
  });

  it('records mission history and metrics for later reads (getMissionHistory/getBotMetrics)', async () => {
    const executor = new BotMissionExecutor();
    const bot = makeBot('bot-history');

    expect(executor.getMissionHistory(bot.id)).toHaveLength(0);
    expect(executor.getBotMetrics(bot.id).totalMissions).toBe(0);

    await executor.executeSimpleMission(bot, 'example.com');

    const history = executor.getMissionHistory(bot.id);
    expect(history).toHaveLength(1);
    expect(history[0].target).toBe('example.com');
    expect(history[0].completedAt).toBeGreaterThan(0);
    expect(executor.getBotMetrics(bot.id).totalMissions).toBe(1);
  });

  it('the exported singleton is a single shared instance, not reconstructed per call', () => {
    expect(botMissionExecutor).toBeInstanceOf(BotMissionExecutor);
    // Same reference across imports/uses — this is the whole point of the singleton.
    expect(botMissionExecutor).toBe(botMissionExecutor);
  });

  it('a completed mission is persisted durably, not just kept in memory', async () => {
    const executor = new BotMissionExecutor();
    const bot = makeBot('bot-persist');

    await executor.executeSimpleMission(bot, 'example.com');

    expect(saveMissionResult).toHaveBeenCalledTimes(1);
    expect(saveMissionResult.mock.calls[0][0]).toMatchObject({ botId: bot.id, target: 'example.com' });
  });

  it('ensureInitialized() hydrates mission history and metrics from a previous session', async () => {
    loadMissionHistory.mockResolvedValue([
      makeResult({ missionId: 'm1', botId: 'bot-history', status: 'success' }),
      makeResult({ missionId: 'm2', botId: 'bot-history', status: 'failed', qualityScore: 0 })
    ]);

    const executor = new BotMissionExecutor();
    expect(executor.getMissionHistory('bot-history')).toHaveLength(0);

    await executor.ensureInitialized();

    const history = executor.getMissionHistory('bot-history');
    expect(history).toHaveLength(2);
    expect(history[0].target).toBe('inherited.com');
    expect(executor.getBotMetrics('bot-history').totalMissions).toBe(2);
  });

  it('ensureInitialized() is idempotent — a second call does not reload from storage', async () => {
    loadMissionHistory.mockResolvedValue([makeResult()]);

    const executor = new BotMissionExecutor();
    await executor.ensureInitialized();
    await executor.ensureInitialized();

    expect(loadMissionHistory).toHaveBeenCalledTimes(1);
  });

  it('ensureInitialized() degrades gracefully if storage is unavailable', async () => {
    loadMissionHistory.mockRejectedValue(new Error('indexedDB is not defined'));

    const executor = new BotMissionExecutor();
    await expect(executor.ensureInitialized()).resolves.toBeUndefined();
    expect(executor.getMissionHistory('anything')).toHaveLength(0);
  });

  it('ensureInitialized() registers the real tool adapters (was never called anywhere in the app before)', async () => {
    const { initializeAdapters } = await import('../../tools/adapters/AdapterRegistry');
    vi.mocked(initializeAdapters).mockClear();

    const executor = new BotMissionExecutor();
    await executor.ensureInitialized();

    expect(initializeAdapters).toHaveBeenCalledTimes(1);
  });

  describe('IntelAnalyzer selection and parameters (was silently unreachable — two separate bugs)', () => {
    const intelAnalyzerAdapter = {
      getToolId: () => 'intel-analyzer',
      getToolSchema: () => ({ name: 'Intel Analyzer' }),
      execute: vi.fn()
    };

    beforeEach(() => {
      intelAnalyzerAdapter.execute.mockReset().mockResolvedValue({
        requestId: 'req-1', toolId: 'intel-analyzer', status: 'success',
        data: { entities: [] }, timestamp: Date.now()
      });
      vi.mocked(getAllAdapters).mockReturnValue([intelAnalyzerAdapter as never]);
      vi.mocked(getAdapter).mockImplementation((id: string) => id === 'intel-analyzer' ? intelAnalyzerAdapter as never : undefined);
      vi.mocked(hasAdapter).mockImplementation((id: string) => id === 'intel-analyzer');
    });

    it('is actually selected for a "financial" bot — the name string now matches the real adapter schema exactly', async () => {
      const executor = new BotMissionExecutor();
      const bot = makeBot('bot-financial', ['financial']); // financial maps ONLY to Intel Analyzer

      await executor.executeSimpleMission(bot, 'acme-corp.example');

      expect(intelAnalyzerAdapter.execute).toHaveBeenCalledTimes(1);
    });

    it('receives {data, packageType} — not the {query, target, operation, limit} shape every other adapter expects', async () => {
      const executor = new BotMissionExecutor();
      const bot = makeBot('bot-financial', ['financial']);

      await executor.executeSimpleMission(bot, 'acme-corp.example');

      const request = intelAnalyzerAdapter.execute.mock.calls[0][0];
      expect(request.parameters).toEqual({ data: 'acme-corp.example', packageType: 'entity_extraction' });
    });

    it('flags usedMockData when a tool response is tagged _isMockData — real API keys/proxies aren\'t assumed', async () => {
      intelAnalyzerAdapter.execute.mockResolvedValue({
        requestId: 'req-1', toolId: 'intel-analyzer', status: 'success',
        data: { entities: [], _isMockData: true }, timestamp: Date.now()
      });

      const executor = new BotMissionExecutor();
      const bot = makeBot('bot-financial', ['financial']);
      const result = await executor.executeSimpleMission(bot, 'acme-corp.example');

      expect(result.usedMockData).toBe(true);
    });

    it('leaves usedMockData false when no tool response is tagged as mock', async () => {
      const executor = new BotMissionExecutor();
      const bot = makeBot('bot-financial', ['financial']);
      const result = await executor.executeSimpleMission(bot, 'acme-corp.example');

      expect(result.usedMockData).toBe(false);
    });
  });

  describe('theHarvester parameters, and naming the tools that answered with sample data', () => {
    const harvesterAdapter = {
      getToolId: () => 'harvester-generated-id',
      getToolSchema: () => ({ name: 'theHarvester' }),
      execute: vi.fn()
    };
    const shodanAdapter = {
      getToolId: () => 'shodan-generated-id',
      getToolSchema: () => ({ name: 'Shodan' }),
      execute: vi.fn()
    };

    beforeEach(() => {
      harvesterAdapter.execute.mockReset().mockResolvedValue({
        requestId: 'req-h', toolId: 'harvester-generated-id', status: 'error', data: null,
        error: 'theHarvester is not available', timestamp: Date.now()
      });
      shodanAdapter.execute.mockReset().mockResolvedValue({
        requestId: 'req-s', toolId: 'shodan-generated-id', status: 'success',
        data: { matches: [], total: 0, _isMockData: true }, timestamp: Date.now()
      });
      const byId: Record<string, unknown> = {
        'harvester-generated-id': harvesterAdapter,
        'shodan-generated-id': shodanAdapter
      };
      vi.mocked(getAllAdapters).mockReturnValue([harvesterAdapter, shodanAdapter] as never);
      vi.mocked(getAdapter).mockImplementation((id: string) => byId[id] as never);
      vi.mocked(hasAdapter).mockImplementation((id: string) => id in byId);
    });

    it('asks theHarvester for emails at the target\'s domain, not for a "search" it does not have', async () => {
      const executor = new BotMissionExecutor();
      await executor.executeSimpleMission(makeBot('bot-identity', ['identity']), 'https://www.example.com/about');

      const request = harvesterAdapter.execute.mock.calls[0][0];
      expect(request.parameters).toEqual({ operation: 'emails', domain: 'www.example.com', limit: 25 });
    });

    it('asks theHarvester for subdomains for a network bot', async () => {
      const executor = new BotMissionExecutor();
      await executor.executeSimpleMission(makeBot('bot-network', ['network']), 'example.com');

      const request = harvesterAdapter.execute.mock.calls[0][0];
      expect(request.parameters).toEqual({ operation: 'subdomains', domain: 'example.com', limit: 25 });
    });

    it('names the tools whose responses were sample data', async () => {
      const executor = new BotMissionExecutor();
      const result = await executor.executeSimpleMission(makeBot('bot-network', ['network']), 'example.com');

      expect(result.usedMockData).toBe(true);
      expect(result.mockDataFrom).toEqual(['Shodan']);
    });
  });
});

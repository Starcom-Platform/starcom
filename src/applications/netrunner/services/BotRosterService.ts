/**
 * BotRosterService — Service layer bridging OsintBot to BotInstance for the UI.
 *
 * Owns bot *definitions* (create/delete/list) only. Runtime status, metrics,
 * and activity are all read through from `botMissionExecutor`'s real mission
 * history — this class used to simulate that state itself (random progress
 * strings on a setTimeout loop, re-randomized metrics on every read); that
 * simulation has been removed in favor of the real thing.
 */

import type { ComponentType } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Globe, Search, Database, Bot } from 'lucide-react';
import { OsintBot, BotCapability, AutonomyLevel } from '../integration/BotRosterIntegration';
import { IntelType } from '../tools/NetRunnerPowerTools';
import { botMissionExecutor } from '../execution/BotMissionExecutor';
import { saveBotDefinition, deleteBotDefinition, loadBotDefinitions } from './persistence/NetRunnerPersistence';

export interface BotInstance {
  id: string;
  name: string;
  type: 'default' | 'custom';
  category: string;
  status: 'active' | 'idle' | 'error';
  icon: ComponentType<{ size?: number | string; color?: string }>;
  description: string;
  tasksCompleted: number;
  autonomyLevel: number; // 0-100 — configured autonomy tier, not a measured behavior yet
  aiControlled: boolean; // configured, not yet behaviorally different — see AutonomyLevel note below
  capabilities: string[];
  specialization?: string;
}

export interface BotMetrics {
  successRate: number;
  operationsCompleted: number;
  currentLoad: number;
  healthStatus: 'excellent' | 'good' | 'warning' | 'error';
  lastActivity: string;
}

/**
 * Bot ids deleted this page load, module-level (not per-instance). The UI
 * creates a fresh BotRosterService on every NetRunner mount (no cross-mount
 * cache), so navigating away right after a delete and back again quickly
 * builds a brand-new instance whose ensureInitialized() can still see the
 * bot in storage if the previous instance's fire-and-forget
 * deleteBotDefinition() write hasn't completed yet — an instance-scoped
 * tombstone set couldn't protect against that, since the new instance has
 * no memory of the old one's delete. This one is shared by construction.
 */
const deletedBotIds: Set<string> = new Set();

export class BotRosterService {
  private registeredBots: Map<string, OsintBot> = new Map();
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initializeDefaultBots();
  }

  /**
   * Loads persisted custom bots (created in a previous session) into the roster.
   * Idempotent and safe to call from every mount — the actual load only runs once.
   * Default bots are always present synchronously from the constructor; this only
   * adds back what the operative built themselves.
   */
  async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = (async () => {
        const persisted = await loadBotDefinitions();
        for (const bot of persisted) {
          if (deletedBotIds.has(bot.id)) continue; // deleted (this instance or a previous one) — do not resurrect
          // A default bot's id (e.g. 'spider-01') is never used for a persisted
          // custom bot, but guard anyway in case of a future id-scheme collision.
          if (!this.registeredBots.has(bot.id)) {
            this.registeredBots.set(bot.id, bot);
          }
        }
      })().catch(error => {
        console.error('[BotRosterService] Failed to load persisted bots — continuing with defaults only:', error);
      });
    }
    return this.initPromise;
  }

  private initializeDefaultBots() {
    const defaultBots: OsintBot[] = [
      {
        id: 'spider-01',
        name: 'WebSpider Alpha',
        description: 'Advanced web crawling and data extraction bot',
        avatar: '🕷️',
        capabilities: ['collection', 'analysis'],
        compatibleTools: [],
        specializations: ['network', 'infrastructure'],
        autonomyLevel: 'semi-autonomous',
        scope: 'specialized',
        author: 'Starcom Systems',
        version: '1.0.0',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        performance: {
          accuracy: 0, speed: 0, successRate: 0, intelQualityScore: 0,
          totalOperations: 0, totalIntelGenerated: 0, lastEvaluation: new Date().toISOString()
        },
        status: 'active',
        configuration: {
          maxConcurrentOperations: 5, maxDailyOperations: 1000, rateLimiting: true,
          proxyRotation: true, obfuscation: false, loggingLevel: 'standard',
          notifyOnCompletion: true, saveResultsAutomatically: true, customParameters: {}
        }
      },
      {
        id: 'recon-02',
        name: 'ReconBot Beta',
        description: 'OSINT reconnaissance and intelligence gathering specialist',
        avatar: '🔍',
        capabilities: ['collection', 'analysis', 'correlation'],
        compatibleTools: [],
        specializations: ['identity', 'network', 'infrastructure'],
        autonomyLevel: 'autonomous',
        scope: 'general',
        author: 'Starcom Systems',
        version: '2.1.0',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        performance: {
          accuracy: 0, speed: 0, successRate: 0, intelQualityScore: 0,
          totalOperations: 0, totalIntelGenerated: 0, lastEvaluation: new Date().toISOString()
        },
        status: 'active',
        configuration: {
          maxConcurrentOperations: 3, maxDailyOperations: 500, rateLimiting: true,
          proxyRotation: true, obfuscation: true, loggingLevel: 'verbose',
          notifyOnCompletion: true, saveResultsAutomatically: true, customParameters: {}
        }
      },
      {
        id: 'data-04',
        name: 'DataMiner Delta',
        description: 'Big data processing and correlation engine',
        avatar: '⛏️',
        capabilities: ['analysis', 'correlation', 'reporting'],
        compatibleTools: [],
        specializations: ['financial', 'social', 'temporal'],
        autonomyLevel: 'semi-autonomous',
        scope: 'specialized',
        author: 'Starcom Systems',
        version: '1.5.0',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        performance: {
          accuracy: 0, speed: 0, successRate: 0, intelQualityScore: 0,
          totalOperations: 0, totalIntelGenerated: 0, lastEvaluation: new Date().toISOString()
        },
        status: 'active',
        configuration: {
          maxConcurrentOperations: 10, maxDailyOperations: 2000, rateLimiting: false,
          proxyRotation: false, obfuscation: false, loggingLevel: 'minimal',
          notifyOnCompletion: false, saveResultsAutomatically: true, customParameters: {}
        }
      }
    ];

    defaultBots.forEach(bot => this.registeredBots.set(bot.id, bot));
  }

  getBots(): BotInstance[] {
    return Array.from(this.registeredBots.values()).map(bot => this.mapOsintBotToBotInstance(bot));
  }

  private mapOsintBotToBotInstance(osintBot: OsintBot): BotInstance {
    const getIconForBot = (name: string) => {
      if (name.includes('Spider')) return Globe;
      if (name.includes('Recon')) return Search;
      if (name.includes('DataMiner')) return Database;
      return Bot;
    };

    const getCategoryFromSpecializations = (specializations: string[]) => {
      if (specializations.includes('network')) return 'crawler';
      if (specializations.includes('identity')) return 'reconnaissance';
      if (specializations.includes('financial')) return 'data';
      return 'general';
    };

    const executionMetrics = botMissionExecutor.getBotMetrics(osintBot.id);

    return {
      id: osintBot.id,
      name: osintBot.name,
      type: osintBot.author === 'Starcom Systems' ? 'default' : 'custom',
      category: getCategoryFromSpecializations(osintBot.specializations),
      // The card runs its missions as this. Left out, every bot ran as an
      // identity bot, whatever it was built for.
      specialization: osintBot.specializations[0],
      status: botMissionExecutor.isRunning(osintBot.id) ? 'active' : 'idle',
      icon: getIconForBot(osintBot.name),
      description: osintBot.description,
      tasksCompleted: executionMetrics.totalMissions,
      // Configured autonomy tier (set at bot creation), not a measured behavior —
      // recurring/scheduled autonomous execution isn't wired up yet, so this
      // doesn't change what the bot actually does. See BotRosterIntegration.AutonomyLevel.
      autonomyLevel: osintBot.autonomyLevel === 'autonomous' ? 90 :
                     osintBot.autonomyLevel === 'semi-autonomous' ? 60 : 30,
      aiControlled: osintBot.autonomyLevel === 'autonomous',
      capabilities: osintBot.capabilities.map(cap =>
        cap.charAt(0).toUpperCase() + cap.slice(1).replace('-', ' ')
      )
    };
  }

  createBot(name: string, category: string, description: string): string {
    const specialization = this.determineSpecialization(category, description, name);
    return this.createCustomBot(name, specialization, description || `Custom ${category} bot`, this.getAutonomyForSpecialization(specialization));
  }

  createCustomBot(name: string, specialization: IntelType, description: string, autonomyLevel: AutonomyLevel): string {
    const capabilities = this.getCapabilitiesForSpecialization(specialization);

    const newBot: OsintBot = {
      // uuidv4 (was `custom-${Date.now()}`): two bots created within the same
      // millisecond — a rapid double-click on Deploy, or scripted creation —
      // collided and the second silently overwrote the first.
      id: `custom-${uuidv4()}`,
      name,
      description,
      avatar: this.getAvatarForSpecialization(specialization),
      capabilities,
      compatibleTools: [],
      specializations: [specialization],
      autonomyLevel,
      scope: specialization === 'identity' ? 'general' : 'specialized',
      author: 'User',
      version: '1.0.0',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      performance: {
        accuracy: 0, speed: 0, successRate: 0, intelQualityScore: 0,
        totalOperations: 0, totalIntelGenerated: 0, lastEvaluation: new Date().toISOString()
      },
      status: 'active',
      configuration: {
        maxConcurrentOperations: autonomyLevel === 'autonomous' ? 3 : autonomyLevel === 'semi-autonomous' ? 2 : 1,
        maxDailyOperations: autonomyLevel === 'autonomous' ? 500 : autonomyLevel === 'semi-autonomous' ? 250 : 100,
        rateLimiting: true,
        proxyRotation: autonomyLevel !== 'supervised',
        obfuscation: autonomyLevel === 'autonomous',
        loggingLevel: autonomyLevel === 'autonomous' ? 'minimal' : 'standard',
        notifyOnCompletion: true,
        saveResultsAutomatically: true,
        customParameters: {}
      }
    };

    this.registeredBots.set(newBot.id, newBot);
    saveBotDefinition(newBot).catch(error =>
      console.error(`[BotRosterService] Failed to persist new bot ${newBot.id}:`, error)
    );
    return newBot.id;
  }

  deleteBot(botId: string): boolean {
    const deleted = this.registeredBots.delete(botId);
    if (deleted) {
      deletedBotIds.add(botId);
      deleteBotDefinition(botId).catch(error =>
        console.error(`[BotRosterService] Failed to remove persisted bot ${botId}:`, error)
      );
    }
    return deleted;
  }

  getBot(botId: string): OsintBot | undefined {
    return this.registeredBots.get(botId);
  }

  private determineSpecialization(category: string, description: string, name: string): IntelType {
    const text = `${category} ${description} ${name}`.toLowerCase();

    if (text.match(/domain|dns|infrastructure|network|ip|ssl|certificate/)) {
      return 'network';
    } else if (text.match(/social|people|person|employee|email|linkedin|twitter/)) {
      return 'social';
    } else if (text.match(/vuln|security|scan|port|cve|vulnerability|threat/)) {
      return 'vulnerability';
    } else if (text.match(/company|business|financial|competitive|market/)) {
      return 'financial';
    } else if (text.match(/dark|tor|underground|breach|leak/)) {
      return 'darkweb';
    } else {
      return 'identity';
    }
  }

  getCapabilitiesForSpecialization(specialization: IntelType): BotCapability[] {
    const capabilityMap: Record<IntelType, BotCapability[]> = {
      'identity': ['collection', 'analysis', 'verification'],
      'network': ['collection', 'analysis', 'monitoring'],
      'social': ['collection', 'correlation', 'monitoring'],
      'financial': ['collection', 'analysis', 'reporting'],
      'vulnerability': ['collection', 'analysis', 'alerting'],
      'darkweb': ['collection', 'monitoring', 'alerting'],
      'infrastructure': ['collection', 'analysis', 'monitoring'],
      'geospatial': ['collection', 'analysis', 'correlation'],
      'temporal': ['collection', 'analysis', 'correlation'],
      'threat': ['collection', 'analysis', 'alerting']
    };
    return capabilityMap[specialization] || ['collection'];
  }

  getAutonomyForSpecialization(specialization: IntelType): AutonomyLevel {
    const autonomyMap: Record<IntelType, AutonomyLevel> = {
      'identity': 'supervised',
      'network': 'semi-autonomous',
      'social': 'supervised',
      'financial': 'semi-autonomous',
      'vulnerability': 'semi-autonomous',
      'darkweb': 'autonomous',
      'infrastructure': 'semi-autonomous',
      'geospatial': 'semi-autonomous',
      'temporal': 'semi-autonomous',
      'threat': 'autonomous'
    };
    return autonomyMap[specialization] || 'supervised';
  }

  getAvatarForSpecialization(specialization: IntelType): string {
    const avatarMap: Record<IntelType, string> = {
      'identity': '🤖',
      'network': '🌐',
      'social': '👥',
      'financial': '💼',
      'vulnerability': '🛡️',
      'darkweb': '🕵️',
      'infrastructure': '⚙️',
      'geospatial': '🗺️',
      'temporal': '⏰',
      'threat': '⚠️'
    };
    return avatarMap[specialization] || '🤖';
  }

  /** Real metrics derived from botMissionExecutor's actual mission history — no simulated data. */
  getBotMetrics(botId: string): BotMetrics {
    const running = botMissionExecutor.isRunning(botId);
    const { totalMissions, successfulMissions } = botMissionExecutor.getBotMetrics(botId);

    const successRate = totalMissions > 0 ? Math.round((successfulMissions / totalMissions) * 100) : 0;

    let healthStatus: BotMetrics['healthStatus'];
    if (totalMissions === 0) {
      healthStatus = 'good'; // neutral — unproven, not unearned "excellent" or unfairly "error"
    } else if (successRate >= 90) {
      healthStatus = 'excellent';
    } else if (successRate >= 70) {
      healthStatus = 'good';
    } else if (successRate >= 50) {
      healthStatus = 'warning';
    } else {
      healthStatus = 'error';
    }

    return {
      successRate,
      operationsCompleted: totalMissions,
      currentLoad: running ? 100 : 0,
      healthStatus,
      lastActivity: this.getBotCurrentActivity(botId)
    };
  }

  /** Real activity summary — either a genuinely-true in-progress state or the last real mission's outcome. */
  getBotCurrentActivity(botId: string): string {
    if (botMissionExecutor.isRunning(botId)) {
      return 'Mission in progress...';
    }

    const history = botMissionExecutor.getMissionHistory(botId);
    if (history.length === 0) {
      return 'No missions run yet';
    }

    const last = history[history.length - 1];
    const minutesAgo = Math.max(0, Math.floor((Date.now() - last.completedAt) / 60000));
    const when = minutesAgo === 0 ? 'just now' : `${minutesAgo}m ago`;
    // A failed mission is exactly as real as a successful one — say why, not
    // just that it happened. A mission built from mock data (adapters fall
    // back to it when a real API key/proxy isn't configured) shouldn't look
    // indistinguishable from a genuine result either.
    const reason = last.status === 'failed' && last.errors[0] ? `: ${last.errors[0]}` : '';
    const mockTag = last.usedMockData ? ' · mock data' : '';
    return `Last: ${last.target} (${last.status}${reason}${mockTag}, ${when})`;
  }

  getBotStatusColor(botId: string): string {
    const metrics = this.getBotMetrics(botId);
    const osintBot = this.registeredBots.get(botId);

    if (!osintBot) return '#666666';

    switch (metrics.healthStatus) {
      case 'excellent': return '#00ff88';
      case 'good': return '#88ff00';
      case 'warning': return '#ffaa00';
      case 'error': return '#ff4444';
      default: return '#666666';
    }
  }
}

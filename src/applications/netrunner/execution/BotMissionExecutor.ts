/**
 * Bot Mission Executor - Enhanced Phase 1 Implementation
 * 
 * Advanced OSINT mission execution with real tool integration,
 * intelligence processing, and Phase 2 preparation
 * 
 * @author GitHub Copilot
 * @date July 15, 2025
 * @version 1.1.0 - Phase 1 Enhanced
 */

import { OsintBot } from '../integration/BotRosterIntegration';
import { IntelType, ToolExecutionRequest } from '../tools/NetRunnerPowerTools';
import { isNetRunnerIntelEnabled, logIntelFlagContext } from '../../../config/netrunnerIntelFeatureFlag';
import { getAdapter, getAllAdapters, hasAdapter, initializeAdapters } from '../tools/adapters/AdapterRegistry';
import { packageTypeForIntelType } from '../tools/adapters/IntelAnalyzerAdapter';
import { toolNamesFor } from './toolsForSpecialization';

// Intel integration imports
import { storageOrchestrator } from '../../../core/intel/storage/storageOrchestrator';
import { Intel } from '../../../models/Intel/Intel';

// Durable mission history — a page reload no longer erases it.
import { saveMissionResult, loadMissionHistory } from '../services/persistence/NetRunnerPersistence';
import { createLogger } from '../../../utils/logger';
const log = createLogger({ prefix: 'BotMissionExecutor' });

export interface EnhancedMissionResult {
  missionId: string;
  botId: string;
  target: string;
  status: 'success' | 'failed' | 'partial';
  intelCollected: number;
  operationsPerformed: string[];
  duration: number;
  /** Wall-clock time (ms since epoch) the mission finished — for "N minutes ago" style reporting. */
  completedAt: number;
  errors: string[];
  /** True if any tool's response came from a mock fallback rather than a real API call. */
  usedMockData: boolean;
  /** The tools whose responses were sample data. Absent from results recorded before it existed. */
  mockDataFrom?: string[];
  // Enhanced Phase 1 metrics
  qualityScore: number;
  confidenceLevel: number;
  specializedFindings: Record<string, unknown>;
  toolsUsed: string[];
  processingStages: string[];
  // Phase 2 preparation data
  rawDataGenerated: number;
  observationsCreated: number;
  correlationOpportunities: string[];
  suggestedNextActions: string[];
}

export interface MissionConfiguration {
  maxConcurrentTools: number;
  timeoutPerTool: number;
  qualityThreshold: number;
  enableDeepAnalysis: boolean;
  saveIntermediateResults: boolean;
  /** Maximum number of tools that can be selected for a single mission. */
  maxToolsPerMission: number;
  /** Mission-level timeout in ms. Entire mission aborts if exceeded. */
  maxMissionDuration: number;
}

/** theHarvester's operation for a bot: people-shaped specializations harvest emails, the rest subdomains. */
function harvesterOperationFor(specialization: IntelType): 'emails' | 'subdomains' {
  return specialization === 'identity' || specialization === 'social' ? 'emails' : 'subdomains';
}

/** The host a mission target names, whether it was typed as a domain or as a URL. */
function domainOf(target: string): string {
  try {
    return new URL(target.includes('://') ? target : `https://${target}`).hostname;
  } catch {
    return target;
  }
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * What a mission sends each tool, in the shape that tool accepts (plan item 7,
 * block C). Every tool but two was sent "search": Censys offers search_hosts,
 * search_certificates and view_host, and VirusTotal its reports, so both
 * rejected every mission. VirusTotal is asked for a report, never scan_url,
 * which would publish the target to its community.
 */
export function toolParametersFor(toolName: string, toolId: string, target: string, specialization: IntelType): Record<string, unknown> {
  if (toolId === 'intel-analyzer') return { data: target, packageType: packageTypeForIntelType(specialization) };
  // theHarvester harvests emails or subdomains for a domain; it has no "search".
  if (toolName === 'theHarvester') return { operation: harvesterOperationFor(specialization), domain: domainOf(target), limit: 25 };
  const host = domainOf(target);
  if (toolName === 'Censys') {
    return IPV4.test(host) ? { operation: 'view_host', ip: host, query: host } : { operation: 'search_hosts', query: host, limit: 25 };
  }
  if (toolName === 'VirusTotal') return { operation: IPV4.test(host) ? 'ip_report' : 'domain_report', query: host };
  return { query: target, target, operation: 'search', limit: 25 };
}

/** "Could not look", and why, for a tool that can answer here only with sample data. */
export function couldNotLook(adapter: { sampleOnlyReason?(): string | null }): string | null {
  const reason = adapter.sampleOnlyReason?.() ?? null;
  return reason ? `Could not look: ${reason}` : null;
}

interface ToolResult {
  tool: string;
  operation: string;
  data: Record<string, unknown> | null;
  duration: number;
  success: boolean;
  error?: string;
}

interface QualityMetrics {
  overallScore: number;
  confidenceLevel: number;
  dataCompleteness: number;
  sourceReliability: number;
}

interface Phase2PrepData {
  observationsCreated: number;
  correlationOpportunities: string[];
  suggestedNextActions: string[];
}

export class BotMissionExecutor {
  private executionMetrics: Map<string, Record<string, number>>;
  private missionHistory: Map<string, EnhancedMissionResult[]>;
  private defaultConfig: MissionConfiguration;
  /** Bot IDs with a mission currently in flight — the one honest "is this bot doing something" signal. */
  private runningMissions: Set<string> = new Set();
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.executionMetrics = new Map();
    this.missionHistory = new Map();
    this.defaultConfig = {
      maxConcurrentTools: 3,
      timeoutPerTool: 10000,
      qualityThreshold: 0.7,
      enableDeepAnalysis: true,
      saveIntermediateResults: true,
      maxToolsPerMission: 10,
      maxMissionDuration: 120_000 // 2 minutes
    };
  }

  /**
   * Hydrates in-memory mission history from durable storage AND registers
   * the real tool adapters (Shodan, theHarvester, IntelAnalyzer, Censys,
   * VirusTotal). Idempotent and safe to call from every mount — the actual
   * work only runs once.
   *
   * The adapter registration matters as much as the history hydration:
   * AdapterRegistry.initializeAdapters() is the only function that
   * constructs and registers those five adapters, and — before this — it
   * was never called anywhere in the running app. getAllAdapters() returned
   * empty forever, so every mission's tool-selection stage picked zero
   * tools, for every bot, on every target, unconditionally. Missions still
   * "completed" and got persisted/notified/broadcast correctly, just with
   * nothing real in them.
   */
  async ensureInitialized(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = Promise.all([
        initializeAdapters().catch(error => {
          log.error('Failed to initialize tool adapters — missions will run with no real tools:', error);
        }),
        loadMissionHistory().then(persisted => { // all bots, ascending by completedAt
          for (const result of persisted) {
            this.storeMissionHistory(result.botId, result);
            this.updateEnhancedMetrics(result.botId, result);
          }
        }).catch(error => {
          log.error('Failed to load persisted mission history — continuing with empty history:', error);
        })
      ]).then(() => undefined);
    }
    return this.initPromise;
  }

  /**
   * Transform mission results into Intel objects for storage
   */
  private transformMissionToIntel(result: EnhancedMissionResult): Intel[] {
    const intel: Intel[] = [];
    const timestamp = Date.now();
    const baseMetadata = {
      botId: result.botId,
      missionId: result.missionId,
      target: result.target,
      duration: result.duration,
      qualityScore: result.qualityScore,
      confidenceLevel: result.confidenceLevel
    };

    // Transform specialized findings into Intel objects
    if (result.specializedFindings) {
      // Technical intelligence
      if (result.specializedFindings.technical) {
        const techIntel: Intel = {
          id: `tech-${result.missionId}`,
          source: 'TECHINT',
          reliability: result.qualityScore >= 70 ? 'B' : 'C',
          timestamp,
          collectedBy: `netrunner-bot-${result.botId}`,
          data: {
            findings: result.specializedFindings.technical,
            metadata: baseMetadata
          },
          tags: ['netrunner', 'technical', 'bot-mission'],
          qualityAssessment: {
            sourceQuality: 'unverified',
            visibility: 'public',
            sensitivity: 'open'
          }
        };
        intel.push(techIntel);
      }

      // Financial intelligence
      if (result.specializedFindings.financial) {
        const finIntel: Intel = {
          id: `fin-${result.missionId}`,
          source: 'FININT',
          reliability: result.qualityScore >= 70 ? 'B' : 'C',
          timestamp,
          collectedBy: `netrunner-bot-${result.botId}`,
          data: {
            findings: result.specializedFindings.financial,
            metadata: baseMetadata
          },
          tags: ['netrunner', 'financial', 'bot-mission'],
          qualityAssessment: {
            sourceQuality: 'unverified',
            visibility: 'public',
            sensitivity: 'open'
          }
        };
        intel.push(finIntel);
      }

      // Social intelligence
      if (result.specializedFindings.social) {
        const socialIntel: Intel = {
          id: `social-${result.missionId}`,
          source: 'OSINT',
          reliability: result.qualityScore >= 70 ? 'B' : 'C',
          timestamp,
          collectedBy: `netrunner-bot-${result.botId}`,
          data: {
            findings: result.specializedFindings.social,
            metadata: baseMetadata
          },
          tags: ['netrunner', 'social', 'bot-mission'],
          qualityAssessment: {
            sourceQuality: 'unverified',
            visibility: 'public',
            sensitivity: 'open'
          }
        };
        intel.push(socialIntel);
      }

      // Vulnerability intelligence
      if (result.specializedFindings.vulnerabilities) {
        const vulnIntel: Intel = {
          id: `vuln-${result.missionId}`,
          source: 'CYBINT',
          reliability: result.qualityScore >= 70 ? 'B' : 'C',
          timestamp,
          collectedBy: `netrunner-bot-${result.botId}`,
          data: {
            findings: result.specializedFindings.vulnerabilities,
            metadata: baseMetadata
          },
          tags: ['netrunner', 'security', 'vulnerabilities', 'bot-mission'],
          qualityAssessment: {
            sourceQuality: 'unverified',
            visibility: 'public',
            sensitivity: 'open'
          }
        };
        intel.push(vulnIntel);
      }
    }

    // Create mission summary Intel
    const summaryIntel: Intel = {
      id: `summary-${result.missionId}`,
      source: 'OSINT',
      reliability: 'A',
      timestamp,
      collectedBy: `netrunner-bot-${result.botId}`,
      data: {
        missionSummary: {
          status: result.status,
          intelCollected: result.intelCollected,
          operationsPerformed: result.operationsPerformed,
          toolsUsed: result.toolsUsed || [],
          processingStages: result.processingStages
        },
        metrics: {
          qualityScore: result.qualityScore,
          confidenceLevel: result.confidenceLevel,
          duration: result.duration,
          rawDataGenerated: result.rawDataGenerated
        },
        metadata: baseMetadata
      },
      tags: ['netrunner', 'mission-report', 'bot-mission'],
      qualityAssessment: {
        sourceQuality: 'verified',
        visibility: 'public',
        sensitivity: 'open'
      }
    };
    intel.push(summaryIntel);

    return intel;
  }

  /**
   * Execute an enhanced mission for Phase 1 with Phase 2 preparation
   */
  async executeEnhancedMission(
    bot: OsintBot, 
    target: string, 
    missionType: 'reconnaissance' | 'monitoring' | 'assessment' | 'deep-analysis' = 'reconnaissance',
    config?: Partial<MissionConfiguration>
  ): Promise<EnhancedMissionResult> {
    const missionConfig = { ...this.defaultConfig, ...config };
    const missionId = `mission-${Date.now()}-${bot.id}`;
    const startTime = Date.now();
    
    log.info(`🚀 Enhanced Mission: Bot ${bot.name} starting ${missionType} on target: ${target}`);
    log.info(`📋 Mission Config:`, missionConfig);

    this.runningMissions.add(bot.id);
    try {
      // Phase 1 Enhanced Pipeline
      const processingStages: string[] = [];
      
      // Stage 1: Tool Selection & Validation
      processingStages.push('tool-selection');
      const allTools = await this.enhancedToolSelection(bot, target, missionType);
      const tools = allTools.slice(0, missionConfig.maxToolsPerMission);
      log.info(`🔧 Enhanced tool selection: ${tools.length} specialized tools (capped from ${allTools.length})`);

      // Stage 2: Parallel Tool Execution (with mission-level timeout)
      processingStages.push('tool-execution');
      const elapsed = Date.now() - startTime;
      const remainingBudget = Math.max(0, missionConfig.maxMissionDuration - elapsed);
      const toolResults = await Promise.race([
        this.executeToolsInParallel(bot, target, tools, missionConfig),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Mission duration limit exceeded')), remainingBudget)
        )
      ]);
      log.info(`⚡ Parallel execution completed: ${toolResults.length} results`);

      // Stage 3: Specialized Intelligence Processing
      processingStages.push('intelligence-processing');
      const specializedFindings = await this.processSpecializedIntelligence(bot, toolResults, target);
      log.info(`🧠 Specialized processing completed: ${Object.keys(specializedFindings).length} finding types`);

      // Stage 4: Quality Assessment & Validation
      processingStages.push('quality-assessment');
      const qualityMetrics = await this.assessIntelligenceQuality(specializedFindings, toolResults);
      log.info(`📊 Quality assessment: ${qualityMetrics.overallScore}% confidence`);

      // Stage 5: Phase 2 Preparation
      processingStages.push('phase2-preparation');
      const phase2Data = await this.preparePhase2Data(specializedFindings, toolResults, bot);
      log.info(`🔮 Phase 2 preparation: ${phase2Data.correlationOpportunities.length} correlation opportunities`);

      // Compile Enhanced Results
      const duration = Date.now() - startTime;
      // True if any tool's response came from a mock fallback rather than a
      // real API call (ShodanAdapter/CensysAdapter/VirusTotalAdapter all tag
      // their mock responses this way). Surfaced to the operative via
      // BotRosterService.getBotCurrentActivity() — findings shouldn't look
      // indistinguishable from real ones.
      const mockDataFrom = toolResults
        .filter(r => r.data && (r.data as Record<string, unknown>)._isMockData === true)
        .map(r => r.tool);
      const usedMockData = mockDataFrom.length > 0;
      const result: EnhancedMissionResult = {
        missionId,
        botId: bot.id,
        target,
        status: qualityMetrics.overallScore >= missionConfig.qualityThreshold ? 'success' : 'partial',
        intelCollected: this.calculateIntelCount(specializedFindings),
        operationsPerformed: toolResults.map(r => r.operation),
        duration,
        completedAt: Date.now(),
        errors: toolResults.filter(r => r.error).map(r => r.error!),
        usedMockData,
        mockDataFrom,
        // Enhanced metrics
        qualityScore: qualityMetrics.overallScore,
        confidenceLevel: qualityMetrics.confidenceLevel,
        specializedFindings,
        toolsUsed: tools,
        processingStages,
        // Phase 2 data
        rawDataGenerated: toolResults.length,
        observationsCreated: phase2Data.observationsCreated,
        correlationOpportunities: phase2Data.correlationOpportunities,
        suggestedNextActions: phase2Data.suggestedNextActions
      };

      // Store mission history for Phase 2 correlation
      this.storeMissionHistory(bot.id, result);

      // Update enhanced metrics
      this.updateEnhancedMetrics(bot.id, result);

      // Persist durably — the in-memory history above is capped at 10 missions
      // per bot for runtime efficiency; the full record survives here instead.
      saveMissionResult(result).catch(error =>
        log.error(`[BotMissionExecutor] Failed to persist mission ${result.missionId}:`, error)
      );

      // Transform and store Intel (NetRunner Phase 1 Integration)
      // NOTE: This is a separate, raw-signal tier (Intel[] via storageOrchestrator) — not a
      // second Intel Report path. Curated reports go through OsintIntelBridge.convertAndStoreIntelReport
      // (called from BotCard.tsx on mission completion), which writes to the canonical
      // intelReportService/IntelWorkspaceManager. This block feeds analyst tooling like
      // WebsiteScanner, and is independent of whether a report was created for this mission.
      try {
        // Feature flag guard: ensure experimental Intel storage can be merged safely while disabled
        if (isNetRunnerIntelEnabled()) {
          logIntelFlagContext('BotMissionExecutor.executeEnhancedMission: storing mission Intel');
          const intelObjects = this.transformMissionToIntel(result);
          await storageOrchestrator.batchStoreIntel(intelObjects);
          log.info(`📊 Intel Storage: Stored ${intelObjects.length} Intel objects from mission ${missionId}`);
        } else {
          // Inert path: still build intel objects count lazily if desired later (skip now for perf)
          // NOTE: If future analysis needs counts while disabled, compute here without storing.
        }
      } catch (storageError) {
        log.error(`⚠️ Intel Storage Warning (flag may be enabled): Failed to store Intel for mission ${missionId}:`, storageError);
        // Do not fail mission due to experimental storage issue.
      }

      log.info(`✅ Enhanced Mission ${missionId} completed: ${result.status} (${duration}ms)`);
      log.info(`📈 Intelligence Quality: ${result.qualityScore}% | Confidence: ${result.confidenceLevel}%`);
      
      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      log.error(`❌ Enhanced Mission ${missionId} failed:`, errorMessage);

      const failureResult: EnhancedMissionResult = {
        missionId,
        botId: bot.id,
        target,
        status: 'failed',
        intelCollected: 0,
        operationsPerformed: [],
        duration,
        completedAt: Date.now(),
        errors: [errorMessage],
        usedMockData: false,
        qualityScore: 0,
        confidenceLevel: 0,
        specializedFindings: {},
        toolsUsed: [],
        processingStages: ['initialization'],
        rawDataGenerated: 0,
        observationsCreated: 0,
        correlationOpportunities: [],
        suggestedNextActions: ['Review target validity', 'Check bot configuration']
      };

      // A failed mission is exactly as real as a successful one — it must
      // leave the same trace. Before this, a mission that threw vanished
      // entirely: no history entry, no effect on "Missions: N" or success
      // rate, nothing persisted. Now that #01/#02 mean real tools actually
      // run, real failures (timeouts, bad targets) will actually happen.
      this.storeMissionHistory(bot.id, failureResult);
      this.updateEnhancedMetrics(bot.id, failureResult);
      saveMissionResult(failureResult).catch(persistError =>
        log.error(`[BotMissionExecutor] Failed to persist mission ${failureResult.missionId}:`, persistError)
      );

      return failureResult;
    } finally {
      this.runningMissions.delete(bot.id);
    }
  }

  /**
   * Backward compatibility method for simple missions
   */
  async executeSimpleMission(
    bot: OsintBot, 
    target: string, 
    missionType: 'reconnaissance' | 'monitoring' | 'assessment' = 'reconnaissance'
  ): Promise<EnhancedMissionResult> {
    return this.executeEnhancedMission(bot, target, missionType);
  }

  /**
   * Enhanced tool selection — queries AdapterRegistry for available tools
   * and filters by bot specialization relevance.
   */
  private async enhancedToolSelection(
    bot: OsintBot, 
    _target: string, 
    missionType: string
  ): Promise<string[]> {
    const specialization = bot.specializations[0] || 'identity';

    // Matched by schema name against the registered adapters; see toolsForSpecialization.
    const candidateNames = toolNamesFor(specialization);

    // Filter to only adapters actually registered in AdapterRegistry
    const availableAdapters = getAllAdapters();
    const adapterByName = new Map(availableAdapters.map(a => [a.getToolSchema().name, a.getToolId()]));
    
    const availableToolIds = candidateNames
      .map(name => adapterByName.get(name))
      .filter((id): id is string => id !== undefined && hasAdapter(id));

    // For deep-analysis missions, include ALL available adapters
    if (missionType === 'deep-analysis') {
      for (const adapter of availableAdapters) {
        const id = adapter.getToolId();
        if (!availableToolIds.includes(id)) {
          availableToolIds.push(id);
        }
      }
    }

    // For monitoring missions, limit to first 2
    if (missionType === 'monitoring') {
      return availableToolIds.slice(0, 2);
    }

    return availableToolIds;
  }

  /**
   * Execute tools in parallel with proper error handling
   */
  private async executeToolsInParallel(
    bot: OsintBot, 
    target: string, 
    tools: string[], 
    config: MissionConfiguration
  ): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    
    // Execute tools with concurrency limit
    const chunks = this.chunkArray(tools, config.maxConcurrentTools);
    
    for (const toolChunk of chunks) {
      const chunkPromises = toolChunk.map(tool => 
        this.executeSingleTool(tool, target, bot, config.timeoutPerTool)
      );
      
      const chunkResults = await Promise.allSettled(chunkPromises);
      
      chunkResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            tool: toolChunk[index],
            operation: `Failed ${toolChunk[index]}`,
            data: null,
            duration: 0,
            success: false,
            error: result.reason?.message || 'Unknown error'
          });
        }
      });
    }

    return results;
  }

  /**
   * Execute a single tool via AdapterRegistry with timeout and error handling
   */
  private async executeSingleTool(
    toolId: string,
    target: string,
    bot: OsintBot,
    timeout: number
  ): Promise<ToolResult> {
    const startTime = Date.now();

    const adapter = getAdapter(toolId);
    if (!adapter) {
      return {
        tool: toolId,
        operation: `${toolId} on ${target}`,
        data: null,
        duration: Date.now() - startTime,
        success: false,
        error: `Tool not available: no adapter registered for "${toolId}"`
      };
    }

    const toolName = adapter.getToolSchema().name;
    const operation = `${toolName} on ${target}`;

    // Not run, and said so, when it could answer only with sample data.
    const refusal = couldNotLook(adapter);
    if (refusal) {
      return { tool: toolName, operation, data: null, duration: Date.now() - startTime, success: false, error: refusal };
    }

    try {
      const parameters = toolParametersFor(toolName, toolId, target, bot.specializations[0] || 'identity');

      const request: ToolExecutionRequest = {
        toolId,
        parameters,
        requestId: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now()
      };

      // Execute with timeout
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Tool execution timed out after ${timeout}ms`)), timeout)
      );

      const response = await Promise.race([
        adapter.execute(request),
        timeoutPromise
      ]);

      return {
        tool: toolName,
        operation,
        data: response.status === 'success' ? (response.data as Record<string, unknown>) : null,
        duration: Date.now() - startTime,
        success: response.status === 'success',
        error: response.error
      };
    } catch (error) {
      return {
        tool: toolName,
        operation,
        data: null,
        duration: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed'
      };
    }
  }

  /**
   * Process specialized intelligence based on bot type
   */
  private async processSpecializedIntelligence(
    bot: OsintBot, 
    toolResults: ToolResult[], 
    target: string
  ): Promise<Record<string, unknown>> {
    const specialization = bot.specializations[0] || 'identity';
    const findings: Record<string, unknown> = {};

    // Process results based on specialization
    switch (specialization) {
      case 'network':
        findings.networkAssets = this.extractNetworkAssets(toolResults);
        findings.ports = this.extractPorts(toolResults);
        findings.services = this.extractServices(toolResults);
        break;
      
      case 'social':
        findings.socialProfiles = this.extractSocialProfiles(toolResults);
        findings.connections = this.extractConnections(toolResults);
        findings.activities = this.extractActivities(toolResults);
        break;
      
      case 'vulnerability':
        findings.vulnerabilities = this.extractVulnerabilities(toolResults);
        findings.exploits = this.extractExploits(toolResults);
        findings.riskScore = this.calculateRiskScore(toolResults);
        break;
      
      case 'threat':
        findings.indicators = this.extractThreatIndicators(toolResults);
        findings.actors = this.extractThreatActors(toolResults);
        findings.campaigns = this.extractCampaigns(toolResults);
        break;
      
      default:
        findings.generalIntel = this.extractGeneralIntel(toolResults);
        findings.metadata = this.extractMetadata(toolResults);
    }

    // Add common findings
    findings.confidence = this.calculateConfidence(toolResults);
    findings.completeness = this.calculateCompleteness(toolResults);
    findings.timestamp = Date.now();
    findings.target = target;
    findings.botId = bot.id;

    return findings;
  }

  /**
   * Assess intelligence quality and generate metrics
   */
  private async assessIntelligenceQuality(
    findings: Record<string, unknown>, 
    toolResults: ToolResult[]
  ): Promise<QualityMetrics> {
    const successfulTools = toolResults.filter(r => r.success).length;
    const totalTools = toolResults.length;
    
    const dataCompleteness = totalTools > 0 ? (successfulTools / totalTools) * 100 : 0;
    const sourceReliability = this.calculateSourceReliability(toolResults);    const confidence = typeof findings.confidence === 'number' ? findings.confidence : 70;
    const overallScore = (dataCompleteness + sourceReliability + confidence) / 3;

    return {
      overallScore: Math.round(overallScore),
      confidenceLevel: Math.round(confidence),
      dataCompleteness: Math.round(dataCompleteness),
      sourceReliability: Math.round(sourceReliability)
    };
  }

  /**
   * Prepare data for Phase 2 processing
   */
  private async preparePhase2Data(
    findings: Record<string, unknown>, 
    toolResults: ToolResult[], 
    _bot: OsintBot
  ): Promise<Phase2PrepData> {
    const observationsCreated = Object.keys(findings).length;
    
    // Identify correlation opportunities
    const correlationOpportunities: string[] = [];
    if (findings.networkAssets) correlationOpportunities.push('Network Asset Correlation');
    if (findings.socialProfiles) correlationOpportunities.push('Social Network Analysis');
    if (findings.vulnerabilities) correlationOpportunities.push('Risk Assessment Correlation');
    if (findings.indicators) correlationOpportunities.push('Threat Intelligence Correlation');
    
    // Generate next action suggestions
    const suggestedNextActions: string[] = [];
    const confidence = typeof findings.confidence === 'number' ? findings.confidence : 70;
    if (confidence < 80) suggestedNextActions.push('Deploy additional verification bots');
    if (toolResults.some(r => !r.success)) suggestedNextActions.push('Retry failed tools with different parameters');
    if (correlationOpportunities.length > 1) suggestedNextActions.push('Initialize cross-domain correlation analysis');
    
    return {
      observationsCreated,
      correlationOpportunities,
      suggestedNextActions
    };
  }

  // Helper methods for data processing
  private calculateIntelCount(findings: Record<string, unknown>): number {
    return Object.values(findings).reduce<number>((count, value) => {
      if (Array.isArray(value)) return count + value.length;
      if (typeof value === 'object' && value !== null) return count + Object.keys(value).length;
      return count + 1;
    }, 0);
  }

  private storeMissionHistory(botId: string, result: EnhancedMissionResult): void {
    if (!this.missionHistory.has(botId)) {
      this.missionHistory.set(botId, []);
    }
    const history = this.missionHistory.get(botId)!;
    history.push(result);
    
    // Keep only last 10 missions for memory efficiency
    if (history.length > 10) {
      history.shift();
    }
  }

  private updateEnhancedMetrics(botId: string, result: EnhancedMissionResult): void {
    const currentMetrics = this.executionMetrics.get(botId) || {
      totalMissions: 0,
      successfulMissions: 0,
      averageQuality: 0,
      averageConfidence: 0,
      totalIntelGenerated: 0
    };

    currentMetrics.totalMissions += 1;
    if (result.status === 'success') currentMetrics.successfulMissions += 1;
    currentMetrics.averageQuality = (currentMetrics.averageQuality + result.qualityScore) / 2;
    currentMetrics.averageConfidence = (currentMetrics.averageConfidence + result.confidenceLevel) / 2;
    currentMetrics.totalIntelGenerated += result.intelCollected;

    this.executionMetrics.set(botId, currentMetrics);
  }

  // Utility methods
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Data extraction methods — parse real adapter response data
  private extractNetworkAssets(results: ToolResult[]): string[] {
    return results
      .flatMap(r => {
        if (!r.data) return [];
        // Shodan host results contain ip_str, hostnames
        const entries: string[] = [];
        if (typeof r.data.ip_str === 'string') entries.push(r.data.ip_str);
        if (Array.isArray(r.data.hostnames)) entries.push(...r.data.hostnames.filter((h: unknown): h is string => typeof h === 'string'));
        // Generic findings array
        const findings = r.data.findings;
        if (Array.isArray(findings)) entries.push(...findings.filter((f: unknown): f is string => typeof f === 'string'));
        return entries;
      })
      .filter((v, i, a) => a.indexOf(v) === i); // dedupe
  }

  private extractPorts(results: ToolResult[]): number[] {
    return results
      .flatMap(r => {
        if (!r.data) return [];
        // Shodan results include ports array
        if (Array.isArray(r.data.ports)) return r.data.ports.filter((p: unknown): p is number => typeof p === 'number');
        // Look in matches array for port fields
        if (Array.isArray(r.data.matches)) {
          return (r.data.matches as Array<Record<string, unknown>>)
            .map(m => m.port)
            .filter((p: unknown): p is number => typeof p === 'number');
        }
        return [];
      })
      .filter((v, i, a) => a.indexOf(v) === i); // dedupe
  }

  private extractServices(results: ToolResult[]): string[] {
    return results
      .flatMap(r => {
        if (!r.data) return [];
        if (Array.isArray(r.data.matches)) {
          return (r.data.matches as Array<Record<string, unknown>>)
            .map(m => m.product || m.transport)
            .filter((s: unknown): s is string => typeof s === 'string');
        }
        return [];
      })
      .filter((v, i, a) => a.indexOf(v) === i);
  }

  private extractSocialProfiles(results: ToolResult[]): string[] {
    return results
      .flatMap(r => {
        if (!r.data) return [];
        if (Array.isArray(r.data.emails)) return r.data.emails.filter((e: unknown): e is string => typeof e === 'string');
        const findings = r.data.findings;
        if (Array.isArray(findings)) return findings.filter((f: unknown): f is string => typeof f === 'string');
        return [];
      })
      .filter((v, i, a) => a.indexOf(v) === i);
  }

  private extractConnections(results: ToolResult[]): string[] {
    return results
      .flatMap(r => {
        if (!r.data) return [];
        if (Array.isArray(r.data.subdomains)) return r.data.subdomains.filter((s: unknown): s is string => typeof s === 'string');
        if (Array.isArray(r.data.connections)) return r.data.connections.filter((c: unknown): c is string => typeof c === 'string');
        return [];
      });
  }

  private extractActivities(results: ToolResult[]): string[] {
    return results
      .flatMap(r => {
        if (!r.data) return [];
        if (Array.isArray(r.data.activities)) return r.data.activities.filter((a: unknown): a is string => typeof a === 'string');
        return [];
      });
  }

  private extractVulnerabilities(results: ToolResult[]): string[] {
    return results
      .flatMap(r => {
        if (!r.data) return [];
        // Shodan results may contain vulns in matches
        if (Array.isArray(r.data.matches)) {
          return (r.data.matches as Array<Record<string, unknown>>)
            .flatMap(m => {
              if (Array.isArray(m.vulns)) return m.vulns;
              if (m.vulns && typeof m.vulns === 'object') return Object.keys(m.vulns);
              return [];
            })
            .filter((v: unknown): v is string => typeof v === 'string');
        }
        if (Array.isArray(r.data.vulnerabilities)) return r.data.vulnerabilities.filter((v: unknown): v is string => typeof v === 'string');
        return [];
      })
      .filter((v, i, a) => a.indexOf(v) === i);
  }

  private extractExploits(results: ToolResult[]): string[] {
    return results
      .flatMap(r => {
        if (!r.data) return [];
        if (Array.isArray(r.data.exploits)) return r.data.exploits.filter((e: unknown): e is string => typeof e === 'string');
        return [];
      });
  }

  private calculateRiskScore(results: ToolResult[]): number {
    const vulns = this.extractVulnerabilities(results);
    const ports = this.extractPorts(results);
    // Base score: 30 points, +10 per vuln (max 50), +2 per open port (max 20)
    const vulnScore = Math.min(vulns.length * 10, 50);
    const portScore = Math.min(ports.length * 2, 20);
    return Math.min(30 + vulnScore + portScore, 100);
  }

  private extractThreatIndicators(results: ToolResult[]): string[] {
    return results
      .flatMap(r => {
        if (!r.data) return [];
        if (Array.isArray(r.data.indicators)) return r.data.indicators.filter((i: unknown): i is string => typeof i === 'string');
        // Vulns and IPs count as IOCs
        const iocs: string[] = [];
        if (typeof r.data.ip_str === 'string') iocs.push(`ip:${r.data.ip_str}`);
        const vulns = this.extractVulnerabilities([r]);
        iocs.push(...vulns.map(v => `cve:${v}`));
        return iocs;
      })
      .filter((v, i, a) => a.indexOf(v) === i);
  }

  private extractThreatActors(results: ToolResult[]): string[] {
    return results
      .flatMap(r => {
        if (!r.data) return [];
        if (Array.isArray(r.data.actors)) return r.data.actors.filter((a: unknown): a is string => typeof a === 'string');
        return [];
      });
  }

  private extractCampaigns(results: ToolResult[]): string[] {
    return results
      .flatMap(r => {
        if (!r.data) return [];
        if (Array.isArray(r.data.campaigns)) return r.data.campaigns.filter((c: unknown): c is string => typeof c === 'string');
        return [];
      });
  }

  private extractGeneralIntel(results: ToolResult[]): string[] {
    return results
      .flatMap(r => {
        if (!r.data) return [];
        const findings = r.data.findings;
        if (Array.isArray(findings)) return findings.filter((f: unknown): f is string => typeof f === 'string');
        // Stringify any data keys as intel
        return Object.entries(r.data)
          .filter(([k]) => !['timestamp', 'metadata', 'tool_version'].includes(k))
          .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
          .slice(0, 5);
      });
  }

  private extractMetadata(results: ToolResult[]): Record<string, unknown> {
    return {
      totalResults: results.length,
      successfulOperations: results.filter(r => r.success).length,
      processingTime: results.reduce((sum, r) => sum + r.duration, 0)
    };
  }

  private calculateConfidence(results: ToolResult[]): number {
    if (results.length === 0) return 0;
    const successRate = results.filter(r => r.success).length / results.length;
    // More data = higher confidence, with diminishing returns
    const dataBonus = Math.min(results.filter(r => r.data !== null).length * 5, 20);
    return Math.min(Math.floor(successRate * 80 + dataBonus), 100);
  }

  private calculateCompleteness(results: ToolResult[]): number {
    if (results.length === 0) return 0;
    const successCount = results.filter(r => r.success).length;
    const dataCount = results.filter(r => r.data !== null).length;
    return Math.floor(((successCount + dataCount) / (results.length * 2)) * 100);
  }

  private calculateSourceReliability(results: ToolResult[]): number {
    if (results.length === 0) return 0;
    const successRate = results.filter(r => r.success).length / results.length;
    // Tools that returned data are more reliable than those that only "succeeded"
    const dataRate = results.filter(r => r.data !== null).length / results.length;
    return Math.floor(((successRate + dataRate) / 2) * 100);
  }

  /**
   * Get enhanced bot metrics for display
   */
  getBotMetrics(botId: string): Record<string, number> {
    return this.executionMetrics.get(botId) || {
      totalMissions: 0,
      successfulMissions: 0,
      averageQuality: 0,
      averageConfidence: 0,
      totalIntelGenerated: 0
    };
  }

  /**
   * Get mission history for correlation analysis
   */
  getMissionHistory(botId: string): EnhancedMissionResult[] {
    return this.missionHistory.get(botId) || [];
  }

  /** Whether this bot has a mission currently in flight. */
  isRunning(botId: string): boolean {
    return this.runningMissions.has(botId);
  }

  /**
   * Publish BotIntelOutput reports via centralized intelReportService and attach canonical linkage.
   * This is a thin proxy over publishBotIntelOutput to keep mission-related automation localized
   * to the executor while NetRunner migrates to Phase 3 shared services.
   *
   * Contract:
   * - Input: BotIntelOutput (may or may not contain reports array)
   * - Behavior: If reports exist, convert & publish each; mutate output to include publishedReports & publishedAt
   * - Output: Array<IntelReportUI> created (empty if no reports)
   *
   * NOTE: no live caller currently constructs a BotIntelOutput — the bot-mission flow wired to
   * BotCard.tsx returns EnhancedMissionResult and goes through
   * OsintIntelBridge.convertAndStoreIntelReport instead, which is the active path. This method
   * is left in place (architecturally correct target) for a future producer that builds a real
   * BotIntelOutput, but don't assume it's currently reachable from the UI.
   */
  async publishMissionOutput(output: import('../types/BotMission').BotIntelOutput, authorDisplayName?: string) {
    // Lazy import to avoid circular dependency and large bundle impact when publishing isn't used.
    const { publishBotIntelOutput } = await import('../models/IntelReport');
    try {
      const created = await publishBotIntelOutput(output, authorDisplayName);
      return created;
    } catch (err) {
      log.error('BotMissionExecutor.publishMissionOutput failed:', err);
      return [];
    }
  }
}

/**
 * Shared singleton — callers must use this instead of `new BotMissionExecutor()`
 * so mission history and running-state persist across calls (matches the
 * ipfsService/nostrService/intelReportService singleton pattern used
 * elsewhere in this codebase).
 */
export const botMissionExecutor = new BotMissionExecutor();

/**
 * OsintIntelBridge.ts
 * 
 * Converts OSINT mission results (EnhancedMissionResult) into
 * IntelReportData objects suitable for the Intel Workspace,
 * and optionally exports to IPFS and Nostr.
 * 
 * Pipeline:  BotMissionExecutor → OsintIntelBridge → IntelWorkspaceManager / IPFS / Nostr
 */

import { v4 as uuidv4 } from 'uuid';
import type { EnhancedMissionResult } from '../execution/BotMissionExecutor';
import type { IntelReportData } from '../../../types/IntelWorkspace';
import type { CreateIntelReportInput, IntelReportUI } from '../../../types/intel/IntelReportUI';
import { intelReportService } from '../../../services/intel/IntelReportService';

/**
 * Thrown instead of converting a mission whose tools answered with sample data.
 *
 * Censys answers with samples when no credentials of the person's own are set,
 * and VirusTotal always does, so the tools can be explored. A sample is not
 * collection: filed as an Intel Report, or published, a sample host reads as a
 * finding about the target.
 */
export class SampleDataRefusedError extends Error {
  constructor(readonly tools: string[]) {
    const who = tools.length === 0
      ? 'A tool'
      : tools.length === 1 ? tools[0] : `${tools.slice(0, -1).join(', ')} and ${tools[tools.length - 1]}`;
    super(`${who} returned sample data, not collection, so no Intel Report was made from it`);
    this.name = 'SampleDataRefusedError';
  }
}

/**
 * When what the tools found held: the mission's collection window, from when its
 * tools started to when they finished (decision D-E). The tools read the target's
 * state inside that window, so it is the event time of the report, known to the
 * second. A report carried only the time it was written.
 *
 * A result without a readable finish or duration gets no event time, rather than
 * one made up from now.
 */
export function missionCollectionWindow(
  result: EnhancedMissionResult
): { startDate?: Date; endDate?: Date; timePrecisionMs?: number } {
  const { completedAt, duration } = result;
  if (!Number.isFinite(completedAt) || !Number.isFinite(duration) || duration < 0) return {};
  return { startDate: new Date(completedAt - duration), endDate: new Date(completedAt), timePrecisionMs: 1000 };
}

function refuseSampleData(result: EnhancedMissionResult): void {
  if (result.usedMockData) {
    throw new SampleDataRefusedError(result.mockDataFrom ?? []);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert an OSINT mission result into an IntelReportData and persist it
 * in the Intel Workspace.  Returns the created report (with id).
 */
export function convertMissionToIntelReport(
  result: EnhancedMissionResult
): IntelReportData {
  refuseSampleData(result);
  const now = new Date();
  const collected = missionCollectionWindow(result);

  const report: IntelReportData = {
    id: `osint-${result.missionId}-${uuidv4().slice(0, 8)}`,
    title: `OSINT Report: ${result.target}`,
    type: 'OSINT_ANALYSIS',

    summary: buildSummary(result),
    content: buildContent(result),
    conclusions: buildConclusions(result),
    recommendations: result.suggestedNextActions ?? [],

    analysisType: 'automated-osint',
    methodology: result.toolsUsed.map(t => `NetRunner adapter: ${t}`),
    confidence: confidence01(result),
    // No severity: a scan's quality score says how good the scan was, not how
    // serious the matter is. A person assesses that (plan item 1.9).

    sourceIntel: [], // Will be populated if raw Intel was stored first
    author: `netrunner-bot-${result.botId}`,
    contributors: [],

    createdAt: now.toISOString(),
    modifiedAt: now.toISOString(),

    targetAudience: ['analyst', 'operator'],
    metadata: {
      generator: 'OsintIntelBridge',
      missionId: result.missionId,
      botId: result.botId,
      target: result.target,
      durationMs: result.duration,
      qualityScore: result.qualityScore,
      status: result.status,
      toolsUsed: result.toolsUsed,
      // Where the workspace keeps a report's event time (see reportMappers).
      ...(collected.startDate
        ? {
            startDate: collected.startDate.toISOString(),
            endDate: collected.endDate?.toISOString(),
            timePrecisionMs: collected.timePrecisionMs,
          }
        : {})
    }
  };

  return report;
}

/**
 * Convert an OSINT mission result into a CreateIntelReportInput, ready for the
 * canonical intelReportService entry point (the same one every other report
 * producer in the app uses).
 */
export function convertMissionToCreateIntelReportInput(
  result: EnhancedMissionResult
): CreateIntelReportInput {
  refuseSampleData(result);
  return {
    title: `OSINT Report: ${result.target}`,
    content: buildContent(result),
    summary: buildSummary(result),
    category: 'OSINT_ANALYSIS',
    tags: ['osint', 'netrunner', ...result.toolsUsed],
    conclusions: buildConclusions(result),
    recommendations: result.suggestedNextActions ?? [],
    methodology: result.toolsUsed.map(t => `NetRunner adapter: ${t}`),
    confidence: confidence01(result),
    // No severity, for the reason given above.
    targetAudience: ['analyst', 'operator'],
    ...missionCollectionWindow(result),
    extra: {
      generator: 'OsintIntelBridge',
      missionId: result.missionId,
      botId: result.botId,
      target: result.target,
      durationMs: result.duration,
      qualityScore: result.qualityScore,
      status: result.status,
      toolsUsed: result.toolsUsed
    }
  };
}

/**
 * Convert and immediately persist via the canonical intelReportService, so the
 * report reaches the same shared IntelWorkspaceManager singleton (and its live
 * subscribers, e.g. IntelDashboard) as every other producer in the app.
 */
export async function convertAndStoreIntelReport(
  result: EnhancedMissionResult
): Promise<IntelReportUI> {
  const input = convertMissionToCreateIntelReportInput(result);
  return intelReportService.createReport(input, `netrunner-bot-${result.botId}`);
}

// ---------------------------------------------------------------------------
// IPFS Export
// ---------------------------------------------------------------------------

export interface OsintIpfsPackage {
  version: '1.0';
  missionId: string;
  target: string;
  createdAt: string;
  report: IntelReportData;
  rawFindings: Record<string, unknown>;
}

/**
 * Package an OSINT mission result and upload to IPFS.
 * Returns the CID (content identifier) string.
 */
/**
 * The package a mission result is uploaded to IPFS as. Built apart from the
 * upload so the publish review can show it, and fingerprint the exact bytes,
 * before anything leaves (plan item 0.1).
 */
export function buildOsintIpfsPackage(result: EnhancedMissionResult): OsintIpfsPackage {
  return {
    version: '1.0',
    missionId: result.missionId,
    target: result.target,
    createdAt: new Date().toISOString(),
    report: convertMissionToIntelReport(result),
    rawFindings: result.specializedFindings
  };
}

/** Upload a built package, as JSON, and return its CID. */
export async function uploadOsintPackage(pkg: OsintIpfsPackage): Promise<string> {
  const { uploadToIPFS } = await import('../../../lib/ipfs-client');
  return uploadToIPFS(JSON.stringify(pkg));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Cross a unit seam, once and by name.
 *
 * BotMissionExecutor reports confidence on a 0-100 scale — assessIntelligenceQuality
 * averages it with dataCompleteness, which is explicitly `(successful/total) * 100`,
 * and defaults it to 70. Every consumer of a report's `confidence` on the other side
 * of this bridge reads 0-1 and renders `confidence * 100`: IntelWorkspaceConsole,
 * IntelAnalyzer's InspectorPanel/TableView/EventDetails, OSINT's TimelinePanel.
 *
 * Passing the executor's number through unchanged put 70 in a field read as 0.7, so
 * every report NetRunner has produced displayed "7000% conf". The conversion belongs
 * here because this function is the seam: it is the only place the two scales meet.
 */
function confidence01(r: EnhancedMissionResult): number {
  return r.confidenceLevel / 100;
}

function buildSummary(r: EnhancedMissionResult): string {
  const status = r.status === 'success' ? 'completed successfully' :
                 r.status === 'partial' ? 'partially completed' : 'failed';
  const toolList = r.toolsUsed.length > 0
    ? r.toolsUsed.join(', ')
    : 'none';
  return (
    `Automated OSINT scan of ${r.target} ${status} in ${(r.duration / 1000).toFixed(1)}s. ` +
    `Tools used: ${toolList}. ` +
    `Quality score: ${r.qualityScore}/100, confidence: ${r.confidenceLevel.toFixed(0)}%. ` +
    `${r.intelCollected} intel items collected across ${r.processingStages.length} processing stages.`
  );
}

function buildContent(r: EnhancedMissionResult): string {
  const sections: string[] = [];

  sections.push(`# OSINT Analysis — ${r.target}\n`);
  sections.push(`**Mission ID:** ${r.missionId}`);
  sections.push(`**Status:** ${r.status}`);
  sections.push(`**Duration:** ${(r.duration / 1000).toFixed(1)}s`);
  sections.push(`**Quality:** ${r.qualityScore}/100 | **Confidence:** ${r.confidenceLevel.toFixed(0)}%\n`);

  // Specialized findings
  if (r.specializedFindings && Object.keys(r.specializedFindings).length > 0) {
    sections.push('## Specialized Findings\n');
    for (const [category, findings] of Object.entries(r.specializedFindings)) {
      sections.push(`### ${capitalize(category)}\n`);
      sections.push('```json');
      sections.push(JSON.stringify(findings, null, 2));
      sections.push('```\n');
    }
  }

  // Operations performed
  if (r.operationsPerformed.length > 0) {
    sections.push('## Operations Performed\n');
    for (const op of r.operationsPerformed) {
      sections.push(`- ${op}`);
    }
    sections.push('');
  }

  // Correlation opportunities
  if (r.correlationOpportunities.length > 0) {
    sections.push('## Correlation Opportunities\n');
    for (const opp of r.correlationOpportunities) {
      sections.push(`- ${opp}`);
    }
    sections.push('');
  }

  // Errors
  if (r.errors.length > 0) {
    sections.push('## Errors & Warnings\n');
    for (const err of r.errors) {
      sections.push(`- ⚠️ ${err}`);
    }
    sections.push('');
  }

  return sections.join('\n');
}

function buildConclusions(r: EnhancedMissionResult): string[] {
  const conclusions: string[] = [];

  if (r.status === 'success') {
    conclusions.push(
      `Target ${r.target} was successfully profiled using ${r.toolsUsed.length} OSINT tool(s).`
    );
  } else if (r.status === 'partial') {
    conclusions.push(
      `Partial results obtained for ${r.target}. ${r.errors.length} tool(s) encountered issues.`
    );
  } else {
    conclusions.push(`Scan of ${r.target} failed. Manual review recommended.`);
  }

  if (r.intelCollected > 0) {
    conclusions.push(`${r.intelCollected} intelligence data points were collected.`);
  }

  if (r.correlationOpportunities.length > 0) {
    conclusions.push(
      `${r.correlationOpportunities.length} potential correlation(s) identified for further analysis.`
    );
  }

  return conclusions;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

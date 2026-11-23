/**
 * Whether something is sample material, or rests on some (plan item 0.9).
 *
 * A demo seed or a tutorial marks what it writes (`sample: true`); nothing a
 * person writes is marked. Sample material is never published, and neither
 * is anything that rests on it: a real case whose only evidence is a demo
 * report concludes nothing about the world. One place answers the question,
 * so the case screen, the reviews and the evidence flags cannot differ.
 */
import { intelWorkspaceManager } from './IntelWorkspaceManager';
import type { IntelCaseUI } from '../../types/intel/IntelCaseUI';
import type { MissionUI } from '../../types/intel/MissionUI';
import type { PackageManifest } from '../exchange/types';
import { en } from '../../i18n/app/en';

/** The words for it, before the click and in the review alike. */
export const SAMPLE_REFUSAL = en.missions.sampleRefusal;

function isSampleReport(id: string): boolean {
  const report = intelWorkspaceManager.getReports().find((r) => r.id === id);
  return (report?.metadata as { sample?: boolean } | undefined)?.sample === true;
}

function sampleCase(id: string): IntelCaseUI | undefined {
  return intelWorkspaceManager.getCases().find((c) => c.id === id);
}

/** A case that is sample, or whose evidence is. */
export function caseRestsOnSample(record: { sample?: boolean; relatedEntities: string[] }): boolean {
  if (record.sample === true) return true;
  return record.relatedEntities.some((id) => isSampleReport(id) || sampleCase(id)?.sample === true);
}

/** A mission that is sample, or that rests on a sample report or case. */
export function missionRestsOnSample(mission: Pick<MissionUI, 'sample' | 'relatedReports' | 'relatedCases'>): boolean {
  if (mission.sample === true) return true;
  if (mission.relatedReports.some(isSampleReport)) return true;
  return mission.relatedCases.some((id) => {
    const linked = sampleCase(id);
    return linked !== undefined && caseRestsOnSample(linked);
  });
}

/**
 * Asks once the workspace has loaded. A review is a gate, and must not skip
 * the question because the workspace had not been read yet; a screen asks
 * the plain helpers, since it shows records only after they have loaded.
 */
export async function onceLoaded<T>(question: () => T): Promise<T> {
  await intelWorkspaceManager.ensureInitialized();
  return question();
}

/** An Exchange package holding a sample report. */
export function manifestHoldsSample(manifest: Pick<PackageManifest, 'reports'>): boolean {
  return (manifest.reports ?? []).some((r) => isSampleReport(r.id));
}

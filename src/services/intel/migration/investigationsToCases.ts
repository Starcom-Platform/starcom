/**
 * One-time migration: the two legacy Investigation stores -> canonical Cases.
 *
 * "Investigation" and "Case" are the same concept, and the app accumulated
 * four separate implementations of it (see
 * docs/missions/00-current-state/investigations-and-cases.md). Two of those
 * four hold REAL local data for anyone who has used the app:
 *
 *   1. RealTimeTeamService's `starcom_investigations` (plain localStorage)
 *   2. CyberInvestigationStorage's `starcom_cyber_investigations`
 *      (secureStorage, the HUD Investigation Board's store)
 *
 * The other two are the canonical target (IntelCaseService, IndexedDB-backed
 * via IntelWorkspaceManager) and an external-server-backed detail view that
 * never worked without a companion service this repo doesn't ship.
 *
 * Rather than let that real data silently vanish behind a route redirect —
 * the shortcut the `/case-manager` retirement could take, because ITS data
 * was already confirmed fake — this migrates it for real.
 *
 * IDEMPOTENCY: every migrated case records its origin in
 * `metadata.migratedFrom` + `metadata.legacyId`. A second run reads existing
 * cases first and skips anything already carrying a matching marker, so
 * running this on every app start (or twice concurrently, or after a partial
 * failure) converges rather than duplicating. Deliberately does NOT delete
 * the source data: a migration that destroys its own input has no safe retry,
 * and these keys are small. Retiring them is a separate, later decision.
 */
import { intelCaseService } from '../IntelCaseService';
import { CaseStatus, CasePriority } from '../../../types/intel/IntelCaseUI';
import type { CyberInvestigation } from '../../../types/cyberInvestigation';
import { CyberInvestigationStorage } from '../../cyberInvestigationStorage';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'investigationsToCases' });

export type MigrationSource = 'realTimeTeamService' | 'cyberInvestigationStorage';

export interface MigrationResult {
  migrated: number;
  skipped: number;
  failed: number;
  /** Per-source counts, so a partial failure is attributable rather than a single opaque number. */
  bySource: Record<MigrationSource, { migrated: number; skipped: number; failed: number }>;
}

/**
 * CyberInvestigation's status vocabulary is incident-response shaped
 * (INITIATED/CONTAINING/RECOVERING/...); Case's is generic case-management
 * (NEW/OPEN/IN_PROGRESS/...). Mapped rather than dropped, so a migrated
 * record lands in a sensible column instead of defaulting everything to NEW.
 */
const STATUS_MAP: Record<CyberInvestigation['status'], CaseStatus> = {
  INITIATED: CaseStatus.NEW,
  INVESTIGATING: CaseStatus.IN_PROGRESS,
  ANALYZING: CaseStatus.IN_PROGRESS,
  CONTAINING: CaseStatus.IN_PROGRESS,
  RECOVERING: CaseStatus.PENDING,
  CLOSED: CaseStatus.CLOSED,
};

const PRIORITY_MAP: Record<CyberInvestigation['priority'], CasePriority> = {
  LOW: CasePriority.LOW,
  MEDIUM: CasePriority.MEDIUM,
  HIGH: CasePriority.HIGH,
  CRITICAL: CasePriority.CRITICAL,
};

/** Dates survive JSON round-trips as strings; both stores can hand back either. */
function toIso(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function readLegacyTeamServiceInvestigations(): CyberInvestigation[] {
  try {
    const raw = localStorage.getItem('starcom_investigations');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CyberInvestigation[]) : [];
  } catch (err) {
    log.warn('Could not read starcom_investigations — skipping that source', err);
    return [];
  }
}

async function readLegacyBoardInvestigations(): Promise<CyberInvestigation[]> {
  try {
    return await CyberInvestigationStorage.loadInvestigations();
  } catch (err) {
    log.warn('Could not read starcom_cyber_investigations — skipping that source', err);
    return [];
  }
}

/**
 * Fold an investigation's incident-response-specific fields into the case
 * description rather than dropping them — Case has no affectedSystems/IoCs/
 * recommendedActions equivalent, and silently losing them would make the
 * migrated record less useful than the original.
 */
function buildDescription(inv: CyberInvestigation): string {
  const sections: string[] = [inv.description || ''];

  if (inv.affectedSystems?.length) {
    sections.push(`\n\n**Affected systems:** ${inv.affectedSystems.join(', ')}`);
  }
  if (inv.ioCs?.length) {
    sections.push(`\n\n**Indicators of compromise:** ${inv.ioCs.length} recorded`);
  }
  if (inv.recommendedActions?.length) {
    sections.push(`\n\n**Recommended actions:**\n${inv.recommendedActions.map(a => `- ${a}`).join('\n')}`);
  }
  if (inv.executiveSummary) {
    sections.push(`\n\n**Executive summary:** ${inv.executiveSummary}`);
  }

  return sections.join('').trim();
}

async function migrateOne(
  inv: CyberInvestigation,
  source: MigrationSource,
  alreadyMigrated: Set<string>
): Promise<'migrated' | 'skipped' | 'failed'> {
  const key = `${source}:${inv.id}`;
  if (alreadyMigrated.has(key)) return 'skipped';

  try {
    await intelCaseService.createCase({
      title: inv.title || 'Untitled investigation',
      description: buildDescription(inv),
      status: STATUS_MAP[inv.status] ?? CaseStatus.NEW,
      priority: PRIORITY_MAP[inv.priority] ?? CasePriority.MEDIUM,
      /*
       * Carry the restriction forward, do not drop it.
       *
       * Stage 6 landed, so this is now a straight field-to-field carry rather
       * than the CONFIDENTIAL stand-in it used through the migration window.
       * The investigation's own axis moves across as itself, and `sensitivity`
       * fires the case's encryption at rest.
       *
       * Dropping the restriction instead was my first attempt, and it silently
       * broke the test asserting a restricted investigation lands as
       * ciphertext — exactly the kind of regression a label-only change is
       * supposed not to cause. That test is the reason this line exists.
       */
      visibility: inv.visibility,
      sensitivity: inv.visibility && inv.visibility !== 'public' ? 'protected' : undefined,
      assignedTo: inv.assignedTeam ? [inv.assignedTeam] : undefined,
      /*
       * The investigation's own author, carried across. Left unset, the case would be
       * credited to whoever opened the Cases screen — and, since an unstated author
       * ensures the current signing identity, opening that screen would have created a
       * key for someone who never asked for one. The person who reported it is who made
       * it; when that was never recorded, the case says so instead of guessing.
       */
      createdBy: inv.reportedBy?.trim() || 'unrecorded (migrated investigation)',
      startDate: toIso(inv.createdAt),
      closedDate: inv.status === 'CLOSED' ? toIso(inv.resolvedDate) : undefined,
      dueDate: toIso(inv.dueDate),
      tags: [inv.type, 'migrated-investigation'].filter(Boolean),
      metadata: {
        migratedFrom: source,
        legacyId: inv.id,
        migratedAt: new Date().toISOString(),
        // Preserved verbatim so nothing is unrecoverable if the folded-in
        // description above ever proves lossy for someone's real record.
        legacyType: inv.type,
        legacySeverity: inv.severity,
        legacyStatus: inv.status,
        legacyProgress: inv.progress,
        legacyReportedBy: inv.reportedBy,
        legacyAffectedSystems: inv.affectedSystems,
        legacyIoCCount: inv.ioCs?.length ?? 0,
      },
    });
    return 'migrated';
  } catch (err) {
    log.error(`Failed to migrate investigation ${inv.id} from ${source}`, err);
    return 'failed';
  }
}

/**
 * Run the migration. Safe to call repeatedly — see IDEMPOTENCY above.
 */
export async function migrateInvestigationsToCases(): Promise<MigrationResult> {
  const result: MigrationResult = {
    migrated: 0,
    skipped: 0,
    failed: 0,
    bySource: {
      realTimeTeamService: { migrated: 0, skipped: 0, failed: 0 },
      cyberInvestigationStorage: { migrated: 0, skipped: 0, failed: 0 },
    },
  };

  // Build the already-migrated set once, from the canonical store itself —
  // not from a separate "have I run yet?" flag, which would go stale the
  // moment a case is deleted or the flag is cleared independently.
  const existingCases = await intelCaseService.listCases();
  const alreadyMigrated = new Set<string>();
  for (const c of existingCases) {
    const from = c.metadata?.migratedFrom;
    const legacyId = c.metadata?.legacyId;
    if (typeof from === 'string' && typeof legacyId === 'string') {
      alreadyMigrated.add(`${from}:${legacyId}`);
    }
  }

  const sources: Array<{ source: MigrationSource; items: CyberInvestigation[] }> = [
    { source: 'realTimeTeamService', items: readLegacyTeamServiceInvestigations() },
    { source: 'cyberInvestigationStorage', items: await readLegacyBoardInvestigations() },
  ];

  for (const { source, items } of sources) {
    for (const inv of items) {
      if (!inv?.id) continue;
      const outcome = await migrateOne(inv, source, alreadyMigrated);
      result[outcome] += 1;
      result.bySource[source][outcome] += 1;
      if (outcome === 'migrated') alreadyMigrated.add(`${source}:${inv.id}`);
    }
  }

  if (result.migrated > 0 || result.failed > 0) {
    log.info('Investigation -> Case migration complete', result);
  }

  return result;
}

export default migrateInvestigationsToCases;

/**
 * The Investigation -> Case migration exists so consolidating four duplicate
 * Investigation/Case systems onto one canonical store doesn't silently
 * destroy real local data (see the module's own header, and
 * docs/missions/01-architecture-decisions/canonical-investigation-case-system.md).
 *
 * Idempotency is the property that actually matters: this may run on app
 * start, after a partial failure, or twice in a row, and must converge
 * rather than duplicate. Tested against the real IntelCaseService/
 * IntelWorkspaceManager (IndexedDB via fake-indexeddb), not mocks — the
 * whole point is that the data really lands in the canonical store.
 */
import 'fake-indexeddb/auto';
// jsdom has no crypto.subtle, which the CONFIDENTIAL+ encryption-at-rest path
// needs for AES-GCM — polyfilled locally from Node's real webcrypto, leaving
// jsdom's own getRandomValues untouched (same technique as
// IntelWorkspaceManager.classifiedEncryption.test.ts, which explains it fully).
import { webcrypto } from 'node:crypto';
if (typeof globalThis.crypto.subtle === 'undefined') {
  (globalThis.crypto as unknown as { subtle: typeof webcrypto.subtle }).subtle = webcrypto.subtle;
}
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { migrateInvestigationsToCases } from '../investigationsToCases';
import { intelCaseService } from '../../IntelCaseService';
import { CyberInvestigationStorage } from '../../../cyberInvestigationStorage';
import { CaseStatus, CasePriority } from '../../../../types/intel/IntelCaseUI';
import type { CyberInvestigation } from '../../../../types/cyberInvestigation';
import nostrService from '../../../nostrService';

function makeInvestigation(overrides: Partial<CyberInvestigation> = {}): CyberInvestigation {
  return {
    id: 'inv-1',
    title: 'Suspicious relay traffic',
    description: 'Anomalous outbound connections observed.',
    type: 'INCIDENT_RESPONSE',
    visibility: 'limited',
    priority: 'HIGH',
    severity: 'HIGH',
    incidentDate: new Date('2026-08-01T00:00:00Z'),
    detectedDate: new Date('2026-08-02T00:00:00Z'),
    reportedBy: 'analyst-1',
    assignedTeam: 'team-alpha',
    status: 'INVESTIGATING',
    progress: 40,
    affectedSystems: ['relay-node-1', 'gateway-2'],
    affectedUsers: [],
    estimatedImpact: 'HIGH',
    intelPackages: [],
    timeline: [],
    ioCs: [],
    evidence: [],
    collaboratingTeams: [],
    sharedWith: [],
    createdAt: new Date('2026-08-02T01:00:00Z'),
    updatedAt: new Date('2026-08-03T00:00:00Z'),
    recommendedActions: ['Rotate relay credentials', 'Audit gateway logs'],
    ...overrides,
  };
}

async function clearAllCases() {
  const existing = await intelCaseService.listCases();
  for (const c of existing) {
    await intelCaseService.deleteCase(c.id);
  }
}

describe('migrateInvestigationsToCases', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearAllCases();
    vi.spyOn(CyberInvestigationStorage, 'loadInvestigations').mockResolvedValue([]);
  });

  it('migrates a RealTimeTeamService investigation into a real canonical Case', async () => {
    localStorage.setItem('starcom_investigations', JSON.stringify([makeInvestigation()]));

    const result = await migrateInvestigationsToCases();

    expect(result.migrated).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.bySource.realTimeTeamService.migrated).toBe(1);

    const cases = await intelCaseService.listCases();
    expect(cases).toHaveLength(1);
    const migrated = cases[0];
    expect(migrated.title).toBe('Suspicious relay traffic');
    expect(migrated.status).toBe(CaseStatus.IN_PROGRESS); // INVESTIGATING -> IN_PROGRESS
    expect(migrated.priority).toBe(CasePriority.HIGH);
    expect(migrated.assignedTo).toEqual(['team-alpha']);
    expect(migrated.metadata.migratedFrom).toBe('realTimeTeamService');
    expect(migrated.metadata.legacyId).toBe('inv-1');
  });

  /*
   * The Cases screen runs this on every mount. An unstated author ensures this
   * browser's signing identity, so a migration that did not carry the investigation's
   * own author would create a key for anyone who merely opened Cases while holding old
   * investigations — someone who never asked to sign anything.
   */
  it('credits the investigation\'s own author, and creates no signing identity doing it', async () => {
    nostrService.forgetIdentity();
    localStorage.setItem('starcom_investigations', JSON.stringify([makeInvestigation()]));

    const result = await migrateInvestigationsToCases();

    expect(result.migrated).toBe(1);
    expect(result.failed).toBe(0);
    const [migrated] = await intelCaseService.listCases();
    expect(migrated.createdBy).toBe('analyst-1');
    expect(migrated.activityLog[0].userId).toBe('analyst-1');
    expect(nostrService.hasIdentity()).toBe(false);
    expect(localStorage.getItem('nostr_secret_key')).toBeNull();
  });

  it('says the author was never recorded, rather than crediting whoever opened the screen', async () => {
    nostrService.forgetIdentity();
    localStorage.setItem('starcom_investigations', JSON.stringify([makeInvestigation({ reportedBy: '   ' })]));

    await migrateInvestigationsToCases();

    const [migrated] = await intelCaseService.listCases();
    expect(migrated.createdBy).toBe('unrecorded (migrated investigation)');
    expect(nostrService.hasIdentity()).toBe(false);
  });

  it('is idempotent — a second run migrates nothing new and creates no duplicates', async () => {
    localStorage.setItem('starcom_investigations', JSON.stringify([makeInvestigation()]));

    const first = await migrateInvestigationsToCases();
    const second = await migrateInvestigationsToCases();

    expect(first.migrated).toBe(1);
    expect(second.migrated).toBe(0);
    expect(second.skipped).toBe(1);
    expect(await intelCaseService.listCases()).toHaveLength(1);
  });

  it('migrates from both legacy stores, attributing each to its own source', async () => {
    localStorage.setItem('starcom_investigations', JSON.stringify([
      makeInvestigation({ id: 'inv-from-team-service', title: 'From team service' }),
    ]));
    vi.mocked(CyberInvestigationStorage.loadInvestigations).mockResolvedValue([
      makeInvestigation({ id: 'inv-from-board', title: 'From HUD board' }),
    ]);

    const result = await migrateInvestigationsToCases();

    expect(result.migrated).toBe(2);
    expect(result.bySource.realTimeTeamService.migrated).toBe(1);
    expect(result.bySource.cyberInvestigationStorage.migrated).toBe(1);

    const titles = (await intelCaseService.listCases()).map(c => c.title).sort();
    expect(titles).toEqual(['From HUD board', 'From team service']);
  });

  it('folds incident-response-only fields into the description rather than dropping them', async () => {
    // UNCLASSIFIED so the description is readable directly — a CONFIDENTIAL+
    // case is encrypted at rest, which the next test covers separately.
    localStorage.setItem('starcom_investigations', JSON.stringify([
      makeInvestigation({ visibility: 'public' }),
    ]));

    await migrateInvestigationsToCases();

    const [migrated] = await intelCaseService.listCases();
    expect(migrated.description).toContain('Anomalous outbound connections observed.');
    expect(migrated.description).toContain('relay-node-1');
    expect(migrated.description).toContain('Rotate relay credentials');
    // And preserved verbatim in metadata, so nothing is unrecoverable.
    expect(migrated.metadata.legacyAffectedSystems).toEqual(['relay-node-1', 'gateway-2']);
    expect(migrated.metadata.legacyStatus).toBe('INVESTIGATING');
  });

  it('carries a restricted investigation through the canonical store\'s encryption-at-rest', async () => {
    localStorage.setItem('starcom_investigations', JSON.stringify([
      makeInvestigation({ visibility: 'limited' }),
    ]));

    await migrateInvestigationsToCases();

    const [migrated] = await intelCaseService.listCases();
    // Stored form is ciphertext — the migration inherits classified handling
    // for free by going through the real service rather than writing directly.
    expect(migrated.description).toContain('__classifiedEncrypted');
    // ...and the real content is recoverable through the normal read path.
    const decrypted = await intelCaseService.decryptCaseDescription(migrated.id);
    expect(decrypted).toContain('Anomalous outbound connections observed.');
    expect(decrypted).toContain('Rotate relay credentials');
  });

  it('maps every legacy status to a real Case status', async () => {
    const statuses: CyberInvestigation['status'][] = [
      'INITIATED', 'INVESTIGATING', 'ANALYZING', 'CONTAINING', 'RECOVERING', 'CLOSED',
    ];
    localStorage.setItem('starcom_investigations', JSON.stringify(
      statuses.map((status, i) => makeInvestigation({ id: `inv-${i}`, status, title: status }))
    ));

    await migrateInvestigationsToCases();

    const cases = await intelCaseService.listCases();
    expect(cases).toHaveLength(statuses.length);
    const byTitle = new Map(cases.map(c => [c.title, c.status]));
    expect(byTitle.get('INITIATED')).toBe(CaseStatus.NEW);
    expect(byTitle.get('INVESTIGATING')).toBe(CaseStatus.IN_PROGRESS);
    expect(byTitle.get('RECOVERING')).toBe(CaseStatus.PENDING);
    expect(byTitle.get('CLOSED')).toBe(CaseStatus.CLOSED);
  });

  it('does not delete the source data — a migration that destroys its input has no safe retry', async () => {
    const raw = JSON.stringify([makeInvestigation()]);
    localStorage.setItem('starcom_investigations', raw);

    await migrateInvestigationsToCases();

    expect(localStorage.getItem('starcom_investigations')).toBe(raw);
  });

  it('survives malformed legacy data instead of aborting the whole migration', async () => {
    localStorage.setItem('starcom_investigations', 'not valid json{');
    vi.mocked(CyberInvestigationStorage.loadInvestigations).mockResolvedValue([
      makeInvestigation({ id: 'inv-good', title: 'Still migrated' }),
    ]);

    const result = await migrateInvestigationsToCases();

    // The unreadable source is skipped; the readable one still lands.
    expect(result.migrated).toBe(1);
    expect((await intelCaseService.listCases())[0].title).toBe('Still migrated');
  });

  it('reports zero work when there is nothing to migrate', async () => {
    const result = await migrateInvestigationsToCases();

    expect(result).toMatchObject({ migrated: 0, skipped: 0, failed: 0 });
    expect(await intelCaseService.listCases()).toHaveLength(0);
  });
});

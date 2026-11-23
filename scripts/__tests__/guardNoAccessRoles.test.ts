/**
 * Collaborator roles and permission lists stay gone.
 *
 * They were removed because nothing enforced them and, in local-first storage,
 * nothing could. This guard is what keeps a later change from bringing back a
 * role picker or a list of who may edit, so it has to be watched failing.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-no-access-roles.mjs';

const clean = {
  'src/types/intel/Collaboration.ts':
    'export interface Collaborator { userId: string; name: string; addedAt: string; addedBy: string }\n'
    + 'export interface CollaborationPermissions { isPublic: boolean }\n',
};

describe('guard-no-access-roles', () => {
  it('passes on collaborators without roles and records that say only whether they are public', () => {
    expect(runGuardIn(GUARD, clean).status).toBe(0);
  });

  it('FAILS on a CollaboratorRole anywhere in source', () => {
    const run = runGuardIn(GUARD, { ...clean, 'src/components/Picker.tsx': 'export enum CollaboratorRole { VIEWER = "VIEWER" }\n' });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/collaborator roles/);
    expect(run.output).toMatch(/src\/components\/Picker\.tsx:1/);
  });

  it('FAILS on a role literal given to a collaborator', () => {
    const run = runGuardIn(GUARD, { ...clean, 'src/applications/teamworkspace/add.ts': "const c = { userId: 'pk', role: 'EDITOR' };\n" });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/role: 'EDITOR'/);
  });

  it('FAILS on a permission list in intel code', () => {
    const run = runGuardIn(GUARD, { ...clean, 'src/services/intel/defaults.ts': 'export const p = { isPublic: false, canEdit: [] };\n' });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/per-user permission lists/);
  });

  it('has no view on the same words in other domains, in comments, or in tests that hold an old record', () => {
    const run = runGuardIn(GUARD, {
      ...clean,
      'src/types/features/collaboration.ts': 'export interface ContextPermissions { canView: string[]; canEdit: string[] }\n',
      'src/services/intel/notes.ts': '// canEdit and CollaboratorRole were removed; see missionCapability.ts\nexport const x = 1;\n',
      'src/services/intel/__tests__/legacy.test.ts': "const stored = { permissions: { canEdit: ['pk'] }, collaborators: [{ role: 'OWNER' }] };\n",
    });
    expect(run.status).toBe(0);
  });

  it('FAILS when there is no source to scan, rather than passing on nothing', () => {
    const run = runGuardIn(GUARD, { 'README.md': 'nothing here\n' });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/cannot confirm/);
  });
});

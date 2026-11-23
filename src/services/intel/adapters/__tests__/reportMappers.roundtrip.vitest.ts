import { describe, it, expect } from 'vitest';
import { uiToWorkspaceReportData, workspaceFileToUI } from '../../adapters/reportMappers';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';

describe('reportMappers round-trip', () => {
  it('UI → workspace → UI preserves core fields', () => {
    const now = new Date();
    const ui: IntelReportUI = {
      id: 'rt-1',
      title: 'Round Trip',
      content: 'Some content',
      summary: 'Some summary',
      author: 'Author',
      category: 'General',
      tags: ['A', 'B'],
      latitude: 1,
      longitude: 2,
      createdAt: now,
      updatedAt: now,
      status: 'DRAFT',
      conclusions: ['C1'],
      recommendations: ['R1'],
      methodology: ['M1'],
      confidence: 0.7,
      priority: 'LOW',
      targetAudience: ['Ops'],
      sourceIntelIds: ['src-1'],
      version: 2,
      manualSummary: true,
      history: []
    };

    const data = uiToWorkspaceReportData(ui);
    const file = { path: '', filename: 'rt-1.intelReport', extension: '.intelReport', reportData: data, size: 0, createdAt: data.createdAt, modifiedAt: data.modifiedAt, checksum: '' };
    const back = workspaceFileToUI(file as any);

    expect(back.id).toBe(ui.id);
    expect(back.title).toBe(ui.title);
    expect(back.content).toBe(ui.content);
    expect(back.category).toBe(ui.category);
    expect(back.tags).toEqual(ui.tags);
    expect(back.latitude).toBe(ui.latitude);
    expect(back.longitude).toBe(ui.longitude);
    // The handling axes are what round-trip now; the tier is gone.
    expect(back.visibility).toBe(ui.visibility);
    expect(back.sensitivity).toBe(ui.sensitivity);
    expect(back.status).toBe(ui.status);
    expect(back.version).toBe(ui.version);
  });

  it('UI → workspace → UI preserves startDate/endDate/hashtags/extra', () => {
    const now = new Date();
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-01-02T00:00:00.000Z');
    const ui: IntelReportUI = {
      id: 'rt-2',
      title: 'Range Report',
      content: 'Some content',
      author: 'Author',
      category: 'General',
      tags: ['A'],
      createdAt: now,
      updatedAt: now,
      status: 'DRAFT',
      startDate: start,
      endDate: end,
      hashtags: ['starcom_intel', 'threat'],
      extra: { source: 'mecha-jono', schemaVersion: 1 }
    };

    const data = uiToWorkspaceReportData(ui);
    const file = { path: '', filename: 'rt-2.intelReport', extension: '.intelReport', reportData: data, size: 0, createdAt: data.createdAt, modifiedAt: data.modifiedAt, checksum: '' };
    const back = workspaceFileToUI(file as any);

    expect(back.startDate?.getTime()).toBe(start.getTime());
    expect(back.endDate?.getTime()).toBe(end.getTime());
    expect(back.hashtags).toEqual(ui.hashtags);
    expect(back.extra).toEqual(ui.extra);
  });

  it('UI → workspace → UI leaves startDate/endDate/hashtags/extra undefined when absent (legacy records)', () => {
    const now = new Date();
    const ui: IntelReportUI = {
      id: 'rt-3',
      title: 'Legacy Report',
      content: 'Some content',
      author: 'Author',
      category: 'General',
      tags: ['A'],
      createdAt: now,
      updatedAt: now,
      status: 'DRAFT'
    };

    const data = uiToWorkspaceReportData(ui);
    const file = { path: '', filename: 'rt-3.intelReport', extension: '.intelReport', reportData: data, size: 0, createdAt: data.createdAt, modifiedAt: data.modifiedAt, checksum: '' };
    const back = workspaceFileToUI(file as any);

    expect(back.startDate).toBeUndefined();
    expect(back.endDate).toBeUndefined();
    expect(back.hashtags).toBeUndefined();
    expect(back.extra).toBeUndefined();
  });

  it('UI → workspace → UI preserves entityRefs (Phase 2: real field, not permanently empty)', () => {
    const now = new Date();
    const ui: IntelReportUI = {
      id: 'rt-4',
      title: 'Entity Report',
      content: 'Some content',
      author: 'Author',
      category: 'General',
      tags: ['A'],
      createdAt: now,
      updatedAt: now,
      status: 'DRAFT',
      entityRefs: ['John Smith', 'Acme Corp']
    };

    const data = uiToWorkspaceReportData(ui);
    const file = { path: '', filename: 'rt-4.intelReport', extension: '.intelReport', reportData: data, size: 0, createdAt: data.createdAt, modifiedAt: data.modifiedAt, checksum: '' };
    const back = workspaceFileToUI(file as any);

    expect(back.entityRefs).toEqual(['John Smith', 'Acme Corp']);
  });

  it('UI → workspace → UI leaves entityRefs as an empty array, not undefined, when absent', () => {
    const now = new Date();
    const ui: IntelReportUI = {
      id: 'rt-5',
      title: 'No Entities Report',
      content: 'Some content',
      author: 'Author',
      category: 'General',
      tags: ['A'],
      createdAt: now,
      updatedAt: now,
      status: 'DRAFT'
    };

    const data = uiToWorkspaceReportData(ui);
    const file = { path: '', filename: 'rt-5.intelReport', extension: '.intelReport', reportData: data, size: 0, createdAt: data.createdAt, modifiedAt: data.modifiedAt, checksum: '' };
    const back = workspaceFileToUI(file as any);

    expect(back.entityRefs).toEqual([]);
  });
});

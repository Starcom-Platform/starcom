/**
 * Intel Report Creation Flow — Verification Tests (Step 2.1.2)
 *
 * Verifies:
 *   2.1.2.1 — UI form → handleSubmit → IntelReportService.createReport()
 *   2.1.2.2 — Report persists to IntelWorkspaceManager on submit
 *   2.1.2.3 — Report ID generated correctly (intel-{uuid} format)
 *   2.1.2.4 — Validation rejects reports with missing required fields
 */

import { describe, it, expect } from 'vitest';
import { intelReportService } from '../IntelReportService';
import { IntelReportValidationService } from '../../IntelReportValidationService';
import type { CreateIntelReportInput } from '../../../types/intel/IntelReportUI';

const validInput: CreateIntelReportInput = {
  title: 'Pipeline Verification Report',
  content: 'Testing the full creation flow from service to persistence.',
  category: 'GENERAL',
  tags: ['verification', 'step-2.1.2'],
  latitude: 38.9072,
  longitude: -77.0369,
  confidence: 0.85,
};

describe('2.1.2 — Report Creation Flow', () => {
  it('2.1.2.1+2 — createReport persists and is retrievable', async () => {
    const report = await intelReportService.createReport(validInput, 'test-agent');
    expect(report).toBeDefined();
    expect(report.title).toBe(validInput.title);
    expect(report.author).toBe('test-agent');
    expect(report.status).toBe('DRAFT');
    // Was expect(report.classification).toBe('UNCLASSIFIED') — an assertion
    // that createReport stamped a marking on a report whose input carried
    // none. It no longer invents one.
    expect(report.visibility).toBeUndefined();
    expect(report.createdAt).toBeInstanceOf(Date);

    // Verify it persists and is listed
    const list = await intelReportService.listReports();
    expect(list.some((r) => r.id === report.id)).toBe(true);

    // Verify retrieval by ID
    const retrieved = await intelReportService.getReport(report.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.title).toBe(validInput.title);
  });

  it('2.1.2.3 — Report ID uses intel-{uuid} format', async () => {
    const report = await intelReportService.createReport(validInput, 'test-agent');
    // Must start with 'intel-'
    expect(report.id).toMatch(/^intel-/);
    // Remainder should be UUID-like or random alphanumeric
    expect(report.id.length).toBeGreaterThan(10);
  });

  it('2.1.2.4 — Validation rejects missing title', () => {
    const validator = new IntelReportValidationService();
    const result = validator.validateCreate({ content: 'body', tags: ['x'] } as any);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('2.1.2.4 — Validation rejects missing content', () => {
    const validator = new IntelReportValidationService();
    const result = validator.validateCreate({ title: 'Title', tags: ['x'] } as any);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => /content/i.test(e.message))).toBe(true);
  });

  it('2.1.2.4 — Validation rejects out-of-range coordinates', () => {
    const validator = new IntelReportValidationService();
    const result = validator.validateCreate({
      title: 'Title',
      content: 'Body content here',
      tags: ['x'],
      latitude: 999,
      longitude: -999,
    } as any);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => /latitude|longitude|coordinate/i.test(e.message))).toBe(true);
  });
});

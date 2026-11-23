/**
 * eventsAdapter — Phase 2 (roadmap: "populate entityRefs on reports").
 * adaptReportsToEvents/adaptIntelItemsToEvents previously hardcoded
 * entityRefs: [] unconditionally, meaning correlationUtils.ts's
 * co-occurrence detection — already normalized (Phase 1) and ready — never
 * received real entity data no matter what a report/item actually carried.
 */
import { describe, it, expect } from 'vitest';
import { adaptReportsToEvents, adaptIntelItemsToEvents } from '../eventsAdapter';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';
import type { IntelItemUI } from '../../../../types/intel/IntelItemUI';

function makeReport(overrides: Partial<IntelReportUI> = {}): IntelReportUI {
  const now = new Date();
  return {
    id: 'report-1',
    title: 'Report',
    content: 'content',
    author: 'author',
    category: 'GENERAL',
    tags: [],
    createdAt: now,
    updatedAt: now,
    // SUBMITTED rather than DRAFT: a draft no longer contributes evidence, and
    // this suite is about entityRefs surviving the adapter, not about the
    // lifecycle gate. See lifecycleEvidence.test.ts for that.
    status: 'SUBMITTED',
    ...overrides
  };
}

function makeItem(overrides: Partial<IntelItemUI> = {}): IntelItemUI {
  const now = new Date();
  return {
    id: 'item-1',
    title: 'Item',
    type: 'OBSERVATION',
    source: 'source',
    reliability: 'C',
    confidence: 0.5,
    tags: [],
    categories: [],
    content: 'content',
    createdAt: now,
    updatedAt: now,
    verified: false,
    ...overrides
  };
}

describe('eventsAdapter — entityRefs pass-through', () => {
  it('adaptReportsToEvents carries a report\'s real entityRefs through, not an empty array', () => {
    const events = adaptReportsToEvents([makeReport({ entityRefs: ['John Smith', 'Acme Corp'] })]);
    expect(events[0].entityRefs).toEqual(['John Smith', 'Acme Corp']);
  });

  it('adaptReportsToEvents defaults to an empty array for a report with no entityRefs, not undefined', () => {
    const events = adaptReportsToEvents([makeReport()]);
    expect(events[0].entityRefs).toEqual([]);
  });

  it('adaptIntelItemsToEvents carries an item\'s real entityRefs through', () => {
    const events = adaptIntelItemsToEvents([makeItem({ entityRefs: ['Jane Doe'] })]);
    expect(events[0].entityRefs).toEqual(['Jane Doe']);
  });

  it('adaptIntelItemsToEvents defaults to an empty array for an item with no entityRefs', () => {
    const events = adaptIntelItemsToEvents([makeItem()]);
    expect(events[0].entityRefs).toEqual([]);
  });
});

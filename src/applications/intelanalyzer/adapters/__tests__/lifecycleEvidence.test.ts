/**
 * The report lifecycle governs what counts as evidence.
 *
 * Before this, adaptReportsToEvents mapped EVERY report to an event regardless
 * of status, so a DRAFT corroborated findings that could then be published. The
 * state machine in IntelReportService was real and enforced; it just governed
 * the workspace and not the evidence pool, which is the half that reaches
 * other people.
 *
 * The gate is here rather than at publication because a CorroboratedFinding
 * carries sourceCount and deliberately never source identities — so the wire
 * cannot ask what status a contributing report held. That link is severed on
 * purpose, to keep analyst identities out of published claims.
 *
 * It is applied by CorrelationContext and NOT by adaptReportsToEvents, which was
 * the first attempt. That adapter also feeds GraphView, MapView and TimelineView,
 * so filtering there hid an analyst's own drafts from their own workspace — two
 * integration tests caught it within a minute. Visibility and evidentiality are
 * different questions and only one of them is the lifecycle's business.
 */
import { describe, it, expect } from 'vitest';
import {
  adaptReportsToEvents, reportsExcludedFromCorrelation, isEvidential, EVIDENTIAL_STATUSES,
} from '../eventsAdapter';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';

const report = (id: string, status?: string): IntelReportUI => ({
  id, title: `Report ${id}`, content: '', author: 'analyst',
  category: 'SIGHTING', tags: [], latitude: 1, longitude: 2,
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'),
  status, confidence: 0.8, summary: '', conclusions: [], recommendations: [],
  methodology: [], targetAudience: [], sourceIntelIds: [], history: [],
} as unknown as IntelReportUI);

describe('what counts as evidence', () => {
  it('admits reports someone has stood behind', () => {
    expect(isEvidential(report('a', 'SUBMITTED'))).toBe(true);
    expect(isEvidential(report('b', 'REVIEWED'))).toBe(true);
    expect(isEvidential(report('c', 'APPROVED'))).toBe(true);
  });

  it('excludes a DRAFT — not yet asserted', () => {
    expect(isEvidential(report('d', 'DRAFT'))).toBe(false);
  });

  it('excludes ARCHIVED — archiving is withdrawal', () => {
    expect(isEvidential(report('e', 'ARCHIVED'))).toBe(false);
  });

  it('treats an unstamped report as a draft, not as approved', () => {
    // Absent status defaults to DRAFT in IntelReportUI. Defaulting the other
    // way would let an unfinished record corroborate for want of a field
    // nobody set.
    expect(isEvidential(report('f', undefined))).toBe(false);
  });

  it('still puts every report on the analyst\'s own views', () => {
    // The error this pins: filtering in the adapter hid drafts from GraphView,
    // MapView and TimelineView. Your own unfinished work belongs on your own
    // graph.
    const all = [report('a', 'APPROVED'), report('b', 'DRAFT'), report('c', 'ARCHIVED')];
    expect(adaptReportsToEvents(all)).toHaveLength(3);
  });

  it('does not require APPROVED, deliberately', () => {
    // Requiring it would be defensible and wrong in practice: if approval is
    // rare, correlation silently empties and the tool looks broken — which is
    // how safety machinery teaches people to route around it.
    expect(EVIDENTIAL_STATUSES.has('SUBMITTED')).toBe(true);
  });
});

describe('exclusions are visible, not silent', () => {
  it('reports what was left out and why', () => {
    const excluded = reportsExcludedFromCorrelation([
      report('a', 'APPROVED'), report('d', 'DRAFT'), report('e', 'ARCHIVED'),
    ]);
    expect(excluded.map(e => e.id)).toEqual(['d', 'e']);
    expect(excluded[0].status).toBe('DRAFT');
  });

  it('says nothing when nothing was excluded', () => {
    expect(reportsExcludedFromCorrelation([report('a', 'APPROVED')])).toEqual([]);
  });

  it('accounts for every report exactly once', () => {
    // An analyst whose drafts stopped corroborating should be able to see where
    // they went. Evidential plus excluded must equal what they put in.
    const all = [report('a', 'APPROVED'), report('b', 'DRAFT'), report('c', 'SUBMITTED')];
    const evidential = all.filter(isEvidential).length;
    const excluded = reportsExcludedFromCorrelation(all).length;
    expect(evidential + excluded).toBe(all.length);
  });
});

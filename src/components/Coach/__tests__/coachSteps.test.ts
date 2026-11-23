/**
 * The coach's steps (plan item 6.1): each belongs to a stage the pipeline
 * declares, links a word the glossary has, and is done only when real
 * records say so, never by sample material.
 */
import { describe, it, expect } from 'vitest';
import { COACH_STEPS, nextCoachStep, type CoachRecords } from '../coachSteps';
import { PIPELINE } from '../../../services/intel/pipeline/pipeline';
import { glossaryEntry } from '../../../services/help/glossary';
import { APPLICATIONS } from '../../Router/EnhancedApplicationRouter';

const none: CoachRecords = { reports: [], cases: [], missions: [] };

describe("the coach's steps", () => {
  it('belong to stages the pipeline declares, in its order, in apps that exist, with words the glossary has', () => {
    const order = PIPELINE.map((s) => s.id);
    let last = -1;
    for (const step of COACH_STEPS) {
      const at = order.indexOf(step.stage);
      expect(at, step.id).toBeGreaterThanOrEqual(last);
      last = at;
      expect(APPLICATIONS.some((a) => a.id === step.app), step.id).toBe(true);
      if (step.term) expect(glossaryEntry(step.term), step.id).toBeDefined();
      expect(step.anchors.length, step.id).toBeGreaterThan(0);
    }
  });

  it('walks the pipeline in order, each step done by what the records hold', () => {
    const records: CoachRecords = { reports: [], cases: [], missions: [] };
    const walk: string[] = [];
    const step = () => { const s = nextCoachStep(records); walk.push(s?.id ?? 'done'); };
    step();
    records.reports.push({});
    step();
    records.cases.push({ relatedEntities: [] });
    step();
    records.cases[0].relatedEntities = ['intel-1'];
    step();
    records.cases[0].position = { statement: 'Night loading is real.', verdict: 'substantiated' };
    step();
    records.missions.push({ status: 'DRAFT', relatedCases: ['intelcase-1'] });
    step();
    records.missions[0].status = 'READY_FOR_PACKAGE';
    step();
    records.missions[0].status = 'DISPATCHED';
    step();
    expect(walk).toEqual(['write-report', 'open-case', 'attach-evidence', 'state-position', 'mission-from-case', 'ready', 'publish', 'done']);
  });

  it('counts a closed mission as published: it was, before it closed (D-MX, MX12)', () => {
    const records: CoachRecords = {
      reports: [{}],
      cases: [{ relatedEntities: ['intel-1'], position: { statement: 'Night loading is real.', verdict: 'substantiated' } }],
      missions: [{ status: 'CLOSED', relatedCases: ['intelcase-1'] }],
    };
    expect(nextCoachStep(records)?.id).toBeUndefined();
  });

  it('counts nothing that is sample material', () => {
    expect(nextCoachStep({
      reports: [{ sample: true }],
      cases: [{ sample: true, relatedEntities: ['x'], position: {} }],
      missions: [{ sample: true, status: 'DISPATCHED', relatedCases: ['c'] }],
    })?.id).toBe('write-report');
    expect(nextCoachStep(none)?.id).toBe('write-report');
  });
});

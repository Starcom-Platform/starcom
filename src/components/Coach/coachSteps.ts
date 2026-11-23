/**
 * The coach's steps (plan item 6.1; tutorial-mode.md, option A): the next
 * control to use, in plain words, on the intern's own work.
 *
 * Each step belongs to a stage of the pipeline (pipeline.ts), names where it
 * happens and the controls it points at, links a glossary word, and is done
 * when the real records say so: never when the coach was clicked through.
 * Sample material (plan item 0.9) completes nothing: the coach is for real
 * work.
 *
 * `anchors` are data-testid values, the deepest first: the coach points at
 * the first one on screen, so it follows the person into a dialog and back
 * out. One ending in "*" matches a test id that starts with it.
 * guard-coach-anchors.mjs fails the build when any of them stops existing.
 */
import type { ApplicationId } from '../Router/EnhancedApplicationRouter';

export interface CoachRecords {
  reports: Array<{ sample?: boolean }>;
  cases: Array<{ sample?: boolean; relatedEntities?: string[]; position?: unknown }>;
  missions: Array<{ sample?: boolean; status: string; relatedCases?: string[] }>;
}

export interface CoachStep {
  id: string;
  /** The pipeline stage (pipeline.ts) this step belongs to. */
  stage: string;
  title: string;
  /** What to do, in the operator's words. */
  words: string;
  /** The glossary word that explains it. */
  term?: string;
  /** Where it happens, for "Go to…" when none of its controls is on screen. */
  app: ApplicationId;
  context?: Record<string, string>;
  anchors: string[];
  done: (records: CoachRecords) => boolean;
}

const real = <T extends { sample?: boolean }>(list: T[]): T[] => list.filter((r) => r.sample !== true);
const PACKAGED = ['PACKAGED', 'DISPATCHED', 'CLOSED'];
const READY = ['READY_FOR_PACKAGE', ...PACKAGED];

export const COACH_STEPS: CoachStep[] = [
  {
    id: 'write-report',
    stage: 'collect',
    title: 'Write an Intel Report',
    words: 'Start a new report and say what you saw: a title, what happened, and where if you know. Save it when it reads right.',
    app: 'inteldashboard',
    anchors: ['create-record', 'new-record'],
    done: ({ reports }) => real(reports).length > 0,
  },
  {
    id: 'open-case',
    stage: 'investigate',
    title: 'Open a case',
    words: 'A case holds a question and the reports that bear on it. Give it a title, say what you are asking, and choose who may receive it.',
    term: 'visibility',
    app: 'cases',
    anchors: ['save-case', 'new-case'],
    done: ({ cases }) => real(cases).length > 0,
  },
  {
    id: 'attach-evidence',
    stage: 'investigate',
    title: 'Attach your report as evidence',
    words: 'In the case, pick your report and attach it. A case rests on what it cites.',
    term: 'corroboration',
    app: 'cases',
    anchors: ['attach-action', 'link-candidate-input', 'open-case'],
    done: ({ cases }) => real(cases).some((c) => (c.relatedEntities ?? []).length > 0),
  },
  {
    id: 'state-position',
    stage: 'investigate',
    title: 'State a position',
    words: 'Say what the evidence shows, and choose a verdict. Answer what argues against it if anything does.',
    term: 'case-position',
    app: 'cases',
    anchors: ['state-position', 'open-case'],
    done: ({ cases }) => real(cases).some((c) => Boolean(c.position)),
  },
  {
    id: 'mission-from-case',
    stage: 'assemble',
    title: 'Make a mission from the case',
    words: 'A mission asks someone to act on what the case found. Make one from the case, then give it a briefing and objectives.',
    term: 'package',
    app: 'cases',
    anchors: ['create-mission-submit', 'create-mission-from-case', 'open-case'],
    done: ({ missions }) => real(missions).some((m) => (m.relatedCases ?? []).length > 0),
  },
  {
    id: 'ready',
    stage: 'publish',
    title: 'Get the mission ready',
    words: 'Press "Start planning", then "Mark ready to publish" once its briefing and objectives say what is asked.',
    term: 'package',
    app: 'teamworkspace',
    context: { initialTab: 'missions' },
    anchors: ['transition-to-READY_FOR_PACKAGE', 'transition-to-PLANNING', 'open-mission-*'],
    done: ({ missions }) => real(missions).some((m) => READY.includes(m.status)),
  },
  {
    id: 'publish',
    stage: 'publish',
    title: 'Publish it',
    words: 'Publish the Mission Package. The review shows exactly what goes and where before anything is sent, and you decide.',
    term: 'navcom',
    app: 'teamworkspace',
    context: { initialTab: 'missions' },
    anchors: ['publish-to-navcom', 'open-mission-*'],
    done: ({ missions }) => real(missions).some((m) => PACKAGED.includes(m.status)),
  },
];

/** The first step not yet done, or null when every step is. */
export function nextCoachStep(records: CoachRecords): CoachStep | null {
  return COACH_STEPS.find((step) => !step.done(records)) ?? null;
}

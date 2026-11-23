/**
 * The guard the whole pipeline discipline rests on.
 *
 * It asserts that every declared join has a producer and a consumer that exist
 * in source and are referenced outside their own file. The defects it was
 * written after — corroboration computed and never carried to a Case, kind
 * 30079 published and consumed by nothing, delegation specified and impossible
 * to perform — all typechecked and all passed their own tests.
 *
 * So the guard has to be able to fail, and until now nobody had watched it.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-pipeline-joins.mjs';

/** A declaration with one join and one stage, in the shape the parser expects. */
const declaration = (producer: string, consumer: string, app = 'cases') => `
export const PIPELINE = [
  {
    id: 'investigate',
    label: 'Open a case',
    surface: { kind: 'app', app: '${app}' },
    restsOn: [
      { name: 'a thing connects', producer: '${producer}', consumer: '${consumer}', because: 'it must' },
    ],
    advanceInvariants: [],
  },
];
export const UNWIRED = [];
`;

const router = (ids: string[]) => ids.map((i) => `  id: '${i}',`).join('\n');

function repo(opts: { producer: string; consumer: string; src: Record<string, string>; app?: string; apps?: string[] }) {
  return {
    'src/services/intel/pipeline/pipeline.ts': declaration(opts.producer, opts.consumer, opts.app),
    'src/components/Router/EnhancedApplicationRouter.tsx': router(opts.apps ?? ['cases']),
    ...opts.src,
  };
}

describe('guard-pipeline-joins', () => {
  it('passes when both halves exist and are referenced outside their own file', () => {
    const run = runGuardIn(GUARD, repo({
      producer: 'makeThing',
      consumer: 'readThing',
      src: {
        'src/a.ts': 'export function makeThing() {}\nexport function readThing() {}\n',
        'src/b.ts': 'import { makeThing, readThing } from "./a";\nmakeThing(); readThing();\n',
      },
    }));
    expect(run.status).toBe(0);
  });

  it('FAILS when the consumer exists but nothing outside its own file reads it', () => {
    const run = runGuardIn(GUARD, repo({
      producer: 'makeThing',
      consumer: 'readThing',
      src: {
        // Declared, exported, and reached by nobody — the exact defect class.
        'src/a.ts': 'export function makeThing() {}\nexport function readThing() {}\n',
        'src/b.ts': 'import { makeThing } from "./a";\nmakeThing();\n',
      },
    }));
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/readThing/);
  });

  it('FAILS when a declared symbol does not exist at all', () => {
    const run = runGuardIn(GUARD, repo({
      producer: 'makeThing',
      consumer: 'neverWritten',
      src: { 'src/a.ts': 'export function makeThing() {}\n', 'src/b.ts': 'import { makeThing } from "./a"; makeThing();\n' },
    }));
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/neverWritten/);
  });

  it('FAILS when a stage claims a surface that is not a registered app', () => {
    const run = runGuardIn(GUARD, repo({
      producer: 'makeThing',
      consumer: 'readThing',
      app: 'nowhere',
      apps: ['cases'],
      src: {
        'src/a.ts': 'export function makeThing() {}\nexport function readThing() {}\n',
        'src/b.ts': 'import { makeThing, readThing } from "./a"; makeThing(); readThing();\n',
      },
    }));
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/nowhere/);
  });

  it('FAILS loudly if the declaration shape changes and it parses nothing', () => {
    const run = runGuardIn(GUARD, {
      'src/services/intel/pipeline/pipeline.ts': 'export const PIPELINE = [];\n',
      'src/components/Router/EnhancedApplicationRouter.tsx': router(['cases']),
    });
    // Going blind must be a failure, not a pass with zero joins checked — the
    // difference between "nothing is wrong" and "I could not look".
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/Parsed no joins|now blind/i);
  });
});

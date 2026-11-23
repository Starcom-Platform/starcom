/**
 * guard-coach-anchors (plan item 6.1): the coach points at controls by their
 * test ids, and a control that is renamed or removed would leave it pointing
 * at nothing, silently, for every intern. The build fails instead.
 */
import { describe, it, expect } from 'vitest';
import { runGuardIn } from './guardHarness';

const GUARD = 'guard-coach-anchors.mjs';

const coach = (anchors: string[][]) => `
export const COACH_STEPS = [
${anchors.map((a, i) => `  { id: 's${i}', anchors: [${a.map((x) => `'${x}'`).join(', ')}], done: () => false },`).join('\n')}
];
`;

const screens = {
  'src/components/Intel/Console.tsx': '<button data-testid="new-record">New</button>\n<button data-testid="create-record">Create</button>\n',
  'src/pages/Cases/Detail.tsx': '<TextField inputProps={{ \'data-testid\': \'link-candidate-input\' }} />\n<Button data-testid={`transition-to-${status}`} />\n<Button data-testid={`open-mission-${m.id}`} />\n',
};

describe('guard-coach-anchors', () => {
  it('passes when every control the coach points at exists: literally, by template, or by prefix', () => {
    const run = runGuardIn(GUARD, {
      ...screens,
      'src/components/Coach/coachSteps.ts': coach([['create-record', 'new-record'], ['link-candidate-input'], ['transition-to-READY_FOR_PACKAGE', 'open-mission-*']]),
    });
    expect(run.output).toMatch(/every control the coach points at exists/);
    expect(run.status).toBe(0);
  });

  it('FAILS when a control the coach points at no longer exists, and names it', () => {
    const run = runGuardIn(GUARD, {
      ...screens,
      'src/components/Coach/coachSteps.ts': coach([['create-record', 'new-record'], ['state-position']]),
    });
    expect(run.status).toBe(1);
    expect(run.output).toMatch(/state-position/);
  });

  it('does not count a control that exists only in a test', () => {
    const run = runGuardIn(GUARD, {
      ...screens,
      'src/pages/Cases/__tests__/Detail.test.tsx': '<button data-testid="state-position" />\n',
      'src/components/Coach/coachSteps.ts': coach([['state-position']]),
    });
    expect(run.status).toBe(1);
  });

  it('FAILS rather than pass when the coach has no steps to read', () => {
    expect(runGuardIn(GUARD, { ...screens, 'src/components/Coach/coachSteps.ts': 'export const COACH_STEPS = [];\n' }).status).toBe(1);
    expect(runGuardIn(GUARD, { ...screens }).status).toBe(1);
  });
});

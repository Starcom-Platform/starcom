/**
 * The coach names the buttons a person will press by what they say. Its words
 * named a step "Ready for package", which no button said, once the steps took
 * plain words (plan item 1.7).
 */
import { describe, it, expect } from 'vitest';
import { COACH_STEPS } from '../coachSteps';
import { movesFrom } from '../../../services/intel/steps/statusSteps';

describe('the coach, on getting a mission ready', () => {
  it('names the steps as their buttons say them', () => {
    const ready = COACH_STEPS.find((s) => s.id === 'ready')!;
    const label = (from: string, to: string) => movesFrom('mission', from).find((m) => m.to === to)!.label;
    expect(ready.words).toContain(`"${label('DRAFT', 'PLANNING')}"`);
    expect(ready.words).toContain(`"${label('PLANNING', 'READY_FOR_PACKAGE')}"`);
  });
});

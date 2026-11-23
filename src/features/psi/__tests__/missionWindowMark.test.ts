/** A psi mission's window on the time bar (D-PW, PW92): the last opened shows; each holder clears only its own. */
import { describe, it, expect, beforeEach } from 'vitest';
import { clearMissionWindow, markMissionWindow, missionWindowMark, resetMissionWindowMarkForTests } from '../missionWindowMark';

const mark = (key: string) => ({ key, title: key, fromMs: 1, peakMs: 2, untilMs: 3 });

beforeEach(() => resetMissionWindowMarkForTests());

describe('missionWindowMark', () => {
  it('shows the last opened, and the one under it again once that closes', () => {
    markMissionWindow('row', mark('a'));
    markMissionWindow('card', mark('b'));
    expect(missionWindowMark()?.key).toBe('b');
    clearMissionWindow('card');
    expect(missionWindowMark()?.key).toBe('a');
    clearMissionWindow('row');
    expect(missionWindowMark()).toBeNull();
  });

  it("leaves another holder's mark when one clears that is not shown", () => {
    markMissionWindow('row', mark('a'));
    markMissionWindow('card', mark('a'));
    clearMissionWindow('row');
    expect(missionWindowMark()?.key).toBe('a');
  });
});

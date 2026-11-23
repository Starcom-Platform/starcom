/**
 * Where Echoes' returns are found (decision D-PW, PW47): on this thread where no worker can be made, a newer request
 * answering and an older one answering null.
 */
import { describe, expect, it } from 'vitest';
import { createEchoComputer } from '../echoComputer';
import type { PsiSkyEvent } from '../../../../services/psiWatch/psiEvents';

const perigee = { address: 'a', title: 'Moon at perigee', sky: { class: 'lunar_distance', sub: 'perigee' }, bodies: ['Moon'], exact: Date.UTC(2020, 0, 1) / 1000 } as unknown as PsiSkyEvent;

describe('the Echo computer', () => {
  it('answers the latest request and the one before it null', async () => {
    const computer = createEchoComputer();
    const older = computer.compute({ event: perigee, fromMs: Date.UTC(2019, 0, 1), untilMs: Date.UTC(2020, 0, 1), frame: 'galactic' });
    const newer = computer.compute({ event: perigee, fromMs: Date.UTC(2021, 0, 1), untilMs: Date.UTC(2022, 0, 1), frame: 'galactic' });
    expect(await older).toBeNull();
    const found = await newer;
    expect(found).toHaveLength(13);
    computer.dispose();
  });
});

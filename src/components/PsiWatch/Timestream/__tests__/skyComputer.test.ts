/**
 * The Timestream's sky is worked on for the latest view only (decision D-PW, PW38): one job at a time, a newer
 * request replacing any that waits, each one passed over answering null; and where no worker can be made, the same
 * sky on this thread.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import type { SkyColumns } from '../../../../services/psiWatch/timestream/skyColumns';
import { createSkyComputer, latestOnly } from '../skyComputer';
import type { SkyJob } from '../sky.worker';

const VIEW = { startMs: Date.UTC(2026, 9, 27), spanMs: 86_400_000 };
const request = (columns: number) => ({ view: VIEW, columns, bodies: ['Sun'] as const, frame: 'galactic' as const });

describe('the Timestream\'s sky computer', () => {
  it('works on one view at a time, and on the latest of those asked for meanwhile', async () => {
    const started: number[] = [];
    let finish: (() => void) | null = null;
    const computer = latestOnly((job: SkyJob) => new Promise<SkyColumns>((resolve) => {
      started.push(job.columns);
      finish = () => resolve({ longitudes: new Float32Array(job.columns), retrograde: new Uint8Array(job.columns), columns: job.columns, bodies: job.bodies });
    }));
    const first = computer.compute(request(1));
    const second = computer.compute(request(2));
    const third = computer.compute(request(3));
    expect(await second).toBeNull();
    expect(started).toEqual([1]);
    finish!();
    expect((await first)?.columns).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toEqual([1, 3]);
    finish!();
    expect((await third)?.columns).toBe(3);
  });

  it('answers null for what waits when it is disposed of', async () => {
    let finish: (() => void) | null = null;
    const computer = latestOnly((job: SkyJob) => new Promise<SkyColumns>((resolve) => {
      finish = () => resolve({ longitudes: new Float32Array(0), retrograde: new Uint8Array(0), columns: job.columns, bodies: job.bodies });
    }));
    void computer.compute(request(1));
    const waiting = computer.compute(request(2));
    computer.dispose();
    expect(await waiting).toBeNull();
    finish!();
    expect(await computer.compute(request(3))).toBeNull();
  });

  it('computes the sky on this thread where no worker can be made', async () => {
    const computer = createSkyComputer();
    const sky = await computer.compute(request(4));
    expect(sky?.longitudes).toHaveLength(4);
    expect(sky!.longitudes.every((lon) => lon >= 0 && lon < 360)).toBe(true);
    computer.dispose();
  });
});

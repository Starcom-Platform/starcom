/// <reference lib="webworker" />
/**
 * The Timestream's sky off the page's thread (decision D-PW, PW38): a view's columns of longitudes, about a second
 * for a wide drawer, too long to hold a frame, the Moon's marks where a wide view draws them (a century's eclipses,
 * half a second), and the graph lanes' series where one is shown (PW45). Its answers are handed over, not copied.
 */
import { skyColumns, type LaneBody, type Observer } from '../../../services/psiWatch/timestream/skyColumns';
import type { TimeView } from '../../../services/psiWatch/timestream/timeView';
import type { ZodiacFrame } from '../../../services/psiWatch/astro/frames';
import { moonMarks, type MoonMark } from '../../../services/psiWatch/timestream/moonMarks';
import { graphBuffers, graphColumns, type GraphColumns } from '../../../services/psiWatch/timestream/graphColumns';

export interface SkyJob { id: number; view: TimeView; columns: number; bodies: LaneBody[]; frame: ZodiacFrame; observer?: Observer; moon?: boolean; graphs?: boolean }
export type SkyAnswer =
  | { id: number; longitudes: Float32Array; retrograde: Uint8Array; columns: number; bodies: LaneBody[]; moonMarks?: MoonMark[]; graphs?: GraphColumns }
  | { id: number; error: string };

self.onmessage = (event: MessageEvent<SkyJob>) => {
  const { id, view, columns, bodies, frame, observer, moon, graphs } = event.data;
  try {
    const sky = skyColumns(view, columns, bodies, frame, observer);
    const series = graphs ? graphColumns(view, sky, frame) : null;
    const answer: SkyAnswer = {
      id, longitudes: sky.longitudes, retrograde: sky.retrograde, columns, bodies,
      ...(moon ? { moonMarks: moonMarks(view) } : {}), ...(series ? { graphs: series } : {}),
    };
    (self as unknown as Worker).postMessage(answer, [sky.longitudes.buffer, sky.retrograde.buffer, ...(series ? graphBuffers(series) : [])]);
  } catch (error) {
    (self as unknown as Worker).postMessage({ id, error: (error as Error).message } satisfies SkyAnswer);
  }
};

/**
 * A card of the chart open in the panel (decision D-PW, PW87): the same shot the share handle takes (`card.chart`), lent
 * by the globe while it is up, so a person's card and an agent's are made the same way. The globe at the item's place,
 * the wheel over a corner, the chart's lines in the text.
 */
import type { ZodiacFrame } from '../../services/psiWatch/astro/frames';
import type { ChartSubject } from './eventChartPanel';

/** How far out a chart's card looks at the item's place, in globe radii: the region around it. */
export const CHART_CARD_ALTITUDE = 1.8;

export type ChartCardMaker = (shot: unknown) => Promise<{ ok: boolean; card?: { dataUrl: string }; reason?: string }>;

let maker: ChartCardMaker | null = null;
/** Set by the globe while it is up; null when it goes. */
export const setChartCardMaker = (next: ChartCardMaker | null): void => { maker = next; };

/** The shot for a chart's card: the item's place, and the chart for its moment with the sky at the cursor outside. */
export function chartCardShot(subject: ChartSubject, cursorMs: number, frame: ZodiacFrame): unknown {
  const { lat, lng } = subject.place;
  return {
    v: 1,
    subject: { view: { lat, lng, altitude: CHART_CARD_ALTITUDE } },
    card: {
      chart: {
        at: Math.floor(subject.timeMs / 1000), lat, lng, title: subject.title.slice(0, 160),
        cursorAt: Math.floor(cursorMs / 1000), frame,
      },
    },
  };
}

/** The card, as a PNG data URL, or why not. */
export async function makeChartCard(subject: ChartSubject, cursorMs: number, frame: ZodiacFrame): Promise<string> {
  if (!maker) throw new Error('The globe is not ready to make a card yet.');
  const made = await maker(chartCardShot(subject, cursorMs, frame));
  if (!made.ok || !made.card) throw new Error(made.reason ?? 'The card could not be made.');
  return made.card.dataUrl;
}

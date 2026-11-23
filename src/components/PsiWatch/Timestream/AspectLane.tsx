/**
 * The aspect lane (decision D-PW, PW42, PW65; Cosmic Cypher's `AspectEventLane`): each major aspect between two of the
 * ten bodies, while in orb, as a bar across its window with a tick at its exact moment, coloured by its kind, in rows
 * that never touch and grow with the aspects, to a cap. A bar wide enough for it carries its name; a hover names the
 * pair, the kind and the exact moment; a click opens it and puts the shared cursor on its exact moment.
 */
import React, { useMemo } from 'react';
import { fill, useMessages } from '../../../i18n/app/i18n';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { DATA_SCALES } from '../../../styles/tokens';
import type { AspectName } from '../../../services/psiWatch/astro/aspects';
import type { AspectEvent } from '../../../services/psiWatch/timestream/aspectEvents';
import type { TimeView } from '../../../services/psiWatch/timestream/timeView';
import SpanLane, { SPAN_ROW_PX, spanLaneHeight, type PlacedSpan } from './SpanLane';

/** At most this many rows; the aspects past them counted. */
export const ASPECT_ROW_CAP = 8;
export const ASPECT_ROW_PX = SPAN_ROW_PX;
export const aspectLaneHeight = spanLaneHeight;

const colourOf = (kind: AspectName): string => (DATA_SCALES.aspects as Record<string, string>)[kind] ?? DATA_SCALES.psiWatch;

export interface PlacedAspect { event: AspectEvent; row: number }

export interface AspectLaneProps {
  placed: readonly PlacedAspect[];
  hidden: number;
  rows: number;
  view: TimeView;
  width: number;
  /** Puts the shared cursor on an opened aspect's exact moment. */
  onSeek?: (ms: number) => void;
}

const AspectLane: React.FC<AspectLaneProps> = ({ placed, hidden, rows, view, width, onSeek }) => {
  const { m } = useMessages();
  const w = m.psiWatch.timestream;
  const spans = useMemo<PlacedSpan[]>(() => {
    const kinds = w.aspects as Record<string, string>;
    const bodies = m.psiWatch.lines.bodies as Record<string, string>;
    const words = (e: AspectEvent) => ({ a: bodies[e.a] ?? e.a, kind: kinds[e.kind] ?? e.kind, b: bodies[e.b] ?? e.b });
    // A window that runs past the computed sky's edge was clipped there: only the edges the sky holds are told.
    const inOrb = (e: AspectEvent): string | null => {
      const from = e.fromEdge ? null : formatUtcDateTime(e.fromMs, { year: true });
      const until = e.untilEdge ? null : formatUtcDateTime(e.untilMs, { year: true });
      if (from && until) return fill(w.aspectInOrb, { from, until });
      if (until) return fill(w.aspectInOrbUntil, { until });
      if (from) return fill(w.aspectInOrbFrom, { from });
      return null;
    };
    return placed.map(({ event: e, row }) => ({
      row,
      item: {
        key: `${e.a}-${e.b}-${e.kind}-${e.exactMs}`, fromMs: e.fromMs, untilMs: e.untilMs, peakMs: e.exactMs, colour: colourOf(e.kind),
        label: fill(w.aspectLabel, words(e)),
        title: fill(w.aspectTitle, { ...words(e), time: formatUtcDateTime(e.exactMs, { year: true }) }),
        detail: inOrb(e),
      },
    }));
  }, [placed, m, w]);
  return (
    <SpanLane placed={spans} hidden={hidden} rows={rows} view={view} width={width} onSeek={onSeek}
      testId="psi-timestream-aspects" cardTestId="psi-timestream-aspect-card" moreLabel={(n) => fill(w.aspectsMore, { n })} />
  );
};

export default AspectLane;

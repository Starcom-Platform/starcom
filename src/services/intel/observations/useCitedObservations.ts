import { useEffect, useState } from 'react';
import type { ReportCitation } from '../../../types/intel/IntelReportUI';
import type { FieldObservation } from './fieldObservations';
import { lookUpCited } from './citedObservations';

/** Where each cited observation stands (D-MX, MX23). */
export type CitedObservation =
  | { state: 'looking' }
  | { state: 'read'; row: FieldObservation }
  /** Asked of every relay this node reads, and none holds it. */
  | { state: 'unread' }
  /** No relay this node reads answered. */
  | { state: 'unreachable' };

/** What these citations rest on, as far as this node can find without asking anyone new. */
export function useCitedObservations(cites: readonly ReportCitation[]): Map<string, CitedObservation> {
  const key = cites.map((c) => c.eventId).join(',');
  const [answers, setAnswers] = useState<Map<string, CitedObservation>>(new Map());

  useEffect(() => {
    let live = true;
    const ids = key ? key.split(',') : [];
    // An id with no answer yet reads as looking.
    if (ids.length === 0) return;
    lookUpCited(ids)
      .then((rows) => {
        if (live) setAnswers(new Map(ids.map((id) => {
          const row = rows.get(id);
          return [id, row ? { state: 'read', row } : { state: 'unread' }];
        })));
      })
      .catch(() => {
        if (live) setAnswers(new Map(ids.map((id) => [id, { state: 'unreachable' }])));
      });
    return () => { live = false; };
  }, [key]);

  return answers;
}

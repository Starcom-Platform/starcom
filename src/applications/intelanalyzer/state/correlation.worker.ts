/// <reference lib="webworker" />
import { CorrelationIndex } from './CorrelationIndex';
import type { Event } from '../adapters/eventsAdapter';
import type { LocationConflict, CorroboratedFinding } from './correlationUtils';

/**
 * Correlation worker. The index lives HERE, not on the main thread.
 *
 * That placement is the whole point. A worker that received the full event set
 * on every call would pay a structured-clone of the entire corpus each time —
 * at the 20000-event cap that clone is itself the cost we were trying to
 * avoid. Keeping the index resident means a poll sends only its delta (tens of
 * events), and only the results (a few hundred conflicts and findings) come
 * back.
 *
 * CorrelationIndex was built for incremental updates before this worker
 * existed; add/conflicts/findings mapped onto messages without changing it.
 */

export type CorrelationRequest =
  | { type: 'reset'; requestId: number; events: Event[] }
  | { type: 'add'; requestId: number; events: Event[] };

export interface CorrelationResponse {
  requestId: number;
  conflicts: LocationConflict[];
  findings: CorroboratedFinding[];
  stats: { events: number; entities: number; evicted: number };
}

const index = new CorrelationIndex();

self.onmessage = (e: MessageEvent<CorrelationRequest>) => {
  const msg = e.data;
  if (msg.type === 'reset') index.reset(msg.events);
  else index.add(msg.events);

  const stats = index.stats();
  const response: CorrelationResponse = {
    requestId: msg.requestId,
    conflicts: index.conflicts(),
    findings: index.findings(),
    stats: { events: stats.events, entities: stats.entities, evicted: stats.evicted },
  };
  (self as unknown as Worker).postMessage(response);
};

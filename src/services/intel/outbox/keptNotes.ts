/**
 * What the outbox keeps, as the screen that sent it shows it (work packages W1 and W1b): a report's note and its
 * withdrawal, a settlement or a challenge of a report on one's mission, one's inbox list, and a Mission Package. Each screen says
 * which of its own waits, or was given up on, and cancels it there.
 */
import { useEffect, useState } from 'react';
import { eventOutbox, isKeptPackageOf, type EventOutbox, type WaitingEvent } from './EventOutbox';
import { MISSION_LABEL_KIND } from '../missionLabels';

/** Everything kept, following the outbox as it changes. */
export function useKeptNotes(outbox: EventOutbox = eventOutbox): WaitingEvent[] {
  const [records, setRecords] = useState<WaitingEvent[]>([]);
  useEffect(() => {
    let live = true;
    const load = () => {
      outbox.waiting()
        .then((waiting) => { if (live) setRecords(waiting); })
        .catch(() => { if (live) setRecords([]); });
    };
    load();
    const stop = outbox.onChange(load);
    return () => { live = false; stop(); };
  }, [outbox]);
  return records;
}

export interface KeptForReport {
  publish?: WaitingEvent;
  withdrawal?: WaitingEvent;
}

/** A report's kept note, and its kept withdrawal. */
export function keptForReport(records: readonly WaitingEvent[], reportId: string): KeptForReport {
  const kept: KeptForReport = {};
  for (const record of records) {
    const { after } = record;
    if (!after) continue;
    if ('published' in after && after.published.report === reportId) kept.publish = record;
    if ('withdrawn' in after && after.withdrawn.report === reportId) kept.withdrawal = record;
  }
  return kept;
}

/** A settlement or a challenge kept for a report on one's mission: the label names the report by its id. */
export function keptLabelOn(records: readonly WaitingEvent[], reportId: string, word: 'settled' | 'challenged'): WaitingEvent | undefined {
  return records.find((r) => r.event.kind === MISSION_LABEL_KIND
    && r.event.tags.some((t) => t[0] === 'e' && t[1] === reportId)
    && r.event.tags.some((t) => t[0] === 'l' && t[1] === word));
}

/** A mission's Mission Package, kept when no relay took it (W1c). */
export function keptPackageOf(records: readonly WaitingEvent[], missionId: string): WaitingEvent | undefined {
  return records.find((r) => isKeptPackageOf(r, missionId));
}

/** This person's inbox list (kind 10050), kept. */
export function keptInboxOf(records: readonly WaitingEvent[], pubkey: string | null | undefined): WaitingEvent | undefined {
  return pubkey ? records.find((r) => r.event.kind === 10050 && r.event.pubkey === pubkey) : undefined;
}

/**
 * Let a kept note go unsent. A withdrawal's notice takes its request to delete with it: the notice's slot is the
 * report's address, which the request names. The request goes first: until the notice is gone the screen still shows
 * the withdrawal waiting, so a drain or a closed tab in between can never send the request without its notice.
 */
export async function cancelKept(record: WaitingEvent, outbox: EventOutbox = eventOutbox): Promise<void> {
  if (record.after && 'withdrawn' in record.after) {
    for (const other of await outbox.waiting()) {
      if (other.event.kind === 5 && other.event.tags.some((t) => t[0] === 'a' && t[1] === record.slot)) await outbox.cancel(other.id);
    }
  }
  await outbox.cancel(record.id);
}

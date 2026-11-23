/**
 * One of Mecha Jono's event sets for the events lane (decision D-PW, PW46): fetched once a page load and kept for it,
 * only while the lane shows; null until it arrives or where it could not be read.
 */
import { useEffect, useState } from 'react';
import { eventSetUrl, readEventSet, type EventSet, type EventSetFile, type EventSetId } from '../../../services/psiWatch/timestream/eventSets';

const kept = new Map<EventSetId, Promise<EventSet | null>>();

function load(id: EventSetId): Promise<EventSet | null> {
  let p = kept.get(id);
  if (!p) {
    p = fetch(eventSetUrl(id))
      .then((res) => (res.ok ? res.json() as Promise<EventSetFile> : null))
      .then((file) => (file ? readEventSet(file) : null))
      .catch(() => null);
    // A set that could not be read is tried again next time.
    p.then((set) => { if (!set) kept.delete(id); });
    kept.set(id, p);
  }
  return p;
}

export function useEventSet(id: EventSetId, enabled: boolean): EventSet | null {
  const [set, setSet] = useState<EventSet | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    setSet(null);
    void load(id).then((s) => { if (live) setSet(s); });
    return () => { live = false; };
  }, [id, enabled]);
  return set;
}

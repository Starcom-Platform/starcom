/**
 * What the globe draws for the Case or Mission it was asked to show, read from the live stores.
 *
 * GlobeContext holds only which record. It and its linked records are read here
 * (readShownRecord), and read again on every workspace change, so a link or a
 * coordinate added after "Show on the globe" appears on the globe. A snapshot
 * taken at the click would leave the pins and their counts describing the
 * record as it was then.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ShownOnGlobe } from '../../../context/GlobeContext';
import { intelWorkspaceManager } from '../../../services/intel/IntelWorkspaceManager';
import { readShownRecord } from '../../../services/intel/globe/readShownRecord';
import type { LinkedRecordPlacement } from '../../../services/intel/globe/linkedRecordPlacement';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'globe-shown-record' });

export type ShownRecord =
  | { status: 'none' }
  | { status: 'loading'; target: ShownOnGlobe }
  | { status: 'missing'; target: ShownOnGlobe }
  | { status: 'failed'; target: ShownOnGlobe }
  | {
    status: 'ready'; target: ShownOnGlobe; label: string; placement: LinkedRecordPlacement; caseCount?: number;
    citations?: { cited: number; found: number; unresolved: string[] };
    published?: number;
  };

const NONE: ShownRecord = { status: 'none' };
// The whole target, since a package carries its signer and citations as well
// as its id (plan item 9.14). A string key, so an equal target reads once.
const keyOf = (target: ShownOnGlobe | null) => (target ? JSON.stringify(target) : null);
const targetOf = (key: string): ShownOnGlobe => JSON.parse(key) as ShownOnGlobe;

export const useShownRecord = (shown: ShownOnGlobe | null): ShownRecord => {
  const key = keyOf(shown);
  const [reading, setReading] = useState<ShownRecord>(NONE);
  const loading = useMemo<ShownRecord>(() => (key ? { status: 'loading', target: targetOf(key) } : NONE), [key]);

  useEffect(() => {
    if (!key) return;
    const target = targetOf(key);
    let live = true;
    let running = false;
    let again = false;

    const readOnce = async (): Promise<ShownRecord> => {
      try {
        const read = await readShownRecord(target);
        return read.status === 'missing' ? { status: 'missing', target } : { ...read, target };
      } catch (error) {
        log.warn(`Could not read ${target.kind} ${target.id} for the globe`, error);
        return { status: 'failed', target };
      }
    };

    // Workspace changes come in bursts (the Nostr ingest persists reports a
    // dozen at a time), so a change during a read queues one more read, not
    // one read per change.
    const read = async () => {
      if (running) {
        again = true;
        return;
      }
      running = true;
      do {
        again = false;
        const next = await readOnce();
        if (!live) return;
        // The same reading keeps the same object. A fresh markers array on
        // every workspace change would rebuild every 3D model on the globe.
        setReading((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      } while (again);
      running = false;
    };

    void read();
    // Cases, missions, reports and intel items are all workspace state, and
    // their services re-announce changes from this same subscription.
    const unsubscribe = intelWorkspaceManager.subscribe(() => {
      void read();
    });
    return () => {
      live = false;
      unsubscribe();
      setReading(NONE);
    };
  }, [key]);

  if (!key) return NONE;
  // Until the first read for THIS record lands, say so. Never the previous
  // record's pins under the new record's name.
  if (reading.status === 'none' || keyOf(reading.target) !== key) return loading;
  return reading;
};

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { liveRlshNotes, startLiveRlsh, subscribeLiveRlsh } from './liveRlsh';
import { loadRlshKit, type RlshFixture } from './rlshKit';
import { addressOf, rlshFamilyOf, rlshRefusalOf, versionAt, type RlshFamily, type RlshNote, type RlshRefusal } from './recurrence';

/**
 * The RLSH items held (decision D-RR): the kit's fixtures under `?rlsh=kit` (RR3), every version of each kept, so a
 * view shows each as it stood at the cursor. Live windows and Cases from The Record join here once read (plan step 3);
 * live packages arrive with the received missions, and live totals through the totals read.
 */
export interface RlshHeld {
  /** Every version, by family. */
  notes: Record<RlshFamily, RlshNote[]>;
  /** What was refused, and why (kit section 6). */
  refused: Array<{ file: string; reason: RlshRefusal }>;
  /** Whether these are the kit's samples. */
  samples: boolean;
}

const EMPTY: RlshHeld = { notes: { recurrence_window: [], recurrence_case: [], mission_totals: [], celebration_safety: [] }, refused: [], samples: false };

function hold(fixtures: readonly RlshFixture[]): RlshHeld {
  const held: RlshHeld = { notes: { recurrence_window: [], recurrence_case: [], mission_totals: [], celebration_safety: [] }, refused: [], samples: fixtures.length > 0 };
  for (const f of fixtures) {
    const family = rlshFamilyOf(f.event);
    if (!family) continue;
    const refused = rlshRefusalOf(f.event);
    if (refused) held.refused.push({ file: f.file, reason: refused });
    else held.notes[family].push(f.event);
  }
  return held;
}

/**
 * The items held: the kit's when `samples` (only with ?rlsh=kit), and the live windows and Cases from The Record when
 * `live`, each kept apart from the other by its own address.
 */
export function useRlshItems(samples: boolean, live = false): RlshHeld {
  const [fixtures, setFixtures] = useState<RlshFixture[]>([]);
  useEffect(() => {
    if (!samples) return undefined;
    let open = true;
    void loadRlshKit().then((f) => { if (open) setFixtures(f); }, () => { if (open) setFixtures([]); });
    return () => { open = false; };
  }, [samples]);
  const liveNotes = useSyncExternalStore(subscribeLiveRlsh, liveRlshNotes, liveRlshNotes);
  useEffect(() => (live ? startLiveRlsh() : undefined), [live]);
  return useMemo(() => {
    const kit = samples ? hold(fixtures) : EMPTY;
    if (!live || !liveNotes.length) return kit;
    const notes = { ...kit.notes };
    for (const note of liveNotes) {
      const family = rlshFamilyOf(note);
      if (family) notes[family] = [...notes[family], note];
    }
    return { ...kit, notes };
  }, [samples, fixtures, live, liveNotes]);
}

/** Each address's version standing at a moment, unix seconds. */
export function standingAt(notes: readonly RlshNote[], atS: number): RlshNote[] {
  const byAddress = new Map<string, RlshNote[]>();
  for (const n of notes) byAddress.set(addressOf(n), [...(byAddress.get(addressOf(n)) ?? []), n]);
  return [...byAddress.values()].map((versions) => versionAt(versions, atS)).filter((n): n is RlshNote => n !== null);
}

/**
 * A link's `open=<note id>` (critique-2026-11-01, OR23; plan A5): the inspector's "Copy a link" opens Starcom on the
 * item, with the inspector open. The rest of the link is deeplink v1 or v2 (deeplinkV1.ts), read as ever; this one
 * parameter is read here, and a parser that does not know it ignores it, as every v1 parameter stands alone.
 *
 * The item is looked for among the marks drawn (findMarkByNoteId), once a second until the layers have drawn it,
 * for a minute at most; a link to an item no longer drawn opens the view without it.
 */
import { useEffect } from 'react';
import { getRegisteredTooltipGroups } from '../../../components/Globe/pointTooltipRegistry';
import { openGlobeNotes } from '../noteDetail/globeNoteStore';
import { findMarkByNoteId } from './relatedMarks';

export const OPEN_PARAM = 'open';
const LOOK_EVERY_MS = 1000;
const LOOK_FOR_MS = 60_000;
/** A note id as layers make them: an event's hex id, an address, a layer's own `kind:place:type`. */
const NOTE_ID = /^[\w:.\-/@]{1,200}$/;

/** The note id a link asks to open, or null. */
export function openFromSearch(search: string): string | null {
  try {
    const asked = new URLSearchParams(search).get(OPEN_PARAM);
    return asked && NOTE_ID.test(asked) ? asked : null;
  } catch {
    return null;
  }
}

/** Opens a link's item once its layer has drawn it. */
export function useOpenFromLink(): void {
  useEffect(() => {
    const id = openFromSearch(globalThis.location?.search ?? '');
    if (!id) return undefined;
    const started = Date.now();
    const timer = setInterval(() => {
      const found = findMarkByNoteId(getRegisteredTooltipGroups().filter((g) => g.parent !== null), id);
      if (found) {
        openGlobeNotes(found.opens, { at: found.at, index: found.index });
        clearInterval(timer);
      } else if (Date.now() - started > LOOK_FOR_MS) {
        clearInterval(timer);
      }
    }, LOOK_EVERY_MS);
    return () => clearInterval(timer);
  }, []);
}

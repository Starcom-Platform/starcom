/**
 * Arcs that open what they stand for (D-GV W3): react-globe.gl draws the arc layer and says which arc the pointer is
 * over and which one was clicked. An arc with notes (`opens`, War & Conflict's state forces) opens them; while the
 * pointer is over one, it takes the click from the layers beneath, as a glyph does (globeClick.ts), so the country
 * under it does not open its panel too.
 */
import { useCallback, useEffect, useRef } from 'react';
import { claimGlobeClicks } from '../../../components/Globe/globeClick';
import { openGlobeNotes, type GlobeNoteSet } from '../noteDetail/globeNoteStore';
import { setHoverOwner } from '../../../components/Globe/hoverOwners';

/** An arc as the layer hands it back: whatever it was given, with notes perhaps. */
type ArcDatum = { opens?: GlobeNoteSet | null } | null | undefined;

const notesOf = (arc: ArcDatum): GlobeNoteSet | null => {
  const opens = arc?.opens;
  return opens && Array.isArray(opens.notes) && opens.notes.length > 0 ? opens : null;
};

export function useGlobeArcClicks(): { onArcHover: (arc: object | null) => void; onArcClick: (arc: object) => void } {
  const overRef = useRef(false);
  useEffect(() => claimGlobeClicks(() => ({ mark: overRef.current, area: overRef.current })), []);
  useEffect(() => () => setHoverOwner('arc', false), []);
  const onArcHover = useCallback((arc: object | null) => {
    overRef.current = notesOf(arc as ArcDatum) !== null;
    // Every arc shows its own label (react-globe.gl's): the tooltips of what lies under it wait (hoverOwners.ts).
    setHoverOwner('arc', arc !== null);
  }, []);
  const onArcClick = useCallback((arc: object) => {
    const notes = notesOf(arc as ArcDatum);
    if (notes) openGlobeNotes(notes);
  }, []);
  return { onArcHover, onArcClick };
}

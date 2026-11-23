/**
 * An arc with notes opens them, and takes the click from the layers beneath while the pointer is over it (D-GV W3).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGlobeArcClicks } from '../useGlobeArcClicks';
import { nearerLayerTakes } from '../../../../components/Globe/globeClick';
import { closeGlobeNotes, getGlobeNoteState } from '../../noteDetail/globeNoteStore';

const withNotes = { label: 'An arc', opens: { heading: 'Turkish Armed Forces, from Turkey', notes: [{ id: 'n', kind: 'Conflict note', title: 'A strike', text: '', timeMs: null, sources: [] }] } };

describe('useGlobeArcClicks', () => {
  afterEach(() => { closeGlobeNotes(); });

  it("takes the click while over an arc with notes, and opens them on a click", () => {
    const { result, unmount } = renderHook(() => useGlobeArcClicks());
    expect(nearerLayerTakes('area')).toBe(false);
    act(() => result.current.onArcHover(withNotes));
    expect(nearerLayerTakes('area')).toBe(true);
    act(() => result.current.onArcClick(withNotes));
    expect(getGlobeNoteState().open?.heading).toBe('Turkish Armed Forces, from Turkey');
    act(() => result.current.onArcHover(null));
    expect(nearerLayerTakes('area')).toBe(false);
    unmount();
  });

  it('leaves an arc with nothing behind it to the layers beneath, and opens nothing', () => {
    const { result, unmount } = renderHook(() => useGlobeArcClicks());
    act(() => result.current.onArcHover({ label: 'A report arc' }));
    expect(nearerLayerTakes('area')).toBe(false);
    act(() => result.current.onArcClick({ label: 'A report arc', opens: { heading: 'Empty', notes: [] } }));
    expect(getGlobeNoteState().open).toBeNull();
    unmount();
  });
});

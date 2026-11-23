/**
 * The globe's pointer handling, as ADR-0002 extracted it from Enhanced3DGlobeInteractivity: a press told from a
 * drag (usePointerClickDrag), and what a click then opens (useIntelRlshPopupFlow).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useRef, useState } from 'react';

const popups = vi.hoisted(() => ({ show: vi.fn(() => 'popup-1'), hide: vi.fn() }));
vi.mock('../../../../components/Popup/PopupManager', () => ({
  usePopup: () => ({ showPopup: popups.show, hidePopup: popups.hide }),
}));

import { usePointerClickDrag } from '../usePointerClickDrag';
import { useIntelRlshPopupFlow } from '../useIntelRlshPopupFlow';
import { CLICK_TIME_THRESHOLD_MS, DRAG_THRESHOLD_PX, INITIAL_INTERACTION_STATE, type UnifiedInteractionState } from '../interactionState';
import { placePick } from '../../../../services/intel/place/placePick';
import type { IntelReportOverlayMarker } from '../../../../interfaces/IntelReportOverlay';
import type { GlobeClickClaim } from '../../../../components/Globe/globeClick';

const report = (pubkey: string): IntelReportOverlayMarker => ({
  pubkey, title: `Report ${pubkey}`, content: '', tags: [], latitude: 10, longitude: 20, timestamp: 0, author: 'a',
});

describe('usePointerClickDrag', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    container.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
    document.body.appendChild(container);
  });
  afterEach(() => { container.remove(); placePick.cancel(); vi.useRealTimers(); });

  function mount(listens = true) {
    const onMove = vi.fn();
    const onPress = vi.fn();
    const hook = renderHook(() => {
      const [state, setState] = useState<UnifiedInteractionState>(INITIAL_INTERACTION_STATE);
      const containerRef = useRef(container);
      const pointerOverRef = useRef<GlobeClickClaim>({ mark: true, area: true });
      const clickPointRef = useRef({ x: 0, y: 0 });
      const isDraggingRef = useRef(false);
      usePointerClickDrag({ listensForClicks: listens, containerRef, setUnifiedInteractionState: setState, pointerOverRef, clickPointRef, isDraggingRef, onMove, onPress });
      return { state, setState, pointerOverRef, clickPointRef, isDraggingRef };
    });
    return { ...hook, onMove, onPress };
  }
  const press = (type: string, x: number, y: number, button = 0) =>
    act(() => { container.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, button, bubbles: true })); });

  it('takes a quick press that barely moves, over a hovered mark, as a click on it', () => {
    const { result, onPress } = mount();
    act(() => result.current.setState((prev) => ({ ...prev, hoveredModel: { report: report('a') } })));
    press('mousedown', 100, 100);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(result.current.state.isMouseDown).toBe(true);
    press('mouseup', 102, 101);
    expect(result.current.state.clickedModel?.report.pubkey).toBe('a');
    expect(result.current.state.isMouseDown).toBe(false);
    expect(result.current.clickPointRef.current).toEqual({ x: 102, y: 101 });
  });

  it('takes a press on the globe with no mark as a click there, for the territories', () => {
    const { result } = mount();
    act(() => result.current.setState((prev) => ({ ...prev, globeHoverPosition: { lat: 1, lng: 2 } })));
    press('mousedown', 100, 100);
    press('mouseup', 100, 100);
    expect(result.current.state.clickedGlobeAt).toEqual({ lat: 1, lng: 2 });
    expect(result.current.state.clickedModel).toBeNull();
  });

  it('takes a drag past the threshold, or a long press, as no click', () => {
    const { result } = mount();
    act(() => result.current.setState((prev) => ({ ...prev, hoveredModel: { report: report('a') } })));
    press('mousedown', 100, 100);
    act(() => result.current.setState((prev) => ({ ...prev, hasDraggedPastThreshold: true, dragDistance: DRAG_THRESHOLD_PX + 1 })));
    press('mouseup', 120, 100);
    expect(result.current.state.clickedModel).toBeNull();

    vi.useFakeTimers();
    press('mousedown', 100, 100);
    vi.advanceTimersByTime(CLICK_TIME_THRESHOLD_MS + 1);
    press('mouseup', 100, 100);
    expect(result.current.state.clickedModel).toBeNull();
  });

  it('ignores any button but the primary, and a press while a report picks its place', () => {
    const { result } = mount();
    press('mousedown', 100, 100, 2);
    expect(result.current.state.isMouseDown).toBe(false);
    act(() => placePick.request());
    press('mousedown', 100, 100);
    expect(result.current.state.isMouseDown).toBe(false);
  });

  it('passes moves to the hover, and says nothing is under the pointer once it leaves the globe', () => {
    const { result, onMove } = mount();
    press('mousemove', 10, 10);
    expect(onMove).toHaveBeenCalledTimes(1);
    act(() => { container.dispatchEvent(new MouseEvent('mouseleave', { button: 0 })); });
    expect(result.current.pointerOverRef.current).toEqual({ mark: false, area: false });
  });

  it('attaches nothing while the globe listens for no clicks', () => {
    const { onMove } = mount(false);
    press('mousemove', 10, 10);
    expect(onMove).not.toHaveBeenCalled();
  });
});

describe('useIntelRlshPopupFlow', () => {
  beforeEach(() => { popups.show.mockClear(); popups.hide.mockClear(); });

  function mount(initial: { clickedModel?: UnifiedInteractionState['clickedModel']; clickedGlobeAt?: UnifiedInteractionState['clickedGlobeAt']; groups?: Array<{ key: string; title: string; members: IntelReportOverlayMarker[] }>; reports?: IntelReportOverlayMarker[] }) {
    const clearClickedState = vi.fn();
    const consumeGlobeClick = vi.fn();
    const hideTooltip = vi.fn();
    const hideTerritoryHover = vi.fn();
    const hook = renderHook((props: { clickedModel: UnifiedInteractionState['clickedModel']; clickedGlobeAt: UnifiedInteractionState['clickedGlobeAt']; listens: boolean }) => {
      const intelReportsRef = useRef(initial.reports ?? []);
      const territoryGroupsAtRef = useRef<((lat: number, lng: number) => typeof initial.groups & object) | null>(() => initial.groups ?? []);
      const clickPointRef = useRef({ x: 40, y: 50 });
      return useIntelRlshPopupFlow({
        hasInteractiveMarkers: true,
        listensForClicks: props.listens,
        clickedModel: props.clickedModel,
        clickedGlobeAt: props.clickedGlobeAt,
        clearClickedState,
        consumeGlobeClick,
        intelReportsRef,
        territoryGroupsAtRef,
        clickPointRef,
        rlshSelectionMemory: { getPopupSeedForReport: vi.fn(), recordMarkerSelection: vi.fn() } as never,
        modelCount: 1,
        hideTooltip,
        hideTerritoryHover,
      });
    }, { initialProps: { clickedModel: initial.clickedModel ?? null, clickedGlobeAt: initial.clickedGlobeAt ?? null, listens: true } });
    return { ...hook, clearClickedState, consumeGlobeClick, hideTooltip, hideTerritoryHover };
  }

  it("opens a clicked report's popup, alone at its place, and clears the click", () => {
    const only = report('a');
    const { clearClickedState, hideTooltip } = mount({ clickedModel: { report: only }, reports: [only] });
    expect(popups.show).toHaveBeenCalledTimes(1);
    expect(popups.show.mock.calls[0][0]).toMatchObject({ label: 'Intel report', props: { initialPubkey: 'a' } });
    expect(clearClickedState).toHaveBeenCalled();
    expect(hideTooltip).toHaveBeenCalled();
  });

  it('opens the menu at the click for a globe click inside territories with reports, and answers the click once', () => {
    const groups = [
      { key: 'territory:fr', title: 'France', members: [report('a')] },
      { key: 'territory:eu', title: 'Europe', members: [report('b')] },
    ];
    const { result, consumeGlobeClick } = mount({ clickedGlobeAt: { lat: 46, lng: 2 }, groups });
    expect(consumeGlobeClick).toHaveBeenCalledTimes(1);
    expect(result.current.groupMenu).toMatchObject({ at: { x: 40, y: 50 }, groups });
    // A report picked from it opens paging through its group, with the way back.
    act(() => result.current.pickFromMenu('territory:fr', 'a'));
    expect(result.current.groupMenu).toBeNull();
    expect(popups.show.mock.calls.at(-1)?.[0]).toMatchObject({ props: { initialPubkey: 'a', reports: groups[0].members } });
  });

  it('opens nothing for a globe click where no territory holds a report', () => {
    const { result } = mount({ clickedGlobeAt: { lat: 0, lng: 0 }, groups: [] });
    expect(result.current.groupMenu).toBeNull();
    expect(popups.show).not.toHaveBeenCalled();
  });

  it('closes the menu at the click when the globe stops listening', () => {
    const groups = [{ key: 'territory:fr', title: 'France', members: [report('a'), report('b')] }];
    const { result, rerender } = mount({ clickedGlobeAt: { lat: 46, lng: 2 }, groups });
    expect(result.current.groupMenu).not.toBeNull();
    rerender({ clickedModel: null, clickedGlobeAt: null, listens: false });
    expect(result.current.groupMenu).toBeNull();
  });
});

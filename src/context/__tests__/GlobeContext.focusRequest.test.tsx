/**
 * The "View on Globe" focus channel, tested from the CONSUMER side.
 *
 * The existing coverage for this affordance asserts that the producer called
 * setFocusLocation and navigateToApp, and stops there. That is exactly the
 * shape of test that let the feature be green in CI and wrong in the product:
 * both calls fired correctly, and the camera still re-flew to a stale target
 * every time the operator came back to the globe, because the globe unmounts
 * on each app switch while GlobeProvider lives above it, and nothing ever set
 * the focus back to null.
 *
 * These pin the consume-once contract that fixes it, and the thing that makes
 * the fix non-obvious: focusLocation must SURVIVE consumption, because three
 * other widgets (TinyGlobe, FloatingPanelManager, ContextBridge) read it as
 * durable "where is attention" state rather than as an event.
 */
import React, { useEffect, useRef } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { GlobeProvider, useGlobeContext } from '../GlobeContext';

const fly = vi.fn();

/** Stands in for Globe.tsx's focus effect — the same shape, without WebGL. */
const CameraConsumer: React.FC = () => {
  const { focusRequest, consumeFocusRequest } = useGlobeContext();
  useEffect(() => {
    if (!focusRequest) return;
    fly(focusRequest);
    consumeFocusRequest();
  }, [focusRequest, consumeFocusRequest]);
  return null;
};

/** Stands in for TinyGlobe / FloatingPanelManager — reads the durable value. */
const FocusReader: React.FC = () => {
  const { focusLocation } = useGlobeContext();
  return <div data-testid="focus">{focusLocation ? `${focusLocation.lat},${focusLocation.lng}` : 'none'}</div>;
};

let request: (loc: { lat: number; lng: number } | null) => void;
const Producer: React.FC = () => {
  const { setFocusLocation } = useGlobeContext();
  request = setFocusLocation;
  return null;
};

/** Mounts and unmounts the camera consumer, the way an app switch does. */
const Harness: React.FC<{ cameraMounted: boolean }> = ({ cameraMounted }) => (
  <GlobeProvider>
    <Producer />
    <FocusReader />
    {cameraMounted && <CameraConsumer />}
  </GlobeProvider>
);

describe('GlobeContext — camera focus requests', () => {
  beforeEach(() => { fly.mockReset(); });

  it('flies the camera once for one request', () => {
    render(<Harness cameraMounted />);

    act(() => request({ lat: 48.85, lng: 2.35 }));

    expect(fly).toHaveBeenCalledTimes(1);
    expect(fly).toHaveBeenCalledWith({ lat: 48.85, lng: 2.35 });
  });

  it('leaves focusLocation readable after the request is consumed', () => {
    // The three non-camera readers want the current focus, not an event —
    // clearing this on consumption is the naive fix and it breaks them.
    render(<Harness cameraMounted />);

    act(() => request({ lat: 48.85, lng: 2.35 }));

    expect(fly).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('focus').textContent).toBe('48.85,2.35');
  });

  it('does NOT re-fly when the camera remounts — the app-switch bug', () => {
    // This is the whole point. Globe.tsx unmounts on every app switch while
    // GlobeProvider stays mounted at app level. Keyed on the durable focus
    // value, returning to the globe re-flew to a target the operator asked
    // about once, screens ago — and forever, since nothing cleared it.
    const { rerender } = render(<Harness cameraMounted />);

    act(() => request({ lat: 48.85, lng: 2.35 }));
    expect(fly).toHaveBeenCalledTimes(1);

    rerender(<Harness cameraMounted={false} />); // navigate away
    rerender(<Harness cameraMounted />);         // and back

    expect(fly).toHaveBeenCalledTimes(1);
  });

  it('treats a repeat request for the same coordinates as a new request', () => {
    // The operator may have dragged the camera away since; asking again must
    // re-centre rather than silently do nothing.
    render(<Harness cameraMounted />);

    act(() => request({ lat: 48.85, lng: 2.35 }));
    act(() => request({ lat: 48.85, lng: 2.35 }));

    expect(fly).toHaveBeenCalledTimes(2);
  });

  it('does not fly for a request made while the camera was unmounted, then flies on return', () => {
    // A request raised from another app is still pending when the globe
    // mounts — that is the actual "View on Globe" sequence, and it must work.
    const { rerender } = render(<Harness cameraMounted={false} />);

    act(() => request({ lat: 35.68, lng: 139.69 }));
    expect(fly).not.toHaveBeenCalled();

    rerender(<Harness cameraMounted />);

    expect(fly).toHaveBeenCalledTimes(1);
    expect(fly).toHaveBeenCalledWith({ lat: 35.68, lng: 139.69 });
  });

  it('clears both the focus and any pending request when set to null', () => {
    render(<Harness cameraMounted />);

    act(() => request({ lat: 48.85, lng: 2.35 }));
    fly.mockReset();
    act(() => request(null));

    expect(fly).not.toHaveBeenCalled();
    expect(screen.getByTestId('focus').textContent).toBe('none');
  });
});

/**
 * A package's cited reports, or what a key published, arrive after "Show on
 * the globe" asked for them (plan item 9.14), so the camera cannot be aimed at
 * the click as it is for a case. It is aimed once, when they first give it
 * somewhere to look, and left alone after that: the person may have moved it.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAimAtArrivingRecord } from '../useAimAtArrivingRecord';
import type { ShownRecord } from '../useShownRecord';
import type { ShownOnGlobe } from '../../../../context/GlobeContext';

const PACKAGE = { kind: 'package' as const, id: 'evt-1', signer: 'a'.repeat(64), name: 'Nova', cites: ['ic-1'] };
const CASE = { kind: 'case' as const, id: 'case-1' };
const ready = (target: ShownOnGlobe, cameraTarget: { lat: number; lng: number } | null): ShownRecord => ({
  status: 'ready', target, label: 'x',
  placement: { linkedCount: 1, markers: [], notDrawn: { count: 0, byReason: {} }, cameraTarget },
});

describe('useAimAtArrivingRecord', () => {
  it('aims once, when a shown package first has somewhere to look', () => {
    const aim = vi.fn();
    const { rerender } = renderHook(({ shown }) => useAimAtArrivingRecord(shown, aim), {
      initialProps: { shown: { status: 'loading', target: PACKAGE } as ShownRecord },
    });
    rerender({ shown: ready(PACKAGE, null) });
    expect(aim).not.toHaveBeenCalled();
    rerender({ shown: ready(PACKAGE, { lat: 40.05, lng: -74.13 }) });
    rerender({ shown: ready(PACKAGE, { lat: 41, lng: -74 }) });
    expect(aim).toHaveBeenCalledTimes(1);
    expect(aim).toHaveBeenCalledWith({ lat: 40.05, lng: -74.13 });
  });

  it('aims again for a different package', () => {
    const aim = vi.fn();
    const { rerender } = renderHook(({ shown }) => useAimAtArrivingRecord(shown, aim), {
      initialProps: { shown: ready(PACKAGE, { lat: 40, lng: -74 }) },
    });
    rerender({ shown: ready({ ...PACKAGE, id: 'evt-2' }, { lat: 38.7, lng: -9.1 }) });
    expect(aim).toHaveBeenCalledTimes(2);
  });

  it('leaves a case alone: it was aimed at the click', () => {
    const aim = vi.fn();
    renderHook(() => useAimAtArrivingRecord(ready(CASE, { lat: 1, lng: 2 }), aim));
    expect(aim).not.toHaveBeenCalled();
  });
});

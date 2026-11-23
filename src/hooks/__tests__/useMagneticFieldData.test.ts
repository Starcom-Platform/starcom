import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMagneticFieldData } from '../useMagneticFieldData';

describe('useMagneticFieldData — no real magnetic-field/radiation-belt source is wired up yet', () => {
  it('never fabricates sample data when active, only ever returns null', () => {
    const { result } = renderHook(() => useMagneticFieldData(true));
    expect(result.current.data).toBeNull();
    expect(result.current.lastUpdated).toBeNull();
  });

  it('stays null when inactive too — same honest "not available" state either way', () => {
    const { result } = renderHook(() => useMagneticFieldData(false));
    expect(result.current.data).toBeNull();
    expect(result.current.lastUpdated).toBeNull();
  });

  it('stays null across an active toggle, not just on initial render', () => {
    const { result, rerender } = renderHook(({ active }) => useMagneticFieldData(active), {
      initialProps: { active: false }
    });
    rerender({ active: true });
    expect(result.current.data).toBeNull();
    expect(result.current.lastUpdated).toBeNull();
  });
});

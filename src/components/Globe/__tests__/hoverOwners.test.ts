/**
 * One hover card at a time (owner, 1 Nov): while a report's card, an arc's label or a hub's card shows, the point and
 * country tooltips wait; they come back once every such card has gone.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { resetHoverOwnersForTests, setHoverOwner, useHoverOwned } from '../hoverOwners';

describe('hoverOwners', () => {
  beforeEach(() => resetHoverOwnersForTests());

  it('holds the generic tooltips back while any card shows, and lets them go when all have gone', () => {
    const { result } = renderHook(() => useHoverOwned());
    expect(result.current).toBe(false);
    act(() => setHoverOwner('reportCard', true));
    expect(result.current).toBe(true);
    act(() => setHoverOwner('arc', true));
    act(() => setHoverOwner('reportCard', false));
    expect(result.current).toBe(true);
    act(() => setHoverOwner('arc', false));
    expect(result.current).toBe(false);
  });
});

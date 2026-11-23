import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGlobePlacePick } from '../useGlobePlacePick';
import { placePick } from '../../../../services/intel/place/placePick';
import { pressOn } from '../../globeClick';

/*
 * Picking a report's place on the globe (plan item 3.5): the form asks, the
 * globe's next click answers, and Esc goes back to the form without a place.
 */

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const press = (type: string, x: number, y: number, target: EventTarget = canvas, button = 0) => {
  act(() => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button })); });
};
const click = (x: number, y: number, target?: EventTarget) => { press('pointerdown', x, y, target); press('pointerup', x, y, target); };

const setup = (locate: (x: number, y: number) => { lat: number; lng: number } | null = (x, y) => ({ lat: y, lng: x })) => {
  const onPick = vi.fn();
  const onCancel = vi.fn();
  const hook = renderHook(() => useGlobePlacePick({ canvas: () => canvas, locate, onPick, onCancel }));
  return { onPick, onCancel, hook };
};

afterEach(() => { placePick.cancel(); });

describe('useGlobePlacePick', () => {
  it('gives the place the next click on the globe lands on, and ends the pick', () => {
    const { onPick, hook } = setup();
    act(() => { placePick.request(); });
    expect(hook.result.current.pending).toBe(true);
    click(10, 20);
    expect(onPick).toHaveBeenCalledWith(20, 10);
    expect(placePick.isPending()).toBe(false);
    expect(hook.result.current.pending).toBe(false);
  });

  it('takes nothing from a drag that turns the globe to find the place', () => {
    const { onPick } = setup();
    act(() => { placePick.request(); });
    press('pointerdown', 10, 20);
    press('pointerup', 90, 20);
    expect(onPick).not.toHaveBeenCalled();
    expect(placePick.isPending()).toBe(true);
  });

  it('keeps waiting after a click on space beside the globe', () => {
    const { onPick } = setup(() => null);
    act(() => { placePick.request(); });
    click(10, 20);
    expect(onPick).not.toHaveBeenCalled();
    expect(placePick.isPending()).toBe(true);
  });

  it('takes nothing from a click on something over the globe, or a right-click', () => {
    const { onPick } = setup();
    const over = document.createElement('button');
    document.body.appendChild(over);
    act(() => { placePick.request(); });
    click(10, 20, over);
    // Pressed on a panel's button and let go over the globe: the press was the panel's.
    press('pointerdown', 10, 20, over);
    press('pointerup', 10, 20, canvas);
    press('pointerdown', 10, 20, canvas, 2);
    press('pointerup', 10, 20, canvas, 2);
    expect(onPick).not.toHaveBeenCalled();
    over.remove();
  });

  it('takes no click when no report asked for a place', () => {
    const { onPick } = setup();
    click(10, 20);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('goes back to the report on Esc, without a place', () => {
    const { onPick, onCancel } = setup();
    act(() => { placePick.request(); });
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(placePick.isPending()).toBe(false);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('hears no Esc when no report asked for a place', () => {
    const { onCancel } = setup();
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('goes back to the report from its button, as a person without a keyboard would', () => {
    const { onCancel, hook } = setup();
    act(() => { placePick.request(); });
    act(() => { hook.result.current.cancel(); });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(placePick.isPending()).toBe(false);
  });

  it('keeps every other layer from picking while a place is picked, so no panel opens over the form', () => {
    const at = { button: 0, clientX: 40, clientY: 60, target: canvas };
    expect(pressOn(at, canvas)).toEqual({ x: 40, y: 60 });
    act(() => { placePick.request(); });
    expect(pressOn(at, canvas)).toBeNull();
  });
});

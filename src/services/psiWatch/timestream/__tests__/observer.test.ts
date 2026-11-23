/**
 * The Timestream's observer (decision D-PW, PW43, PW65): one place shared by the drawer and the globe, and the Zone
 * it lies in by name, never a retired one, whose successors hold its places.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { areaByCode } from '../../../../features/globe/areas/areaRegistry';
import type { AreaShapes } from '../../../../features/globe/areas/areaShapes';
import { getObserverState, setObserverState, subscribeObserver, zoneNameAt } from '../observer';

const square = (w: number, s: number, e: number, n: number) => ({ type: 'Polygon' as const, coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]] as [number, number][]] });

describe('observer', () => {
  afterEach(() => setObserverState(null, false));

  it('tells its listeners of a new place or a pin, and not of the same again', () => {
    let told = 0;
    const stop = subscribeObserver(() => { told += 1; });
    setObserverState({ lat: 12.5, lon: 3 }, false);
    setObserverState({ lat: 12.5, lon: 3 }, false);
    setObserverState({ lat: 12.5, lon: 3 }, true);
    stop();
    expect(told).toBe(2);
    expect(getObserverState()).toEqual({ observer: { lat: 12.5, lon: 3 }, pinned: true });
  });

  it('names the Zone a place lies in, passing over a retired Zone that drew the same ground', () => {
    // The Sahel, retired by ZSP 2.0, is listed first and covers the place; the Zone now holding it is named.
    expect(areaByCode('zone:sahel')?.from).toBe('covered');
    const live = areaByCode('zone:central-african-rifts')!;
    const shapes: AreaShapes = new Map([
      ['zone:sahel', { name: 'Sahel Zone', geometry: square(-20, 5, 40, 25) }],
      ['terra:africana', { name: 'Terra Africana', geometry: square(-20, -35, 55, 38) }],
      ['zone:central-african-rifts', { name: live.name, geometry: square(15, 8, 30, 22) }],
    ]);
    expect(zoneNameAt(shapes, { lat: 13, lon: 20 })).toBe(live.name);
    expect(zoneNameAt(shapes, { lat: 13, lon: 0 })).toBeNull();
  });
});

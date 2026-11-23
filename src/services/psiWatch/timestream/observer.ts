/**
 * The Timestream's observer (decision D-PW, PW43, PW65): the place its angles are cast for, the globe's centre or a
 * pinned place. The drawer says where; the globe marks it, and the drawer names it by the Zone it lies in.
 */
import { useSyncExternalStore } from 'react';
import { boundsOf, pointInGeometry } from '../../geoint/pointInPolygon';
import { areaByCode } from '../../../features/globe/areas/areaRegistry';
import type { AreaShapes } from '../../../features/globe/areas/areaShapes';
import type { Observer } from './skyColumns';

export interface ObserverState {
  observer: Observer | null;
  pinned: boolean;
}

let state: ObserverState = { observer: null, pinned: false };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export const getObserverState = (): ObserverState => state;

export function setObserverState(observer: Observer | null, pinned: boolean): void {
  if (state.pinned === pinned && state.observer?.lat === observer?.lat && state.observer?.lon === observer?.lon) return;
  state = { observer, pinned };
  emit();
}

export function subscribeObserver(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export const useObserverState = (): ObserverState => useSyncExternalStore(subscribeObserver, getObserverState, getObserverState);

const bounds = new WeakMap<object, [number, number, number, number]>();

/** The Zone a place lies in, its code and name, from the areas' shapes; a retired Zone never, as its successors hold the place. */
export function zoneAt(shapes: AreaShapes, { lat, lon }: Observer): { code: string; name: string } | null {
  for (const [code, outline] of shapes) {
    if (!code.startsWith('zone:')) continue;
    const area = areaByCode(code);
    if (!area || area.kind !== 'zone' || area.from === 'covered') continue;
    let box = bounds.get(outline.geometry);
    if (!box) { box = boundsOf(outline.geometry); bounds.set(outline.geometry, box); }
    if (lon < box[0] || lat < box[1] || lon > box[2] || lat > box[3]) continue;
    if (pointInGeometry(lat, lon, outline.geometry)) return { code, name: outline.name };
  }
  return null;
}

/** The Zone a place lies in, by name. */
export const zoneNameAt = (shapes: AreaShapes, observer: Observer): string | null => zoneAt(shapes, observer)?.name ?? null;

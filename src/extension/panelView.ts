/**
 * What Uplink's side panel shows of the open case (decision D-EX, E2, W6): the captures sent to it,
 * newest first, and the objectives still open on the missions resting on it, with their limits, so a
 * person collecting for a mission sees what they may not do while they do it.
 */
import type { IntelItemUI } from '../types/intel/IntelItemUI';
import type { MissionUI } from '../types/intel/MissionUI';
import { CAPTURE_CATEGORY, CAPTURE_TAG, type CaptureHolder } from './captureItems';

const capturedAt = (i: Pick<IntelItemUI, 'collectedAt' | 'createdAt'>) => Date.parse(i.collectedAt ?? '') || i.createdAt.getTime();

/** The captures a case holds, as evidence or against it, newest first. */
export function capturesInCase<I extends Pick<IntelItemUI, 'id' | 'tags' | 'categories' | 'collectedAt' | 'createdAt'>>(
  items: readonly I[],
  held: CaptureHolder,
  limit = 10,
): I[] {
  const ids = new Set([...(held.relatedEntities ?? []), ...(held.contradictedBy ?? [])]);
  return items
    .filter((i) => ids.has(i.id) && i.tags.includes(CAPTURE_TAG) && i.categories.includes(CAPTURE_CATEGORY))
    .sort((a, b) => capturedAt(b) - capturedAt(a))
    .slice(0, limit);
}

export interface OpenWork {
  id: string;
  title: string;
  status: MissionUI['status'];
  objectives: Array<{ id: string; description: string; limits: string[] }>;
}

/** Each mission's objectives not yet done, with their limits; a mission with none left is left out. */
export function openObjectives(missions: readonly Pick<MissionUI, 'id' | 'title' | 'status' | 'objectives'>[]): OpenWork[] {
  return missions
    .map((m) => ({
      id: m.id, title: m.title, status: m.status,
      objectives: m.objectives.filter((o) => !o.completed).map((o) => ({ id: o.id, description: o.description, limits: o.limits ?? [] })),
    }))
    .filter((m) => m.objectives.length > 0);
}

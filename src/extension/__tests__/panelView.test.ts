/**
 * What Uplink's side panel shows of the open case (decision D-EX, E2, W6): the captures sent to it,
 * newest first, and the objectives still open on the missions resting on it, each with its limits.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { capturesInCase, openObjectives } from '../panelView';
import { CAPTURE_CATEGORY, CAPTURE_TAG } from '../captureItems';
import type { IntelItemUI } from '../../types/intel/IntelItemUI';
import type { MissionUI } from '../../types/intel/MissionUI';

const item = (id: string, collectedAt: string, capture = true) => ({
  id, title: id, collectedAt, createdAt: new Date(collectedAt),
  tags: capture ? [CAPTURE_TAG, 'selection'] : ['other'], categories: capture ? [CAPTURE_CATEGORY] : ['other'],
}) as unknown as IntelItemUI;

describe('capturesInCase', () => {
  it('are the captures the case holds, either way, newest first, at most as many as asked', () => {
    const items = [item('old', '2026-10-10T08:00:00Z'), item('new', '2026-10-11T21:00:00Z'), item('against', '2026-10-11T09:00:00Z'), item('elsewhere', '2026-10-11T22:00:00Z'), item('report-ish', '2026-10-11T23:00:00Z', false)];
    const held = { relatedEntities: ['old', 'new', 'report-ish'], contradictedBy: ['against'] };
    expect(capturesInCase(items, held).map((i) => i.id)).toEqual(['new', 'against', 'old']);
    expect(capturesInCase(items, held, 2).map((i) => i.id)).toEqual(['new', 'against']);
  });
});

describe('openObjectives', () => {
  it('lists each mission\'s objectives not yet done, with their limits, and leaves out missions with none', () => {
    const missions = [
      { id: 'm1', title: 'Map the flood', status: 'ACTIVE', objectives: [
        { id: 'o1', description: 'Photograph the bridge', completed: false, limits: ['No drones', 'Public land only'] },
        { id: 'o2', description: 'Count closed roads', completed: true },
      ] },
      { id: 'm2', title: 'Done mission', status: 'COMPLETED', objectives: [{ id: 'o3', description: 'x', completed: true }] },
    ] as unknown as MissionUI[];
    expect(openObjectives(missions)).toEqual([
      { id: 'm1', title: 'Map the flood', status: 'ACTIVE', objectives: [{ id: 'o1', description: 'Photograph the bridge', limits: ['No drones', 'Public land only'] }] },
    ]);
  });
});

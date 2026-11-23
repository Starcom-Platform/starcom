/**
 * Campaigns and Operations on the globe (decision D-RS, RS25): read while the layer is on; each running or coming
 * one's places outlined in its colour, a disc at each place's middle whose hover names them and whose click opens
 * them in Operations, a pill with its name and clock; its legend published only when it draws; a feed line.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import type { ReadRosterItem } from '../../../../services/roster/rosterItem';
import type { TerritoryIndex } from '../../../../services/intel/coverage/territoryIndex';

const read = vi.hoisted(() => ({ items: [] as unknown[], started: 0, status: { loaded: true, error: null as string | null, at: 1 } }));
vi.mock('../../../../services/roster/rosterRead', () => ({
  rosterItems: () => read.items,
  rosterReadStatus: () => read.status,
  subscribeRoster: () => () => {},
  startRosterRead: () => { read.started += 1; return () => {}; },
}));
const square = (name: string, lon: number, lat: number) => ({ name, geometry: { type: 'Polygon' as const, coordinates: [[[lon, lat], [lon + 5, lat], [lon + 5, lat + 5], [lon, lat + 5], [lon, lat]]] } });
vi.mock('../../../../services/raverWatch/usStates', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../services/raverWatch/usStates')>()),
  loadUsStates: () => Promise.resolve(new Map([['us-ca', square('California', -122, 34)]])),
}));
vi.mock('../../heroWatchSprites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../heroWatchSprites')>()),
  bakeHeroWatchPills: (labels: string[]) => Promise.resolve({
    texture: new THREE.Texture(),
    cells: new Map(labels.map((label) => [label, { u0: 0, v0: 0, u1: 1, v1: 1, widthPx: 90 }])),
  }),
}));

import { useGlobeRosterOps, ROSTER_OPS_OUTLINE_TYPE, ROSTER_OPS_MARK_TYPE, ROSTER_OPS_PILL_TYPE } from '../useGlobeRosterOps';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';

const B = 'b'.repeat(64);
const op = (over: Partial<ReadRosterItem> = {}): ReadRosterItem => ({
  d: 'operation-1', kind: 'operation', title: 'Count the Geminids', limits: [], places: ['us-ca'], toward: [], counts: [], text: '',
  window: { from: '2026-12-13', until: '2026-12-15' }, author: B, createdAt: 1, address: `30084:${B}:operation-1`, ...over,
});
const TERRITORIES = { size: 1, at: () => null, byCode: () => null, countries: () => [] } as unknown as TerritoryIndex;
const NOW = Date.parse('2026-12-13T12:00:00Z');
const byType = (scene: THREE.Scene, type: string) => {
  let found: THREE.Object3D | null = null;
  scene.traverse((o) => { if (o.userData?.type === type) found = o; });
  return found as THREE.Object3D | null;
};

beforeEach(() => { read.items = []; read.started = 0; read.status = { loaded: true, error: null, at: 1 }; resetLegendsForTest(); });

describe('useGlobeRosterOps', () => {
  it('reads only while the layer is on', () => {
    renderHook(() => useGlobeRosterOps({ scene: new THREE.Scene(), active: false, territories: TERRITORIES, now: NOW }));
    expect(read.started).toBe(0);
    renderHook(() => useGlobeRosterOps({ scene: new THREE.Scene(), active: true, territories: TERRITORIES, now: NOW }));
    expect(read.started).toBe(1);
  });

  it('outlines each running one\'s places, with a disc that opens it in Operations, and a pill with its clock', async () => {
    read.items = [op()];
    const scene = new THREE.Scene();
    const { result } = renderHook(() => useGlobeRosterOps({ scene, active: true, territories: TERRITORIES, now: NOW }));
    await waitFor(() => expect(byType(scene, ROSTER_OPS_OUTLINE_TYPE)).not.toBeNull());
    expect(byType(scene, ROSTER_OPS_OUTLINE_TYPE)!.userData.places).toEqual(['us-ca']);
    const mark = byType(scene, ROSTER_OPS_MARK_TYPE)!;
    expect(mark.userData.tooltips).toEqual(['California\nOperation: Count the Geminids · 2 days left\nClick to open it in Operations']);
    expect(mark.userData.opens[0]).toMatchObject({ panel: 'operations', heading: 'California', notes: [{ id: `30084:${B}:operation-1` }] });
    await waitFor(() => expect(byType(scene, ROSTER_OPS_PILL_TYPE)).not.toBeNull());
    expect(result.current.places.map((p) => p.code)).toEqual(['us-ca']);
    expect(getLegends().find((l) => l.layerId === 'CampaignsOperations')).toBeTruthy();
  });

  it('says what it draws in a feed line, and publishes no legend when nothing is drawn', () => {
    read.items = [op({ places: ['union:eu'] })];
    read.status = { loaded: false, error: null, at: null };
    const { result } = renderHook(() => useGlobeRosterOps({ scene: new THREE.Scene(), active: true, territories: TERRITORIES, now: NOW }));
    expect(result.current.feeds).toEqual([expect.objectContaining({ layer: 'CampaignsOperations', shortName: 'Campaigns and operations', loading: true })]);
    expect(result.current.feeds[0].note).toContain('1 names no place drawn here');
    expect(getLegends().find((l) => l.layerId === 'CampaignsOperations')).toBeUndefined();
  });
});

/**
 * Calls on the globe (decision D-PW, PW40, PW44, PW72, PW76): a sealed call's Zone waits as a faint dotted outline
 * and lights while its window is open; unsealed or closed, it draws nothing; revealed, it lights again inside its
 * window; a teammate's revealed call lights inside its window, named by its team; outside Psi Watch, nothing at all.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import { CALL_LOOKS, PSI_CALLS_TYPE, useGlobePsiCalls } from '../useGlobePsiCalls';
import { addCall, resetCallsForTests, updateCall } from '../../../../services/psiWatch/calls';
import type { TeamCall } from '../../../../services/psiWatch/teamCalls';

const team = vi.hoisted(() => ({ calls: [] as TeamCall[] }));
vi.mock('../../../../services/psiWatch/teamCalls', () => ({ useTeamCalls: (active: boolean) => (active ? team.calls : []) }));
const links = vi.hoisted(() => ({ quakes: new Map<string, unknown>() }));
vi.mock('../../../../services/psiWatch/callLinks', () => ({ useQuakeLinks: () => links.quakes }));

vi.mock('../../../../features/globe/areas/areaShapes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../features/globe/areas/areaShapes')>();
  const fsm = await import('node:fs');
  const shapes = actual.areaShapesFrom(JSON.parse(fsm.readFileSync('public/geopolitical/areas-lod0.geojson', 'utf8')));
  return { ...actual, loadAreaShapes: async () => shapes };
});

const FROM = Date.UTC(2026, 10, 1, 12);
const UNTIL = Date.UTC(2026, 10, 2, 12);
const looksOf = (scene: THREE.Scene) => {
  const found: LineLookish[] = [];
  scene.children.find((c) => c.userData.type === PSI_CALLS_TYPE)!.traverse((c) => {
    // A batch keeps one look for all its lines.
    for (const line of (c.userData.lines ?? []) as LineLookish[]) found.push({ ...line, look: c.userData.look });
  });
  return found;
};
type LineLookish = { look?: unknown; tooltip?: string };

describe('useGlobePsiCalls', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    resetCallsForTests();
    addCall({
      id: 'c1', createdAt: FROM - 2 * 86_400_000,
      text: {
        window: { address: 'w', title: 'A window', start: FROM / 1000, end: UNTIL / 1000 },
        place: { zone: 'zone:levant', name: 'Levant Zone' }, expects: { kind: 'conflict' }, words: 'x',
      },
      salt: 'ab',
      seal: { eventId: 'e1', relay: 'wss://team.example', at: FROM - 86_400_000 },
    });
  });

  it('draws a sealed call\'s Zone faint before its window, bright while open, and nothing after or outside Psi Watch', async () => {
    const scene = new THREE.Scene();
    const { rerender } = renderHook(({ cursorMs, active }) => useGlobePsiCalls({ scene, active, cursorMs }), { initialProps: { cursorMs: FROM - 1000, active: true } });
    await waitFor(() => expect(looksOf(scene).length).toBeGreaterThan(0));
    expect(looksOf(scene).every((l) => l.look === CALL_LOOKS.waiting)).toBe(true);
    expect(looksOf(scene)[0].tooltip).toBe('Conflict in Levant Zone');
    rerender({ cursorMs: FROM + 1000, active: true });
    await waitFor(() => expect(looksOf(scene).every((l) => l.look === CALL_LOOKS.open)).toBe(true));
    rerender({ cursorMs: UNTIL + 1000, active: true });
    await waitFor(() => expect(looksOf(scene)).toHaveLength(0));
    rerender({ cursorMs: FROM + 1000, active: false });
    await waitFor(() => expect(looksOf(scene)).toHaveLength(0));
  });

  it('lights a revealed call again inside its window, and a teammate\'s, named by its team', async () => {
    updateCall('c1', { reveal: { eventId: 'r1', at: UNTIL + 3_600_000 } });
    team.calls = [{
      key: 'k:t1', id: 't1', team: 'Blue Team', sealedAt: FROM - 86_400_000, revealedAt: Date.UTC(2026, 10, 2, 13),
      text: {
        window: { address: 'w2', title: 'Another', start: FROM / 1000, end: UNTIL / 1000 },
        place: { zone: 'zone:levant', name: 'Levant Zone' }, expects: { kind: 'quakes' }, words: 'y',
      },
    }];
    const scene = new THREE.Scene();
    const { rerender } = renderHook(({ cursorMs }) => useGlobePsiCalls({ scene, active: true, cursorMs }), { initialProps: { cursorMs: FROM + 1000 } });
    await waitFor(() => expect(new Set(looksOf(scene).map((l) => l.tooltip))).toEqual(new Set([
      'Conflict in Levant Zone', 'Earthquakes M5.5+ in Levant Zone · A call from Blue Team, revealed 2 Nov 2026 13:00Z',
    ])));
    expect(looksOf(scene).every((l) => l.look === CALL_LOOKS.open)).toBe(true);
    rerender({ cursorMs: FROM - 1000 });
    await waitFor(() => expect(looksOf(scene)).toHaveLength(0));
    team.calls = [];
  });

  it('rings each quake that fell in a lit earthquake call\'s window (PW40, PW74)', async () => {
    team.calls = [{
      key: 'k:t1', id: 't1', team: 'Blue Team', sealedAt: FROM - 86_400_000, revealedAt: UNTIL + 3_600_000,
      text: {
        window: { address: 'w2', title: 'Another', start: FROM / 1000, end: UNTIL / 1000 },
        place: { zone: 'zone:levant', name: 'Levant Zone' }, expects: { kind: 'quakes' }, words: 'y',
      },
    }];
    links.quakes = new Map([['team:k:t1', { state: 'done', quakes: [{ id: 'us1', ms: FROM + 3_600_000, mag: 6.1, lat: 33, lon: 35.5, place: 'Off Tyre' }] }]]);
    const scene = new THREE.Scene();
    renderHook(() => useGlobePsiCalls({ scene, active: true, cursorMs: FROM + 1000 }));
    await waitFor(() => expect(looksOf(scene).some((l) => l.look === CALL_LOOKS.quake)).toBe(true));
    expect(looksOf(scene).filter((l) => l.look === CALL_LOOKS.quake).map((l) => l.tooltip)).toEqual(['M6.1 · 1 Nov 2026 13:00Z · Off Tyre']);
    team.calls = [];
    links.quakes = new Map();
  });
});

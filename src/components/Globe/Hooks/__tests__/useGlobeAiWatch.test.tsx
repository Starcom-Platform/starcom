/**
 * AI Watch on the globe (decision D-AW): its notes at their point or country (AW3), by section (AW2), each
 * mark carrying its stance (AW4); the key, the card's line and whenReady saying what is drawn. The 26
 * notes of 12 October, read by the real reader, served by a stand-in store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import type { Event } from 'nostr-tools';
import type { AiWatchItem, AiWatchStatus } from '../../../../services/aiWatch/aiWatch';
import type { TerritoryIndex } from '../../../../services/intel/coverage/territoryIndex';

const reader = vi.hoisted(() => ({
  items: [] as AiWatchItem[],
  status: { loaded: true, error: null, at: Date.UTC(2026, 9, 12, 21) } as AiWatchStatus,
  start: vi.fn(),
}));
vi.mock('../../../../services/aiWatch/aiWatch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../services/aiWatch/aiWatch')>()),
  aiWatchItems: () => reader.items,
  aiWatchStatus: () => reader.status,
  subscribeAiWatch: () => () => undefined,
  startAiWatch: () => { reader.start(); return () => undefined; },
}));
// jsdom has no 2D canvas to bake on: an atlas that is there, as it is in a browser.
vi.mock('../../aiWatchSprites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../aiWatchSprites')>()),
  aiWatchAtlas: () => Promise.resolve(new THREE.Texture()),
}));
vi.mock('../../heroWatchSprites', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../heroWatchSprites')>()),
  bakeHeroWatchPills: (labels: string[]) => Promise.resolve({
    texture: new THREE.Texture(),
    cells: new Map(labels.map((label) => [label, { u0: 0, v0: 0, u1: 1, v1: 1, widthPx: 90 }])),
  }),
}));

import { readAiWatchNote } from '../../../../services/aiWatch/aiWatch';
import { useGlobeAiWatch, aiWatchReadiness, AI_OUTLINE_TYPE } from '../useGlobeAiWatch';
import { AI_WATCH_PILL_TYPE, AI_WATCH_SPRITE_TYPE } from '../../aiWatchSprites';
import { getLegends, resetLegendsForTest } from '../../../../services/globe/globeLegendStore';

const LIVE: Event[] = JSON.parse(readFileSync(resolve(__dirname, '../../../../../docs/missions/01-architecture-decisions/ai-watch/terminator_watch_live_2026-10-12.json'), 'utf8'));
const NOTES = LIVE.map((e) => readAiWatchNote(e)).filter((r): r is AiWatchItem & { retracted: boolean } => !('refused' in r))
  .sort((a, b) => b.publishedAt - a.publishedAt);
const square = (name: string, lon: number, lat: number) => ({ name, geometry: { type: 'Polygon' as const, coordinates: [[[lon, lat], [lon + 5, lat], [lon + 5, lat + 5], [lon, lat + 5], [lon, lat]]] } });
const OUTLINES: Record<string, ReturnType<typeof square>> = {
  IN: square('India', 75, 20), AU: square('Australia', 135, -25), BR: square('Brazil', -50, -10),
  MD: square('Moldova', 27, 46), US: square('United States of America', -100, 35), UA: square('Ukraine', 30, 48),
};
const TERRITORIES = { size: 6, at: () => null, byCode: (code: string) => OUTLINES[code.toUpperCase()] ?? null, countries: () => [] } as unknown as TerritoryIndex;
const ALL = { AiIncidents: true, AiFrontier: true, AiWar: true, AiSafety: true };
const NONE = { AiIncidents: false, AiFrontier: false, AiWar: false, AiSafety: false };

const byType = (scene: THREE.Scene, type: string) => {
  let found: THREE.Object3D | null = null;
  scene.traverse((o) => { if (o.userData?.type === type) found = o; });
  return found as THREE.Object3D | null;
};
function mount(active: typeof ALL) {
  const scene = new THREE.Scene();
  const hook = renderHook((p: { active: typeof ALL }) => useGlobeAiWatch({ scene, active: p.active, window: null, territories: TERRITORIES }), { initialProps: { active } });
  return { scene, ...hook };
}

beforeEach(() => {
  reader.items = NOTES;
  reader.status = { loaded: true, error: null, at: Date.UTC(2026, 9, 12, 21) };
  reader.start.mockClear();
  resetLegendsForTest();
});

describe('AI Watch on the globe', () => {
  it('draws each note at its point or country, lists the rest, and outlines the countries (AW3)', async () => {
    const { scene, result } = mount(ALL);
    expect(reader.start).toHaveBeenCalled();
    expect(result.current.points).toHaveLength(3);
    expect(result.current.places.map((p) => p.name).sort()).toEqual(['Australia', 'Brazil', 'India', 'Moldova', 'Ukraine', 'United States of America']);
    expect(result.current.unplaced).toHaveLength(17);
    await waitFor(() => expect(byType(scene, AI_WATCH_SPRITE_TYPE)).not.toBeNull());
    expect(byType(scene, AI_OUTLINE_TYPE)!.userData.places).toHaveLength(6);
    await waitFor(() => expect(byType(scene, AI_WATCH_PILL_TYPE)).not.toBeNull());
    expect(byType(scene, AI_WATCH_PILL_TYPE)!.userData.labels).toContain('India · 1 AI note');
    // Six countries, and the three notes sharing New Delhi's point as one mark.
    expect((byType(scene, AI_WATCH_SPRITE_TYPE) as THREE.Points).geometry.getAttribute('position').count).toBe(7);
  });

  it('draws only the sections on, and nothing with none on (AW2)', () => {
    const { result, rerender } = mount({ ...NONE, AiIncidents: true });
    expect(result.current.notes).toHaveLength(12);
    rerender({ active: NONE });
    expect(result.current.notes).toHaveLength(0);
    expect(result.current.anyOn).toBe(false);
  });

  it('says where each note is drawn, for the panel', () => {
    const { result } = mount(ALL);
    const point = result.current.points[0];
    expect(result.current.drawnAt.get(point.id)).toBe('the point it gives, to a city');
    expect(result.current.drawnAt.get(result.current.places.find((p) => p.name === 'Ukraine')!.notes[0].id)).toBe('Ukraine');
    expect(result.current.drawnAt.has(result.current.unplaced[0].id)).toBe(false);
  });

  it('keys its shapes, and credits Mecha Jono on the card, saying no note is placed by its outlet', async () => {
    const { result } = mount(ALL);
    await waitFor(() => expect(getLegends().find((l) => l.layer === 'AI Watch')).toBeDefined());
    expect(getLegends().find((l) => l.layer === 'AI Watch')!.shapeMeans).toMatch(/▲ good, ▼ bad, ◆ ugly/);
    expect(getLegends().find((l) => l.layer === 'AI Watch')!.badgeMeans).toBe('its pill: the country · its notes');
    const feed = result.current.feeds[0];
    // The four layers' one feed, under the id they share (D-LS).
    expect(feed.layer).toBe('AIWatch');
    expect(feed.credits).toEqual([]);
    expect(feed.note).toMatch(/^AI Watch: 26 notes, each a source's headline and link, sorted into areas/);
    expect(feed.note).toMatch(/9 drawn: 3 at the point the note gives, 6 at its country/);
    expect(feed.note).toMatch(/never placed by where its outlet is/);
  });

  it('holds a card while its notes are being read', () => {
    reader.status = { loaded: false, error: null, at: null };
    mount(ALL);
    expect(aiWatchReadiness()).toMatchObject({ ready: false, why: 'AI Watch was still being read from The Record' });
  });
});

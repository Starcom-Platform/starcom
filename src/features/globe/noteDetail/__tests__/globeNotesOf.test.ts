/**
 * Who posted a globe note, and what a drug-check alert always says (the legal review of 2026-10-17): the author
 * from the note's own key or its address, named at first sight; a drug check finds only what it tests for.
 */
import { describe, it, expect } from 'vitest';
import { raverWatchGlobeNote, warConflictGlobeNote } from '../globeNotesOf';
import type { RaverWatchItem } from '../../../../services/raverWatch/raverWatch';
import type { ConflictItem } from '../../../../services/warConflict/warConflict';

const MJ = '6301c4d09a014909e5a48b7d0c9aa859eec18804c2fc87eab4e414aa5a319692';
const raver = (over: Partial<RaverWatchItem> = {}): RaverWatchItem => ({
  id: `30023:${MJ}:raver-x`, pubkey: MJ, d: 'raver-x', eventId: 'e', createdAt: 1_000,
  layer: 'DrugCheckAlerts', title: 'Carfentanil in counterfeit tablets', source: 'CFSRE NPS Discovery',
  validFrom: 1, validUntil: 2, content: 'words', level: 'red', jurisdiction: 'us', ...over,
} as RaverWatchItem);

describe('globe notes', () => {
  it('a Raver Watch note names its author by its key', () => {
    expect(raverWatchGlobeNote(raver()).author).toBe(MJ);
  });

  it('a drug-check alert always says no alert is not a sign that anything is safe; other notes do not', () => {
    expect(raverWatchGlobeNote(raver()).limits).toBe('No alert is not a sign that anything is safe.');
    expect(raverWatchGlobeNote(raver({ layer: 'SceneIncidents' })).limits).toBeUndefined();
  });

  it('takes the author from a note\'s address when the item keeps no key of its own', () => {
    const note = warConflictGlobeNote({ id: `30023:${MJ}:war-sudan`, family: 'item', title: 'Sudan', content: '', reportedAt: 1, events: [], casualties: [], fatal: false, actors: [] } as unknown as ConflictItem);
    expect(note.author).toBe(MJ);
    expect(warConflictGlobeNote({ id: 'not-an-address', family: 'item', title: 'x', content: '', reportedAt: 1, events: [], casualties: [], fatal: false, actors: [] } as unknown as ConflictItem).author).toBeUndefined();
  });
});

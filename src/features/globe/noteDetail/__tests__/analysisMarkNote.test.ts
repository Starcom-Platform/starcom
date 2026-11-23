/**
 * What a click on an analysis mark opens (critique C5, D-CT's open list): what Starcom's own analysis concluded
 * there, from how many independent sources, over what time, how heavily it is weighted, and when and by what it
 * was computed. It links nothing, because the mark carries no source of its own; the panel says so.
 */
import { describe, it, expect } from 'vitest';
import { analysisMarkNoteSet } from '../analysisMarkNote';
import type { GlobeIntelLayer, GlobeIntelMark } from '../../../../services/intel/globe/globeIntelLayer';

const mark = (over: Partial<GlobeIntelMark> = {}): GlobeIntelMark => ({
  id: 'm1', kind: 'corroboration', lat: 38, lon: 23, label: 'Port closure at Piraeus', weight: 0.625, sourceCount: 3,
  observedFrom: '2026-10-15T06:00:00Z', observedTo: '2026-10-16T09:30:00Z', isMock: false, ...over,
});
const provenance = (over: Partial<GlobeIntelLayer['provenance']> = {}) => ({
  provenance: { derivedFrom: 'correlation-engine', algorithmVersion: 2, computedAt: '2026-10-16T10:00:00Z', blindSpots: [], ...over },
});

describe('analysisMarkNoteSet', () => {
  it('opens what the analysis concluded, with its sources counted and its window', () => {
    const set = analysisMarkNoteSet(mark(), provenance());
    expect(set.heading).toBe('Analysis');
    expect(set.notes[0]).toMatchObject({
      id: 'm1', kind: 'Starcom\'s analysis: corroboration', title: 'Port closure at Piraeus',
      timeMs: Date.parse('2026-10-16T10:00:00Z'), sources: [],
    });
    expect(set.notes[0].text.split('\n')).toEqual([
      '3 independent sources',
      'Observed 15 Oct 2026 06:00Z to 16 Oct 2026 09:30Z',
      'Weight 0.63 of 1, derived from source reliability, method and age',
      'Computed by correlation-engine, version 2',
    ]);
  });

  it('names a contradiction, the sources it could not reach, and fabricated data', () => {
    const contradiction = analysisMarkNoteSet(mark({ kind: 'contradiction', sourceCount: 1 }), provenance({ blindSpots: ['USGS', 'GDACS'] })).notes[0];
    expect(contradiction.kind).toBe('Starcom\'s analysis: a contradiction');
    expect(contradiction.text).toContain('1 independent source\n');
    expect(contradiction.text).toContain('Unreachable when it was computed: USGS, GDACS');
    const mock = analysisMarkNoteSet(mark({ isMock: true }), provenance()).notes[0];
    expect(mock.kind).toBe('Starcom\'s analysis, from fabricated data');
    expect(mock.text.split('\n')[0]).toBe('Built from fabricated (fixture) data: not a finding.');
  });

  it('says no time it cannot read', () => {
    const note = analysisMarkNoteSet(mark({ observedFrom: 'x', observedTo: 'y' }), provenance({ computedAt: 'z' })).notes[0];
    expect(note.timeMs).toBeNull();
    expect(note.text).not.toContain('Observed');
  });
});

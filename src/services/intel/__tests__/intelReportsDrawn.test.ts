/**
 * Whether what the pipeline took in is drawn (plan H3): a capture waits on it before the camera moves.
 */
import { describe, it, expect } from 'vitest';
import { intelDrawnReadiness, noteIntelDrawn, noteIntelTaken } from '../intelReportsDrawn';

// Each test leaves every list it took drawn, so the next starts ready, as a first visit does.

describe('intelDrawnReadiness', () => {
  it('is ready on a first visit, before anything is taken in', () => {
    expect(intelDrawnReadiness().ready).toBe(true);
  });

  it('waits from a list taken in until the render that shows it has run', () => {
    const first = noteIntelTaken();
    expect(intelDrawnReadiness()).toEqual({ ready: false, why: 'the Intel Reports just read were not drawn yet' });
    noteIntelDrawn(first);
    expect(intelDrawnReadiness().ready).toBe(true);
  });

  it('is not ready while a later list waits, and an earlier render coming late does not make it so', () => {
    const first = noteIntelTaken();
    const second = noteIntelTaken();
    noteIntelDrawn(second);
    noteIntelDrawn(first);
    expect(intelDrawnReadiness().ready).toBe(true);
    const third = noteIntelTaken();
    noteIntelDrawn(second);
    expect(intelDrawnReadiness().ready).toBe(false);
    noteIntelDrawn(third);
    expect(intelDrawnReadiness().ready).toBe(true);
  });
});

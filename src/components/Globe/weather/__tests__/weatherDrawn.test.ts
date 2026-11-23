/**
 * The moment each Earth Weather layer last drew (decision D-W, step 5c): what
 * a clip sweeping the forecast hours waits on, so each frame is drawn for its
 * own moment.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { noteDrawn, forgetDrawn, allDrawnFor, resetDrawnForTest } from '../weatherDrawn';

const AT = Date.UTC(2026, 9, 7, 3);

beforeEach(() => resetDrawnForTest());

describe('weatherDrawn', () => {
  it('holds when every layer drawing has drawn the moment, and only then', () => {
    noteDrawn('heat', AT);
    noteDrawn('wind', AT - 60_000);
    expect(allDrawnFor(AT)).toBe(false);
    noteDrawn('wind', AT);
    expect(allDrawnFor(AT)).toBe(true);
    expect(allDrawnFor(AT + 1)).toBe(false);
  });

  it('asks nothing of a layer that is off', () => {
    noteDrawn('rain', AT - 1);
    forgetDrawn('rain');
    expect(allDrawnFor(AT)).toBe(true);
  });
});

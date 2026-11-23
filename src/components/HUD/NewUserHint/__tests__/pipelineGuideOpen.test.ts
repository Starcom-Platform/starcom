/**
 * Whether the pipeline guide is open over the globe (decision D-F, step 3). The
 * support ask waits while it is, and is mounted apart from the guide, so the guide
 * says so through this module.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setPipelineGuideOpen,
  isPipelineGuideOpen,
  onPipelineGuideChange,
  resetPipelineGuideForTests,
} from '../pipelineGuideOpen';

beforeEach(() => resetPipelineGuideForTests());

describe('pipelineGuideOpen', () => {
  it('starts closed', () => {
    expect(isPipelineGuideOpen()).toBe(false);
  });

  it('says what the guide last said', () => {
    setPipelineGuideOpen(true);
    expect(isPipelineGuideOpen()).toBe(true);

    setPipelineGuideOpen(false);
    expect(isPipelineGuideOpen()).toBe(false);
  });

  it('tells a listener when the guide opens and when it closes', () => {
    const seen: boolean[] = [];
    onPipelineGuideChange(() => seen.push(isPipelineGuideOpen()));

    setPipelineGuideOpen(true);
    setPipelineGuideOpen(false);

    expect(seen).toEqual([true, false]);
  });

  it('stops telling a listener that left', () => {
    const listener = vi.fn();
    const off = onPipelineGuideChange(listener);
    off();

    setPipelineGuideOpen(true);

    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps telling the others when one listener throws', () => {
    const later = vi.fn();
    onPipelineGuideChange(() => {
      throw new Error('a listener failed');
    });
    onPipelineGuideChange(later);

    setPipelineGuideOpen(true);

    expect(later).toHaveBeenCalledTimes(1);
  });
});

/**
 * Whether the person has used the globe yet on this visit (decision D-F, step 3).
 * The support ask opens only after they have, and it is mounted above the globe in
 * the app's tree, so the globe says so through this module rather than a context.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  markGlobeEngaged,
  hasEngagedWithGlobe,
  onGlobeEngaged,
  resetGlobeEngagementForTests,
} from '../globeEngagement';

beforeEach(() => resetGlobeEngagementForTests());

describe('globeEngagement', () => {
  it('starts a visit with the globe unused', () => {
    expect(hasEngagedWithGlobe()).toBe(false);
  });

  it('remembers once the person has used it', () => {
    markGlobeEngaged();
    expect(hasEngagedWithGlobe()).toBe(true);
  });

  it('tells a listener the first time, and only the first time', () => {
    const listener = vi.fn();
    onGlobeEngaged(listener);

    markGlobeEngaged();
    markGlobeEngaged();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops telling a listener that left', () => {
    const listener = vi.fn();
    const off = onGlobeEngaged(listener);
    off();

    markGlobeEngaged();

    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps telling the others when one listener throws', () => {
    const later = vi.fn();
    onGlobeEngaged(() => {
      throw new Error('a listener failed');
    });
    onGlobeEngaged(later);

    markGlobeEngaged();

    expect(later).toHaveBeenCalledTimes(1);
  });
});

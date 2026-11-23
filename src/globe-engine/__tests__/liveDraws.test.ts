/**
 * The live loop's draws held while a clip records (liveDraws.ts): a capture's render is drawn, the loop's is not,
 * and the composer gets its own `render` back.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { holdLiveDraws } from '../liveDraws';
import { releaseMotion, stillMotion } from '../captureClock';

class Composer {
  drawn: string[] = [];
  render(_deltaTime?: number): void {
    this.drawn.push('drawn');
  }
}

afterEach(() => releaseMotion());

describe('holdLiveDraws', () => {
  it('skips the live loop\'s draws while held, and draws a capture\'s, made with motion held still', () => {
    const composer = new Composer();
    const letGo = holdLiveDraws(composer);
    composer.render();
    expect(composer.drawn).toEqual([]);
    stillMotion(1);
    composer.render(0.016);
    releaseMotion();
    expect(composer.drawn).toEqual(['drawn']);
    letGo();
    composer.render();
    expect(composer.drawn).toEqual(['drawn', 'drawn']);
  });

  it('gives the composer back its class\'s render, or its own', () => {
    const fromClass = new Composer();
    holdLiveDraws(fromClass)();
    expect(Object.prototype.hasOwnProperty.call(fromClass, 'render')).toBe(false);

    const own = vi.fn();
    const withOwn = { render: own };
    holdLiveDraws(withOwn)();
    expect(withOwn.render).toBe(own);
  });

  it('counts holds: the last let go gives the draws back, and letting go twice counts once', () => {
    const composer = new Composer();
    const first = holdLiveDraws(composer);
    const second = holdLiveDraws(composer);
    first();
    first();
    composer.render();
    expect(composer.drawn).toEqual([]);
    second();
    composer.render();
    expect(composer.drawn).toEqual(['drawn']);
  });

  it('does nothing with no composer to hold', () => {
    expect(() => holdLiveDraws(undefined)()).not.toThrow();
    expect(() => holdLiveDraws(null)()).not.toThrow();
  });
});

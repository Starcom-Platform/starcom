/**
 * Motion held still while a capture renders (decision IM23): each card and clip
 * frame holds glows at rest, and clouds and space weather at the moment's phase,
 * so the same shot makes the same picture. The globe on screen keeps moving.
 *
 * @vitest-environment node
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { stillMotion, releaseMotion, stilledAt, onStill, phaseSeconds, holdForCapture, captureUnderWay, stillSerial } from '../captureClock';

afterEach(() => releaseMotion());

describe('the capture clock', () => {
  it('is not stilled until a capture stills it, and not after it releases', () => {
    expect(stilledAt()).toBeNull();
    stillMotion(1_790_967_291_000);
    expect(stilledAt()).toBe(1_790_967_291_000);
    releaseMotion();
    expect(stilledAt()).toBeNull();
  });

  it('tells each moving thing that registered, and stops telling one that left', () => {
    const still = vi.fn();
    const release = vi.fn();
    const leave = onStill({ still, release });
    stillMotion(5_000);
    releaseMotion();
    expect(still).toHaveBeenCalledWith(5_000);
    expect(release).toHaveBeenCalledTimes(1);
    leave();
    stillMotion(6_000);
    expect(still).toHaveBeenCalledTimes(1);
  });

  it('gives a phase from a moment that a shader float holds exactly: the same moment, the same phase', () => {
    const at = 1_790_967_291_123;
    expect(phaseSeconds(at)).toBe(phaseSeconds(at));
    expect(phaseSeconds(at)).toBeGreaterThanOrEqual(0);
    expect(phaseSeconds(at)).toBeLessThan(3600);
    expect(phaseSeconds(at + 1000) - phaseSeconds(at)).toBeCloseTo(1, 6);
  });

  it('counts a capture under way while a render is held still, and while a clip holds the look between its frames', () => {
    expect(captureUnderWay()).toBe(false);
    stillMotion(7_000);
    expect(captureUnderWay()).toBe(true);
    releaseMotion();
    expect(captureUnderWay()).toBe(false);

    const releaseClip = holdForCapture();
    const releaseOther = holdForCapture();
    expect(captureUnderWay()).toBe(true);
    releaseClip();
    releaseClip(); // released twice, counted once
    expect(captureUnderWay()).toBe(true);
    releaseOther();
    expect(captureUnderWay()).toBe(false);
  });

  it('counts each still, so a clip frame is told from the renders around it, even at the same moment', () => {
    const before = stillSerial();
    stillMotion(5_000);
    const first = stillSerial();
    expect(first).toBe(before + 1);
    releaseMotion();
    expect(stillSerial()).toBe(first);
    stillMotion(5_000);
    expect(stillSerial()).toBe(first + 1);
  });
});

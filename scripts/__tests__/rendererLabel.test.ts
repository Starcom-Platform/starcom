/**
 * Every probe says which renderer produced its numbers (decision D-F, step 5).
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * probe-first-visit.mjs, audit-globe-layers.mjs, audit-ui-layout.mjs and
 * smoke-app.mjs all launch a headless browser forced onto SwiftShader. That is
 * correct for observing content — smoke-app.mjs says so itself: "without these a
 * headless browser has no GPU and reports every WebGL application as broken".
 *
 * It is wrong for timing, and nothing said so. Measured on one production build,
 * same page, same relays:
 *
 *                        software rasterizer      hardware
 *   globe paints                    10.9 s         0.8 s
 *   reports on the globe            21.7 s         2.0 s
 *   total blocking time          18,031 ms        618 ms
 *
 * Read without that column heading, the left-hand figures say the app is broken.
 * They went into a decision record as facts about a first visit, and three
 * separate causes were diagnosed from them before the renderer was suspected.
 *
 * ─── WHY IT IS DERIVED AND NOT WRITTEN ─────────────────────────────────────
 *
 * The label takes the argument array the script actually passes to chromium. A
 * string written beside the flags would be a second source of truth, free to
 * drift the moment someone changes one and not the other — and a probe that
 * printed "software rendering" while running on a GPU would be worse than one
 * that printed nothing, because it would be believed.
 */
import { describe, it, expect } from 'vitest';
import { rendererLabel, rendererNotice } from '../lib/rendererLabel.mjs';

const SWIFTSHADER = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const HARDWARE = ['--use-gl=angle', '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'];

describe('rendererLabel', () => {
  it('names the software rasterizer when the flags ask for one', () => {
    expect(rendererLabel(SWIFTSHADER)).toBe('swiftshader (software rendering)');
  });

  it('names the renderer when the flags ask for hardware', () => {
    expect(rendererLabel(HARDWARE)).toBe('metal (hardware rendering)');
  });

  /*
   * The whole point of deriving it: change the flags and the label changes with
   * them. A hardcoded string is what this exists to prevent.
   */
  it('follows the flags rather than any fixed answer', () => {
    expect(rendererLabel(SWIFTSHADER)).not.toBe(rendererLabel(HARDWARE));
    expect(rendererLabel(['--use-gl=angle', '--use-angle=vulkan'])).toBe('vulkan (hardware rendering)');
  });

  /*
   * Absence is not software. A browser launched with no GL flags uses whatever
   * the machine gives it, and claiming to know which would be the same invented
   * certainty this decision exists to remove.
   */
  it('does not guess when the flags say nothing', () => {
    expect(rendererLabel([])).toBe('unspecified (whatever the browser chose)');
    expect(rendererLabel(['--ignore-gpu-blocklist'])).toBe('unspecified (whatever the browser chose)');
  });

  it('treats llvmpipe as software, as the globe already does', () => {
    expect(rendererLabel(['--use-angle=swiftshader'])).toContain('software');
    expect(rendererLabel(['--use-gl=swiftshader'])).toContain('software');
  });

  /*
   * A caller passing something unusable should get a usable sentence, because
   * this is printed in a header that must never be the reason a probe dies.
   */
  it('survives being given nothing at all', () => {
    expect(rendererLabel(undefined as unknown as string[])).toBe('unspecified (whatever the browser chose)');
  });
});

/*
 * The line the probes actually print. Tested because an untested export in a
 * module whose purpose is preventing untested claims would be the same defect
 * wearing a different hat.
 */
describe('rendererNotice', () => {
  it('warns that software timing is not what a visitor sees', () => {
    const notice = rendererNotice(SWIFTSHADER);

    expect(notice).toContain('swiftshader (software rendering)');
    expect(notice).toMatch(/not what a visitor with a GPU sees/);
  });

  /*
   * A caveat attached to every run is a caveat nobody reads. A hardware run has
   * nothing to warn about, so it says nothing.
   */
  it('does not warn when the run was on hardware', () => {
    const notice = rendererNotice(HARDWARE);

    expect(notice).toContain('metal (hardware rendering)');
    expect(notice).not.toMatch(/not what a visitor/);
  });

  it('says what it does not know, without warning about it', () => {
    const notice = rendererNotice([]);

    expect(notice).toContain('unspecified (whatever the browser chose)');
    expect(notice).not.toMatch(/not what a visitor/);
  });
});

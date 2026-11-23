/**
 * Which renderer produced these numbers.
 *
 * Every probe in this repository launches a headless browser forced onto
 * SwiftShader, and that is the right choice for observing content — smoke-app.mjs
 * says so in its own words: "without these a headless browser has no GPU and
 * reports every WebGL application as broken".
 *
 * It is the wrong choice for timing, and until this existed, nothing said which
 * one a number came from. Measured on one production build, same page, same
 * relays, on 2026-09-17:
 *
 *                        software rasterizer      hardware
 *   globe paints                    10.9 s         0.8 s
 *   reports on the globe            21.7 s         2.0 s
 *   total blocking time          18,031 ms        618 ms
 *
 * Read without the column heading, the left-hand figures describe a broken
 * application. They entered a decision record as facts about a first visit, and
 * three separate causes were diagnosed from them — the preloader's hold, asset
 * loading, main-thread execution — before the renderer itself was suspected.
 *
 * The label is DERIVED from the argument array a script actually passes, never
 * written beside it. Two sources of truth drift, and a probe that printed
 * "software rendering" while running on a GPU would be worse than one that
 * printed nothing, because it would be believed.
 */

/** Renderer names that mean a CPU is doing the drawing. */
const SOFTWARE = ['swiftshader', 'llvmpipe', 'softpipe', 'swangle'];

/**
 * The renderer named by `args`, as a phrase for a probe's header.
 *
 * Absence is reported as absence. A browser launched with no GL flags uses
 * whatever the machine offers, and naming that would be the invented certainty
 * this module exists to remove.
 */
export function rendererLabel(args) {
  if (!Array.isArray(args)) return 'unspecified (whatever the browser chose)';

  let named;
  for (const arg of args) {
    if (typeof arg !== 'string') continue;
    // --use-angle wins over --use-gl when both name something: it is the more
    // specific of the two, and it is the one these scripts vary.
    const angle = /^--use-angle=(.+)$/.exec(arg);
    if (angle) { named = angle[1]; break; }
    const gl = /^--use-gl=(.+)$/.exec(arg);
    // `--use-gl=angle` names a pipeline, not a renderer; the renderer is in
    // --use-angle, which may appear later in the array.
    if (gl && gl[1] !== 'angle') named = gl[1];
  }

  if (!named) return 'unspecified (whatever the browser chose)';

  const kind = SOFTWARE.includes(named.toLowerCase()) ? 'software' : 'hardware';
  return `${named} (${kind} rendering)`;
}

/**
 * A full line for a probe to print, so the four of them say it the same way.
 *
 * Carries the warning only when it applies. A hardware run needs no caveat, and
 * attaching one anyway would train readers to skip the line.
 */
export function rendererNotice(args) {
  const label = rendererLabel(args);
  if (!label.includes('software')) return `  renderer: ${label}`;
  return `  renderer: ${label}\n`
    + '  Timing under software rendering is not what a visitor with a GPU sees.';
}

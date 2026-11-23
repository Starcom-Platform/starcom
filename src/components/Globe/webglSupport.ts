/**
 * What this browser will actually give a 3D globe.
 *
 * ─── WHY THE ANSWER IS NOT A BOOLEAN ───────────────────────────────────────
 *
 * three.js dropped WebGL1 in r163 and this project is on r171, so the globe
 * needs WebGL2 or nothing — there is no reduced path to fall back to.
 *
 * But "can a context be created" is a weaker question than "will this work".
 * A WebGL2 context creation SUCCEEDS when it is backed by a software
 * rasterizer — SwiftShader in Chrome, llvmpipe on Linux — and reports no error
 * of any kind. It simply runs a twenty-shader scene at single-digit frames per
 * second. That population is considerably larger than the one with no WebGL at
 * all, so a probe that answers only yes/no describes the smaller problem.
 *
 * This reports the renderer string alongside, which is the only signal
 * available before drawing anything. It is a hint and is treated as one:
 * `WEBGL_debug_renderer_info` is withheld by privacy-hardened browsers
 * precisely because it fingerprints, so an unknown renderer is common and is
 * not itself a finding.
 */

export interface WebglSupport {
  /** A WebGL2 context could be created. Says nothing about speed. */
  available: boolean;
  /** Unmasked renderer, when the browser is willing to say. */
  renderer?: string;
  /** True when the renderer string names a known software rasterizer. */
  likelySoftware: boolean;
  /** Why it is unavailable, when it is. */
  detail?: string;
}

const SOFTWARE_HINTS = ['swiftshader', 'llvmpipe', 'software', 'softpipe', 'microsoft basic render'];

export function detectWebglSupport(): WebglSupport {
  if (typeof document === 'undefined') {
    return { available: false, likelySoftware: false, detail: 'No document to probe.' };
  }

  let canvas: HTMLCanvasElement | null = null;
  try {
    canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      return {
        available: false,
        likelySoftware: false,
        detail:
          'This browser did not provide a WebGL2 context. That is usually a privacy setting, '
          + 'a managed-device policy, a virtual machine without GPU passthrough, or older hardware.',
      };
    }

    let renderer: string | undefined;
    // Commonly withheld, and withholding it is a reasonable thing for a
    // browser to do. Absence is not a problem to report.
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (info) {
      const value = gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
      if (typeof value === 'string') renderer = value;
    }

    const likelySoftware =
      renderer !== undefined && SOFTWARE_HINTS.some((hint) => renderer!.toLowerCase().includes(hint));

    // Released explicitly. A probe that leaves contexts behind will itself
    // exhaust the browser's limit after enough mounts.
    gl.getExtension('WEBGL_lose_context')?.loseContext();

    return { available: true, renderer, likelySoftware };
  } catch (error) {
    return {
      available: false,
      likelySoftware: false,
      detail: error instanceof Error ? error.message : 'WebGL probe failed.',
    };
  } finally {
    canvas?.remove();
  }
}

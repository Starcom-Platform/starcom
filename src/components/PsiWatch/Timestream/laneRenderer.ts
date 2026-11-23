/**
 * The Timestream's lanes in one WebGL2 canvas (decision D-PW, PW38, PW41): each lane is one body's row of the
 * longitude texture, drawn into its own band of the canvas by viewport and scissor, coloured by its sign's element
 * (Cosmic Cypher's `elementColor`, gradient or solid), a dark tick where it enters a sign, and hatched while the body
 * moves backward (PW66: no hue of its own, so the element's colour still reads under it). Cosmic Cypher gave every
 * lane a context of its own; with up to nineteen lanes beside the globe that passes
 * the browser's limit of about sixteen, and the browser drops the oldest, which may be the globe's.
 *
 * Between a view's change and its sky's arrival, the texture computed for the old view is drawn shifted and scaled
 * into the new one, so a pan or a zoom answers at once (Cosmic Cypher's `uViewScale` and `uViewOffset`).
 */
import type { TimeView } from '../../../services/psiWatch/timestream/timeView';
import type { SkyColumns } from '../../../services/psiWatch/timestream/skyColumns';

export const VERTEX_SOURCE = `#version 300 es
out vec2 vUV;
void main() {
  float x = float((gl_VertexID & 1) << 2);
  float y = float((gl_VertexID & 2) << 1);
  vUV = vec2(x * 0.5, y * 0.5);
  gl_Position = vec4(x - 1.0, y - 1.0, 0.0, 1.0);
}
`;

export const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uLongitudes;
uniform sampler2D uRetrograde;
uniform float uRow;          // the lane's body, as a texture row's middle (0..1)
uniform float uTexScale;     // the view's span over the texture's
uniform float uTexOffset;    // where the view starts in the texture, as a share of its span
uniform float uTexel;        // one device pixel, in the texture's u
uniform float uRatio;        // device pixels per CSS pixel
uniform int uFillMode;       // 0 gradient, 1 solid
uniform int uShowRetrograde;
uniform vec3 uColorFire;
uniform vec3 uColorEarth;
uniform vec3 uColorAir;
uniform vec3 uColorWater;
uniform vec3 uGround;

vec3 elementColor(float longitude) {
  vec3 colors[4];
  colors[0] = uColorFire;
  colors[1] = uColorEarth;
  colors[2] = uColorAir;
  colors[3] = uColorWater;
  if (uFillMode == 1) {
    int sign = int(mod(floor(longitude / 30.0), 12.0));
    return colors[sign & 3];
  }
  // Gradient: from each sign's middle to the next one's.
  float shifted = mod(longitude - 15.0, 360.0);
  float segment = shifted / 30.0;
  int signA = int(floor(segment)) % 12;
  int signB = (signA + 1) % 12;
  return mix(colors[signA & 3], colors[signB & 3], fract(segment));
}

void main() {
  float u = uTexOffset + vUV.x * uTexScale;
  if (u < 0.0 || u > 1.0) { fragColor = vec4(uGround, 1.0); return; }
  float lon = texture(uLongitudes, vec2(u, uRow)).r;
  if (lon != lon) { fragColor = vec4(uGround, 1.0); return; }
  vec3 color = elementColor(lon);
  if (uShowRetrograde == 1 && texture(uRetrograde, vec2(u, uRow)).r > 0.5
      && mod(gl_FragCoord.x - gl_FragCoord.y, 5.0 * uRatio) < 1.5 * uRatio) {
    color = mix(color, uGround, 0.6);
  }
  // A sign begins: the pixel whose sign differs from the one before it, unless signs pass faster than one in 8 px.
  float before = texture(uLongitudes, vec2(u - uTexel, uRow)).r;
  if (before == before && u - uTexel >= 0.0) {
    float moved = abs(mod(lon - before + 180.0, 360.0) - 180.0);
    if (floor(lon / 30.0) != floor(before / 30.0) && moved < 30.0 / (8.0 * uRatio)) color = mix(color, uGround, 0.85);
  }
  fragColor = vec4(color, 1.0);
}
`;

export interface LaneBand {
  /** The body's index in the sky's bodies. */
  row: number;
  /** The band's top and height in CSS pixels, from the canvas's top. */
  top: number;
  height: number;
  showRetrograde: boolean;
}

export interface ElementColours { fire: [number, number, number]; earth: [number, number, number]; air: [number, number, number]; water: [number, number, number] }

/** Cosmic Cypher's classic palette, kept (PW41). */
export const CLASSIC_ELEMENTS: ElementColours = { fire: [1, 0, 0], earth: [0, 1, 0], air: [1, 1, 0], water: [0, 0, 1] };
/**
 * A colour-blind-safe palette (PW65): Okabe and Ito's vermilion, bluish green, yellow and blue, which keep Fire and
 * Earth apart for the one in twelve men who cannot tell Cosmic Cypher's red from its green.
 */
export const SAFE_ELEMENTS: ElementColours = { fire: [0.835, 0.369, 0], earth: [0, 0.62, 0.451], air: [0.941, 0.894, 0.259], water: [0, 0.447, 0.698] };
export const ELEMENT_PALETTES = { classic: CLASSIC_ELEMENTS, safe: SAFE_ELEMENTS } as const;
export type ElementPalette = keyof typeof ELEMENT_PALETTES;

/** Where a view falls in a texture computed for another: the shift and scale that draw the old sky into the new view. */
export function textureMapping(view: TimeView, textureView: TimeView): { scale: number; offset: number } {
  return { scale: view.spanMs / textureView.spanMs, offset: (view.startMs - textureView.startMs) / textureView.spanMs };
}

export interface LaneRenderer {
  /** A view's sky, as the texture the lanes sample. */
  upload(sky: SkyColumns, view: TimeView): void;
  /** Every lane, for a view, onto a canvas sized in CSS pixels times the device's ratio. */
  draw(view: TimeView, bands: readonly LaneBand[], options: { fillMode: 'gradient' | 'solid'; elements: ElementColours; ground: [number, number, number] }): void;
  dispose(): void;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
  return shader;
}

/** The lanes' renderer on a canvas, or null where WebGL2 or float textures are not to be had. */
export function createLaneRenderer(canvas: HTMLCanvasElement): LaneRenderer | null {
  const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  const at = (name: string) => gl.getUniformLocation(program, name);
  const u = {
    lon: at('uLongitudes'), retro: at('uRetrograde'), row: at('uRow'), scale: at('uTexScale'), offset: at('uTexOffset'),
    texel: at('uTexel'), ratio: at('uRatio'),
    fill: at('uFillMode'), showRetro: at('uShowRetrograde'), fire: at('uColorFire'), earth: at('uColorEarth'),
    air: at('uColorAir'), water: at('uColorWater'), ground: at('uGround'),
  };
  const vao = gl.createVertexArray();
  const lonTexture = gl.createTexture();
  const retroTexture = gl.createTexture();
  const setUp = (texture: WebGLTexture | null) => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };
  setUp(lonTexture);
  setUp(retroTexture);
  let textureView: TimeView | null = null;
  let rows = 0;

  return {
    upload(sky, view) {
      rows = sky.bodies.length;
      // Column-major in the sky, row-major in a texture: a row per body, a texel per column.
      const lon = new Float32Array(sky.columns * rows);
      const retro = new Uint8Array(sky.columns * rows);
      for (let col = 0; col < sky.columns; col++) {
        for (let b = 0; b < rows; b++) {
          lon[b * sky.columns + col] = sky.longitudes[col * rows + b];
          retro[b * sky.columns + col] = sky.retrograde[col * rows + b] * 255;
        }
      }
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.bindTexture(gl.TEXTURE_2D, lonTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, sky.columns, rows, 0, gl.RED, gl.FLOAT, lon);
      gl.bindTexture(gl.TEXTURE_2D, retroTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, sky.columns, rows, 0, gl.RED, gl.UNSIGNED_BYTE, retro);
      textureView = view;
    },
    draw(view, bands, { fillMode, elements, ground }) {
      const ratio = canvas.width / Math.max(1, canvas.clientWidth || canvas.width);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(ground[0], ground[1], ground[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (!textureView || !rows) return;
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, lonTexture);
      gl.uniform1i(u.lon, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, retroTexture);
      gl.uniform1i(u.retro, 1);
      const { scale, offset } = textureMapping(view, textureView);
      gl.uniform1f(u.scale, scale);
      gl.uniform1f(u.offset, offset);
      gl.uniform1f(u.texel, scale / Math.max(1, canvas.width));
      gl.uniform1f(u.ratio, ratio);
      gl.uniform1i(u.fill, fillMode === 'solid' ? 1 : 0);
      gl.uniform3fv(u.fire, elements.fire);
      gl.uniform3fv(u.earth, elements.earth);
      gl.uniform3fv(u.air, elements.air);
      gl.uniform3fv(u.water, elements.water);
      gl.uniform3fv(u.ground, ground);
      gl.enable(gl.SCISSOR_TEST);
      for (const band of bands) {
        if (band.row < 0 || band.row >= rows) continue;
        // GL counts from the canvas's foot; bands from its top.
        const y = Math.round(canvas.height - (band.top + band.height) * ratio);
        const h = Math.max(1, Math.round(band.height * ratio));
        gl.viewport(0, y, canvas.width, h);
        gl.scissor(0, y, canvas.width, h);
        gl.uniform1f(u.row, (band.row + 0.5) / rows);
        gl.uniform1i(u.showRetro, band.showRetrograde ? 1 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.SCISSOR_TEST);
    },
    dispose() {
      gl.deleteTexture(lonTexture);
      gl.deleteTexture(retroTexture);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

/**
 * Country names on the globe (decision K5, step 4: TS4, TS10–TS14,
 * docs/missions/01-architecture-decisions/territories.md).
 *
 * One instanced mesh of screen-space quads, one per territory, reading one text
 * atlas (countryNameAtlas.ts): a single draw call, in the globe's own scene, so a
 * card that asks for names carries them as drawn and every other card carries none.
 *
 * ─── WHERE IT DRAWS ────────────────────────────────────────────────────────
 *
 * Its root rides the territories' shell (globe-engine/shellLift.ts), so a name stands
 * on the fills in either style; quads are sized in pixels, so the lift moves only the
 * anchor. Group order 130: over the fills, the borders and the outlines, under every
 * mark a person clicks (190 and up; markGroupOrder.test.ts). No depth test: the far
 * side is culled by how squarely a name faces the camera, as on the CPU.
 *
 * ─── WHICH NAMES ───────────────────────────────────────────────────────────
 *
 * countryNamePlacement.ts decides, on the CPU, at most ten times a second while the
 * camera moves and once when it stops; between, the GPU keeps each name on its anchor.
 * A capture places afresh in its own render, with the card's settings and none of the
 * screen's memory, so the same shot makes the same picture; the screen's state is put
 * back for the next live frame. A clip that asks for names places them frame by frame,
 * with its own memory, and fades them in frames at its rate: each frame is counted once
 * (captureClock's still serial), and a live render between frames draws the clip's
 * names as they stand and changes nothing, so the same clip draws the same names
 * however many renders fall between its frames.
 */
import * as THREE from 'three';
import { ridesShell } from '../../globe-engine/shellLift';
import { captureUnderWay, stilledAt, stillSerial } from '../../globe-engine/captureClock';
import { cardNameObstacles, clipCountryNames, namesVisibilityNow, noteCountryNamesDrawn } from '../../globe-engine/countryNamesLook';
import { zoomOutFadeFor } from '../../components/Globe/zoomOutFade';
import { BASE_MAP } from '../../components/Globe/globeAltitudes';
import { latLngToGlobeWorld } from '../../utils/globeCoordinates';
import type { TerritoryLabel } from '../theme/territoryLabels';
import { NAME_HALO, NAME_TIERS, SELECTED_NAME_COLOUR, tierOf } from './countryNameLook';
import { bakeNameAtlas, type NameAtlas } from './countryNameAtlas';
import {
  FACING_MIN,
  FACING_WHOLE,
  facingOpacity,
  nameDue,
  nameFacing,
  nameZoom,
  nameZoomBias,
  placeCountryNames,
  pxPerRadFrom,
  type NameCandidate,
} from './countryNamePlacement';
import { nameObstacles, type NameObstacles } from './nameObstacles';
import type { ScreenBox } from '../../globe-engine/placeNames';

/** Over the fills, borders and outlines; under every mark a person clicks. */
export const COUNTRY_NAMES_ORDER = 130;
export const COUNTRY_NAMES_NAME = 'country-names';
/** How often names are placed while the camera moves, and how long a name fades. */
export const PLACE_EVERY_MS = 100;
export const FADE_MS = 200;

/** Colour slots: the three tiers, then selected. */
const SELECTED_TONE = NAME_TIERS.length;

const VERTEX = /* glsl */ `
  attribute vec2 corner;
  attribute vec3 aAnchor;
  attribute vec4 aCell;
  attribute float aAlpha;
  attribute float aShift;
  attribute float aTone;
  uniform vec2 uViewport;
  uniform float uPixelRatio;
  uniform float uAtlasRatio;
  uniform vec2 uAtlasSize;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vTone;

  void main() {
    vec4 world = modelMatrix * vec4(aAnchor, 1.0);
    vec3 n = normalize(world.xyz);
    vec3 toCamera = normalize(cameraPosition - world.xyz);
    float facing = dot(n, toCamera);
    vAlpha = aAlpha * uOpacity * smoothstep(${FACING_MIN.toFixed(2)}, ${FACING_WHOLE.toFixed(2)}, facing);
    vTone = aTone;

    vec4 clip = projectionMatrix * viewMatrix * world;
    vec2 device = uViewport * uPixelRatio;
    vec2 centre = (clip.xy / clip.w * 0.5 + 0.5) * device;
    // The cell as drawn: its own size where the atlas was drawn at this ratio, texel for pixel.
    vec2 size = aCell.zw * (uPixelRatio / uAtlasRatio);
    // Snapped to whole device pixels, so a texel lands on a pixel. aShift is in CSS px, down the screen.
    vec2 origin = floor(centre - size * 0.5 - vec2(0.0, aShift * uPixelRatio) + 0.5);
    vec2 at = origin + corner * size;
    gl_Position = vec4((at / device * 2.0 - 1.0) * clip.w, clip.z, clip.w);
    // The atlas's first row is the canvas's top; a quad's top corner is corner.y = 1.
    vUv = vec2(aCell.x + corner.x * aCell.z, aCell.y + (1.0 - corner.y) * aCell.w) / uAtlasSize;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform vec3 uTones[${SELECTED_TONE + 1}];
  uniform vec3 uHalo;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vTone;

  void main() {
    vec2 rg = texture2D(uAtlas, vUv).rg;
    float letters = rg.r;
    float halo = rg.g * (1.0 - letters);
    float a = letters + halo;
    if (a * vAlpha < 0.004) discard;
    vec3 text = uTones[int(vTone + 0.5)];
    vec3 rgb = (text * letters + uHalo * halo) / max(a, 1e-4);
    gl_FragColor = vec4(rgb, a * vAlpha);
    // Linear out, sRGB on screen, as screenPoints.ts and the fills do.
    gl_FragColor = sRGBTransferOETF(gl_FragColor);
  }
`;

export interface NamesUpdate {
  /** On screen only: the selected country's code, and the hovered one's after its rest. */
  selected?: string | null;
  hovered?: string | null;
}

/** What the screen last showed, kept apart from a capture's. */
interface ScreenState {
  shown: Set<string>;
  target: Float32Array;
  alpha: Float32Array;
  shift: Float32Array;
  placedAt: number;
  /** Placed since the camera last stopped. */
  stillPlaced: boolean;
  /** The camera's matrix when last seen: float64, as three.js holds it, so a still camera compares equal. */
  camera: Float64Array;
  key: string;
}

/** A clip's names, kept apart from the screen's and from any card's. */
interface ClipState {
  /** Which clip (countryNamesLook's numbering): the next one starts afresh. */
  clip: number;
  /** The still serial of the last frame placed, or -1 before the first. */
  frame: number;
  shown: Set<string>;
  target: Float32Array;
  alpha: Float32Array;
  shift: Float32Array;
  note: { drawn: true; codes: string[]; boxes: ScreenBox[] } | null;
}

export class CountryNames {
  readonly root: THREE.Group;
  private mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial> | null = null;
  private atlas: NameAtlas | null = null;
  private texture: THREE.DataTexture | null = null;
  private readonly anchors: THREE.Vector3[];
  private readonly screen: ScreenState;
  private readonly obstacles: NameObstacles = { hard: [], soft: [] };
  private lastFrame = 0;
  private capturedLast = false;
  private clip: ClipState | null = null;

  constructor(private readonly labels: readonly TerritoryLabel[]) {
    this.root = ridesShell(new THREE.Group());
    this.root.name = COUNTRY_NAMES_NAME;
    this.root.renderOrder = COUNTRY_NAMES_ORDER;
    this.root.visible = false;
    this.anchors = labels.map((l) => latLngToGlobeWorld(l.lat, l.lng, 100 * BASE_MAP));
    const n = labels.length;
    this.screen = {
      shown: new Set(), target: new Float32Array(n), alpha: new Float32Array(n), shift: new Float32Array(n),
      placedAt: -Infinity, stillPlaced: false, camera: new Float64Array(16), key: '',
    };
  }

  /** Builds the mesh on an atlas: the 1x one, which serves captures and every screen at ratio 1. */
  useAtlas(atlas: NameAtlas): void {
    this.atlas = atlas;
    const texture = new THREE.DataTexture(atlas.data, atlas.width, atlas.height, THREE.RGFormat, THREE.UnsignedByteType);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    this.texture?.dispose();
    this.texture = texture;

    const n = this.labels.length;
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute('corner', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), 2));
    geometry.setIndex([0, 1, 2, 2, 1, 3]);
    const anchors = new Float32Array(n * 3);
    const cells = new Float32Array(n * 4);
    const tones = new Float32Array(n);
    this.labels.forEach((label, i) => {
      this.anchors[i].toArray(anchors, i * 3);
      const cell = atlas.cells.get(label.code)!;
      cells.set([cell.x, cell.y, cell.width, cell.height], i * 4);
      tones[i] = NAME_TIERS.indexOf(tierOf(label.rank));
    });
    geometry.setAttribute('aAnchor', new THREE.InstancedBufferAttribute(anchors, 3));
    geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 4));
    geometry.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aShift', new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('aTone', new THREE.InstancedBufferAttribute(tones, 1).setUsage(THREE.DynamicDrawUsage));
    geometry.instanceCount = n;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas: { value: texture },
        uAtlasSize: { value: new THREE.Vector2(atlas.width, atlas.height) },
        uAtlasRatio: { value: atlas.ratio },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uPixelRatio: { value: 1 },
        uOpacity: { value: 1 },
        uTones: { value: [...NAME_TIERS.map((t) => new THREE.Color(t.colour)), new THREE.Color(SELECTED_NAME_COLOUR)] },
        uHalo: { value: new THREE.Color(NAME_HALO.colour) },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.root.remove(this.mesh);
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    // Names take no clicks: a pick goes through to the mark or the country under them.
    mesh.raycast = () => {};
    this.root.add(mesh);
    this.mesh = mesh;
    this.screen.key = '';
  }

  /** Bakes the atlas in the browser and builds on it. False where there is no canvas. */
  prepare(): boolean {
    const atlas = bakeNameAtlas(this.labels, 1);
    if (!atlas) return false;
    this.useAtlas(atlas);
    return true;
  }

  /**
   * At the start of each render, after the riders are lifted: which names show, and
   * where, for the render under way. A capture's names are placed afresh and noted for
   * compose; the next live render puts the screen's back.
   */
  update(renderer: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Object3D, now: number, input: NamesUpdate = {}): void {
    const capturing = captureUnderWay();
    const visibility = namesVisibilityNow();
    const bias = nameZoomBias(visibility);
    if (!this.mesh || !this.atlas || bias === null) {
      this.root.visible = false;
      if (capturing) noteCountryNamesDrawn({ drawn: false, codes: [], boxes: [] });
      this.capturedLast = capturing;
      return;
    }
    this.root.visible = true;
    const material = this.mesh.material;
    const size = renderer.getSize(material.uniforms.uViewport.value as THREE.Vector2);
    material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    material.uniforms.uOpacity.value = zoomOutFadeFor(renderer, camera, this.root);
    this.root.updateMatrixWorld(true);

    if (capturing) {
      const asked = clipCountryNames();
      if (asked) {
        this.clipRender(camera, scene, size, bias, asked);
        this.capturedLast = true;
        return;
      }
      const placed = this.place(camera, scene, size, bias, { capture: true });
      const alpha = new Float32Array(this.labels.length);
      const shift = new Float32Array(this.labels.length);
      for (const p of placed) {
        const i = this.indexOf(p.id);
        alpha[i] = 1;
        shift[i] = p.shift;
      }
      this.write(alpha, shift, null);
      noteCountryNamesDrawn({ drawn: true, codes: placed.map((p) => p.id).sort(), boxes: placed.map((p) => p.box) });
      this.capturedLast = true;
      return;
    }

    const s = this.screen;
    const moved = !arraysEqual(s.camera, camera.matrixWorld.elements);
    if (moved) s.stillPlaced = false;
    const key = `${visibility}|${size.x}x${size.y}|${input.selected ?? ''}|${input.hovered ?? ''}|${this.root.scale.x}`;
    // On any change of what decides it; while the camera moves, at most every PLACE_EVERY_MS; once when it stops.
    const due = key !== s.key || (moved ? now - s.placedAt >= PLACE_EVERY_MS : !s.stillPlaced);
    if (due) {
      const placed = this.place(camera, scene, size, bias, { previous: s.shown, selected: input.selected, hovered: input.hovered });
      s.target.fill(0);
      s.shown = new Set(placed.map((p) => p.id));
      for (const p of placed) {
        const i = this.indexOf(p.id);
        s.target[i] = 1;
        s.shift[i] = p.shift;
      }
      s.placedAt = now;
      s.stillPlaced = !moved;
      s.key = key;
      s.camera.set(camera.matrixWorld.elements);
    } else if (moved) {
      s.camera.set(camera.matrixWorld.elements);
    }
    // Fades, eased by the time since the last frame.
    const step = this.lastFrame > 0 ? Math.min(1, (now - this.lastFrame) / FADE_MS) : 1;
    let fading = this.capturedLast || due;
    for (let i = 0; i < s.alpha.length; i++) {
      const goal = s.target[i];
      if (s.alpha[i] === goal) continue;
      s.alpha[i] = goal > s.alpha[i] ? Math.min(goal, s.alpha[i] + step) : Math.max(goal, s.alpha[i] - step);
      fading = true;
    }
    if (fading) this.write(s.alpha, s.shift, input.selected ?? null);
    this.lastFrame = now;
    this.capturedLast = false;
  }

  /**
   * A render in a clip that asks for names. Its frame (a new still): placed with the
   * clip's memory, then faded one frame's step, a fifth of a second of footage over
   * however many frames that is at the clip's rate; the first frame whole. Any other
   * render in it draws the names as the last frame left them.
   */
  private clipRender(camera: THREE.Camera, scene: THREE.Object3D, size: THREE.Vector2, bias: number, asked: { fps: number; clip: number }): void {
    let c = this.clip;
    if (!c || c.clip !== asked.clip) {
      const n = this.labels.length;
      c = { clip: asked.clip, frame: -1, shown: new Set(), target: new Float32Array(n), alpha: new Float32Array(n), shift: new Float32Array(n), note: null };
      this.clip = c;
    }
    const frame = stilledAt() !== null ? stillSerial() : null;
    if (frame !== null && frame !== c.frame) {
      const placed = this.place(camera, scene, size, bias, { capture: true, previous: c.shown });
      c.target.fill(0);
      for (const p of placed) {
        const i = this.indexOf(p.id);
        c.target[i] = 1;
        c.shift[i] = p.shift;
      }
      c.shown = new Set(placed.map((p) => p.id));
      const step = c.frame < 0 ? 1 : 1 / Math.max(1, Math.round((asked.fps * FADE_MS) / 1000));
      for (let i = 0; i < c.alpha.length; i++) {
        const goal = c.target[i];
        c.alpha[i] = goal > c.alpha[i] ? Math.min(goal, c.alpha[i] + step) : Math.max(goal, c.alpha[i] - step);
      }
      c.frame = frame;
      c.note = { drawn: true, codes: placed.map((p) => p.id).sort(), boxes: placed.map((p) => p.box) };
    }
    if (frame !== null && c.note) noteCountryNamesDrawn(c.note);
    this.write(c.alpha, c.shift, null);
  }

  private index = new Map<string, number>();
  private indexOf(code: string): number {
    if (this.index.size === 0) this.labels.forEach((l, i) => this.index.set(l.code, i));
    return this.index.get(code)!;
  }

  private place(
    camera: THREE.Camera,
    scene: THREE.Object3D,
    viewport: THREE.Vector2,
    bias: number,
    options: { capture?: boolean; previous?: ReadonlySet<string>; selected?: string | null; hovered?: string | null },
  ) {
    const projection = (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5];
    const zoom = nameZoom(pxPerRadFrom(projection, viewport.y, camera.position.length()));
    const world = new THREE.Vector3();
    const candidates: NameCandidate[] = [];
    this.labels.forEach((label, i) => {
      if (!nameDue(label, zoom, bias, options.previous?.has(label.code) ?? false)) return;
      world.copy(this.anchors[i]).applyMatrix4(this.root.matrixWorld);
      if (facingOpacity(nameFacing(world, camera.position)) <= 0) return;
      world.project(camera);
      const cell = this.atlas!.cells.get(label.code)!;
      candidates.push({
        label,
        x: ((world.x + 1) / 2) * viewport.x,
        y: ((1 - world.y) / 2) * viewport.y,
        width: cell.boxWidth,
        height: cell.boxHeight,
      });
    });
    nameObstacles(scene, camera, { width: viewport.x, height: viewport.y }, this.obstacles);
    const hard = options.capture ? [...this.obstacles.hard, ...cardNameObstacles()] : this.obstacles.hard;
    return placeCountryNames(candidates, {
      viewport: { width: viewport.x, height: viewport.y },
      hard,
      soft: this.obstacles.soft,
      // A card none of the screen's memory; a clip its own (previous), and nothing a person points at.
      ...(options.capture
        ? (options.previous ? { previous: options.previous } : {})
        : { previous: options.previous, selected: options.selected, hovered: options.hovered }),
    });
  }

  private write(alpha: Float32Array, shift: Float32Array, selected: string | null): void {
    const geometry = this.mesh!.geometry;
    const a = geometry.getAttribute('aAlpha') as THREE.InstancedBufferAttribute;
    const s = geometry.getAttribute('aShift') as THREE.InstancedBufferAttribute;
    const t = geometry.getAttribute('aTone') as THREE.InstancedBufferAttribute;
    (a.array as Float32Array).set(alpha);
    (s.array as Float32Array).set(shift);
    this.labels.forEach((label, i) => {
      (t.array as Float32Array)[i] = label.code === selected ? SELECTED_TONE : NAME_TIERS.indexOf(tierOf(label.rank));
    });
    a.needsUpdate = true;
    s.needsUpdate = true;
    t.needsUpdate = true;
  }

  dispose(): void {
    this.root.parent?.remove(this.root);
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
    this.texture?.dispose();
    this.mesh = null;
    this.texture = null;
  }
}

function arraysEqual(a: Float64Array, b: ArrayLike<number>): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

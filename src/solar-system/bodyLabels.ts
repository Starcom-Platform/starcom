/**
 * Finding the bodies too small to see (decision K6, step 4; record
 * docs/missions/01-architecture-decisions/solar-system.md).
 *
 * At the solar system's scale most bodies are far less than a pixel across: from the
 * farthest reach Neptune, four times the Earth's size, is a twentieth of a pixel. So
 * each body is marked: a ring in its own colour, a fixed size on screen, whole while
 * its disc is too small to see and fading as the disc grows, and its name beside it.
 * Where names would overlap, the higher-ranked keeps its place, the Sun's and the
 * Earth's first. A body off screen, or behind the camera, gets an arrow in its colour at
 * the edge of the view pointing its way, its name just inside (decision SS5): from most
 * daytime views the Sun is behind the camera on the way out. They are drawn in the scene,
 * so a card or clip that pulls back out carries them too.
 */
import * as THREE from 'three';
import { FONTS, GUNMETAL, ROLES } from '../styles/tokens';
import { placeNames, type ScreenBox } from '../globe-engine/placeNames';

/** The marker ring's size on screen, in CSS pixels. */
export const MARKER_PX = 14;
/** A marker is whole while its body's disc on screen is at most this radius, in CSS pixels... */
export const MARKER_FULL_PX = 3;
/** ...and gone once the disc is this large: the body can be seen for itself. */
export const MARKER_GONE_PX = 8;
/** The names' size, in CSS pixels, and their gap from the marker or the disc. */
export const NAME_PX = 12;
/** An edge pointer's size on screen, in CSS pixels (SS5). */
export const POINTER_PX = 14;
const NAME_GAP_PX = 4;
const NAME_HEIGHT_PX = NAME_PX + 6;
/** Textures are drawn at twice their size on screen, so names stay sharp on a dense display. */
const TEXTURE_SCALE = 2;
/** Drawn after everything else, over the bodies and the globe. */
const LABEL_RENDER_ORDER = 1000;

export interface LabelledBody {
  /** The scene object's name, and the key of the label. */
  id: string;
  /** What the label says. */
  name: string;
  /** Lower ranks keep their names where names would overlap. */
  rank: number;
  colour: number;
  position: THREE.Vector3;
  /** The body's radius in scene units. */
  radius: number;
}

// One placer for every set of names on the globe (globe-engine/placeNames.ts), the countries' too.
export { placeNames, type ScreenBox };

/** The radius on screen, in CSS pixels, of a sphere `radius` in size seen from `distance` away. */
export function radiusOnScreen(radius: number, distance: number, fovDeg: number, viewportHeight: number): number {
  if (distance <= radius) return Infinity;
  const angular = Math.asin(radius / distance);
  return (Math.tan(angular) / Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2)) * (viewportHeight / 2);
}

/** How much of a body's marker is drawn when its disc on screen is `discPx` in radius. */
export function markerShown(discPx: number): number {
  return 1 - THREE.MathUtils.smoothstep(discPx, MARKER_FULL_PX, MARKER_GONE_PX);
}


let measuring: CanvasRenderingContext2D | null | undefined;
/** A 2D context to measure text with, or null where there is none (tests): asked for once. */
function measuringContext(): CanvasRenderingContext2D | null {
  if (measuring === undefined) {
    measuring = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d') ?? null;
  }
  return measuring;
}

/** A texture drawn on a canvas, or a blank one where there is no canvas to draw on (tests). */
function drawTexture(widthPx: number, heightPx: number, draw: (context: CanvasRenderingContext2D) => void): THREE.Texture {
  if (!measuringContext()) return new THREE.Texture();
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return new THREE.Texture();
  canvas.width = Math.ceil(widthPx * TEXTURE_SCALE);
  canvas.height = Math.ceil(heightPx * TEXTURE_SCALE);
  context.scale(TEXTURE_SCALE, TEXTURE_SCALE);
  draw(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const nameFont = () => `600 ${NAME_PX}px ${FONTS.text}`;

/** How wide a name is drawn, in CSS pixels: measured where there is a canvas, estimated where not. */
function nameWidthPx(name: string): number {
  const context = measuringContext();
  if (!context) return Math.ceil(name.length * NAME_PX * 0.6) + 4;
  context.font = nameFont();
  return Math.ceil(context.measureText(name).width) + 4;
}

/** A pale ring, tinted to each body's colour by its material. */
function ringTexture(): THREE.Texture {
  return drawTexture(MARKER_PX, MARKER_PX, (context) => {
    context.strokeStyle = GUNMETAL[100];
    context.lineWidth = 2;
    context.beginPath();
    context.arc(MARKER_PX / 2, MARKER_PX / 2, MARKER_PX / 2 - 1.5, 0, Math.PI * 2);
    context.stroke();
  });
}

function nameTexture(name: string, widthPx: number): THREE.Texture {
  return drawTexture(widthPx, NAME_HEIGHT_PX, (context) => {
    context.font = nameFont();
    context.textBaseline = 'middle';
    context.fillStyle = ROLES.text.body;
    // A dark edge, so a name reads over the Sun or a lit planet as well as over space.
    context.lineWidth = 3;
    context.strokeStyle = ROLES.surface.globe;
    context.strokeText(name, 2, NAME_HEIGHT_PX / 2);
    context.fillText(name, 2, NAME_HEIGHT_PX / 2);
  });
}

const overlayMaterial = (map: THREE.Texture, colour = 0xffffff) => new THREE.SpriteMaterial({
  map,
  color: colour,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  sizeAttenuation: false,
});

/** A pale arrowhead pointing up, tinted to each body's colour by its material. */
function arrowTexture(): THREE.Texture {
  return drawTexture(POINTER_PX, POINTER_PX, (context) => {
    context.fillStyle = GUNMETAL[100];
    context.beginPath();
    context.moveTo(POINTER_PX / 2, 1);
    context.lineTo(POINTER_PX - 2, POINTER_PX - 2);
    context.lineTo(POINTER_PX / 2, POINTER_PX - 5);
    context.lineTo(2, POINTER_PX - 2);
    context.closePath();
    context.fill();
  });
}

/**
 * How far in from the edge of the view a pointer stands: a tenth of the view's width and
 * an eighth of its height, never under 18 pixels. The globe's canvas runs under the app's
 * rails and its timeline, and in the running app pointers 18 pixels in stood beneath
 * them, the Sun's under the timeline.
 */
export function pointerInsets(width: number, height: number): { x: number; y: number } {
  return { x: Math.max(18, width * 0.1), y: Math.max(18, height * 0.125) };
}

/**
 * Where the pointer to a body off screen stands (decision SS5): at the edge of the view,
 * inset (pointerInsets), along the body's direction from the middle of the view. `viewX` and `viewY` are
 * the body's place along the camera's own right and up, so a body behind the camera is
 * pointed to on the side it lies; one straight behind, downward. Returns pixels from the
 * middle of the view (x right, y up) and the pointer's angle.
 */
export function pointerAt(viewX: number, viewY: number, width: number, height: number): { x: number; y: number; angle: number } {
  const length = Math.hypot(viewX, viewY);
  const [dx, dy] = length === 0 ? [0, -1] : [viewX / length, viewY / length];
  const inset = pointerInsets(width, height);
  const reachX = dx === 0 ? Infinity : (width / 2 - inset.x) / Math.abs(dx);
  const reachY = dy === 0 ? Infinity : (height / 2 - inset.y) / Math.abs(dy);
  const reach = Math.min(reachX, reachY);
  return { x: dx * reach, y: dy * reach, angle: Math.atan2(dy, dx) };
}

interface Label {
  marker: THREE.Sprite;
  name: THREE.Sprite;
  pointer: THREE.Sprite;
  pointerName: THREE.Sprite;
  nameWidthPx: number;
}

/** The markers, names and edge pointers of the solar system's bodies, laid out afresh at every render. */
export class BodyLabels {
  private readonly scene: THREE.Scene;
  private readonly group = new THREE.Group();
  private readonly labels = new Map<string, Label>();
  private readonly ring = ringTexture();
  private readonly arrow = arrowTexture();
  private readonly projected = new THREE.Vector3();
  private readonly inView = new THREE.Vector3();
  private readonly toCamera = new THREE.Vector3();
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = 'solar-system-labels';
    this.group.visible = false;
    this.scene.add(this.group);
  }

  private labelFor(body: LabelledBody): Label {
    const existing = this.labels.get(body.id);
    if (existing) return existing;
    const widthPx = nameWidthPx(body.name);
    const nameMap = nameTexture(body.name, widthPx);
    const marker = new THREE.Sprite(overlayMaterial(this.ring, body.colour));
    const name = new THREE.Sprite(overlayMaterial(nameMap));
    const pointer = new THREE.Sprite(overlayMaterial(this.arrow, body.colour));
    const pointerName = new THREE.Sprite(overlayMaterial(nameMap));
    marker.name = `${body.id}-marker`;
    name.name = `${body.id}-name`;
    pointer.name = `${body.id}-pointer`;
    pointerName.name = `${body.id}-pointer-name`;
    for (const sprite of [marker, name, pointer, pointerName]) sprite.renderOrder = LABEL_RENDER_ORDER;
    pointer.visible = false;
    pointerName.visible = false;
    this.group.add(marker, name, pointer, pointerName);
    const label = { marker, name, pointer, pointerName, nameWidthPx: widthPx };
    this.labels.set(body.id, label);
    return label;
  }

  /** Puts `sprite` at a point `px` pixels from the middle of the view (x right, y up). */
  private placeOnScreen(sprite: THREE.Sprite, px: { x: number; y: number }, camera: THREE.PerspectiveCamera, viewport: THREE.Vector2): void {
    sprite.position.set(px.x / (viewport.x / 2), px.y / (viewport.y / 2), 0.5).unproject(camera);
  }

  /**
   * Lays the labels out for one render through `camera` over a viewport `viewport` CSS
   * pixels in size, the solar system drawn by `shown` (0 to 1).
   */
  public update(bodies: LabelledBody[], camera: THREE.PerspectiveCamera, viewport: THREE.Vector2, shown: number): void {
    if (this.disposed) return;
    this.group.visible = shown > 0;
    if (shown <= 0) return;

    const { x: width, y: height } = viewport;
    // A sprite of scale s spans s × P[1][1] × height / 2 pixels when its size does not attenuate.
    const scalePerPx = 2 / (height * camera.projectionMatrix.elements[5]);
    const names: Array<{ id: string; rank: number; box: ScreenBox }> = [];
    const pointers: Array<{ id: string; rank: number; box: ScreenBox }> = [];

    for (const body of bodies) {
      const label = this.labelFor(body);
      const distance = this.toCamera.copy(body.position).sub(camera.position).length();
      this.projected.copy(body.position).project(camera);
      const inFront = this.projected.z < 1 && this.projected.z > -1;
      const x = ((this.projected.x + 1) / 2) * width;
      const y = ((1 - this.projected.y) / 2) * height;
      const onScreen = inFront && x >= 0 && x <= width && y >= 0 && y <= height;
      label.marker.visible = false;
      label.name.visible = false;
      label.pointer.visible = false;
      label.pointerName.visible = false;

      if (!onScreen) {
        // An edge pointer, its name just inside it.
        this.inView.copy(body.position).applyMatrix4(camera.matrixWorldInverse);
        const at = pointerAt(this.inView.x, this.inView.y, width, height);
        const [dx, dy] = [Math.cos(at.angle), Math.sin(at.angle)];
        this.placeOnScreen(label.pointer, at, camera, viewport);
        label.pointer.scale.setScalar(POINTER_PX * scalePerPx);
        const pointerMaterial = label.pointer.material as THREE.SpriteMaterial;
        pointerMaterial.rotation = at.angle - Math.PI / 2;
        pointerMaterial.opacity = shown;
        const inward = POINTER_PX / 2 + NAME_GAP_PX + Math.abs(dx) * (label.nameWidthPx / 2) + Math.abs(dy) * (NAME_HEIGHT_PX / 2);
        const nameAt = { x: at.x - dx * inward, y: at.y - dy * inward };
        this.placeOnScreen(label.pointerName, nameAt, camera, viewport);
        label.pointerName.scale.set(label.nameWidthPx * scalePerPx, NAME_HEIGHT_PX * scalePerPx, 1);
        (label.pointerName.material as THREE.SpriteMaterial).opacity = shown;
        // The box round arrow and name together, in pixels from the top left.
        const left = Math.min(at.x - POINTER_PX / 2, nameAt.x - label.nameWidthPx / 2) + width / 2;
        const right = Math.max(at.x + POINTER_PX / 2, nameAt.x + label.nameWidthPx / 2) + width / 2;
        const top = height / 2 - Math.max(at.y + POINTER_PX / 2, nameAt.y + NAME_HEIGHT_PX / 2);
        const bottom = height / 2 - Math.min(at.y - POINTER_PX / 2, nameAt.y - NAME_HEIGHT_PX / 2);
        pointers.push({ id: body.id, rank: body.rank, box: { x: left, y: top, width: right - left, height: bottom - top } });
        continue;
      }

      label.marker.position.copy(body.position);
      label.name.position.copy(body.position);
      const discPx = radiusOnScreen(body.radius, distance, camera.fov, height);
      const markerFade = markerShown(discPx);
      label.marker.visible = markerFade > 0;
      label.marker.scale.setScalar(MARKER_PX * scalePerPx);
      (label.marker.material as THREE.SpriteMaterial).opacity = shown * markerFade;

      const offsetPx = Math.max(MARKER_PX / 2, discPx) + NAME_GAP_PX;
      label.name.scale.set(label.nameWidthPx * scalePerPx, NAME_HEIGHT_PX * scalePerPx, 1);
      label.name.center.set(-offsetPx / label.nameWidthPx, 0.5);
      (label.name.material as THREE.SpriteMaterial).opacity = shown;
      names.push({
        id: body.id,
        rank: body.rank,
        box: { x: x + offsetPx, y: y - NAME_HEIGHT_PX / 2, width: label.nameWidthPx, height: NAME_HEIGHT_PX },
      });
    }

    for (const id of placeNames(names)) this.labels.get(id)!.name.visible = true;
    for (const id of placeNames(pointers)) {
      const label = this.labels.get(id)!;
      label.pointer.visible = true;
      label.pointerName.visible = true;
    }
    // Laid out as a render starts, after its matrices are worked out: worked out again for this render, or it draws
    // the layout of the render before, and a capture after a smaller render drew every label at that render's size.
    this.group.updateMatrixWorld(true);
  }

  /** Whether a body's marker, name or edge pointer is drawn now. For tests and the record's checks. */
  public isDrawn(id: string, part: 'marker' | 'name' | 'pointer'): boolean {
    const label = this.labels.get(id);
    return Boolean(this.group.visible && label?.[part].visible);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.group);
    for (const { marker, name, pointer, pointerName } of this.labels.values()) {
      (name.material as THREE.SpriteMaterial).map?.dispose();
      for (const sprite of [marker, name, pointer, pointerName]) (sprite.material as THREE.SpriteMaterial).dispose();
    }
    this.ring.dispose();
    this.arrow.dispose();
    this.labels.clear();
  }
}

/**
 * Every country fill in one mesh.
 *
 * Each baked part was its own mesh with its own shader material, so a globe of 330
 * to 615 parts cost that many draw calls. They are one geometry now. What made
 * them separate objects rides along per vertex (which part it belongs to, the
 * part's colour, its QA tint), and what changed per part at runtime (hover,
 * selection, dimming) lives in a small texture the vertex shader reads by part.
 *
 * A part is still addressable: userData.parts lists them in order, a raycast hit
 * names its part through the vertex it struck, and a part's own triangles can be
 * copied out for a selection halo.
 */
import * as THREE from 'three';

export interface TerritoryPartSource {
  id: string;
  countryCode?: string;
  name?: string;
  qa?: { status?: string };
  /** Flattened xyz. */
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
}

export interface TerritoryPart {
  id: string;
  countryCode?: string;
  name?: string;
  qa?: TerritoryPartSource['qa'];
  vertexStart: number;
  vertexCount: number;
}

/** Eased toward their targets each frame; a texel per part carries them to the shader. */
export interface TerritoryPartMotion {
  hover: Float32Array;
  select: Float32Array;
  dim: Float32Array;
  targetHover: Float32Array;
  targetSelect: Float32Array;
  targetDim: Float32Array;
  texture: THREE.DataTexture;
}

export interface TerritoryBatchData {
  parts: TerritoryPart[];
  motion: TerritoryPartMotion;
}

/** Wide enough that a globe's parts fit a few rows, narrow enough for any GPU. */
const STATE_TEXTURE_WIDTH = 1024;

export function createPartMotion(partCount: number): TerritoryPartMotion {
  const width = Math.max(1, Math.min(partCount, STATE_TEXTURE_WIDTH));
  const height = Math.max(1, Math.ceil(partCount / width));
  const texture = new THREE.DataTexture(new Uint8Array(width * height * 4), width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  const zeros = () => new Float32Array(partCount);
  return {
    hover: zeros(), select: zeros(), dim: zeros(),
    targetHover: zeros(), targetSelect: zeros(), targetDim: zeros(),
    texture,
  };
}

export interface MergedTerritoryParts {
  geometry: THREE.BufferGeometry;
  parts: TerritoryPart[];
}

export function mergeTerritoryParts<S extends TerritoryPartSource>(
  sources: S[],
  look: { colorOf: (part: S) => number; tintOf?: (part: S) => { color: number; strength: number } | null },
): MergedTerritoryParts {
  const usable = sources.filter((s) => s.positions.length >= 9 && s.indices.length >= 3);
  const vertexTotal = usable.reduce((n, s) => n + s.positions.length / 3, 0);
  const indexTotal = usable.reduce((n, s) => n + s.indices.length, 0);

  const positions = new Float32Array(vertexTotal * 3);
  const partOf = new Float32Array(vertexTotal);
  const baseColors = new Float32Array(vertexTotal * 3);
  const tints = new Float32Array(vertexTotal * 4);
  const indices = vertexTotal > 65535 ? new Uint32Array(indexTotal) : new Uint16Array(indexTotal);
  const parts: TerritoryPart[] = [];
  const color = new THREE.Color();
  const tint = new THREE.Color();

  let v = 0;
  let i = 0;
  usable.forEach((source, partIndex) => {
    const count = source.positions.length / 3;
    parts.push({ id: source.id, countryCode: source.countryCode, name: source.name, qa: source.qa, vertexStart: v, vertexCount: count });
    positions.set(Array.from(source.positions), v * 3);
    color.setHex(look.colorOf(source));
    const partTint = look.tintOf?.(source) ?? null;
    if (partTint) tint.setHex(partTint.color);
    for (let k = 0; k < count; k++) {
      const at = v + k;
      partOf[at] = partIndex;
      baseColors[at * 3] = color.r; baseColors[at * 3 + 1] = color.g; baseColors[at * 3 + 2] = color.b;
      if (partTint) {
        tints[at * 4] = tint.r; tints[at * 4 + 1] = tint.g; tints[at * 4 + 2] = tint.b; tints[at * 4 + 3] = partTint.strength;
      }
    }
    for (let k = 0; k < source.indices.length; k++) indices[i + k] = source.indices[k] + v;
    v += count;
    i += source.indices.length;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPart', new THREE.BufferAttribute(partOf, 1));
  geometry.setAttribute('aBaseColor', new THREE.BufferAttribute(baseColors, 3));
  geometry.setAttribute('aQaTint', new THREE.BufferAttribute(tints, 4));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  // Parts share no vertices, so merged normals are each part's own normals.
  geometry.computeVertexNormals();
  return { geometry, parts };
}

export function territoryBatchData(obj: THREE.Object3D | null | undefined): TerritoryBatchData | null {
  const data = (obj as THREE.Mesh | undefined)?.userData as Partial<TerritoryBatchData> | undefined;
  return data && Array.isArray(data.parts) && data.motion ? (data as TerritoryBatchData) : null;
}

/**
 * The part a raycast struck, read from the vertex it hit. A vertex, not a triangle
 * number: three-mesh-bvh reorders the index buffer when it builds its tree, and
 * vertex numbers are the one thing that survives that.
 */
export function territoryPartAt(hit: THREE.Intersection | undefined): number | null {
  const mesh = hit?.object as THREE.Mesh | undefined;
  const vertex = hit?.face?.a;
  const attribute = mesh?.geometry?.getAttribute?.('aPart');
  if (vertex === undefined || !attribute || !territoryBatchData(mesh)) return null;
  return Math.round(attribute.getX(vertex));
}

/** A copy of one part's triangles, e.g. for a selection halo that outlives an LOD swap. */
export function territoryPartGeometry(mesh: THREE.Mesh, partIndex: number): THREE.BufferGeometry | null {
  const part = territoryBatchData(mesh)?.parts[partIndex];
  const index = mesh.geometry.index;
  if (!part || !index) return null;
  const from = part.vertexStart;
  const to = from + part.vertexCount;
  const all = mesh.geometry.getAttribute('position').array as Float32Array;
  const triangles: number[] = [];
  for (let t = 0; t + 2 < index.count; t += 3) {
    const a = index.getX(t);
    // A triangle never spans two parts, so its first corner decides.
    if (a >= from && a < to) triangles.push(a - from, index.getX(t + 1) - from, index.getX(t + 2) - from);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(all.slice(from * 3, to * 3), 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  return geometry;
}

/** Which part is hovered and which selected. Selecting one dims every other. */
export function setTerritoryPartTargets(motion: TerritoryPartMotion, hovered: number | null, selected: number | null): void {
  for (let p = 0; p < motion.hover.length; p++) {
    motion.targetHover[p] = p === hovered ? 1 : 0;
    motion.targetSelect[p] = p === selected ? 1 : 0;
    motion.targetDim[p] = selected !== null && p !== selected ? 1 : 0;
  }
}

/**
 * Moves every part `alpha` of the way to its targets and writes the texels that
 * changed. Returns whether the texture needs uploading.
 */
export function easeTerritoryParts(motion: TerritoryPartMotion, alpha: number): boolean {
  const texels = motion.texture.image.data as Uint8Array;
  const step = (value: number, target: number) => {
    const next = value + (target - value) * alpha;
    return Math.abs(target - next) < 1e-3 ? target : next;
  };
  let changed = false;
  for (let p = 0; p < motion.hover.length; p++) {
    motion.hover[p] = step(motion.hover[p], motion.targetHover[p]);
    motion.select[p] = step(motion.select[p], motion.targetSelect[p]);
    motion.dim[p] = step(motion.dim[p], motion.targetDim[p]);
    const o = p * 4;
    const h = Math.round(motion.hover[p] * 255);
    const s = Math.round(motion.select[p] * 255);
    const d = Math.round(motion.dim[p] * 255);
    if (texels[o] !== h || texels[o + 1] !== s || texels[o + 2] !== d) {
      texels[o] = h; texels[o + 1] = s; texels[o + 2] = d;
      changed = true;
    }
  }
  if (changed) motion.texture.needsUpdate = true;
  return changed;
}

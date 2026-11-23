/**
 * Which territories border which, and four colours that keep neighbours apart
 * (decision K5, TS2 and TS7: docs/missions/01-architecture-decisions/territories.md).
 *
 * Two territories are neighbours when they share a border edge: the same two
 * vertices, at the bake's quantization (1e-6 degrees). A shared corner alone does
 * not count, which is the usual rule for map colouring and the one the four-colour
 * theorem is stated for.
 *
 * Shared by scripts/colour-territories.mjs, which writes the table, and the test
 * that recomputes the graph and checks the table against it, so the two cannot
 * disagree about what a neighbour is.
 */

/** The bake's quantization (territories-baked/manifest.json, topology.quantizationScale). */
const QUANTIZATION = 1e6;

/** The colours a Classic fill can take. More are never needed for a map; the test says so. */
export const SLOTS = 4;

const vertexKey = ([lng, lat]) => `${Math.round(lng * QUANTIZATION)},${Math.round(lat * QUANTIZATION)}`;

/**
 * Every territory's code (`ADM0_A3`) and the codes it shares an edge with, read
 * from Natural Earth GeoJSON. Several collections (the detail levels) may be
 * passed: a pair that borders at any level counts.
 */
export function territoryNeighbours(...collections) {
  const neighbours = new Map();
  for (const collection of collections) {
    const edgeOwners = new Map();
    for (const feature of collection.features) {
      const code = feature.properties.ADM0_A3;
      if (!neighbours.has(code)) neighbours.set(code, new Set());
      const { type, coordinates } = feature.geometry;
      const polygons = type === 'Polygon' ? [coordinates] : coordinates;
      for (const polygon of polygons) {
        for (const ring of polygon) {
          for (let k = 0; k + 1 < ring.length; k++) {
            const a = vertexKey(ring[k]);
            const b = vertexKey(ring[k + 1]);
            if (a === b) continue;
            const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
            const owners = edgeOwners.get(edge) ?? new Set();
            owners.add(code);
            edgeOwners.set(edge, owners);
          }
        }
      }
    }
    for (const owners of edgeOwners.values()) {
      if (owners.size < 2) continue;
      for (const a of owners) for (const b of owners) if (a !== b) neighbours.get(a).add(b);
    }
  }
  return neighbours;
}

/**
 * A colour slot (0..SLOTS-1) for every territory, no two neighbours alike.
 *
 * DSATUR: colour next the territory whose neighbours already use the most
 * different colours, then the one with the most neighbours, then by code, so the
 * result is the same on every run. It throws if a colouring needs more than SLOTS.
 *
 * DSATUR fills the lowest free slot, which puts every island (no neighbours) in
 * the first colour: 128 of 242 territories on the 2026-10-07 data. A second pass
 * then moves each territory, in code order, to the least-used slot its neighbours
 * leave free, while that is used less than its own. A move never gives a territory
 * a neighbour's slot, so the colouring stays sound, and the counts even out.
 *
 * Given the slots last written (`kept`), every territory keeps its own, so a new
 * territory never recolours the map (France's overseas regions, 8 Nov 2026, would
 * otherwise have moved some thirty others): only the new ones are coloured, by
 * DSATUR, each the least-used slot its neighbours leave free. With nothing kept, or
 * slots that no longer hold, every territory is coloured afresh.
 */
export function colourTerritories(neighbours, kept = {}) {
  const held = Object.fromEntries(Object.entries(kept)
    .filter(([code, s]) => neighbours.has(code) && Number.isInteger(s) && s >= 0 && s < SLOTS));
  const sound = [...neighbours].every(([a, set]) => [...set].every((b) => held[a] === undefined || held[a] !== held[b]));
  if (Object.keys(held).length && sound) {
    const slots = dsatur(neighbours, leastUsed, held);
    if (slots) return slots;
  }
  for (const pick of [leastUsed, lowest]) {
    const slots = dsatur(neighbours, pick);
    if (slots) return balance(neighbours, slots);
  }
  throw new Error(`territoryNeighbours: no colouring in ${SLOTS} slots`);
}

const leastUsed = (free, used) => free.reduce((best, s) => (used[s] < used[best] ? s : best));
const lowest = (free) => free[0];

function balance(neighbours, slots) {
  const used = new Array(SLOTS).fill(0);
  for (const s of Object.values(slots)) used[s]++;
  for (let moved = true; moved; ) {
    moved = false;
    for (const code of Object.keys(slots).sort()) {
      const taken = new Set([...neighbours.get(code)].map((n) => slots[n]));
      let best = slots[code];
      for (let s = 0; s < SLOTS; s++) if (!taken.has(s) && used[s] + 1 < used[best]) best = s;
      if (best !== slots[code]) {
        used[slots[code]]--;
        used[best]++;
        slots[code] = best;
        moved = true;
      }
    }
  }
  return slots;
}

function dsatur(neighbours, pick, held = {}) {
  const codes = [...neighbours.keys()].sort();
  const slot = new Map(Object.entries(held));
  const used = new Array(SLOTS).fill(0);
  for (const s of slot.values()) used[s]++;
  while (slot.size < codes.length) {
    let next = null;
    let nextSaturation = -1;
    let nextDegree = -1;
    for (const code of codes) {
      if (slot.has(code)) continue;
      const saturation = new Set([...neighbours.get(code)].filter((n) => slot.has(n)).map((n) => slot.get(n))).size;
      const degree = neighbours.get(code).size;
      if (saturation > nextSaturation || (saturation === nextSaturation && degree > nextDegree)) {
        next = code;
        nextSaturation = saturation;
        nextDegree = degree;
      }
    }
    const taken = new Set([...neighbours.get(next)].map((n) => slot.get(n)));
    const free = [];
    for (let s = 0; s < SLOTS; s++) if (!taken.has(s)) free.push(s);
    if (free.length === 0) return null;
    const chosen = pick(free, used);
    slot.set(next, chosen);
    used[chosen]++;
  }
  return Object.fromEntries(codes.map((code) => [code, slot.get(code)]));
}

/** Neighbour pairs that share a slot; empty when the colouring is sound. */
export function clashes(neighbours, slots) {
  const found = [];
  for (const [a, set] of neighbours) {
    for (const b of set) if (a < b && slots[a] === slots[b]) found.push(`${a}-${b}`);
  }
  return found;
}

/** The module scripts/colour-territories.mjs writes, as text, so the test can say when it is stale. */
export function colourModuleSource(slots) {
  const entries = Object.keys(slots).sort().map((code) => `${code}: ${slots[code]}`);
  const lines = [];
  for (let i = 0; i < entries.length; i += 10) lines.push(`  ${entries.slice(i, i + 10).join(', ')},`);
  return `/**
 * GENERATED by scripts/colour-territories.mjs from the territory GeoJSON; do not edit.
 * Re-run it (npm run geo:colours) when the territories change; territoryColours.test.ts
 * fails until then.
 *
 * Each territory's colour slot in the Classic style (decision K5, TS2 and TS7), keyed by
 * Natural Earth's ADM0_A3, which every baked part carries as its countryCode. No two
 * territories that share a border edge share a slot.
 */
export const TERRITORY_COLOUR_SLOT: Readonly<Record<string, 0 | 1 | 2 | 3>> = {
${lines.join('\n')}
};
`;
}

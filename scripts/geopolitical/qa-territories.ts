import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { parseArgs, readJson, writeJson, type LOD } from './shared';
import { BASE_MAP } from '../../src/components/Globe/globeAltitudes';

interface QAResult {
  lod: LOD;
  ok: boolean;
  reasons: string[];
  warnings: string[];
  partsIndex: PartIndexEntry[];
  meshPath: string;
  largeComplexPartIssues: string[];
}

interface SourceValidationReport {
  status?: 'pass' | 'warn' | 'fail' | string;
  lodCoverage?: Array<{
    lod: number;
    territoriesExists?: boolean;
    bordersExists?: boolean;
  }>;
}

interface TopologyReport {
  topologyGraphHash?: string;
  lods?: Array<{
    lod: number;
    uniqueEdgeCount: number;
    sharedEdgeCount: number;
  }>;
}

interface MeshPart {
  id: string;
  positions: number[];
  indices: number[];
  indexFormat?: 'uint16' | 'uint32';
  ringCount?: number;
  pointCount?: number;
  triangleCount?: number;
  qa?: {
    maxEdgeToMedianEdgeRatio?: number;
    minTriangleArea?: number;
    maxSurfaceSag?: number;
    status?: 'pass' | 'warn' | 'fail';
    droppedDegenerateFaces?: number;
    droppedPathologicalFaces?: number;
    usedLargePartTriangulation?: boolean;
  };
}

interface MeshPayload {
  contract?: {
    manifestVersion?: string;
    packageId?: string;
    topologyGraphHash?: string | null;
  };
  parts?: MeshPart[];
}

interface PartIndexEntry {
  id: string;
  countryCode?: string;
  pointCount?: number;
  vertexCount?: number;
  triangleCount?: number;
  indexFormat?: 'uint16' | 'uint32';
  qa?: {
    maxEdgeToMedianEdgeRatio?: number;
    minTriangleArea?: number;
    maxSurfaceSag?: number;
    status?: 'pass' | 'warn' | 'fail';
    usedLargePartTriangulation?: boolean;
  };
}

// Trusts the bake script's own authoritative decision (bakePolygonPart in
// bake-territories.ts) about which triangulation strategy was actually
// used, rather than re-deriving it from pointCount alone — a part below
// the 800-point cutoff that retried into constrained Delaunay because
// ear-clipping produced pathological triangles is exactly as
// large-part-triangulated as one that started above the cutoff, and needs
// the same (more lenient) ratio thresholds; re-deriving from pointCount
// alone would miss that and misjudge a genuinely-improved part as failing.
// Falls back to the point-count heuristic only for baked data predating
// this field.
function isLargeComplexPart(part: { pointCount?: number; qa?: { usedLargePartTriangulation?: boolean } }): boolean {
  if (typeof part.qa?.usedLargePartTriangulation === 'boolean') return part.qa.usedLargePartTriangulation;
  return (part.pointCount ?? 0) >= 800;
}

// Scoped to the large-complex-part bucket (the only parts triangulated via
// constrained Delaunay, in constrainedTriangulation.ts) — that's where both
// the winding-inversion and crash-safety-fallback bugs fixed this session
// actually lived, and it's cheap (currently 1-3 parts total across all LODs)
// since it needs the full position/index buffers, not just summary stats.
// warn, not fail: a genuine but rare edge case (near-duplicate points
// silently dropped by Delaunator) can make the completeness check's raw
// triangle count fall a little short of the Euler-formula prediction without
// there being an actual regression — see the audit in the commit message.
function checkLargeComplexPartCompleteness(part: MeshPart): string | null {
  const pointCount = part.pointCount;
  const ringCount = part.ringCount;
  if (pointCount === undefined || ringCount === undefined) return null;
  const triangleCount = part.triangleCount ?? part.indices.length / 3;
  const droppedDegenerate = part.qa?.droppedDegenerateFaces ?? 0;
  const droppedPathological = part.qa?.droppedPathologicalFaces ?? 0;
  // Euler's formula: a simple polygon triangulation with h holes and n total
  // boundary vertices (all rings combined) has exactly n - 2 + 2h triangles,
  // independent of which algorithm (ear-clipping or constrained Delaunay)
  // produced it — verified directly against both this session (see
  // constrainedTriangulation.test.ts and geometryFactory.largeComplexPart.test.ts).
  const expectedRawTriangles = pointCount + 2 * ringCount - 4;
  const actualRawTriangles = triangleCount + droppedDegenerate + droppedPathological;
  if (actualRawTriangles !== expectedRawTriangles) {
    return `triangle-count mismatch for ${part.id}: raw=${actualRawTriangles} expected=${expectedRawTriangles} `
      + `(pointCount=${pointCount}, ringCount=${ringCount}) — possible duplicate points or a triangulator regression`;
  }
  return null;
}

// Checks every triangle's face normal points away from the sphere origin —
// the convention THREE.ShapeUtils.triangulateShape (ear-clipping) produces
// and constrainedTriangulation.ts normalizes CDT's output to match. An
// inverted winding is currently invisible in the live renderer (both mesh
// consumers use an unlit, double-sided material) but breaks the moment
// either switches to a lit material, so it's checked directly rather than
// relying on that masking to stay true forever.
function checkLargeComplexPartWinding(part: MeshPart): string | null {
  const pos = part.positions;
  const idx = part.indices;
  for (let t = 0; t < idx.length; t += 3) {
    const ia = idx[t] * 3, ib = idx[t + 1] * 3, ic = idx[t + 2] * 3;
    const ax = pos[ia], ay = pos[ia + 1], az = pos[ia + 2];
    const bx = pos[ib], by = pos[ib + 1], bz = pos[ib + 2];
    const cx = pos[ic], cy = pos[ic + 1], cz = pos[ic + 2];
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const cxm = (ax + bx + cx) / 3, cym = (ay + by + cy) / 3, czm = (az + bz + cz) / 3;
    const dot = nx * cxm + ny * cym + nz * czm;
    if (dot <= 0) {
      return `inward-facing triangle in ${part.id} at triangle index ${t / 3} (winding-order regression)`;
    }
  }
  return null;
}

// Kept in sync with the identical thresholds in bake-territories.ts — see the
// comment there for why 80 (chosen without reference to actual large-part ratio
// data) let a genuine outlier (RUS:1-0, ~76) through as merely 'warn'.
/** How far above the globe the fills sit, in scene units — the most any triangle may sag. */
const SURFACE_CLEARANCE_UNITS = Number(((BASE_MAP - 1) * 100).toFixed(6));

function failRatioThreshold(part: PartIndexEntry): number {
  return isLargeComplexPart(part) ? 40 : 20;
}

function warnRatioThreshold(part: PartIndexEntry): number {
  return isLargeComplexPart(part) ? 20 : 12;
}

interface InvariantResult {
  key: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

interface FailureMatrixRow {
  failureMode: string;
  detector: string;
  status: 'pass' | 'warn' | 'fail';
  blocking: boolean;
  detail: string;
}

interface LODBudgetReport {
  lod: LOD;
  triangles: number;
  triangleBudget: number;
  gzipBytes: number;
  brotliBytes: number;
  transferBudget: number;
  decodeUploadMs: number;
  decodeBudgetMs: number;
  status: 'pass' | 'warn' | 'fail';
  failures: string[];
}

const TRIANGLE_BUDGETS: Record<LOD, number> = {
  0: 50000,
  1: 120000,
  2: 240000
};

const TRANSFER_BUDGETS: Record<LOD, number> = {
  0: 900 * 1024,
  1: Math.round(2.2 * 1024 * 1024),
  2: Math.round(4.5 * 1024 * 1024)
};

const DECODE_BUDGET_MS: Record<LOD, number> = {
  0: 80,
  1: 180,
  2: 350
};

const GOLDEN_OFFENDER_CODES = [
  'USA', 'CAN', 'RUS', 'MEX', 'CHL', 'AUS', 'ATA', 'NOR', 'IDN', 'JPN', 'GBR'
];

const MICROSTATE_REQUIRED_CODES = ['VAT', 'SMR', 'MCO', 'LIE', 'AND', 'MLT', 'SGP', 'BHR'];

function readPartsIndex(indexPath: string): PartIndexEntry[] {
  const indexData = readJson<{ parts?: PartIndexEntry[] }>(indexPath);
  return Array.isArray(indexData.parts) ? indexData.parts : [];
}

function validateLod(
  lod: LOD,
  generatedDir: string,
  expectedContract?: { manifestVersion?: string; packageId?: string; topologyGraphHash?: string | null }
): QAResult {
  const result: QAResult = { lod, ok: true, reasons: [], warnings: [], partsIndex: [], meshPath: '', largeComplexPartIssues: [] };
  const indexPath = path.join(generatedDir, `lod${lod}`, 'parts-index.json');
  const meshPath = path.join(generatedDir, `lod${lod}`, 'parts-mesh.json');
  result.meshPath = meshPath;

  if (!fs.existsSync(indexPath)) {
    result.ok = false;
    result.reasons.push(`Missing file: ${indexPath}`);
    return result;
  }
  if (!fs.existsSync(meshPath)) {
    result.ok = false;
    result.reasons.push(`Missing file: ${meshPath}`);
    return result;
  }

  const indexData = readJson<{ parts?: unknown[] }>(indexPath);
  if (!Array.isArray(indexData.parts)) {
    result.ok = false;
    result.reasons.push(`Invalid schema: parts is not an array (${indexPath})`);
    return result;
  }

  const meshData = readJson<MeshPayload>(meshPath);
  if (!Array.isArray(meshData.parts)) {
    result.ok = false;
    result.reasons.push(`Invalid schema: parts is not an array (${meshPath})`);
    return result;
  }

  if (expectedContract) {
    if (meshData.contract?.manifestVersion !== expectedContract.manifestVersion) {
      result.ok = false;
      result.reasons.push(`Mesh contract manifestVersion mismatch for LOD${lod}`);
    }
    if ((meshData.contract?.packageId || null) !== (expectedContract.packageId || null)) {
      result.ok = false;
      result.reasons.push(`Mesh contract packageId mismatch for LOD${lod}`);
    }
    if ((meshData.contract?.topologyGraphHash || null) !== (expectedContract.topologyGraphHash || null)) {
      result.ok = false;
      result.reasons.push(`Mesh contract topologyGraphHash mismatch for LOD${lod}`);
    }
  }

  if (indexData.parts.length === 0 || meshData.parts.length === 0) {
    result.ok = false;
    result.reasons.push(`Empty parts array (${meshPath})`);
    return result;
  }

  result.partsIndex = readPartsIndex(indexPath);

  for (let i = 0; i < meshData.parts.length; i++) {
    const part = meshData.parts[i];
    if (!Array.isArray(part.positions) || part.positions.length % 3 !== 0) {
      result.ok = false;
      result.reasons.push(`Invalid positions buffer for part ${part.id}`);
      continue;
    }
    if (!Array.isArray(part.indices) || part.indices.length % 3 !== 0) {
      result.ok = false;
      result.reasons.push(`Invalid index buffer for part ${part.id}`);
      continue;
    }
    const maxIndex = part.positions.length / 3 - 1;
    const outOfRange = part.indices.some((idx) => idx < 0 || idx > maxIndex);
    if (outOfRange) {
      result.ok = false;
      result.reasons.push(`Out-of-range indices for part ${part.id}`);
    }

    const ratio = part.qa?.maxEdgeToMedianEdgeRatio ?? 999;
    const minArea = part.qa?.minTriangleArea ?? 0;
    const status = part.qa?.status ?? 'fail';

    const failRatio = failRatioThreshold(part);
    const warnRatio = warnRatioThreshold(part);

    if (status === 'fail' || ratio > failRatio || minArea < 1e-7) {
      result.ok = false;
      result.reasons.push(`Mandatory QA fail for part ${part.id} (ratio=${ratio}, minArea=${minArea})`);
    } else if (status === 'warn' || ratio > warnRatio || minArea < 1e-6) {
      result.warnings.push(`Warning QA for part ${part.id} (ratio=${ratio}, minArea=${minArea})`);
    }

    /*
     * Whether the shipped mesh stays above the globe. Kept in sync with the
     * clearance bake-territories.ts fits to: the fills sit (BASE_MAP - 1) * 100
     * scene units up, and a triangle whose flat interior sags that far passes
     * under the planet's own surface. A part with no measurement fails too — it
     * was baked before sphere fitting, and nothing has checked it against this.
     */
    const sag = part.qa?.maxSurfaceSag;
    if (typeof sag !== 'number') {
      result.ok = false;
      result.reasons.push(`No maxSurfaceSag for part ${part.id} — baked without sphere fitting`);
    } else if (sag >= SURFACE_CLEARANCE_UNITS) {
      result.ok = false;
      result.reasons.push(`Part ${part.id} sags ${sag} below the sphere, at or past the fills' ${SURFACE_CLEARANCE_UNITS}-unit clearance`);
    }

    if (isLargeComplexPart(part)) {
      const completenessIssue = checkLargeComplexPartCompleteness(part);
      if (completenessIssue) result.largeComplexPartIssues.push(completenessIssue);
      const windingIssue = checkLargeComplexPartWinding(part);
      if (windingIssue) result.largeComplexPartIssues.push(windingIssue);
    }
  }

  return result;
}

function benchmarkDecodeUploadMs(meshPath: string): number {
  const raw = fs.readFileSync(meshPath, 'utf8');
  const start = performance.now();
  const payload = JSON.parse(raw) as MeshPayload;
  const parts = Array.isArray(payload.parts) ? payload.parts : [];
  let touch = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const positions = new Float32Array(part.positions);
    const indices = part.indexFormat === 'uint16'
      ? new Uint16Array(part.indices)
      : new Uint32Array(part.indices);
    touch += positions.length + indices.length;
  }
  const elapsed = performance.now() - start;
  if (touch === -1) console.log('');
  return Number(elapsed.toFixed(3));
}

function evaluateBudgetGates(results: QAResult[]): {
  status: 'pass' | 'warn' | 'fail';
  rows: LODBudgetReport[];
} {
  const rows: LODBudgetReport[] = results.map((result) => {
    const triangleCount = result.partsIndex.reduce((sum, part) => sum + (part.triangleCount ?? 0), 0);
    const triangleBudget = TRIANGLE_BUDGETS[result.lod];

    const meshBuffer = fs.readFileSync(result.meshPath);
    const gzipBytes = zlib.gzipSync(meshBuffer, { level: zlib.constants.Z_BEST_COMPRESSION }).byteLength;
    const brotliBytes = zlib.brotliCompressSync(meshBuffer, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 }
    }).byteLength;
    const transferBudget = TRANSFER_BUDGETS[result.lod];

    const decodeUploadMs = benchmarkDecodeUploadMs(result.meshPath);
    const decodeBudgetMs = DECODE_BUDGET_MS[result.lod];

    const failures: string[] = [];
    if (triangleCount > triangleBudget) {
      failures.push(`triangles=${triangleCount} exceeds budget=${triangleBudget}`);
    }
    if (gzipBytes > transferBudget) {
      failures.push(`gzipBytes=${gzipBytes} exceeds budget=${transferBudget}`);
    }
    if (brotliBytes > transferBudget) {
      failures.push(`brotliBytes=${brotliBytes} exceeds budget=${transferBudget}`);
    }
    if (decodeUploadMs > decodeBudgetMs) {
      failures.push(`decodeUploadMs=${decodeUploadMs} exceeds budgetMs=${decodeBudgetMs}`);
    }

    return {
      lod: result.lod,
      triangles: triangleCount,
      triangleBudget,
      gzipBytes,
      brotliBytes,
      transferBudget,
      decodeUploadMs,
      decodeBudgetMs,
      status: failures.length ? 'fail' : 'pass',
      failures
    };
  });

  const status = rows.some((row) => row.status === 'fail') ? 'fail' : 'pass';
  return { status, rows };
}

function evaluateInvariants(
  lodResults: QAResult[],
  sourceValidation: SourceValidationReport,
  topologyReport: TopologyReport
): InvariantResult[] {
  const invariants: InvariantResult[] = [];

  if (!topologyReport.topologyGraphHash) {
    invariants.push({
      key: 'topologyHash',
      status: 'fail',
      detail: 'Missing topologyGraphHash in topology report'
    });
  } else {
    invariants.push({
      key: 'topologyHash',
      status: 'pass',
      detail: `topologyGraphHash=${topologyReport.topologyGraphHash}`
    });
  }

  const topologyByLod = new Map<number, { uniqueEdgeCount: number; sharedEdgeCount: number }>();
  (topologyReport.lods ?? []).forEach((entry) => {
    topologyByLod.set(entry.lod, { uniqueEdgeCount: entry.uniqueEdgeCount, sharedEdgeCount: entry.sharedEdgeCount });
  });

  for (const lodResult of lodResults) {
    const topo = topologyByLod.get(lodResult.lod);
    if (!topo) {
      invariants.push({
        key: `lod${lodResult.lod}:topologyPresence`,
        status: 'fail',
        detail: `Missing topology metrics for LOD${lodResult.lod}`
      });
      continue;
    }

    if (topo.sharedEdgeCount <= 0) {
      invariants.push({
        key: `lod${lodResult.lod}:neighborInvariant`,
        status: 'fail',
        detail: `sharedEdgeCount=${topo.sharedEdgeCount}`
      });
    } else {
      const ratio = topo.uniqueEdgeCount > 0 ? topo.sharedEdgeCount / topo.uniqueEdgeCount : 0;
      invariants.push({
        key: `lod${lodResult.lod}:neighborInvariant`,
        status: ratio < 0.03 ? 'warn' : 'pass',
        detail: `sharedEdgeRatio=${ratio.toFixed(4)} (${topo.sharedEdgeCount}/${topo.uniqueEdgeCount})`
      });
    }
  }

  const coverage = sourceValidation.lodCoverage ?? [];
  const byLod = new Map(coverage.map((row) => [row.lod, row]));
  for (const lodResult of lodResults) {
    const row = byLod.get(lodResult.lod);
    if (!row?.territoriesExists) {
      invariants.push({
        key: `lod${lodResult.lod}:coverageInvariant`,
        status: 'fail',
        detail: 'Territories source missing for requested LOD'
      });
    } else {
      invariants.push({
        key: `lod${lodResult.lod}:coverageInvariant`,
        status: 'pass',
        detail: 'Territories source present'
      });
    }

    if (!row?.bordersExists) {
      invariants.push({
        key: `lod${lodResult.lod}:borderFillParity`,
        status: 'fail',
        detail: 'Borders source missing; cannot guarantee border/fill parity'
      });
    } else {
      invariants.push({
        key: `lod${lodResult.lod}:borderFillParity`,
        status: 'pass',
        detail: 'Borders source present'
      });
    }
  }

  return invariants;
}

function evaluateGoldenOffenders(lodResults: QAResult[]): {
  status: 'pass' | 'warn' | 'fail';
  details: Array<{ lod: LOD; missing: string[]; failedQaCodes: string[]; severeRatioCodes: string[] }>;
} {
  const details = lodResults.map((lodResult) => {
    const countryCodes = new Set(
      lodResult.partsIndex
        .map((part) => part.countryCode)
        .filter((code): code is string => typeof code === 'string' && code.length > 0)
    );

    const missing = GOLDEN_OFFENDER_CODES.filter((code) => !countryCodes.has(code));
    const missingMicrostates = MICROSTATE_REQUIRED_CODES.filter((code) => !countryCodes.has(code));

    const failedQaCodes = new Set<string>();
    const severeRatioCodes = new Set<string>();
    for (const part of lodResult.partsIndex) {
      const code = part.countryCode;
      if (!code) continue;
      if (!GOLDEN_OFFENDER_CODES.includes(code) && !MICROSTATE_REQUIRED_CODES.includes(code)) continue;
      const status = part.qa?.status ?? 'fail';
      const ratio = part.qa?.maxEdgeToMedianEdgeRatio ?? 0;
      if (status === 'fail') failedQaCodes.add(code);
      if (ratio > failRatioThreshold(part)) severeRatioCodes.add(code);
    }

    return {
      lod: lodResult.lod,
      missing: [...missing, ...missingMicrostates],
      failedQaCodes: Array.from(failedQaCodes),
      severeRatioCodes: Array.from(severeRatioCodes)
    };
  });

  const hasFailure = details.some((d) => d.missing.length > 0 || d.failedQaCodes.length > 0 || d.severeRatioCodes.length > 0);
  const hasWarn = details.some((d) => d.missing.length > 0);

  return {
    status: hasFailure ? 'fail' : hasWarn ? 'warn' : 'pass',
    details
  };
}

function buildFailureModeMatrix(
  lodResults: QAResult[],
  invariants: InvariantResult[],
  golden: { status: 'pass' | 'warn' | 'fail'; details: Array<{ lod: LOD; missing: string[]; failedQaCodes: string[]; severeRatioCodes: string[] }> }
): FailureMatrixRow[] {
  const totalReasons = lodResults.reduce((sum, lod) => sum + lod.reasons.length, 0);
  const ratioStats = lodResults
    .flatMap((lod) => lod.partsIndex.map((part) => ({
      ratio: part.qa?.maxEdgeToMedianEdgeRatio ?? 0,
      failThreshold: failRatioThreshold(part),
      warnThreshold: warnRatioThreshold(part)
    })));
  const hasRatioFail = ratioStats.some((entry) => entry.ratio > entry.failThreshold);
  const hasRatioWarn = ratioStats.some((entry) => entry.ratio > entry.warnThreshold);
  const maxWarnRatio = ratioStats.reduce((max, current) => Math.max(max, current.ratio), 0);
  const minArea = lodResults
    .flatMap((lod) => lod.partsIndex.map((part) => part.qa?.minTriangleArea ?? Number.POSITIVE_INFINITY))
    .reduce((min, current) => Math.min(min, current), Number.POSITIVE_INFINITY);

  const invariantFail = (keyPart: string) => invariants.some((inv) => inv.key.includes(keyPart) && inv.status === 'fail');

  return [
    {
      failureMode: 'Neighbor crack/gap',
      detector: 'Topology shared-edge invariant',
      status: invariantFail('neighborInvariant') ? 'fail' : 'pass',
      blocking: true,
      detail: invariantFail('neighborInvariant') ? 'Shared-edge check failed for one or more LODs' : 'Shared-edge checks passed'
    },
    {
      failureMode: 'Cross-country overlap (non-disputed)',
      detector: 'Proxy: blocking QA failures in polygon parts',
      status: totalReasons > 0 ? 'warn' : 'pass',
      blocking: false,
      detail: totalReasons > 0 ? `${totalReasons} blocking QA reasons detected (proxy only)` : 'No blocking QA reasons'
    },
    {
      failureMode: 'Dateline bridge artifact',
      detector: 'Max edge ratio across parts',
      status: hasRatioFail ? 'fail' : hasRatioWarn ? 'warn' : 'pass',
      blocking: true,
      detail: `maxEdgeToMedianEdgeRatio=${maxWarnRatio.toFixed(4)}`
    },
    {
      failureMode: 'Polar fan degeneration',
      detector: 'Minimum triangle area threshold',
      status: minArea < 1e-7 ? 'fail' : minArea < 1e-6 ? 'warn' : 'pass',
      blocking: true,
      detail: `minTriangleArea=${Number.isFinite(minArea) ? minArea.toFixed(8) : 'n/a'}`
    },
    {
      failureMode: 'Microstate disappearance',
      detector: 'Golden offender microstate presence',
      status: golden.details.some((d) => d.missing.some((code) => MICROSTATE_REQUIRED_CODES.includes(code))) ? 'fail' : 'pass',
      blocking: true,
      detail: 'Required microstate codes verified per LOD'
    },
    {
      failureMode: 'Hole inversion/fill leak',
      detector: 'Proxy: mandatory QA status',
      status: totalReasons > 0 ? 'warn' : 'pass',
      blocking: false,
      detail: 'Advanced ring leak detector pending; proxy used'
    },
    {
      failureMode: 'LOD pop drift',
      detector: 'Total triangle monotonic growth by LOD',
      status: (() => {
        const byLod = [...lodResults].sort((a, b) => a.lod - b.lod);
        for (let i = 1; i < byLod.length; i++) {
          const prev = byLod[i - 1].partsIndex.reduce((sum, part) => sum + (part.qa?.status === 'fail' ? 0 : 1), 0);
          const curr = byLod[i].partsIndex.reduce((sum, part) => sum + (part.qa?.status === 'fail' ? 0 : 1), 0);
          if (curr < prev) return 'warn';
        }
        return 'pass';
      })(),
      blocking: false,
      detail: 'Monotonic LOD complexity proxy applied'
    },
    {
      failureMode: 'Index overflow',
      detector: 'Index format vs vertex count',
      status: lodResults.some((lod) => lod.partsIndex.some((part) => part.indexFormat === 'uint16' && (part.vertexCount ?? 0) > 65535))
        ? 'fail'
        : 'pass',
      blocking: true,
      detail: 'Index format bounds validated'
    },
    {
      failureMode: 'Large-complex-part triangulation integrity',
      detector: 'Euler-formula triangle completeness + outward-winding check (constrained-Delaunay parts only)',
      status: lodResults.some((lod) => lod.largeComplexPartIssues.length > 0) ? 'warn' : 'pass',
      blocking: false,
      detail: lodResults.some((lod) => lod.largeComplexPartIssues.length > 0)
        ? lodResults.flatMap((lod) => lod.largeComplexPartIssues).slice(0, 5).join('; ')
        : 'No issues in large-complex (constrained-Delaunay) parts'
    },
    {
      failureMode: 'Border/fill mismatch',
      detector: 'Source coverage parity checks',
      status: invariantFail('borderFillParity') ? 'fail' : 'pass',
      blocking: true,
      detail: invariantFail('borderFillParity') ? 'Missing borders source for one or more LODs' : 'Borders source present for requested LODs'
    },
    {
      failureMode: 'Decode stutter on low-tier profile',
      detector: 'Performance benchmark gate',
      status: 'warn',
      blocking: false,
      detail: 'Pending dedicated runtime benchmark stage'
    }
  ];
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = path.join(args.generatedDir, 'manifest.json');
  const sourceValidationPath = path.join(args.generatedDir, 'source-validation.json');
  const topologyReportPath = path.join(args.generatedDir, 'topology', 'territories-topology-report.json');

  if (!fs.existsSync(manifestPath)) {
    console.error(`[geo:qa] Missing manifest: ${manifestPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(sourceValidationPath)) {
    console.error(`[geo:qa] Missing source validation report: ${sourceValidationPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(topologyReportPath)) {
    console.error(`[geo:qa] Missing topology report: ${topologyReportPath}`);
    process.exit(1);
  }

  const sourceValidation = readJson<SourceValidationReport>(sourceValidationPath);
  if (sourceValidation.status === 'fail') {
    console.error(`[geo:qa] Source validation failed: ${sourceValidationPath}`);
    process.exit(1);
  }

  const topologyReport = readJson<TopologyReport>(topologyReportPath);
  if (!topologyReport.topologyGraphHash) {
    console.error(`[geo:qa] Topology report missing topologyGraphHash: ${topologyReportPath}`);
    process.exit(1);
  }

  const manifest = readJson<Record<string, unknown>>(manifestPath);
  const expectedContract = {
    manifestVersion: typeof manifest.version === 'string' ? manifest.version : undefined,
    packageId: typeof manifest.packageId === 'string' ? manifest.packageId : undefined,
    topologyGraphHash: topologyReport.topologyGraphHash ?? null
  };

  const results = args.lods.map(lod => validateLod(lod, args.generatedDir, expectedContract));
  const budgetGates = evaluateBudgetGates(results);
  const failed = results.filter(r => !r.ok);
  const warningCount = results.reduce((sum, r) => sum + r.warnings.length, 0);
  const invariants = evaluateInvariants(results, sourceValidation, topologyReport);
  const invariantFailures = invariants.filter((inv) => inv.status === 'fail');
  const goldenOffenders = evaluateGoldenOffenders(results);
  const failureMatrix = buildFailureModeMatrix(results, invariants, goldenOffenders);
  const matrixBlockingFailures = failureMatrix.filter((row) => row.blocking && row.status === 'fail');

  const reportsDir = path.join(args.generatedDir, 'qa-reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const failureMatrixPath = path.join(reportsDir, 'failure-mode-matrix.json');
  const goldenOffendersPath = path.join(reportsDir, 'golden-offenders.json');
  const budgetReportPath = path.join(reportsDir, 'budget-report.json');
  writeJson(failureMatrixPath, {
    generatedAt: new Date().toISOString(),
    rows: failureMatrix,
    summary: {
      blockingFailures: matrixBlockingFailures.length,
      totalRows: failureMatrix.length
    }
  });
  writeJson(goldenOffendersPath, {
    generatedAt: new Date().toISOString(),
    ...goldenOffenders
  });
  writeJson(budgetReportPath, {
    generatedAt: new Date().toISOString(),
    status: budgetGates.status,
    rows: budgetGates.rows
  });

  for (const r of results) {
    if (r.ok) {
      console.log(`[geo:qa] LOD${r.lod}: PASS`);
    } else {
      console.error(`[geo:qa] LOD${r.lod}: FAIL`);
      r.reasons.forEach(reason => console.error(`  - ${reason}`));
    }
    if (r.warnings.length) {
      r.warnings.slice(0, 20).forEach(warn => console.warn(`  - ${warn}`));
      if (r.warnings.length > 20) {
        console.warn(`  - ... ${r.warnings.length - 20} more warnings`);
      }
    }
    r.largeComplexPartIssues.forEach(issue => console.warn(`  - [largeComplexPart] ${issue}`));
  }

  if (invariants.length) {
    console.log('[geo:qa] Global topology invariants:');
    invariants.forEach((inv) => {
      const prefix = inv.status === 'fail' ? 'FAIL' : inv.status === 'warn' ? 'WARN' : 'PASS';
      const writer = inv.status === 'fail' ? console.error : inv.status === 'warn' ? console.warn : console.log;
      writer(`  - [${prefix}] ${inv.key} :: ${inv.detail}`);
    });
  }

  if (matrixBlockingFailures.length) {
    console.error(`[geo:qa] Failure-mode matrix blocking failures: ${matrixBlockingFailures.length}`);
  }
  if (goldenOffenders.status === 'fail') {
    console.error('[geo:qa] Golden offender regression failed');
  }
  if (budgetGates.status === 'fail') {
    console.error('[geo:qa] Performance budget gates failed');
    budgetGates.rows
      .filter((row) => row.status === 'fail')
      .forEach((row) => {
        row.failures.forEach((failure) => console.error(`  - LOD${row.lod}: ${failure}`));
      });
  }

  try {
    const nextManifest = readJson<Record<string, unknown>>(manifestPath);
    const qaSummary = {
      status: failed.length > 0 || invariantFailures.length > 0 || matrixBlockingFailures.length > 0 || goldenOffenders.status === 'fail'
        || budgetGates.status === 'fail'
        ? 'fail'
        : warningCount > 0 || invariants.some((inv) => inv.status === 'warn') || goldenOffenders.status === 'warn'
          ? 'warn'
          : 'pass',
      failedParts: failed.reduce((sum, r) => sum + r.reasons.length, 0),
      warnParts: warningCount,
      failedInvariants: invariantFailures.length,
      failureModeBlockingFailures: matrixBlockingFailures.length,
      goldenOffenderStatus: goldenOffenders.status,
      budgetStatus: budgetGates.status,
      reports: {
        failureModeMatrix: failureMatrixPath,
        goldenOffenders: goldenOffendersPath,
        budget: budgetReportPath
      }
    };
    writeJson(manifestPath, {
      ...nextManifest,
      qaSummary,
      invariantsSummary: invariants,
      qaGeneratedAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn('[geo:qa] unable to update manifest QA summary', err);
  }

  if (failed.length > 0 || invariantFailures.length > 0 || matrixBlockingFailures.length > 0 || goldenOffenders.status === 'fail' || budgetGates.status === 'fail') {
    process.exit(1);
  }

  console.log('[geo:qa] All requested LOD checks passed.');
}

main();

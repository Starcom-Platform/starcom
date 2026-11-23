/**
 * The Basis transcoder the app serves compiles no code from strings, as the content
 * security policy requires, and decodes the 8K maps exactly as three.js's own does
 * (decision K7; scripts/lib/basisTranscoderPatch.mjs says why it is patched). And the
 * 8K maps are what the globe's materials expect of them.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { read, KHR_DF_PRIMARIES_BT709, KHR_DF_TRANSFER_SRGB, KHR_SUPERCOMPRESSION_BASISLZ } from 'three/examples/jsm/libs/ktx-parse.module.js';
import {
  PATCHED_TRANSCODER,
  REPLACEMENTS,
  STRING_COMPILATION,
  THREE_TRANSCODER,
  patchBasisTranscoder,
} from '../lib/basisTranscoderPatch.mjs';

const THREE_WASM = 'node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm';
const MAPS = ['earth-day-8k', 'earth-night-8k', 'earth-blue-marble-8k'].map((name) => `public/assets/textures/earth/8k/${name}.ktx2`);
const threeVersion = JSON.parse(fs.readFileSync('node_modules/three/package.json', 'utf8')).version as string;
const threeSource = fs.readFileSync(THREE_TRANSCODER, 'utf8');

type Decoded = { mip: number; width: number; height: number; format: string; rowMeans?: number[] };
type Checked = { ok: boolean; error?: string; files?: Array<{ file: string; kind: string; width: number; height: number; levels: number; decoded: Decoded[] }> };

/** Decodes the maps with `transcoder`, in a Node that refuses code from strings unless `strings` is set. */
function decode(transcoder: string, strings: 'refused' | 'allowed'): Checked {
  const flags = strings === 'refused' ? ['--disallow-code-generation-from-strings'] : [];
  try {
    return JSON.parse(execFileSync(process.execPath, [...flags, 'scripts/check-basis-transcoder.mjs', transcoder, THREE_WASM, ...MAPS], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }));
  } catch (error) {
    return JSON.parse((error as { stdout: string }).stdout);
  }
}

let served: Checked | undefined;
/** The maps as the app's transcoder decodes them under the policy, decoded once for every test that reads them. */
const decodedAsServed = () => (served ??= decode(PATCHED_TRANSCODER, 'refused'));

describe("the app's Basis transcoder", () => {
  it('is the patch of the installed three.js transcoder (run node scripts/patch-basis-transcoder.mjs after an upgrade)', () => {
    expect(fs.readFileSync(PATCHED_TRANSCODER, 'utf8')).toBe(patchBasisTranscoder(threeSource, threeVersion));
  });

  it('holds nothing that compiles code from a string', () => {
    const source = fs.readFileSync(PATCHED_TRANSCODER, 'utf8');
    expect(STRING_COMPILATION.filter((text) => source.includes(text))).toEqual([]);
    // Without the patch it would not: the check above is looking for what is there.
    expect(threeSource).toContain('newFunc(Function');
  });

  it("decodes every 8K map with code from strings refused, where three.js's own fails at once", () => {
    const own = decode(THREE_TRANSCODER, 'refused');
    expect(own.ok).toBe(false);
    expect(own.error).toMatch(/EvalError: Code generation from strings disallowed/);

    const patched = decodedAsServed();
    expect(patched.error).toBeUndefined();
    expect(patched.files?.map((f) => f.decoded.length)).toEqual([12, 12, 12]);
    // Byte for byte what three.js's own decodes where it is allowed to run.
    expect(patched).toEqual(decode(THREE_TRANSCODER, 'allowed'));
  });

  it('is made only from the code it was written against', () => {
    for (const { name, start } of REPLACEMENTS) {
      const at = threeSource.indexOf(start) + start.length;
      const changed = threeSource.slice(0, at) + ' ' + threeSource.slice(at);
      expect(() => patchBasisTranscoder(changed, threeVersion), name).toThrow(`${name} is not the code this patch was written against`);
    }
    expect(() => patchBasisTranscoder(threeSource.replace(REPLACEMENTS[0].start, 'function craftOther('), threeVersion))
      .toThrow('craftInvokerFunction: the transcoder should hold');
    // Nor does it hand over a copy that would still compile code from a string somewhere else.
    expect(() => patchBasisTranscoder(`${threeSource}\nnewFunc(Function,[]);`, threeVersion))
      .toThrow('The patched transcoder still compiles code from strings: newFunc(Function.');
  });
});

describe('the 8K maps the app ships', () => {
  it('are 8192×4096 Basis ETC1S with every mip level, sRGB with BT.709 primaries, so three.js reads their colours as it reads the 2K maps', () => {
    for (const file of MAPS) {
      const container = read(new Uint8Array(fs.readFileSync(file)));
      const dfd = container.dataFormatDescriptor[0];
      expect({
        width: container.pixelWidth,
        height: container.pixelHeight,
        levels: container.levels.length,
        supercompression: container.supercompressionScheme,
        primaries: dfd.colorPrimaries,
        transfer: dfd.transferFunction,
      }, file).toEqual({
        width: 8192,
        height: 4096,
        levels: 14,
        supercompression: KHR_SUPERCOMPRESSION_BASISLZ,
        primaries: KHR_DF_PRIMARIES_BT709,
        transfer: KHR_DF_TRANSFER_SRGB,
      });
    }
    expect(decodedAsServed().files?.map((f) => f.kind)).toEqual(['etc1s', 'etc1s', 'etc1s']);
  });

  it('store their rows bottom first, as a compressed texture, which cannot be flipped as it is uploaded, needs', () => {
    // At 32×16, rows 2–7 are 67.5° S to the equator and rows 8–13 the equator to 67.5° N when the
    // south comes first. The northern band holds more land and more city lights in every map
    // (measured: 1.39× in the night lights, 1.31× in the day map, 2.85× in the Blue Marble).
    // Stored top first, it would be the other way round.
    for (const file of decodedAsServed().files ?? []) {
      const rows = file.decoded.find((d) => d.format === 'rgba32' && d.height === 16)?.rowMeans ?? [];
      const mean = (from: number, to: number) => rows.slice(from, to).reduce((sum, v) => sum + v, 0) / (to - from);
      expect(mean(8, 14) / mean(2, 8), file.file).toBeGreaterThan(1.15);
    }
  });
});

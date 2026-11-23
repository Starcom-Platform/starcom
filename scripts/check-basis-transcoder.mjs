#!/usr/bin/env node
/**
 * Decodes KTX2 files with a Basis transcoder the way three.js's KTX2Loader worker
 * does, and prints what came out: the smallest mip levels, transcoded to BC7 and to
 * plain RGBA, each as a hash. Run it with code generation from strings switched off
 * to see whether a transcoder works under the app's content security policy:
 *
 *   node --disallow-code-generation-from-strings scripts/check-basis-transcoder.mjs \
 *     <basis_transcoder.js> <basis_transcoder.wasm> <file.ktx2>...
 *
 * Prints one line of JSON, {"ok":true,"files":[...]} or {"ok":false,"error":"..."},
 * and exits 0 or 1. The transcoder is run as a script, as in the worker, not
 * through eval, which the switch would refuse.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

/** basis_transcoder's transcoder_texture_format values. */
const FORMATS = { bc7: 6, rgba32: 13 };
/** How many of the smallest mip levels are decoded: enough to run every call, small enough to be quick. */
const LEVELS = 6;
const TIMEOUT_MS = 20_000;

const [transcoderPath, wasmPath, ...ktx2Paths] = process.argv.slice(2);

function finish(result) {
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}
const fail = (error) => finish({ ok: false, error: String(error?.stack ?? error) });
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);
// A transcoder that fails while starting leaves its ready promise unsettled, and the worker waiting for ever.
setTimeout(() => fail(new Error(`the transcoder did not start or finish within ${TIMEOUT_MS} ms`)), TIMEOUT_MS).unref();

if (!transcoderPath || !wasmPath || !ktx2Paths.length) fail(new Error('usage: <basis_transcoder.js> <basis_transcoder.wasm> <file.ktx2>...'));

// The Emscripten glue reads its environment from these when it finds itself in Node.
globalThis.require = createRequire(import.meta.url);
globalThis.__dirname = path.dirname(path.resolve(transcoderPath));
const BASIS = vm.runInThisContext(`${fs.readFileSync(transcoderPath, 'utf8')}\n;BASIS;`, { filename: transcoderPath });

const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);

function rowMeans(rgba, width, height) {
  return Array.from({ length: height }, (_, row) => {
    let sum = 0;
    for (let x = 0; x < width; x++) {
      const i = (row * width + x) * 4;
      sum += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
    }
    return Math.round((sum / width) * 10) / 10;
  });
}

const Module = await BASIS({ wasmBinary: fs.readFileSync(wasmPath) });
Module.initializeBasis();

const files = ktx2Paths.map((file) => {
  const ktx2 = new Module.KTX2File(new Uint8Array(fs.readFileSync(file)));
  try {
    if (!ktx2.isValid()) throw new Error(`${file}: not a valid KTX2 file`);
    const kind = ktx2.isUASTC() ? 'uastc' : ktx2.isETC1S() ? 'etc1s' : ktx2.isHDR() ? 'hdr' : 'unknown';
    const levels = ktx2.getLevels();
    const described = {
      file: path.basename(file),
      kind,
      width: ktx2.getWidth(),
      height: ktx2.getHeight(),
      layers: ktx2.getLayers() || 1,
      levels,
      faces: ktx2.getFaces(),
      hasAlpha: ktx2.getHasAlpha(),
      dfdFlags: ktx2.getDFDFlags(),
      decoded: [],
    };
    if (!ktx2.startTranscoding()) throw new Error(`${file}: startTranscoding failed`);
    for (let mip = Math.max(0, levels - LEVELS); mip < levels; mip++) {
      const info = ktx2.getImageLevelInfo(mip, 0, 0);
      for (const [format, code] of Object.entries(FORMATS)) {
        const dst = new Uint8Array(ktx2.getImageTranscodedSizeInBytes(mip, 0, 0, code));
        if (!ktx2.transcodeImage(dst, mip, 0, 0, code, 0, -1, -1)) throw new Error(`${file}: transcodeImage failed at mip ${mip}, ${format}`);
        const decoded = { mip, width: info.origWidth, height: info.origHeight, format, bytes: dst.length, sha256: hash(dst) };
        // Each row's mean brightness, 0 to 255, in the order the file stores the rows.
        if (format === 'rgba32') decoded.rowMeans = rowMeans(dst, info.origWidth, info.origHeight);
        described.decoded.push(decoded);
      }
    }
    return described;
  } finally {
    ktx2.close();
    ktx2.delete();
  }
});

finish({ ok: true, files });

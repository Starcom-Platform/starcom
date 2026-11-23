/**
 * Keep the exact bytes a claim was derived from.
 *
 * WHY THIS EXISTS. Every enumeration we publish carries a boundary sentence
 * naming a snapshot date, and a digest committing to the member set. That is
 * what makes a count checkable: someone holding the same snapshot recomputes
 * the digest and compares. It only works if they can GET the snapshot.
 *
 * Companies House publishes dated monthly files, so anyone can. Brønnøysund-
 * registrene serves one file at one undated URL, regenerated nightly — so a
 * claim published from it is, by tomorrow, one that nobody can verify,
 * ourselves included. Archiving the bytes is what closes that gap, and it is
 * more in the spirit of the project than the analysis is.
 *
 * THE HAZARD, AND WHY THE API IS SHAPED THIS WAY. A cache is more dangerous
 * here than in most systems: completeness and snapshot age are the entire
 * basis of an enumeration's weight, so a stale file reused as a current one
 * publishes a confidently wrong number. Twice today a partial source looked
 * exactly like a complete one. So reading from the archive requires naming a
 * SNAPSHOT DATE explicitly — there is no "just use the cache" path, and no
 * call that means "give me the latest you have".
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { PassThrough } from 'node:stream';

/** Where snapshots live. Explicit, or STARCOM_ARCHIVE, or nowhere. */
export function archiveDir(explicit = '') {
  const dir = explicit || process.env.STARCOM_ARCHIVE || '';
  return dir ? path.resolve(dir) : '';
}

const manifestPath = (dir, dataset, snapshot) => path.join(dir, dataset, `${snapshot}.manifest.json`);
const blobPath = (dir, dataset, snapshot, ext) => path.join(dir, dataset, `${snapshot}${ext}`);

/**
 * Tee a stream into the archive while the caller consumes it.
 *
 * Returns the stream to consume plus a promise resolving to the manifest, so
 * the caller parses the register and archives the bytes in ONE pass — reading
 * it twice would mean either holding it in memory or writing it to disk first,
 * and writing it to disk first is what filled a machine.
 */
export function teeToArchive(source, { dir, dataset, snapshot, ext = '.gz', url = '' }) {
  if (!dir) return { stream: source, written: Promise.resolve(null) };

  fs.mkdirSync(path.join(dir, dataset), { recursive: true });
  const target = blobPath(dir, dataset, snapshot, ext);
  const tmp = `${target}.partial`;

  const hash = crypto.createHash('sha256');
  let bytes = 0;
  const toArchive = new PassThrough();
  const toCaller = new PassThrough();

  source.on('data', (c) => { toArchive.write(c); toCaller.write(c); });
  source.on('end', () => { toArchive.end(); toCaller.end(); });
  source.on('error', (e) => { toArchive.destroy(e); toCaller.destroy(e); });

  toArchive.on('data', (c) => { hash.update(c); bytes += c.length; });

  const written = pipeline(toArchive, fs.createWriteStream(tmp)).then(() => {
    // Renamed only after the stream completes, so a partial download is never
    // mistaken for an archived snapshot. Same reason the fetchers refuse a
    // truncated archive rather than parsing what arrived.
    fs.renameSync(tmp, target);
    const manifest = {
      dataset, snapshot, url,
      file: path.basename(target),
      bytes,
      sha256: hash.digest('hex'),
      archivedAt: new Date().toISOString(),
    };
    fs.writeFileSync(manifestPath(dir, dataset, snapshot), JSON.stringify(manifest, null, 2) + '\n');
    return manifest;
  }).catch((err) => {
    try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
    throw err;
  });

  return { stream: toCaller, written };
}

/**
 * Open an archived snapshot BY DATE, verifying it first.
 *
 * There is deliberately no "latest" lookup. A caller must know which snapshot
 * it wants, so a cached file can never be silently substituted for a current
 * one — which is the failure this whole design is built to refuse.
 */
export function openArchived(dir, dataset, snapshot, ext = '.gz') {
  if (!dir) return null;
  const file = blobPath(dir, dataset, snapshot, ext);
  const mf = manifestPath(dir, dataset, snapshot);
  if (!fs.existsSync(file) || !fs.existsSync(mf)) return null;

  const manifest = JSON.parse(fs.readFileSync(mf, 'utf8'));
  // Size first: it is free, and a truncated file is the common case.
  const size = fs.statSync(file).size;
  if (manifest.bytes !== undefined && size !== manifest.bytes) {
    throw new Error(`Archived ${dataset} ${snapshot} is ${size} bytes, manifest says ${manifest.bytes} — refusing to use it.`);
  }
  return { path: file, manifest, verify: async () => {
    const { sha256 } = await digestFile(file);
    if (sha256 !== manifest.sha256) {
      throw new Error(`Archived ${dataset} ${snapshot} does not match its manifest digest — refusing to use it.`);
    }
    return true;
  } };
}

/**
 * Digest a file without holding it in memory.
 *
 * The verification path used readFileSync, which is a 500MB Buffer for the
 * GLEIF golden copy. Streaming costs nothing and removes a size ceiling that
 * would have been discovered the hard way.
 */
export async function digestFile(file) {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  await pipeline(fs.createReadStream(file), async function* (source) {
    for await (const chunk of source) { hash.update(chunk); bytes += chunk.length; yield chunk; }
  }, async function (source) { for await (const _ of source) { /* drain */ } });
  return { sha256: hash.digest('hex'), bytes };
}

/**
 * Adopt a file that was put in the archive by other means.
 *
 * Snapshots fetched before this helper existed, or pulled with curl during an
 * investigation, sit in the archive with no manifest — so nothing can verify
 * them and `openArchived` refuses to read them. Adopting one computes its
 * digest and writes the manifest it should have had.
 *
 * It does NOT invent provenance: the caller states the url and the snapshot
 * date, because the file itself cannot say where it came from.
 */
export async function adoptIntoArchive(dir, dataset, snapshot, { ext = '.gz', url = '' } = {}) {
  if (!dir) throw new Error('no archive directory configured');
  const target = blobPath(dir, dataset, snapshot, ext);
  if (!fs.existsSync(target)) throw new Error(`no archived file at ${target}`);

  const { sha256, bytes } = await digestFile(target);
  const manifest = {
    dataset, snapshot, url,
    file: path.basename(target),
    bytes,
    sha256,
    archivedAt: new Date().toISOString(),
    adopted: true,
  };
  fs.writeFileSync(manifestPath(dir, dataset, snapshot), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

export function listArchived(dir, dataset) {
  if (!dir) return [];
  const d = path.join(dir, dataset);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.manifest.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')))
    .sort((a, b) => a.snapshot.localeCompare(b.snapshot));
}

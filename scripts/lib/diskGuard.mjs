/**
 * Refuse to start work that will not fit.
 *
 * Written after a registry ingest filled a machine's disk. Every fetcher here
 * pulls hundreds of megabytes and, before this, decompressed them onto disk
 * first — so a run that could not finish still consumed the space it needed to
 * get partway, and a failure path that exits early leaves it there.
 *
 * The cheap fix is not to write the intermediates at all (see the fetchers'
 * streaming), and the honest fix is to say up front what a run will cost and
 * stop if the machine cannot afford it. Filling someone's disk is a real cost
 * imposed on them by a tool they were only running.
 */
import fs from 'node:fs';

export function freeBytes(dir = process.cwd()) {
  // fs.statfs landed in Node 18.15; older runtimes get a null answer rather
  // than a guess, and callers proceed with a warning instead of a false one.
  if (typeof fs.statfsSync !== 'function') return null;
  try {
    const s = fs.statfsSync(dir);
    return s.bavail * s.bsize;
  } catch { return null; }
}

const mb = (n) => `${Math.round(n / 1048576)}MB`;

/**
 * Stop unless `needBytes` is available, with a headroom margin.
 *
 * Exits 3 — distinct from an upstream failure (1) or bad usage (2), because
 * "your disk is full" is neither and the remedy is different.
 */
export function requireFreeSpace(needBytes, what, dir = process.cwd()) {
  const free = freeBytes(dir);
  if (free === null) {
    console.warn(`Cannot determine free space on this runtime; ${what} needs about ${mb(needBytes)}.`);
    return;
  }
  const margin = 256 * 1048576;
  if (free < needBytes + margin) {
    console.error(`Not enough disk: ${what} needs about ${mb(needBytes)} plus ${mb(margin)} headroom, and ${mb(free)} is free.`);
    console.error('Refusing to start rather than filling the disk partway through.');
    process.exit(3);
  }
  console.log(`Disk: ${mb(free)} free, ${what} needs about ${mb(needBytes)}.`);
}

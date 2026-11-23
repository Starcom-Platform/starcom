/**
 * The Finder's place control as baked (decision D-PW, PW61, PW70): fetched once a page load, only once the control is
 * open; null until it arrives or where it could not be read.
 */
import { useEffect, useState } from 'react';
import { FINDER_PLATES_URL, type FinderPlatesFile } from '../../services/psiWatch/finder';

let kept: Promise<FinderPlatesFile | null> | null = null;

function load(): Promise<FinderPlatesFile | null> {
  kept ??= fetch(FINDER_PLATES_URL)
    .then((res) => (res.ok ? res.json() as Promise<FinderPlatesFile> : null))
    .then((file) => (file && Array.isArray(file.zones) ? file : null))
    .catch(() => null);
  // A file that could not be read is tried again next time.
  void kept.then((file) => { if (!file) kept = null; });
  return kept;
}

export function useFinderPlates(enabled: boolean): FinderPlatesFile | null {
  const [file, setFile] = useState<FinderPlatesFile | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    void load().then((f) => { if (live) setFile(f); });
    return () => { live = false; };
  }, [enabled]);
  return file;
}

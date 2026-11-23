/**
 * The kit's RLSH fixtures (decision D-RR, RR3): an invented night, its window at each state, its Case, its package
 * open and ended, and its totals. Shown only in a tab opened with `?rlsh=kit` (kept for the tab, `?rlsh=off` forgets
 * it), as Psi Watch's samples are (PW48); never accepted from a relay. Read from the build's own files, only once asked,
 * so nothing of them is in the first download.
 */
import type { RlshNote } from './recurrence';

const SAMPLES_KEY = 'starcom:rlsh-kit-samples';

export function rlshKitSamplesOn(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const asked = new URLSearchParams(window.location.search).get('rlsh');
    if (asked === 'kit') window.sessionStorage.setItem(SAMPLES_KEY, '1');
    else if (asked === 'off') window.sessionStorage.removeItem(SAMPLES_KEY);
    return window.sessionStorage.getItem(SAMPLES_KEY) === '1';
  } catch {
    return false;
  }
}

export interface RlshFixture {
  file: string;
  event: RlshNote;
  fixture_note?: string;
  provenance?: { real?: string; invented?: string };
}

const FILES = import.meta.glob<Omit<RlshFixture, 'file'>>('../../psiWatch/kit-v0/fixtures/rlsh/*.json', { import: 'default' });

let loaded: Promise<RlshFixture[]> | null = null;

/** Every RLSH fixture, by its file's name; empty unless the tab asked for the samples. */
export function loadRlshKit(options: { samples?: boolean } = {}): Promise<RlshFixture[]> {
  if (!(options.samples ?? rlshKitSamplesOn())) return Promise.resolve([]);
  loaded ??= Promise.all(Object.entries(FILES).map(async ([path, load]) => ({ file: path.split('/').pop() ?? path, ...(await load()) })));
  return loaded;
}

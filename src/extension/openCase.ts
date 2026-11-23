/**
 * The case open in Uplink's side panel (decision D-EX, E2, EX16): what the person sends goes to it.
 * The side panel is a Starcom page sharing this browser's storage with every Starcom tab, so whichever
 * page takes a capture files it to the same case. No case open: the capture waits to be filed.
 *
 * Open only while the panel is: the panel opens the case it had last time, and lets it go when it
 * closes, so captures never keep going to a case the person can no longer see.
 */
export const OPEN_CASE_KEY = 'starcom-uplink-open-case';
/** The case the panel had last, opened again with it. */
export const LAST_PANEL_CASE_KEY = 'starcom-uplink-panel-case';

const read = (key: string) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* blocked storage: captures wait to be filed */ }
};

export function openCaseForCaptures(): string | null {
  return read(OPEN_CASE_KEY);
}

/** The panel's choice: this case, or none. */
export function chooseOpenCase(caseId: string | null): void {
  write(OPEN_CASE_KEY, caseId);
  write(LAST_PANEL_CASE_KEY, caseId);
}

/** The case the panel had last, if it still exists. */
export function lastPanelCase(exists: (id: string) => boolean): string | null {
  const last = read(LAST_PANEL_CASE_KEY);
  return last && exists(last) ? last : null;
}

/** The panel closing: its case is open no more, unless another panel has opened one since. */
export function releaseOpenCase(caseId: string | null): void {
  if (caseId !== null && read(OPEN_CASE_KEY) === caseId) write(OPEN_CASE_KEY, null);
}

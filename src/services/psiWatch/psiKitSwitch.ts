/**
 * Psi Watch's switch (decision D-PW, PW12 and PW19): the whole mode, and Mecha Jono's build-kit fixtures with it.
 * Opened to everyone by the owner on 1 November, ahead of the key change (critique-2026-11-01.md, OR6): it shows
 * unless `?psi=off` hid it in this tab; `?psi=kit` shows it again. Kept for the tab, so moving about the app keeps
 * the choice, and a new tab starts with Psi Watch shown.
 */
const KEY = 'starcom:psi-off';
const SAMPLES_KEY = 'starcom:psi-kit-samples';

export function psiKitOn(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const asked = new URLSearchParams(window.location.search).get('psi');
    if (asked === 'off') window.sessionStorage.setItem(KEY, '1');
    else if (asked === 'kit') window.sessionStorage.removeItem(KEY);
    return window.sessionStorage.getItem(KEY) !== '1';
  } catch {
    return true;
  }
}

/**
 * Whether the kit's invented sample notes are drawn (PW48, the switch alone keeping them apart): only in a tab opened
 * with `?psi=kit`, kept for the tab; `?psi=off` forgets it. Opening Psi Watch to everyone (OR6) had put them in front of
 * every visitor; Mecha Jono asked for them back behind the switch (2 Nov) until their live notes replace the kit.
 */
export function psiKitSamplesOn(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const asked = new URLSearchParams(window.location.search).get('psi');
    if (asked === 'kit') window.sessionStorage.setItem(SAMPLES_KEY, '1');
    else if (asked === 'off') window.sessionStorage.removeItem(SAMPLES_KEY);
    return window.sessionStorage.getItem(SAMPLES_KEY) === '1';
  } catch {
    return false;
  }
}

/** Settings opens from anywhere: the header's gear and the phone's More sheet ask, MainSettingsRoot opens it. */
export const MAIN_SETTINGS_EVENT = 'starcom:open-settings';

export function openMainSettings(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(MAIN_SETTINGS_EVENT));
}

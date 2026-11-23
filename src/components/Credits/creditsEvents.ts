/** Credits open from anywhere: Settings asks, and so does the address /credits (decision TX11). */
export const CREDITS_EVENT = 'starcom:open-credits';

/** The address that opens the credits over the app, the globe kept beneath them. */
export const CREDITS_PATH = '/credits';

export function openCredits(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CREDITS_EVENT));
}

/**
 * Asks SupportFunnelRoot to open the support modal.
 *
 * The entry point lives in the bottom navigation bar, while the funnel is
 * mounted once at the app root, so the two talk through a window event.
 */
export const SUPPORT_FUNNEL_OPEN_EVENT = 'starcom:open-support-funnel';

export function openSupportFunnel(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SUPPORT_FUNNEL_OPEN_EVENT));
}

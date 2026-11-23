/**
 * Asks SecureChatManager to open the contact list.
 *
 * The chat's button is in the header (decision D-F, step 3.2), while the manager
 * that owns the contact list and the chat windows is mounted near the app root, so
 * the two talk through a window event, the way SUPPORT OPS reaches
 * SupportFunnelRoot.
 */
export const SECURE_CHAT_OPEN_EVENT = 'starcom:open-secure-chat';

export function openSecureChatContacts(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SECURE_CHAT_OPEN_EVENT));
}

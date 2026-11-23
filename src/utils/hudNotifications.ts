/**
 * HUD notification helpers — thin wrappers around RealTimeEventSystem
 * for emitting non-blocking, HUD-styled notifications from anywhere.
 *
 * Replaces browser alert() / confirm() / prompt() with notifications
 * that integrate with the existing NotificationSystem component.
 */

import RealTimeEventSystem from '../services/realTimeEventSystem';
import type { SfxMoment } from '../services/audio/sfxLibrary';
import type { GlyphName } from '../symbols/uiSymbols';

type NotificationType = 'info' | 'success' | 'warning' | 'error';
type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

interface HUDNotificationOptions {
  title: string;
  message: string;
  type?: NotificationType;
  priority?: NotificationPriority;
  duration?: number;
  /** The sound it makes in place of its type's. */
  sound?: SfxMoment;
  /** Its glyph in place of its type's mark. */
  glyph?: GlyphName;
  /** What a click on it opens. */
  onOpen?: () => void;
}

/**
 * Emit a non-blocking HUD notification.
 * Renders in the NotificationSystem toast stack.
 */
export function showHUDNotification(options: HUDNotificationOptions): void {
  const eventSystem = RealTimeEventSystem.getInstance();
  eventSystem.emit({
    type: 'UI_SHOW_NOTIFICATION',
    payload: {
      title: options.title,
      message: options.message,
      type: options.type ?? 'info',
      duration: options.duration ?? 4000,
      ...(options.sound ? { sound: options.sound } : {}),
      ...(options.glyph ? { glyph: options.glyph } : {}),
      ...(options.onOpen ? { onOpen: options.onOpen } : {}),
    },
    source: 'user',
    timestamp: new Date(),
    priority: options.priority ?? 'normal',
  });
}

/** Convenience: success notification */
export function hudSuccess(title: string, message: string): void {
  showHUDNotification({ title, message, type: 'success' });
}

/** Convenience: info notification */
export function hudInfo(title: string, message: string): void {
  showHUDNotification({ title, message, type: 'info' });
}

/** Convenience: warning notification */
export function hudWarning(title: string, message: string): void {
  showHUDNotification({ title, message, type: 'warning', priority: 'high' });
}

/** Convenience: error notification */
export function hudError(title: string, message: string): void {
  showHUDNotification({ title, message, type: 'error', priority: 'high' });
}

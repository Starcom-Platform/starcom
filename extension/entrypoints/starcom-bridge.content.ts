/**
 * The bridge between Starcom's page and Uplink (decision D-EX, E0), on starcom.app alone, and on
 * localhost only in a development build. What it passes, and how one bridge answers a page across an
 * update, is `startBridge`, tested with the app's tests.
 */
import { startBridge } from '../../src/extension/uplink/bridge';
import { CAPTURES_KEY } from '../../src/extension/uplink/captures';
import { bridgePages } from '../lib/pages';

const waitingIn = (value: unknown) => (Array.isArray(value) ? value.length : 0);

export default defineContentScript({
  matches: bridgePages(import.meta.env.MODE),
  runAt: 'document_start',
  // In frames too: the side panel frames Starcom's page (W6). starcom.app lets no one else frame it.
  allFrames: true,
  main() {
    startBridge(window, {
      get id() { return browser.runtime?.id; },
      sendMessage: (message) => browser.runtime.sendMessage(message),
      // The captures waiting, read from Uplink's own storage: now, and as they change.
      watchCaptures(heard) {
        void browser.storage.local.get(CAPTURES_KEY)
          .then((got) => { const waiting = waitingIn(got[CAPTURES_KEY]); if (waiting > 0) heard(waiting); })
          .catch(() => undefined);
        const changed = (changes: Record<string, { newValue?: unknown }>, area: string) => {
          if (area === 'local' && changes[CAPTURES_KEY]) heard(waitingIn(changes[CAPTURES_KEY].newValue));
        };
        browser.storage.onChanged.addListener(changed);
        return () => { try { browser.storage.onChanged.removeListener(changed); } catch { /* cut off: nothing to remove */ } };
      },
    });
  },
});

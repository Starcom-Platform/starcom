/**
 * Starcom telling Uplink how many captures wait to be filed, for its toolbar icon (decision D-EX, E2,
 * W7). Said only when it differs from what Uplink shows: every request goes in the activity log, and the
 * same number said again would only fill it.
 *
 * Several Starcom pages can be open at once (tabs, the side panel), and each sees every change. So the
 * count last said is shared between them, in this browser's storage, and set on connecting from what
 * Uplink's hello says its icon shows, which also covers an Uplink reinstalled and so forgetful.
 */
import { useEffect } from 'react';
import { intelWorkspaceManager } from '../services/intel/IntelWorkspaceManager';
import { unfiledCaptures } from './captureItems';
import { askUplink, useStarcomUplink } from './useStarcomUplink';
import { uplinkPurpose } from './purposes';

/**
 * How long a count must hold before it is said. Each page hears another's changes a moment later, so a
 * page catching up briefly holds an older count; said at once, it would put that passing number in the
 * log (seen 2026-10-12: 1, then 0, then 1 again, within a third of a second).
 */
const SETTLE_MS = 500;
/** The count last said to Uplink, by any Starcom page in this browser. */
const SAID_KEY = 'starcom-uplink-inbox-said';
const readSaid = (): number | null => {
  try { const v = localStorage.getItem(SAID_KEY); return v === null ? null : Number(v); } catch { return null; }
};
const writeSaid = (count: number | null) => {
  try { if (count === null) localStorage.removeItem(SAID_KEY); else localStorage.setItem(SAID_KEY, String(count)); } catch { /* storage refused: the count is said again, no harm */ }
};

const countNow = () => unfiledCaptures(intelWorkspaceManager.getIntelItems(), [
  ...intelWorkspaceManager.getCases(),
  { sourceIntelIds: intelWorkspaceManager.getReports().flatMap((r) => r.sourceIntel ?? []) },
]).length;

export function useUplinkInboxCount(): void {
  const uplink = useStarcomUplink();
  const connected = uplink.status === 'connected';
  const shown = uplink.status === 'connected' ? uplink.hello.inbox : undefined;
  useEffect(() => {
    if (!connected) return undefined;
    // What Uplink's icon shows now, when it says; else unknown, so the count is said.
    writeSaid(typeof shown === 'number' ? shown : null);
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const say = () => {
      if (!live) return;
      const count = countNow();
      if (count === readSaid()) return;
      writeSaid(count);
      const why = uplinkPurpose('inbox');
      void askUplink('inbox.count', why.said, { count }, undefined, why.english).then((answer) => { if (answer.ok === false) writeSaid(null); });
    };
    // Said once the count has held a moment: a passing number is never said.
    const tell = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(say, SETTLE_MS);
    };
    void intelWorkspaceManager.ensureInitialized().then(tell);
    const stop = intelWorkspaceManager.subscribe(tell);
    return () => { live = false; if (timer !== undefined) clearTimeout(timer); stop(); };
  }, [connected]);
}

/** Tests only: forget the count last said. */
export function resetInboxCountForTests(): void {
  writeSaid(null);
}

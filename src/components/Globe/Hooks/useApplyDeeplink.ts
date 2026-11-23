/**
 * A link, applied (deeplink v1; decision RW8; globe record, section 19, Phase
 * 1 step 5).
 *
 * `?sub=` and `?mode=` have always chosen the layer as the app starts
 * (visualizationModeFromUrl). The rest of the grammar, what is pinned beside
 * it, the camera, the window and the featured report, needs a globe that is
 * drawn, so it is applied here once the globe is ready: read once, never
 * written back, and in the order the grammar states. Layer, pins, camera,
 * window, then the featured report, which is waited for until it is drawn,
 * for up to 90 seconds.
 *
 * Through the share handle, with the calls Mecha Jono's grammar names for
 * each part, so a link and an agent cannot disagree about what a view is: the
 * layer with other pins cleared, `pinLayers`, `setView`, `setTimeWindow`, and
 * for the featured report `frameReports` then `focusReport`, since focus
 * overrides the camera once it succeeds. Each part stands or falls alone: a
 * link whose report never arrives still sets the camera it named.
 *
 * And each part yields to a caller who has already chosen it through the handle (linkYield.ts): an agent that opens
 * a page and sets its own layer after `whenReady` raced the link, which set the link's layer after the same wait.
 */
import { useEffect } from 'react';
import { parseDeeplink } from '../../../context/deeplinkV1';
import { setGlobeAppearance, type GlobeAppearance } from '../../../services/globe/globeAppearance';
import { sameNote } from '../../../services/nostr/publisherKeys';
import { asTheLink, drivenByCaller } from '../../../features/globe/capture/linkYield';

/** A link's look, shown for this visit and not saved (deeplink v2). */
const showLookForVisit = (patch: Partial<GlobeAppearance>) => setGlobeAppearance(patch, { persist: false });

/** The share handle, as far as a link needs it. */
export interface LinkDriver {
  whenReady(options?: { timeoutMs?: number }): Promise<{ ready: boolean; waitedMs: number }>;
  setLayer(layerId: string, options?: { pin?: boolean; clearOtherPins?: boolean }): unknown;
  pinLayers(layerIds: string[]): unknown;
  setView(pov: { lat: number; lng: number; altitude?: number }, options?: { transitionMs?: number }): Promise<unknown>;
  setTimeWindow(window: { from: number; until: number } | null): Promise<unknown>;
  listReports(): Array<{ id: string }>;
  frameReports(ids: string[], options?: { transitionMs?: number }): Promise<unknown>;
  focusReport(id: string | null): unknown;
}

const FOCUS_WAIT_MS = 90_000;
const HANDLE_WAIT_MS = 60_000;
const READY_WAIT_MS = 60_000;

const pause = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

export function useApplyDeeplink({
  handle, search, focusWaitMs = FOCUS_WAIT_MS, pollMs = 250, look: applyLook = showLookForVisit,
}: {
  /** The installed share handle, when it is. */
  handle: () => LinkDriver | undefined;
  /** How a link's look is applied: for this visit, unsaved, unless a test says otherwise. */
  look?: (patch: Partial<GlobeAppearance>) => void;
  /** The link's query string; the page's own when absent. */
  search?: string;
  focusWaitMs?: number;
  pollMs?: number;
}): void {
  useEffect(() => {
    const link = parseDeeplink(search ?? globalThis.location?.search ?? '');
    // The look needs no handle: applied at once, so the globe is drawn in it from the first frame.
    if (link.look) {
      const { skin, light, nightFill } = link.look;
      applyLook({
        ...(skin !== undefined ? { skin } : {}),
        ...(light !== undefined ? { lightMode: light } : {}),
        ...(nightFill !== undefined ? { nightFill } : {}),
      });
    }
    const stated = link.sub || link.pins.length || link.at || link.win || link.focus;
    if (!stated) return undefined;
    let cancelled = false;
    const attempt = async (step: () => unknown) => {
      try { await asTheLink(step); } catch { /* Each part stands or falls alone. */ }
    };

    void (async () => {
      let driver: LinkDriver | undefined;
      const handleBy = Date.now() + HANDLE_WAIT_MS;
      while (!cancelled && !(driver = handle()) && Date.now() < handleBy) await pause(pollMs);
      if (cancelled || !driver) return;
      const d = driver;
      await attempt(() => d.whenReady({ timeoutMs: READY_WAIT_MS }));
      if (cancelled) return;

      const layerIsTheLinks = !drivenByCaller('layer');
      if (link.sub && layerIsTheLinks) await attempt(() => d.setLayer(link.sub!, { pin: false, clearOtherPins: true }));
      if (link.pins.length && layerIsTheLinks) await attempt(() => d.pinLayers(link.pins));
      if (link.at && !drivenByCaller('view')) {
        const { lat, lng, alt } = link.at;
        await attempt(() => d.setView(alt === null ? { lat, lng } : { lat, lng, altitude: alt }, { transitionMs: 0 }));
      }
      if (link.win && !drivenByCaller('window')) await attempt(() => d.setTimeWindow(link.win));
      if (!link.focus || drivenByCaller('focus')) return;

      const focusBy = Date.now() + focusWaitMs;
      while (!cancelled && Date.now() < focusBy) {
        // The note the link names, under any of its publisher's keys: a link made before Mecha Jono's key
        // changed finds the note signed under the new one (D-HW).
        let drawn: string | undefined;
        try { drawn = d.listReports().find((report) => sameNote(report.id, link.focus!))?.id; } catch { drawn = undefined; }
        if (drawn) {
          const id = drawn;
          if (!drivenByCaller('view')) await attempt(() => d.frameReports([id], { transitionMs: 0 }));
          await attempt(() => d.focusReport(id));
          return;
        }
        await pause(pollMs);
      }
    })();

    return () => { cancelled = true; };
    // Read once, as the page opens: a link is an entry point, not a binding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

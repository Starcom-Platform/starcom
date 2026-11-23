/**
 * A link yields to whoever drives the share handle (1 Nov 2026).
 *
 * A page opened from a link applies the link's parts once its globe is ready (useApplyDeeplink): layer, pins,
 * camera, window, featured report. An agent that opens the same page and drives the handle waits for the same
 * readiness, so the two raced: measured on starcom.app, a caller's `setLayer('ResourceZones')` right after
 * `whenReady` was undone by the link's own `setLayer('DiplomaticEvents')` (`?mode=GeoPolitical`'s default) in
 * three runs of five, and the cards that followed showed the wrong layer.
 *
 * The link is an entry point, not a binding: each part a caller has driven, the link no longer applies. Recorded
 * per part, so a caller that only moves the camera still gets the link's layer. The link's own calls, made through
 * the same handle, are marked (asTheLink) and do not count.
 */

export type DrivenPart = 'layer' | 'view' | 'window' | 'focus';

/** The handle's methods that choose a part, as a link would. */
const PARTS_OF: Readonly<Record<string, readonly DrivenPart[]>> = {
  setLayer: ['layer'],
  pinLayers: ['layer'],
  setView: ['view'],
  frameReports: ['view'],
  frameArea: ['view'],
  focusReport: ['focus'],
  setTimeWindow: ['window'],
  // An address names its own layer, camera and window.
  composeFor: ['layer', 'view', 'window'],
  renderShot: ['layer', 'view', 'window'],
  renderBatch: ['layer', 'view', 'window'],
};

const driven = new Set<DrivenPart>();
let linkCalls = 0;

/** A handle method was called: the parts it chooses are the caller's from now on, unless the link made the call. */
export function noteHandleCall(method: string): void {
  if (linkCalls > 0) return;
  for (const part of PARTS_OF[method] ?? []) driven.add(part);
}

/** Whether a caller has chosen this part since the page opened. */
export function drivenByCaller(part: DrivenPart): boolean {
  return driven.has(part);
}

/**
 * A call the link makes: it does not count as a caller's. Marked only while the call is made, not while its promise
 * settles: the handle notes a call when it is made (noticedWhenUsed), and the link's `whenReady` waits many seconds,
 * in which a caller's own calls must still count. The first version held the mark across that wait, and on the
 * release check a caller's `setLayer` made during it was undone all the same.
 */
export async function asTheLink<T>(call: () => T | Promise<T>): Promise<T> {
  linkCalls += 1;
  let result: T | Promise<T>;
  try {
    result = call();
  } finally {
    linkCalls -= 1;
  }
  return await result;
}

/** For tests. */
export function resetLinkYield(): void {
  driven.clear();
  linkCalls = 0;
}

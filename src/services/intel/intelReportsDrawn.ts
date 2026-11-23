/**
 * Whether the globe has drawn every Intel Report the pipeline has taken in (plan H3, 25 Oct).
 *
 * Mecha Jono's videos opened on a turning planet with the reports arriving near the end of
 * the turn: whenReady had let the camera move once each relay had sent its first note, not
 * all it holds. The feed line now waits for the whole read (useIntelReportsFeed); this says
 * the last thing the read brought is on the globe, not a render away.
 *
 * The pipeline numbers each list it hands the globe as it takes the notes in, and notes the
 * number again once the render that shows that list has run its effects, the glyphs' among
 * them. Equal numbers: what was taken in is drawn.
 */
let taken = 0;
let drawn = 0;

/** The pipeline, as it hands the globe a new list: that list's number. */
export function noteIntelTaken(): number {
  taken += 1;
  return taken;
}

/** The pipeline, once the render showing list `seq` has run its effects. */
export function noteIntelDrawn(seq: number): void {
  if (seq > drawn) drawn = seq;
}

/** Whether every list taken in is drawn, and why not. */
export function intelDrawnReadiness(): { ready: boolean; why?: string } {
  return drawn >= taken
    ? { ready: true }
    : { ready: false, why: 'the Intel Reports just read were not drawn yet' };
}

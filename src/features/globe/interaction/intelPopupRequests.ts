/**
 * Asking for an Intel Report's popup from outside the globe (decision D-PW, PW89): a list names a report by its id, and
 * the globe's popup flow opens it as a click on its mark would, when the report is drawn. Told to whatever flow is up.
 */
const listeners = new Set<(id: string) => boolean>();

/** Asks the globe to open a report's popup; false when none opened it: no globe up, or the report not drawn on it. */
export function requestIntelPopup(id: string): boolean {
  return [...listeners].some((listener) => listener(id));
}

/** A popup flow's answer: true when it opened the report. */
export function onIntelPopupRequest(listener: (id: string) => boolean): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

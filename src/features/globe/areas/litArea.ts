/**
 * The area lit on the globe with no report naming it (BA23, BA24): by a card
 * about the area while it is made, or by a person who found it in the search,
 * until they dismiss it. One at a time.
 *
 * The globe's region layer draws it and says what it has drawn, which a card
 * waits for: a card about the Sahel made before the Sahel is lit would say so
 * over a picture that does not show it.
 */
type Listener = () => void;

let lit: string | null = null;
let drawn: string | null = null;
const listeners = new Set<Listener>();

/** Light an area by its code, or none. */
export function setLitArea(code: string | null): void {
  if (lit === code) return;
  lit = code;
  for (const listener of listeners) listener();
}

export function getLitArea(): string | null {
  return lit;
}

export function subscribeLitArea(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The globe says which area it has drawn lit, or none. */
export function markLitAreaDrawn(code: string | null): void {
  drawn = code;
}

export function litAreaDrawn(): string | null {
  return drawn;
}

/** Test-only: nothing lit, nothing drawn, nobody listening. */
export function resetLitAreaForTests(): void {
  lit = null;
  drawn = null;
  listeners.clear();
}

/**
 * Why an address is not drawn, asked of each layer that holds addresses (Mecha Jono's ask D): Raver
 * Watch's, then Hero Watch's. Each answers for its own: a reason, null when it is drawn, or undefined
 * when the address is not its own. So the first answer that is not undefined stands; `??` would pass
 * over a null, and say "not mine" of an item that is drawn.
 */
export type WhyNotDrawn = (id: string) => string | null | undefined;

export function whyNotDrawnOf(...layers: WhyNotDrawn[]): WhyNotDrawn {
  return (id) => {
    for (const layer of layers) {
      const answer = layer(id);
      if (answer !== undefined) return answer;
    }
    return undefined;
  };
}

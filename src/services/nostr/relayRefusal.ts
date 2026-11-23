/**
 * Whether the relays refused a note for good (work package W1): every answer is one NIP-01 marks as a refusal
 * that trying again will not change, `blocked:`, `invalid:`, `restricted:`, `pow:` or `mute:`. A relay that did not
 * answer, timed out, said `error:`, asked to be signed in to, or to be written to more slowly, may take it later, so
 * a note any of them failed is kept to try again. One every relay refused for good is not: the person is shown why,
 * as before, since waiting would only hide it (walk story S22).
 */
const FOR_GOOD = /^(blocked|invalid|restricted|pow|mute):/i;

export function refusedForGood(said: readonly string[]): boolean {
  return said.length > 0 && said.every((answer) => FOR_GOOD.test(answer.trim()));
}

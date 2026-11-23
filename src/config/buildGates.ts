/**
 * Where the build switch (decision D-CS, CS1, CS13) hides what a build may not draw. A sub-mode whose data comes only
 * from sources the build may not use is absent from it, as if it never existed: off the rails, the palette and the
 * layer list, and a stored or linked choice of it opens the mode's default instead. In the non-commercial build every
 * check here is true.
 *
 * Each check names its sources literally, so the build profile's ratchet test can see that each is gated.
 */
import { sourceAllowed } from '../legal/buildProfile';

/** Sub-modes drawn only from restricted sources, each with whether this build may show it. */
const SUBMODE_GATES: Readonly<Record<string, () => boolean>> = {
  // Its lists: DShield (permission needed) and FireHOL's mirrors (terms unclear); OTX's ring sits inside it.
  CyberThreats: () => sourceAllowed('dshield') || sourceAllowed('firehol'),
  // Every orbit is CelesTrak's, whose terms are silent on reuse.
  Satellites: () => sourceAllowed('celestrak'),
  // Cables, their landing points and the connectivity drawn from them are all TeleGeography's.
  CommHubs: () => sourceAllowed('cables'),
};

/** Whether this build shows a sub-mode. One not listed above is always shown. */
export function subModeAvailable(subMode: string): boolean {
  const gate = SUBMODE_GATES[subMode];
  return gate ? gate() : true;
}

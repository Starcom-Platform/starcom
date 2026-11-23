/**
 * Sends a reviewed mission report (decision D-MF, MF11). Called only from the publish review
 * (guard-publish-review.mjs), after the person saw what goes, to whom and where.
 *
 * The report is sealed to the package's publisher and gift-wrapped (NIP-59), so a relay holds a wrap signed by
 * a key used once and addressed to the publisher: never who sent it, never what it says. Its own time is the
 * start of its day (MF12). It is sent when at least one relay took it, and says the id inside its seal: the id a
 * settlement names (NavCom §5.3), so its sender can read how it stands.
 */
import type { SimplePool } from 'nostr-tools';
import { createRelayPool } from '../../nostr/relayPool';
import { makeRumor, wrapRumor } from '../../nostr/giftWrap';
import type { ReportTemplate } from './missionReport';

export interface SentReportOutcome {
  relays: number;
  /** The id inside the seal, and the key that sealed it. */
  id: string;
  author: string;
}

export async function sendMissionReport(
  template: ReportTemplate,
  recipient: string,
  relays: string[],
  pool: Pick<SimplePool, 'publish'> = createRelayPool(),
): Promise<SentReportOutcome> {
  const rumor = await makeRumor({ kind: template.kind, tags: template.tags, content: template.content }, template.createdAt);
  const wrap = await wrapRumor(rumor, recipient);
  const answers = await Promise.allSettled(pool.publish(relays, wrap));
  const took = answers.filter((a) => a.status === 'fulfilled').length;
  if (took === 0) {
    const said = answers.map((a) => (a.status === 'rejected' ? String(a.reason?.message ?? a.reason) : '')).filter(Boolean);
    throw new Error(said.length > 0 ? `No relay took it: ${said.join('; ')}` : 'No relay took it.');
  }
  return { relays: took, id: rumor.id, author: rumor.pubkey };
}

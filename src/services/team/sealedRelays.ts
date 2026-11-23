/**
 * Where something sealed to people goes (plan items 2.4 and 2.7): the build's
 * internal relays, and for each person the relays of the teams joined whose
 * roster names them. A roster here never hears of someone who joined by
 * invite on their own machine, so a person no roster names is sent to over
 * every team relay joined. A relay they are not on holds a wrap they never
 * read: it learns that their key received something, and roughly when; never
 * who sent it, and never what it is.
 */
import { internalRelays } from '../nostr/publishTargets';
import { isJoinedRelay } from '../nostr/joinedRelays';
import { realTimeTeamService } from '../RealTimeTeamService';

export function sealedRelaysFor(recipients: readonly string[]): string[] {
  const joinedTeams = realTimeTeamService.getTeams().filter((team) => team.relayUrl && isJoinedRelay(team.relayUrl));
  const teamRelays = recipients.flatMap((recipient) => {
    const named = joinedTeams.filter((team) => team.members.some((m) => m.pubkey === recipient));
    return (named.length > 0 ? named : joinedTeams).map((team) => team.relayUrl!);
  });
  return [...new Set([...internalRelays(), ...teamRelays])];
}

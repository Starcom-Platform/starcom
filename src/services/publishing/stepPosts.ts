/**
 * Posting a step label (decision D-RS, RS55–RS57) through the publish review: a step of a mission a team works
 * together taken, released, done or checked, signed to the team's own relay only, so only its members read it.
 */
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { requestReview, type ReviewOutcome } from './publishReview';
import { destinationsFor } from './destinations';
import { stableStringify } from '../exchange/signing';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { sendSignedRoster } from '../roster/sendRoster';
import { stepLabelTemplate, type StepLabelValue } from '../roster/stepLabels';

interface StepSend {
  template: { kind: number; tags: string[][]; content: string };
  team: { relay: string; name: string };
  mission: { coordinate: string; title: string };
  step: { id: string; ask: string };
  value: StepLabelValue;
}

const ACT: Record<StepLabelValue, string> = {
  taken: 'Take this step', released: 'Release this step', done: 'Mark this step done', checked: 'Check this step',
};
const SAYS: Record<StepLabelValue, string> = {
  taken: 'You are taking it, so no one else does it twice.',
  released: 'You are letting it go, so someone else can take it.',
  done: 'You did it. Someone else on it can check it.',
  checked: 'You checked what someone else did.',
};

function show(p: Readonly<StepSend>) {
  return {
    title: `${p.mission.title}: ${p.step.ask}`,
    body: p.template.content,
    fields: [
      { label: 'Who can read it', value: `${p.team.name}'s members, on the team's own relay.` },
      { label: 'What it says', value: SAYS[p.value] },
      ...(p.value === 'taken' ? [{ label: 'How long', value: '24 hours, or until you release it.' }] : []),
    ],
    raw: JSON.stringify(p.template, null, 2),
  };
}

/** Show, and on a yes post, one step's label to its team's relay. */
export async function reviewStepLabel(
  team: { relay: string; name: string },
  mission: { coordinate: string; title: string },
  step: { id: string; ask: string },
  value: StepLabelValue,
  extra: { doer?: string; note?: string } = {},
  now: number = Date.now(),
): Promise<ReviewOutcome<{ relays: number }>> {
  if (!/^wss:\/\/[^\s/]+(\/[^\s]*)?$/.test(team.relay)) return { status: 'refused', reason: "A team's relay is a wss:// address." };
  if (value === 'checked' && !extra.doer) return { status: 'refused', reason: 'A check names whose step it checks.' };
  const template = stepLabelTemplate({ value, coordinate: mission.coordinate, step: step.id, ...extra, nowS: Math.floor(now / 1000) });
  return requestReview<StepSend, { relays: number }>({
    act: ACT[value],
    payload: { template, team, mission, step, value },
    show,
    destinations: destinationsFor([team.relay]),
    digest: (p) => bytesToHex(sha256(utf8ToBytes(stableStringify(p.template)))),
    digestLabel: 'the label, as it will be signed',
    signer: await nostrIdentityService.refreshSigner(),
    send: async (p) => sendSignedRoster(p.template, [p.team.relay], now),
  });
}

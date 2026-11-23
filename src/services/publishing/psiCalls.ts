/**
 * Sealing and revealing a Psi Watch call (decision D-PW, PW44, PW72, PW75), through the review every publish passes.
 * The seal shows that only a fingerprint goes, not the call nor its window's times, to the one team relay picked,
 * before the window opens; the reveal shows the call's exact text and salt going to that relay beside its seal, once
 * the window has closed. On a yes it goes, and the call kept on this device records where (`psiWatch/calls.ts`).
 */
import { requestReview, type ReviewOutcome } from './publishReview';
import { destinationsFor } from './destinations';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { en } from '../../i18n/app/en';
import { sendSignedEvent } from '../nostr/sendSigned';
import { fingerprintOf, getCall, revealTemplate, sealTemplate, updateCall, windowMs, type PsiCall } from '../psiWatch/calls';

const WSS = /^wss:\/\/[^\s/]+(\/[^\s]*)?$/;
const when = (ms: number) => new Date(ms).toISOString().replace('.000', '');

function callFields(call: PsiCall) {
  const { text } = call;
  const { fromMs, untilMs } = windowMs(text);
  return [
    { label: 'Window', value: `${text.window.title}: ${when(fromMs)} to ${when(untilMs)}` },
    { label: 'Zone', value: text.place.name },
    { label: 'Expected', value: [en.psiWatch.timestream.callKinds[text.expects.kind], text.expects.detail].filter(Boolean).join(': ') },
  ];
}

/** Show, and on a yes send, the seal of the call kept here at `id`: its fingerprint only, to the team's relay. */
export async function reviewCallSeal(id: string, team: { relay: string; name: string }, now: number = Date.now()): Promise<ReviewOutcome<{ relays: number }>> {
  const call = getCall(id);
  if (!call) return { status: 'refused', reason: 'That call is not on this device.' };
  if (call.seal) return { status: 'refused', reason: 'That call is already sealed.' };
  if (now >= windowMs(call.text).fromMs) return { status: 'refused', reason: 'A call is sealed before its window opens; this one has opened.' };
  if (!WSS.test(team.relay)) return { status: 'refused', reason: "A team's relay is a wss:// address." };
  const template = sealTemplate(call);
  const outcome = await requestReview<{ template: typeof template; relay: string }, { relays: number; eventId: string }>({
    act: 'Seal the call',
    payload: { template, relay: team.relay },
    show: (p) => ({
      title: `A sealed call on ${call.text.window.title}`,
      body: 'Only the fingerprint goes: no one can read the call until you reveal it after its window.',
      fields: [
        { label: 'Who can read it', value: `${team.name}'s members see that a call was sealed, and when; not what it says, where, or for which window.` },
        { label: 'Fingerprint', value: p.template.tags.find((t) => t[0] === 'x')?.[1] ?? '' },
        ...callFields(call),
      ],
      raw: JSON.stringify({ kind: p.template.kind, tags: p.template.tags, content: p.template.content }, null, 2),
    }),
    destinations: destinationsFor([team.relay]),
    digest: () => fingerprintOf(call.text, call.salt),
    digestLabel: 'the call, as it will be revealed',
    signer: await nostrIdentityService.refreshSigner(),
    send: async (p) => {
      const { relays, event } = await sendSignedEvent(p.template, [p.relay], now);
      return { relays, eventId: event.id };
    },
  });
  if (outcome.status === 'sent') updateCall(id, { seal: { eventId: outcome.result.eventId, relay: team.relay, at: now } });
  return outcome.status === 'sent' ? { status: 'sent', result: { relays: outcome.result.relays } } : outcome;
}

/** Show, and on a yes send, the reveal of a sealed call whose window has closed: its exact text, beside its seal. */
export async function reviewCallReveal(id: string, now: number = Date.now()): Promise<ReviewOutcome<{ relays: number }>> {
  const call = getCall(id);
  if (!call?.seal) return { status: 'refused', reason: 'Only a sealed call is revealed.' };
  if (call.reveal || call.keptPrivate) return { status: 'refused', reason: 'That call is already revealed or kept private.' };
  if (now <= windowMs(call.text).untilMs) return { status: 'refused', reason: 'A call is revealed after its window closes.' };
  const template = revealTemplate(call, call.seal);
  const outcome = await requestReview<{ template: typeof template; relay: string }, { relays: number; eventId: string }>({
    act: 'Reveal the call',
    payload: { template, relay: call.seal.relay },
    show: (p) => ({
      title: `The call on ${call.text.window.title}`,
      body: call.text.words,
      fields: [
        { label: 'Who can read it', value: "Whoever reads the team's relay: the call's text and salt, which anyone can check against its seal." },
        { label: 'Sealed', value: `${when(call.seal!.at)}, before the window opened` },
        ...callFields(call),
      ],
      raw: JSON.stringify({ kind: p.template.kind, tags: p.template.tags, content: p.template.content }, null, 2),
    }),
    destinations: destinationsFor([call.seal.relay]),
    digest: () => fingerprintOf(call.text, call.salt),
    digestLabel: 'the call, as sealed',
    signer: await nostrIdentityService.refreshSigner(),
    send: async (p) => {
      const { relays, event } = await sendSignedEvent(p.template, [p.relay], now);
      return { relays, eventId: event.id };
    },
  });
  if (outcome.status === 'sent') updateCall(id, { reveal: { eventId: outcome.result.eventId, at: now } });
  return outcome.status === 'sent' ? { status: 'sent', result: { relays: outcome.result.relays } } : outcome;
}

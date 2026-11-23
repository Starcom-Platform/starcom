/**
 * The package profile NavCom reads (interchange spec rev 11; decision D-MX:
 * MX2, MX11, MX13). A package says whether anybody is behind its mission,
 * whether one person takes it or anybody joins, and, for field work, where and
 * until when.
 *
 * The event carries it as tags, where NavCom reads it, and the manifest
 * carries the same values: the manifest's signature covers them, the review's
 * fingerprint covers what the review shows, and a kept package sends the same
 * tags again.
 *
 * A region, never a point (MX11): field work names a country or a state by
 * its code, chosen by its publisher. Nothing finer crosses; decision D1 holds
 * for positions.
 */
import { MissionStatus, type MissionUI } from '../../types/intel/MissionUI';
import type { PackageProfile } from '../exchange/types';
import { REGION_CODE } from '../exchange/schema';
import { formatUtcDateTime } from '../../utils/utcTime';
import { statusName } from './steps/statusSteps';
import { en, type Messages } from '../../i18n/app/en';
import { utcDateTimeIn } from '../../i18n/app/dates';
import { interpolate } from '../../i18n/messages';
import type { LanguageId } from '../../i18n/app/languages';

type ProfiledMission = Pick<MissionUI, 'claims' | 'fieldWork'> & Partial<Pick<MissionUI, 'status'>>;

const regionOf = (fieldWork: NonNullable<MissionUI['fieldWork']>) => fieldWork.jurisdiction?.trim().toLowerCase() ?? '';
const endOf = (fieldWork: NonNullable<MissionUI['fieldWork']>) => (fieldWork.until ? Date.parse(fieldWork.until) : NaN);

/**
 * What a mission's package says of it. Field work that cannot be checked is
 * left out: publishing refuses it first (fieldWorkProblem). `agent` is the
 * name an agent's key publishes under (MX14).
 */
export function missionProfile(mission: ProfiledMission, agent?: string): PackageProfile {
  const fieldWork = mission.fieldWork;
  const region = fieldWork ? regionOf(fieldWork) : '';
  const end = fieldWork ? endOf(fieldWork) : NaN;
  return {
    // Closed once the mission is (MX12); `claimed` waits on reading NavCom's labels.
    missionState: mission.status === MissionStatus.CLOSED ? 'closed' : 'open',
    claims: mission.claims ?? 'many',
    ...(REGION_CODE.test(region) && Number.isFinite(end)
      ? { fieldWork: { jurisdiction: region, validUntil: Math.floor(end / 1000) } }
      : {}),
    ...(agent ? { agent } : {}),
  };
}

/**
 * Why this mission's field work cannot be published now, in words that say what to do, or null. Desk work has none.
 * Field work names at least one objective: NavCom refuses a field package nobody could report on (rev 5, §4.3).
 */
export function fieldWorkProblem(
  mission: Pick<MissionUI, 'fieldWork'> & Partial<Pick<MissionUI, 'objectives'>>,
  now = Date.now(),
  lang: LanguageId = 'en',
  words: Messages['missions']['fieldWorkProblems'] = en.missions.fieldWorkProblems,
): string | null {
  const fieldWork = mission.fieldWork;
  if (!fieldWork) return null;
  const region = regionOf(fieldWork);
  if (!region) return words.needsRegion;
  if (!REGION_CODE.test(region)) return interpolate(words.notRegion, { region });
  const end = endOf(fieldWork);
  if (!Number.isFinite(end)) return words.needsEnd;
  if (end <= now) return interpolate(words.ended, { when: utcDateTimeIn(lang, end, true) });
  if (mission.objectives && mission.objectives.length === 0) return words.needsObjective;
  return null;
}

/** Why a kept package is not sent again, its field work having ended, or null. */
export function keptFieldWorkProblem(profile: PackageProfile | undefined, now = Date.now()): string | null {
  const end = profile?.fieldWork ? profile.fieldWork.validUntil * 1000 : Infinity;
  if (end > now) return null;
  return `Its field work ended ${formatUtcDateTime(end, { year: true })}, so its kept package is not sent again. `
    + `Move it back to ${statusName('mission', MissionStatus.PLANNING)} to set a later end date.`;
}

/** The tags NavCom reads the profile from, in the order a package carries them. None for a package without one. */
export function profileTags(profile: PackageProfile | undefined): string[][] {
  if (!profile) return [];
  return [
    ['mission_state', profile.missionState],
    ...(profile.claims ? [['claims', profile.claims]] : []),
    ...(profile.fieldWork ? [
      ['t', 'navcom_mission'],
      ['valid_until', String(profile.fieldWork.validUntil)],
      ['jurisdiction', profile.fieldWork.jurisdiction],
    ] : []),
    ...(profile.agent ? [['agent', profile.agent]] : []),
  ];
}

/**
 * The profile a received package states (D-MX, MX1): its signed profile when it
 * carries one, the verifier having held its tags to it; else its tags, as
 * NavCom reads them. Only what it states: a package from before rev 11 states
 * none, and an absent field stays absent.
 */
export function statedProfile(event: { tags: string[][] }, signed?: PackageProfile): Partial<PackageProfile> {
  if (signed) return signed;
  const tag = (name: string) => event.tags.find((t) => t[0] === name)?.[1];
  const state = tag('mission_state');
  const claims = tag('claims');
  const jurisdiction = tag('jurisdiction')?.trim().toLowerCase();
  const until = Number(tag('valid_until'));
  const agent = tag('agent')?.trim();
  const fieldWork = event.tags.some((t) => t[0] === 't' && t[1] === 'navcom_mission');
  return {
    ...(state === 'open' || state === 'closed' || state === 'claimed' ? { missionState: state } : {}),
    ...(claims === 'one' || claims === 'many' ? { claims } : {}),
    ...(fieldWork && jurisdiction && Number.isInteger(until) && until > 0 ? { fieldWork: { jurisdiction, validUntil: until } } : {}),
    ...(agent ? { agent } : {}),
  };
}

/**
 * A stated profile in words, for a reader; null when it states nothing. Its end is in UTC (D-E). In English
 * unless a language and its words are given (D-ML, L3).
 */
export function profileWords(
  profile: Partial<PackageProfile>,
  lang: LanguageId = 'en',
  words: Messages['missionParts']['profile'] = en.missionParts.profile,
): string | null {
  const stated = profile.missionState !== undefined || profile.claims !== undefined;
  const said = [
    profile.missionState ? words.states[profile.missionState] : null,
    // NavCom reads an absent `claims` as many; said only when the package states a profile at all.
    profile.claims === 'one' ? words.onePerson : stated ? words.anybodyJoins : null,
    profile.fieldWork
      ? interpolate(words.fieldWorkIn, { region: profile.fieldWork.jurisdiction, when: utcDateTimeIn(lang, profile.fieldWork.validUntil * 1000, true) })
      : null,
    profile.agent ? interpolate(words.postedByAgent, { agent: profile.agent }) : null,
  ].filter((w): w is string => Boolean(w));
  return said.length ? said.join(' · ') : null;
}

/**
 * Who is taking part, as the package's own publisher counts it (NavCom rev 4, Q13; adopted, D-MX MX28): the
 * `["taking_part", "<operators>", "<agents>"]` tag. Only the publisher sees private claims, so only its count is
 * whole; it names nobody, and agents are counted apart. Null when the package carries none.
 */
export function takingPartOf(event: { tags: string[][] }): { operators: number; agents: number } | null {
  const tag = event.tags.find((t) => t[0] === 'taking_part');
  if (!tag) return null;
  const [operators, agents] = [Number(tag[1]), Number(tag[2] ?? 0)];
  return Number.isInteger(operators) && operators >= 0 && Number.isInteger(agents) && agents >= 0 ? { operators, agents } : null;
}

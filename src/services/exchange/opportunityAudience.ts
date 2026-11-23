/**
 * Who a record is offered to, and on what legal basis — never for how much.
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * The Intelligence Market Exchange was five tabs of trading terminal, four of
 * them empty, built on a frozen NFT model with `price`, `royalties` and
 * `floorPrice`. Its own plan described a paywall: purchase, sealed key,
 * decrypt locally. That product contradicts what this network has since
 * committed to in public — that a flag names the statute and who decides, and
 * never states an amount — and it contradicts the point of the place, which is
 * to be a FREE avenue for people who work for reward to find work that pays.
 *
 * Information is the currency here. Charging for the index would be charging
 * admission to the thing that makes it worth having.
 *
 * ─── THE ROUTING ALREADY HAD A PROTOCOL ────────────────────────────────────
 *
 * Spec rev 7 defines the audience axis and the peer accepted it:
 *
 *     ["t", "audience:reward_hunter"]     who it is offered to
 *     ["statute", "<the legal basis>"]    the law and who decides, never a sum
 *
 * So this module is not a new invention; it is the reading side of a contract
 * two nodes already agreed. The archetypes below are that axis extended to the
 * people who actually turn up: ex-military, ex-police, ex-intelligence,
 * private investigators, whitehat researchers, recovery agents, consultants.
 *
 * ─── AND THE INTEL WAS ALREADY THERE ───────────────────────────────────────
 *
 * Nothing here needs a new feed. From a live ingest on 2026-09-23, arriving on
 * the public relays and drawn on the globe as an anonymous dot:
 *
 *     "Dubai Enterprises Co was paid $25,242 across 1 federal award(s) while
 *      carrying a Reciprocal exclusion"
 *
 * An entity paid federal money while carrying an exclusion is the shape the
 * False Claims Act exists for. The board's job is to say so — and to stop
 * there.
 *
 * ─── THE THREE RULES ───────────────────────────────────────────────────────
 *
 * **A statute flag never carries an amount.** The peer's sentence, binding on
 * both nodes. A figure OBSERVED in a record is a fact about the record and may
 * be shown; a figure attached to the statute would be a promise about what a
 * reader receives, and this node does not make those. There is deliberately no
 * reward, payout, bounty, amount or price field on the result — absent by
 * construction, so one cannot be added later and leak.
 *
 * **Declared beats derived, and derived says so.** A publisher tagging their
 * own audience is authoritative. Anything worked out here is marked `derived`,
 * because a reader must be able to tell a routing guess from the author's own
 * words. Same commitment that makes the attestation model work.
 *
 * **A statute is named only where the pattern reaches it.** A charity losing
 * its exemption for not filing is not fraud, and tagging it as one would be
 * the "imply the cause" failure the epistemic vocabulary exists to prevent.
 * Such records still route — as public-interest work, with no statute.
 *
 * ─── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────────
 *
 * It routes to PUBLISHED PROGRAMMES AND PUBLIC RECORDS. It does not locate
 * people, hold dossiers, or rank private individuals. That boundary is not
 * decoration: the audience this is built for — former investigators and
 * officers — will not use a tool that hands them unsourced allegations about
 * named people, and would be right not to.
 */
import type { IntelReportUI } from '../../types/intel/IntelReportUI';

/**
 * The archetypes the board routes to.
 *
 * `reward_hunter` is kept as the spec's own generic name so a peer publishing
 * rev 7's literal tag is understood without translation; the rest are the
 * specific trades that turn up looking for it.
 */
export const ARCHETYPES = [
  'reward_hunter',
  'qui_tam_relator',
  'recovery_agent',
  'private_investigator',
  'whitehat',
  'strategic_consultant',
  'journalist',
  'citizen_osint',
  // The public-record feeds' audiences (decision D-BF, BF6), the last also
  // declared by Mecha Jono as `audience:public_interest_attorney`.
  'compliance_analyst',
  'sanctions_researcher',
  'insurance_siu',
  'academic_researcher',
  'public_interest_attorney',
] as const;

export type Archetype = (typeof ARCHETYPES)[number];

/**
 * The legal basis, named.
 *
 * `decidedBy` exists because "there may be a reward" and "somebody decides
 * whether there is" are different claims, and only the second is ours to make.
 * Naming the decider is what lets a reader go and check rather than trust us.
 *
 * There is no amount field and there will not be one.
 */
export interface StatuteBasis {
  /** The law or programme, named so a reader can look it up. */
  name: string;
  /** Who decides whether anything is paid. Never us. */
  decidedBy: string;
  /** Where to read the programme's own words. */
  reference?: string;
  /**
   * What the programme itself says it may pay, word for word from its own page and linked (critique C12,
   * CR2): the programme's words, never a figure of ours. Absent where its page says nothing of payment.
   */
  programmeSays?: { words: string; by: string; url: string };
}

export interface AudienceRouting {
  archetypes: Archetype[];
  /**
   * `declared` — the publisher said so. `derived` — this node worked it out.
   * `none` — nothing matched, which is stated rather than guessed at.
   */
  basis: 'declared' | 'derived' | 'none';
  statute?: StatuteBasis;
  /** What was OBSERVED, in the record's own terms. Never an accusation. */
  pattern?: string;
  /** The record's own words the pattern was found in, as the record writes them (D-LD, "why it is here"). */
  matched?: string;
}

const isArchetype = (value: string): value is Archetype =>
  (ARCHETYPES as readonly string[]).includes(value);

/**
 * A peer's spelling of one of ours. Mecha Jono's interchange writes
 * `audience:white_hat` for what this board calls `whitehat`; their other
 * audiences that have no archetype here are ignored, as any unknown one is.
 */
const ALIASES: Record<string, Archetype> = { white_hat: 'whitehat' };

/**
 * A derivation rule: a pattern this node can recognise, and where it routes.
 *
 * Each carries its own `pattern` sentence, written in the record's terms —
 * "paid while an exclusion was recorded", not "defrauded the government". The
 * first states what the documents show. The second is a conclusion no node
 * here is entitled to reach.
 */
interface DerivationRule {
  id: string;
  matches: (haystack: string) => boolean;
  /** The words to show as the reason: the most telling part of what `matches` found. */
  phrase: RegExp;
  archetypes: Archetype[];
  pattern: string;
  statute?: StatuteBasis;
}

const RULES: DerivationRule[] = [
  {
    id: 'award-during-exclusion',
    // Both halves required: a payment AND a recorded exclusion. Either alone is
    // ordinary — federal awards are published by the million, and an exclusion
    // on its own is a listing, not a payment.
    // An exclusion recorded against a contractor, named as one: "a Reciprocal
    // exclusion", "an active SAM exclusion", "an exclusion was recorded". Never
    // an exclusion zone, and never an award of another kind: "federal award".
    matches: (h) => /\b(reciprocal|active|sam|procurement|nonprocurement|debarment|suspension)\b[^.]{0,30}\bexclusion\b(?!\s+zones?\b)|\bexclusion (was )?recorded\b/.test(h)
      && /\bfederal awards?\b/.test(h),
    phrase: /\b(reciprocal|active|sam|procurement|nonprocurement|debarment|suspension)\b[^.]{0,30}\bexclusion\b|\bexclusion (was )?recorded\b/i,
    archetypes: ['qui_tam_relator', 'reward_hunter', 'strategic_consultant'],
    pattern: 'Payment recorded during a period carrying an exclusion.',
    statute: {
      name: 'False Claims Act (31 U.S.C. §3729)',
      decidedBy: 'the U.S. Department of Justice and the court',
      reference: 'https://www.justice.gov/civil/false-claims-act',
      // DOJ's own sentence, as its page gave it on 2026-10-16; the page names no share.
      programmeSays: {
        words: 'Private citizens who successfully bring qui tam actions may receive a portion of the government’s recovery.',
        by: 'U.S. Department of Justice',
        url: 'https://www.justice.gov/civil/false-claims-act',
      },
    },
  },
  {
    id: 'exemption-revoked',
    matches: (h) => /501\(c\)\(3\)|exempt status|exemption/.test(h) && /revok|lost/.test(h),
    // NO statute. Automatic revocation follows unfiled returns; it is a
    // compliance fact, not an allegation, and naming a fraud statute here would
    // be exactly the overreach the epistemic rules forbid.
    phrase: /(lost|revok\w*)[^.]{0,40}(501\(c\)\(3\)|exempt status|exemption)|(501\(c\)\(3\)|exempt status|exemption)[^.]{0,40}(lost|revok\w*)/i,
    archetypes: ['journalist', 'citizen_osint', 'strategic_consultant'],
    pattern: 'Exempt status recorded as revoked.',
  },
  {
    id: 'parent-entity-declared',
    // `h` is lower case, so the Unique Entity ID is looked for as `uei`.
    matches: (h) => /\bparent\b/.test(h) && /\buei\b|ownership/.test(h),
    phrase: /\bparent\b[^.]{0,40}/i,
    archetypes: ['strategic_consultant', 'private_investigator', 'citizen_osint'],
    pattern: 'Corporate parentage declared on an award record.',
  },
  {
    id: 'funding-window',
    // A stated closing date, or a notice that is a funding notice. "Announcement"
    // alone was enough before, so a club's new opening hours were a funding window.
    matches: (h) => /closes in \d+ day|notice of funding|funding opportunity|broad agency announcement|grant program/.test(h),
    phrase: /closes in \d+ day(\(s\)|s)?|notice of funding|funding opportunity|broad agency announcement|grant program/i,
    archetypes: ['strategic_consultant'],
    pattern: 'A funding window with a stated closing date.',
  },
];

/**
 * Route one record to the archetypes it is offered to.
 *
 * Reads the publisher's own `audience:` tags first and stops there if it finds
 * any: their word outranks our inference, and mixing the two would produce a
 * routing nobody stated.
 */
export function routeToAudiences(report: IntelReportUI): AudienceRouting {
  // A local report's own tags, and a network report's publisher tags, which the
  // ingest keeps apart in `hashtags` so they cannot pose as Starcom's own.
  const declared = [...(report.tags ?? []), ...(report.hashtags ?? [])]
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.startsWith('audience:'))
    .map((t) => t.slice('audience:'.length))
    .map((t) => ALIASES[t] ?? t)
    .filter(isArchetype);

  if (declared.length > 0) {
    return { archetypes: [...new Set(declared)], basis: 'declared' };
  }

  const text = `${report.title ?? ''} ${report.content ?? ''}`;
  const haystack = text.toLowerCase();
  const hit = RULES.find((rule) => rule.matches(haystack));
  if (!hit) return { archetypes: [], basis: 'none' };
  const matched = hit.phrase.exec(text)?.[0].trim();

  return {
    archetypes: [...hit.archetypes],
    basis: 'derived',
    pattern: hit.pattern,
    ...(matched ? { matched } : {}),
    ...(hit.statute ? { statute: hit.statute } : {}),
  };
}

/**
 * The archetypes this node can reach by working a record out itself. The rest
 * are reached when a publisher declares them, or by the public-record feeds
 * (boardFeeds.ts): nothing in a report says "fugitive" or "exposed service"
 * plainly enough to route on.
 */
export const DERIVABLE_ARCHETYPES: ReadonlySet<Archetype> = new Set(RULES.flatMap((rule) => rule.archetypes));

/** Human label for an archetype, for a filter a person reads. */
export const ARCHETYPE_LABELS: Record<Archetype, string> = {
  reward_hunter: 'Reward-bearing',
  qui_tam_relator: 'Qui tam / whistleblower',
  recovery_agent: 'Recovery & enforcement',
  private_investigator: 'Private investigator',
  whitehat: 'Security research',
  strategic_consultant: 'Strategic consulting',
  journalist: 'Journalism',
  citizen_osint: 'Citizen OSINT',
  compliance_analyst: 'Compliance & AML',
  sanctions_researcher: 'Sanctions research',
  insurance_siu: 'Insurance SIU',
  academic_researcher: 'Academic research',
  public_interest_attorney: 'Public-interest law',
};

export interface Routed {
  report: IntelReportUI;
  routing: AudienceRouting;
}

/**
 * Route every report, keep the ones that route anywhere.
 *
 * Lives beside the rule rather than in the board: which records reach which
 * archetype is a judgement, and a judgement should be testable without a DOM.
 * It also keeps the component file exporting only a component.
 */
export function routeAll(reports: readonly IntelReportUI[]): Routed[] {
  return reports
    .map((report) => ({ report, routing: routeToAudiences(report) }))
    .filter((r) => r.routing.archetypes.length > 0);
}

/** Archetypes that at least one record actually reaches. */
export function archetypesPresent(routed: readonly Routed[]): Archetype[] {
  const seen = new Set<Archetype>();
  for (const r of routed) for (const a of r.routing.archetypes) seen.add(a);
  // Kept in ARCHETYPES order so the filter does not reshuffle as intel arrives.
  return ARCHETYPES.filter((a) => seen.has(a));
}

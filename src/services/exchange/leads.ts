/**
 * A lead on the Market Exchange's desk (decision D-LD, LD1): a routed report, or one of the board's
 * public-record feed items (D-BF), in one shape, so one list, one audience filter and the desk's views
 * read them all. Each says when its record is dated, when it closes if it does, where it came from,
 * where it is about, who it is offered to and whose word that is, and who decides under it.
 *
 * The board's rules hold here as on every card (opportunityAudience.ts): no amount; declared beats
 * derived and derived says so; a statute only where the pattern reaches it. People are never a lead:
 * the feeds count them (BF2), and a lead's places are its organisations' and its territories.
 */
import type { IntelReportUI } from '../../types/intel/IntelReportUI';
import type { Archetype, AudienceRouting, Routed, StatuteBasis } from './opportunityAudience';
import type { FundingWindow, FundingWindows } from './feeds/grantsGov';
import type { RewardProgramme } from './feeds/rewardProgrammes';
import { SANCTIONS_AUDIENCES, type SanctionsChanges, type SanctionsPublication } from './feeds/sanctionsChanges';
import { EXCLUSIONS_AUDIENCES, type ExclusionMonth, type HealthExclusions } from './feeds/healthExclusions';

export type LeadKind = 'report' | 'funding' | 'reward' | 'sanctions' | 'exclusions';
export const LEAD_KINDS: readonly LeadKind[] = ['report', 'funding', 'reward', 'sanctions', 'exclusions'];

/**
 * A place a lead is about, as its record gives it: a jurisdiction code (ISO 3166-1 alpha-2, or a US
 * state as `us-xx`), or a country by the name OFAC writes. The map resolves them (LD2).
 */
export type LeadPlace = { jurisdiction: string } | { countryName: string };

export type LeadRecord =
  | { kind: 'report'; report: IntelReportUI; routing: AudienceRouting }
  | { kind: 'funding'; window: FundingWindow }
  | { kind: 'reward'; programme: RewardProgramme }
  | { kind: 'sanctions'; publication: SanctionsPublication & { via: 'record' | 'file' } }
  | { kind: 'exclusions'; month: ExclusionMonth & { via: 'record' | 'file' } };

export interface Lead {
  /** `<kind>:<the record's own id>`. */
  id: string;
  kind: LeadKind;
  title: string;
  /** When the record is dated, YYYY-MM-DD; absent for a standing programme. */
  date?: string;
  /** When it closes, YYYY-MM-DD, where the record states it. */
  closes?: string;
  /** Who published it, in their own name. */
  source: string;
  /** Where to read it: the record itself, or Starcom's copy of it. */
  url?: string;
  places: LeadPlace[];
  audiences: Archetype[];
  /** Whose word the audiences are: the publisher's, or worked out here. */
  basis: 'declared' | 'derived';
  /** The law and its decider, where the pattern reaches one. Never an amount. */
  statute?: StatuteBasis;
  /** Who decides under it, named as they name themselves. */
  decidedBy: string;
  record: LeadRecord;
}

const day = (date: Date) => (Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10));

export function reportLead({ report, routing }: Routed): Lead {
  const jurisdictions = report.jurisdictions ?? [];
  return {
    id: `report:${report.id}`,
    kind: 'report',
    title: report.title,
    date: day(new Date(report.createdAt)),
    source: report.author,
    url: `/intel?reportId=${encodeURIComponent(report.id)}`,
    places: jurisdictions.map((jurisdiction) => ({ jurisdiction: jurisdiction.toLowerCase() })),
    audiences: routing.archetypes,
    basis: routing.basis === 'declared' ? 'declared' : 'derived',
    ...(routing.statute ? { statute: routing.statute } : {}),
    decidedBy: routing.statute?.decidedBy ?? 'the publisher',
    record: { kind: 'report', report, routing },
  };
}

export function fundingLead(window: FundingWindow): Lead {
  return {
    id: `funding:${window.id}`,
    kind: 'funding',
    title: window.title,
    ...(window.opens ? { date: window.opens } : {}),
    closes: window.closes,
    source: `Grants.gov · ${window.agency || window.agencyCode}`,
    url: window.url,
    // Federal funding, open across the United States: no place of its own.
    places: [],
    audiences: window.audiences,
    basis: 'derived',
    decidedBy: window.agency || window.agencyCode,
    record: { kind: 'funding', window },
  };
}

export function rewardLead(programme: RewardProgramme): Lead {
  return {
    id: `reward:${programme.id}`,
    kind: 'reward',
    title: programme.name,
    source: programme.name,
    url: programme.reference,
    places: [],
    audiences: programme.audiences,
    basis: 'derived',
    // A reward programme is the law the pattern reaches: the programme itself.
    ...(programme.basis ? { statute: { name: programme.basis, decidedBy: programme.decidedBy, reference: programme.reference } } : {}),
    decidedBy: programme.decidedBy,
    record: { kind: 'reward', programme },
  };
}

export function sanctionsLead(publication: SanctionsPublication & { via: 'record' | 'file' }): Lead {
  const countries = [...new Set(publication.named.flatMap((n) => n.countries))];
  return {
    id: `sanctions:${publication.id}`,
    kind: 'sanctions',
    title: `OFAC sanctions changes, ${publication.date}`,
    date: publication.date,
    source: 'OFAC',
    url: `https://ofac.treasury.gov/recent-actions/${publication.date.replace(/-/g, '')}`,
    places: countries.map((countryName) => ({ countryName })),
    audiences: [...SANCTIONS_AUDIENCES],
    basis: 'derived',
    decidedBy: 'OFAC',
    record: { kind: 'sanctions', publication },
  };
}

export function exclusionsLead(month: ExclusionMonth & { via: 'record' | 'file' }): Lead {
  // The states of the organisations named: people are counted, never placed (BF2).
  const states = [...new Set(month.organisations.map((o) => o.state).filter(Boolean))];
  return {
    id: `exclusions:${month.month}`,
    kind: 'exclusions',
    title: `HHS-OIG exclusions, ${month.month}`,
    date: `${month.month}-01`,
    source: 'HHS-OIG',
    url: 'https://oig.hhs.gov/exclusions/supplements.asp',
    places: states.map((state) => ({ jurisdiction: `us-${state.toLowerCase()}` })),
    audiences: [...EXCLUSIONS_AUDIENCES],
    basis: 'derived',
    decidedBy: 'HHS-OIG',
    record: { kind: 'exclusions', month },
  };
}

export interface LeadSources {
  reports: readonly Routed[];
  funding?: FundingWindows | null;
  rewards?: { programmes: RewardProgramme[] } | null;
  sanctions?: SanctionsChanges | null;
  exclusions?: HealthExclusions | null;
}

/** Every lead the desk holds, each once. */
export function leadsFrom(sources: LeadSources): Lead[] {
  return [
    ...sources.reports.map(reportLead),
    ...(sources.funding?.windows ?? []).map(fundingLead),
    ...(sources.rewards?.programmes ?? []).map(rewardLead),
    ...(sources.sanctions?.publications ?? []).map(sanctionsLead),
    ...(sources.exclusions?.months ?? []).map(exclusionsLead),
  ];
}

export type LeadOrder = 'newest' | 'closing';

/**
 * Newest first by the record's date, or the soonest to close first; a lead the order cannot place
 * (no date, or nothing closing) comes after, by title.
 */
export function sortLeads(leads: readonly Lead[], order: LeadOrder): Lead[] {
  const key = (lead: Lead) => (order === 'newest' ? lead.date : lead.closes);
  return [...leads].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka && kb && ka !== kb) return order === 'newest' ? kb.localeCompare(ka) : ka.localeCompare(kb);
    if (ka && !kb) return -1;
    if (!ka && kb) return 1;
    return a.title.localeCompare(b.title);
  });
}

/** The leads offered to any of the audiences chosen; all of them when none is chosen. */
export function leadsFor(leads: readonly Lead[], audiences: ReadonlySet<Archetype>): Lead[] {
  return audiences.size ? leads.filter((lead) => lead.audiences.some((a) => audiences.has(a))) : [...leads];
}

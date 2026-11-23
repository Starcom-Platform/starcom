/**
 * A case started from a lead on the Market Exchange's desk (decision D-LD, LD3), as Diplomacy's drawer
 * starts one from an event (DP7): its title and description say what the lead is, when its record is
 * dated or closes, who published it and who decides; its sources are the lead's own pages on the web,
 * and a report lead is linked by its id. Who it is offered to, and whose word that is, is kept.
 *
 * No amount goes in, and no person: a lead names none (BF2).
 */
import type { CaseSourceInput } from '../../types/intel/IntelCaseUI';
import { ARCHETYPE_LABELS } from './opportunityAudience';
import type { Lead } from './leads';

export interface LeadCaseInput {
  title: string;
  description: string;
  tags: string[];
  sources: CaseSourceInput[];
  /** A report lead's report, as the case's related intel. */
  relatedEntities: string[];
}

const KIND: Record<Lead['kind'], string> = {
  report: 'report', funding: 'funding window', reward: 'reward programme', sanctions: 'sanctions changes', exclusions: 'HHS-OIG exclusions',
};

const isWeb = (url: string | undefined): url is string => !!url && /^https?:\/\//.test(url);

/** The lead's own pages: its record, and where its source says to go next. */
function sourcesOf(lead: Lead): CaseSourceInput[] {
  const r = lead.record;
  const pages: Array<CaseSourceInput | null> = [lead.url ? { url: lead.url, title: lead.title, ...(lead.date ? { reportedAt: `${lead.date}T00:00:00Z` } : {}) } : null];
  if (r.kind === 'reward') pages.push({ url: r.programme.tip.url, title: `${r.programme.name}: tips` });
  if (r.kind === 'sanctions') pages.push({ url: `https://sanctionslistservice.ofac.treas.gov/changes/${r.publication.id}`, title: `OFAC delta file, publication ${r.publication.id}` });
  if (r.kind === 'exclusions') pages.push({ url: 'https://exclusions.oig.hhs.gov/', title: 'HHS-OIG: search the LEIE' });
  // Only pages on the web: a report lead's own page is Starcom's, and the case links the report by id.
  const seen = new Set<string>();
  return pages.filter((p): p is CaseSourceInput => !!p && isWeb(p.url) && !seen.has(p.url) && !!seen.add(p.url));
}

export function caseFromLead(lead: Lead): LeadCaseInput {
  const lines = [
    `A ${KIND[lead.kind]} from the Market Exchange's lead desk: ${lead.title}.`,
    lead.date ? `Dated ${lead.date}.` : null,
    lead.closes ? `Closes ${lead.closes}.` : null,
    `Published by ${lead.source}; decided by ${lead.decidedBy}.`,
    lead.statute ? `${lead.statute.name}, decided by ${lead.statute.decidedBy}.` : null,
    `Offered to ${lead.audiences.map((a) => ARCHETYPE_LABELS[a]).join(', ')}: ${lead.basis === 'declared' ? 'the publisher’s word' : 'worked out by Starcom, not stated by the publisher'}.`,
  ];
  return {
    title: `Lead: ${lead.title}`,
    description: lines.filter(Boolean).join(' '),
    tags: ['lead', `lead-${lead.kind}`, ...lead.audiences.map((a) => `audience:${a}`)],
    sources: sourcesOf(lead),
    relatedEntities: lead.record.kind === 'report' ? [lead.record.report.id] : [],
  };
}

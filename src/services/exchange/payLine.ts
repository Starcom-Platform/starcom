/**
 * What a lead may pay, first on every listing (critique C12, decision CR2).
 *
 * Only what a programme itself publishes, quoted word for word from its own page and linked, never a figure
 * of Starcom's (the board's rule 1: a statute flag never carries an amount of ours). Where a programme
 * publishes nothing, the line says who decides; where nothing is paid, it says so. Amounts a programme states
 * notice by notice reach the board through Mecha Jono's notes (CR2), and until they do, the line says none is
 * listed here yet.
 */
import type { Lead } from './leads';
import { NO_AMOUNTS, type AmountNotes } from './feeds/amountNotes';

const dollars = (usd: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(usd);
const day = (iso: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

export interface PayLine {
  /** `quoted`: the programme's own words. `decider`: who decides, no amount published here. `none`: nothing is paid. */
  kind: 'quoted' | 'decider' | 'none';
  text: string;
  /** Whose words, and where they are, for a quote: `label` names the page a link opens. */
  source?: { by: string; url: string; label: string };
}

/** What a lead may pay; `amounts` are Mecha Jono's notes of what programmes state (CR2), none until they post. */
export function payLineOf(lead: Lead, amounts: AmountNotes = NO_AMOUNTS): PayLine {
  const record = lead.record;
  switch (record.kind) {
    case 'report': {
      const statute = record.routing.statute;
      if (statute?.programmeSays) {
        const { words, by, url } = statute.programmeSays;
        return { kind: 'quoted', text: `“${words}” (${by})`, source: { by, url, label: `the ${by}'s page` } };
      }
      if (statute) return { kind: 'decider', text: `Decided by ${statute.decidedBy}; no amount is published here.` };
      return { kind: 'none', text: 'No reward programme: public-interest work.' };
    }
    case 'funding': {
      const award = record.window.number ? amounts.awards.get(record.window.number) : undefined;
      if (award?.ceiling !== undefined || award?.floor !== undefined) {
        const said = [award.ceiling !== undefined ? `Award ceiling ${dollars(award.ceiling)}` : null, award.floor !== undefined ? `floor ${dollars(award.floor)}` : null]
          .filter(Boolean).join(', ');
        return {
          kind: 'quoted',
          text: `${said.charAt(0).toUpperCase()}${said.slice(1)}, as Grants.gov lists it${amounts.awardsAsOf ? ` (read ${day(amounts.awardsAsOf)})` : ''}.`,
          source: { by: 'Grants.gov', url: record.window.url, label: 'the opportunity on Grants.gov' },
        };
      }
      return { kind: 'decider', text: `${record.window.agency || 'The agency'} sets the award on the notice's terms; no amount is listed here yet.` };
    }
    case 'reward': {
      const stated = amounts.rewards.get(record.programme.id);
      if (stated) {
        const most = stated.upTo[0];
        const highest = Math.max(...stated.upTo.map((a) => a.usd));
        return {
          kind: 'quoted',
          text: `Up to ${dollars(most.usd)} on ${most.notices} of its notices${highest > most.usd ? `, and up to ${dollars(highest)} at most` : ''}, as they state (read ${day(stated.asOf)}).`,
          source: { by: record.programme.name, url: record.programme.reference, label: "the programme's page" },
        };
      }
      const decider = record.programme.decidedBy;
      return { kind: 'decider', text: `${decider.charAt(0).toUpperCase()}${decider.slice(1)} decides any reward and its amount; none is listed here yet.` };
    }
    case 'sanctions':
    case 'exclusions':
      return { kind: 'none', text: 'Pays nothing: a public record to work from.' };
  }
}

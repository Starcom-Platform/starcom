/**
 * Funding windows from Grants.gov (decision D-BF, BF4): posted and forecast opportunities in the
 * funding categories the board's audiences work in, by their closing dates. Read by the browser when
 * the board opens: Grants.gov's `search2` answers any site, though only to a plain-text POST (its
 * JSON preflight is refused). Three requests, about 116 KB on 2026-10-13.
 *
 * The audiences are worked out here from Grants.gov's funding category, and the board says so. No
 * statute is named: a grant is the agency's to award, on the notice's terms.
 */
import type { Archetype } from '../opportunityAudience';
import { decodeHtmlEntities } from '../../../utils/htmlEntities';

export const GRANTS_SEARCH_URL = 'https://api.grants.gov/v1/api/search2';

/** Grants.gov's funding categories read, and who each is offered to. */
export const FUNDING_CATEGORIES: Readonly<Record<string, { name: string; audiences: Archetype[] }>> = {
  ST: { name: 'Science and technology research', audiences: ['strategic_consultant', 'academic_researcher'] },
  LJL: { name: 'Law, justice and legal services', audiences: ['public_interest_attorney'] },
  IS: { name: 'Information and statistics', audiences: ['academic_researcher', 'journalist'] },
};

export interface FundingWindow {
  id: string;
  number: string;
  title: string;
  agency: string;
  agencyCode: string;
  /** When it opened (or, forecast, is to open), as Grants.gov states it, YYYY-MM-DD; '' when not stated. */
  opens: string;
  /** The closing date as Grants.gov states it, YYYY-MM-DD. */
  closes: string;
  status: 'posted' | 'forecasted';
  /** The categories it was found under, and so who it is offered to. */
  categories: string[];
  audiences: Archetype[];
  url: string;
}

export interface FundingWindows {
  /** Open on or after `today`, the soonest to close first. */
  windows: FundingWindow[];
  /** Forecast with no closing date yet: counted, never placed on the timeline. */
  undated: number;
  /** The UTC day they were read against, YYYY-MM-DD. */
  today: string;
}

interface Hit {
  id?: unknown;
  number?: unknown;
  title?: unknown;
  agency?: unknown;
  agencyCode?: unknown;
  openDate?: unknown;
  closeDate?: unknown;
  oppStatus?: unknown;
}

/** Grants.gov writes dates MM/DD/YYYY. */
function isoDate(value: unknown): string | null {
  const m = typeof value === 'string' ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim()) : null;
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

/** One list from the categories' answers: each opportunity once, the soonest to close first. */
export function fundingWindowsOf(byCategory: Readonly<Record<string, readonly Hit[]>>, now: Date): FundingWindows {
  const today = now.toISOString().slice(0, 10);
  const found = new Map<string, FundingWindow>();
  const undated = new Set<string>();
  for (const [category, hits] of Object.entries(byCategory)) {
    const audiences = FUNDING_CATEGORIES[category]?.audiences ?? [];
    for (const hit of hits) {
      const id = typeof hit.id === 'string' || typeof hit.id === 'number' ? String(hit.id) : '';
      // Grants.gov sends titles and agencies with HTML's character references in them.
      const title = typeof hit.title === 'string' ? decodeHtmlEntities(hit.title).trim() : '';
      if (!id || !title) continue;
      const closes = isoDate(hit.closeDate);
      if (!closes) {
        undated.add(id);
        continue;
      }
      if (closes < today) continue;
      const held = found.get(id);
      if (held) {
        held.categories = [...new Set([...held.categories, category])];
        held.audiences = [...new Set([...held.audiences, ...audiences])];
        continue;
      }
      found.set(id, {
        id,
        number: typeof hit.number === 'string' ? hit.number : '',
        title,
        agency: typeof hit.agency === 'string' ? decodeHtmlEntities(hit.agency) : '',
        agencyCode: typeof hit.agencyCode === 'string' ? hit.agencyCode : '',
        opens: isoDate(hit.openDate) ?? '',
        closes,
        status: hit.oppStatus === 'forecasted' ? 'forecasted' : 'posted',
        categories: [category],
        audiences: [...audiences],
        url: `https://www.grants.gov/search-results-detail/${encodeURIComponent(id)}`,
      });
    }
  }
  const windows = [...found.values()].sort((a, b) => a.closes.localeCompare(b.closes) || a.title.localeCompare(b.title));
  return { windows, undated: undated.size, today };
}

/** Whole days from `today` to `closes`, both YYYY-MM-DD. */
export function daysUntil(closes: string, today: string): number {
  return Math.round((Date.parse(`${closes}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

export type PostJson = (url: string, body: string) => Promise<unknown>;

const postDefault: PostJson = async (url, body) => {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body });
  if (!response.ok) throw new Error(`Grants.gov answered ${response.status}`);
  return response.json();
};

/** Each category's posted and forecast opportunities; throws when any category does not answer. */
export async function readFundingWindows(post: PostJson = postDefault, now = new Date()): Promise<FundingWindows> {
  const entries = await Promise.all(Object.keys(FUNDING_CATEGORIES).map(async (category) => {
    const answer = await post(GRANTS_SEARCH_URL, JSON.stringify({ rows: 1000, oppStatuses: 'forecasted|posted', fundingCategories: category }));
    const hits = (answer as { data?: { oppHits?: unknown } })?.data?.oppHits;
    if (!Array.isArray(hits)) throw new Error(`Grants.gov sent no opportunities for ${category}`);
    return [category, hits as Hit[]] as const;
  }));
  return fundingWindowsOf(Object.fromEntries(entries), now);
}

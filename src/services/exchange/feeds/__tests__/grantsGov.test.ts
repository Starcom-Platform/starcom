import { describe, expect, it, vi } from 'vitest';
import { daysUntil, fundingWindowsOf, readFundingWindows, GRANTS_SEARCH_URL } from '../grantsGov';

const hit = (id: string, closeDate: string, over: Record<string, unknown> = {}) => ({
  id, number: `N-${id}`, title: `Opportunity ${id}`, agency: 'National Science Foundation', agencyCode: 'NSF', openDate: '09/01/2026', closeDate, oppStatus: 'posted', ...over,
});
const NOW = new Date('2026-10-13T20:00:00Z');

describe('fundingWindowsOf', () => {
  const read = fundingWindowsOf({
    ST: [hit('3', '11/02/2026'), hit('1', '10/14/2026'), hit('9', '', { oppStatus: 'forecasted' }), hit('old', '10/12/2026')],
    LJL: [hit('2', '10/13/2026', { agency: 'Bureau of Justice Assistance' }), hit('3', '11/02/2026')],
    IS: [hit('9', '', { oppStatus: 'forecasted' }), hit('', '10/20/2026'), hit('x', 'soon')],
  }, NOW);

  it('lists each opportunity once, the soonest to close first, from today on', () => {
    expect(read.windows.map((w) => w.id)).toEqual(['2', '1', '3']);
    expect(read.windows[1]).toMatchObject({ opens: '2026-09-01', closes: '2026-10-14', number: 'N-1', url: 'https://www.grants.gov/search-results-detail/1' });
  });

  it("offers each to the audiences of every category it was found under", () => {
    const both = read.windows.find((w) => w.id === '3')!;
    expect(both.categories).toEqual(['ST', 'LJL']);
    expect(both.audiences).toEqual(['strategic_consultant', 'academic_researcher', 'public_interest_attorney']);
  });

  it("reads Grants.gov's character references as text", () => {
    const [w] = fundingWindowsOf({ ST: [hit('7', '12/01/2026', { title: 'Program Award &ndash; Rare Melanomas&#8203;', agency: 'Research &amp; Development' })] }, NOW).windows;
    expect(w.title).toBe('Program Award – Rare Melanomas');
    expect(w.agency).toBe('Research & Development');
  });

  it('counts a forecast with no closing date once, and never places it', () => {
    expect(read.undated).toBe(2);
    expect(read.today).toBe('2026-10-13');
  });
});

describe('daysUntil', () => {
  it('counts whole UTC days', () => {
    expect(daysUntil('2026-10-13', '2026-10-13')).toBe(0);
    expect(daysUntil('2026-11-02', '2026-10-13')).toBe(20);
  });
});

describe('readFundingWindows', () => {
  it("asks for each category's posted and forecast opportunities as plain text, which Grants.gov answers any site", async () => {
    const post = vi.fn(async (_url: string, _body: string) => ({ data: { oppHits: [hit('1', '10/30/2026')] } }));
    const read = await readFundingWindows(post, NOW);
    expect(post.mock.calls.map(([url, body]) => [url, JSON.parse(body).fundingCategories, JSON.parse(body).oppStatuses])).toEqual([
      [GRANTS_SEARCH_URL, 'ST', 'forecasted|posted'],
      [GRANTS_SEARCH_URL, 'LJL', 'forecasted|posted'],
      [GRANTS_SEARCH_URL, 'IS', 'forecasted|posted'],
    ]);
    expect(read.windows).toHaveLength(1);
  });

  it('sends it as text/plain, the one way a browser may ask: the JSON preflight is refused', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { oppHits: [] } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await readFundingWindows(undefined, NOW);
      expect(fetchMock).toHaveBeenCalledWith(GRANTS_SEARCH_URL, expect.objectContaining({ method: 'POST', headers: { 'Content-Type': 'text/plain' } }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('fails when a category sends no list, rather than showing part as the whole', async () => {
    const post = vi.fn(async (_url: string, body: string) => (JSON.parse(body).fundingCategories === 'LJL' ? { errorcode: 1 } : { data: { oppHits: [] } }));
    await expect(readFundingWindows(post, NOW)).rejects.toThrow(/LJL/);
  });
});

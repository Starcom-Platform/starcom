/**
 * Who a record is offered to, and on what legal basis — never for how much.
 *
 * ─── WHAT THIS IS FOR ──────────────────────────────────────────────────────
 *
 * The Intelligence Market Exchange is being rebuilt from a trading floor into
 * an opportunity board: a free surface where people who work for reward — ex
 * military, ex police, ex intelligence, private investigators, whitehat
 * researchers, recovery agents, strategic consultants — can find the work that
 * pays, without anyone asserting what it pays.
 *
 * The intel to route was already arriving. From a live ingest on 2026-09-23:
 *
 *   "Dubai Enterprises Co was paid $25,242 across 1 federal award(s) while
 *    carrying a Reciprocal exclusion"
 *
 * A contractor paid federal money while carrying an exclusion is the shape the
 * False Claims Act exists for. It was being drawn as an anonymous dot.
 *
 * ─── THE RULES, WHICH ARE THE POINT ────────────────────────────────────────
 *
 * 1. A statute flag NEVER carries an amount. This is the peer's own sentence,
 *    promoted to a binding constraint on both nodes in spec rev 7: "a flag
 *    names the statute and who decides; it never states an amount, an
 *    eligibility or a promise." It is also why NIP-99's kind 30402 was
 *    rejected — its `price` tag is required.
 *
 *    A figure OBSERVED in the record ("was paid $25,242") is a fact about the
 *    record and may be shown. A figure attached to the STATUTE would be a
 *    promise about what a reader would receive, and this node does not make
 *    those. The distinction is the whole rule, so it is tested directly.
 *
 * 2. Declared beats derived, and derived says so. A publisher who tags their
 *    own audience is authoritative. Anything this node works out for itself is
 *    marked `derived` so a reader can tell a routing guess from the author's
 *    own words — the same commitment that makes the attestation model work:
 *    weight is derived by the consumer, never asserted by the author.
 *
 * 3. Name a statute only where the pattern genuinely reaches it. Over-naming
 *    would be the "imply the cause" failure the epistemic vocabulary exists to
 *    prevent. A charity losing its exemption is not a False Claims Act matter,
 *    and a test holds that line.
 */
import { describe, it, expect } from 'vitest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { routeToAudiences, ARCHETYPES, DERIVABLE_ARCHETYPES } from '../opportunityAudience';

const report = (over: Partial<IntelReportUI> = {}): IntelReportUI => ({
  id: 'r-1',
  title: 'A record',
  content: '',
  author: 'Starcom',
  category: 'general',
  tags: [],
  createdAt: new Date('2026-09-23T00:00:00Z'),
  updatedAt: new Date('2026-09-23T00:00:00Z'),
  status: 'DRAFT',
  ...over,
} as IntelReportUI);

const exclusionRecord = () => report({
  id: 'r-exclusion',
  title: 'Dubai Enterprises Co was paid $25,242 across 1 federal award(s) while carrying a Reciprocal exclusion',
  content: 'Award records show payment during a period in which an exclusion was recorded against the entity.',
});

describe('a statute flag never carries an amount', () => {
  it('names the statute and who decides, and nothing about money', () => {
    const routing = routeToAudiences(exclusionRecord());

    expect(routing.statute).toBeDefined();
    expect(routing.statute?.name).toMatch(/False Claims Act/i);
    expect(routing.statute?.decidedBy).toBeTruthy();

    // The binding constraint. If a currency figure, a percentage or a range
    // ever appears in the statute block, this node has started making promises.
    const asText = JSON.stringify(routing.statute);
    expect(asText).not.toMatch(/\$|\bUSD\b|\d+\s*%|percent/i);
  });

  it('still lets the record state a figure it OBSERVED', () => {
    // "was paid $25,242" is a fact about the award, not a promise to a reader.
    // Refusing it would make the board useless; asserting it as a reward would
    // break rule 1. The figure stays in the record, out of the statute.
    const routing = routeToAudiences(exclusionRecord());
    expect(routing.pattern).toBeTruthy();
    expect(JSON.stringify(routing.statute)).not.toContain('25,242');
  });

  it('exposes no reward, payout or bounty field at all', () => {
    // Absent by construction, so a field cannot be added later and leak.
    const routing = routeToAudiences(exclusionRecord()) as Record<string, unknown>;
    for (const forbidden of ['reward', 'payout', 'bounty', 'amount', 'price', 'value']) {
      expect(Object.keys(routing)).not.toContain(forbidden);
    }
  });
});

describe('declared beats derived, and derived says so', () => {
  it('takes the publisher\'s own audience tag as authoritative', () => {
    const routing = routeToAudiences(report({
      tags: ['audience:journalist', 'audience:citizen_osint'],
      title: 'Dubai Enterprises Co was paid $25,242 while carrying a Reciprocal exclusion',
    }));

    expect(routing.basis).toBe('declared');
    expect(routing.archetypes).toEqual(expect.arrayContaining(['journalist', 'citizen_osint']));
  });

  it('marks its own inference as derived, never as the author\'s word', () => {
    const routing = routeToAudiences(exclusionRecord());
    expect(routing.basis).toBe('derived');
  });

  it('says nothing rather than guessing when a record matches nothing', () => {
    const routing = routeToAudiences(report({ title: 'Weather over the channel', content: 'Fog.' }));
    expect(routing.basis).toBe('none');
    expect(routing.archetypes).toEqual([]);
    expect(routing.statute).toBeUndefined();
  });

  it('ignores an unknown archetype rather than inventing one', () => {
    const routing = routeToAudiences(report({ tags: ['audience:time_traveller'] }));
    expect(routing.archetypes).toEqual([]);
    expect(routing.basis).toBe('none');
  });
});

describe('a statute is named only where the pattern reaches it', () => {
  it('does NOT call a lapsed charity exemption a False Claims Act matter', () => {
    // Failing to file is not fraud, and saying so would be the "imply the
    // cause" failure the epistemic vocabulary exists to prevent.
    const routing = routeToAudiences(report({
      id: 'r-charity',
      title: '7 charities in Brooklyn Park, MN lost their 501(c)(3) exemption in the last 18 months',
      content: 'Automatic revocation follows three consecutive years without a required filing.',
    }));

    expect(routing.statute).toBeUndefined();
    // Still worth routing — it is public-interest work, just not reward-bearing.
    expect(routing.archetypes).toEqual(expect.arrayContaining(['journalist']));
  });

  it('does not attach a statute to an ordinary funding notice', () => {
    const routing = routeToAudiences(report({
      title: "'FY 2024 - 2026 Broad Agency Announcement' closes in 8 day(s)",
    }));
    expect(routing.statute).toBeUndefined();
  });

});

/**
 * Found by the critique audit of 2026-10-01 (docs/missions/00-current-state/
 * critique-audit.md, section 9). Rule 2 read only Starcom's own tags, while a
 * network report keeps its publisher's `t` tags apart, in `hashtags`, so a peer's
 * declared audience was never seen. Rule 3 rested on patterns loose enough to
 * name the False Claims Act on a maritime exclusion zone. And one pattern
 * looked for "UEI" in text it had already lowercased.
 */
describe('a publisher\'s declared audience, as it arrives from the network', () => {
  const fromNetwork = (hashtags: string[], over: Partial<IntelReportUI> = {}) => report({
    tags: ['nostr', 'relay:wss://record.cosmiccodex.app'],
    hashtags,
    ...over,
  });

  it('is read from the publisher\'s own tags, where the ingest keeps them', () => {
    const routing = routeToAudiences(fromNetwork(['starcom_intel', 'audience:journalist', 'audience:citizen_osint']));
    expect(routing.basis).toBe('declared');
    expect(routing.archetypes).toEqual(['journalist', 'citizen_osint']);
  });

  it('outranks a derivation the same record would otherwise get', () => {
    const routing = routeToAudiences(fromNetwork(['audience:journalist'], { title: exclusionRecord().title }));
    expect(routing).toEqual({ archetypes: ['journalist'], basis: 'declared' });
  });

  it('reads their spelling white_hat as security research', () => {
    expect(routeToAudiences(fromNetwork(['audience:white_hat'])).archetypes).toEqual(['whitehat']);
  });

  it('reads their public_interest_attorney as an audience of its own (D-BF, BF6)', () => {
    expect(routeToAudiences(fromNetwork(['audience:public_interest_attorney']))).toEqual({ archetypes: ['public_interest_attorney'], basis: 'declared' });
  });

  it('still reads a local report\'s own tags', () => {
    expect(routeToAudiences(report({ tags: ['audience:private_investigator'] })).basis).toBe('declared');
  });
});

describe('the patterns reach only what they name', () => {
  const routed = (title: string, content = '') => routeToAudiences(report({ title, content }));

  it('names the False Claims Act for federal awards paid during a recorded exclusion', () => {
    expect(routed(exclusionRecord().title).statute?.name).toMatch(/False Claims Act/);
    expect(routed('Acme LLC received 2 federal awards during an active SAM exclusion').statute?.name).toMatch(/False Claims Act/);
  });

  it('does not name it for an exclusion zone, an award of another kind, or either alone', () => {
    for (const title of [
      'Navy awards contract to patrol the maritime exclusion zone',
      'Workers were paid to clear the exclusion zone around the reactor',
      'Festival wins an award despite exclusion from the city programme',
      'Acme LLC was paid $3,000 across 2 federal award(s)',
      'Acme LLC carries a Reciprocal exclusion',
      // Each one condition away from a match:
      '2 federal awards fund a study of school exclusion policies', // an exclusion, but not a contractor's
      '2 federal awards fund patrols of the active exclusion zone', // a zone, however it is qualified
      'Acme LLC won an industry award while carrying a Reciprocal exclusion', // an award, but not federal money
    ]) {
      expect(routed(title).statute, title).toBeUndefined();
    }
  });

  it('reads a funding window only where a closing date or a funding notice is stated', () => {
    expect(routed("'FY 2024 - 2026 Broad Agency Announcement' closes in 8 day(s)").archetypes).toContain('strategic_consultant');
    expect(routed("'Limited Competition: Small Grant Program for the NCATS Clinical and Tr' closes in 23 day(s)").archetypes).toContain('strategic_consultant');
    expect(routed('Notice of Funding Opportunity: community resilience grants').archetypes).toContain('strategic_consultant');
    expect(routed('Press announcement: the festival line-up').basis).toBe('none');
    expect(routed('Club announcement: new opening hours').basis).toBe('none');
  });

  it("keeps the record's own words the pattern was found in, as the record writes them (D-LD)", () => {
    expect(routed(exclusionRecord().title).matched).toBe('Reciprocal exclusion');
    expect(routed('7 charities in Brooklyn Park, MN lost their 501(c)(3) exemption').matched).toBe('lost their 501(c)(3) exemption');
    expect(routed("'FY 2024 - 2026 Broad Agency Announcement' closes in 8 day(s)").matched).toBe('Broad Agency Announcement');
  });

  it('finds a declared parent by its UEI, in any case', () => {
    expect(routed('Acme Holdings declared parent Big Corp', 'Parent UEI ABC123DEF456').archetypes).toContain('private_investigator');
  });
});

describe('every archetype it offers can be reached', () => {
  it('each by a publisher declaring it', () => {
    for (const archetype of ARCHETYPES) {
      expect(routeToAudiences(report({ tags: [`audience:${archetype}`] })).archetypes, archetype).toEqual([archetype]);
    }
  });

  it('and these by what this node can work out itself; the rest only by declaration', () => {
    expect([...DERIVABLE_ARCHETYPES].sort()).toEqual(
      ['citizen_osint', 'journalist', 'private_investigator', 'qui_tam_relator', 'reward_hunter', 'strategic_consultant'],
    );
  });
});

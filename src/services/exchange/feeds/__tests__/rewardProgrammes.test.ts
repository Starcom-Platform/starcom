import { describe, expect, it, vi } from 'vitest';
import { FBI_WANTED_URL, RFJ_API, readFbiProgramme, readRewardProgrammes, readRfjProgramme, rfjOriginParam, type RewardSources } from '../rewardProgrammes';

const FBI_TOTALS: Record<string, number> = { ten: 13, terrorist: 22, fraudster: 17, information: 288, default: 723, missing: 142, kidnapping: 12, ecap: 12 };
// A notice the API sends beside each total, whatever is asked: never read.
const NOTICE = { title: 'A PERSON', reward_text: 'up to $10,000', images: [{}] };

const RFJ_TERMS: Record<string, Array<{ id: number; slug: string; count: number }>> = {
  'crime-category': [{ id: 1, slug: 'acts-of-terrorism', count: 36 }, { id: 2, slug: 'organization', count: 45 }, { id: 3, slug: 'individual', count: 97 }, { id: 4, slug: 'terrorism-financing', count: 41 }],
  cyber: [{ id: 5, slug: 'critical-infrastructure', count: 17 }, { id: 6, slug: 'critical-infrastructure-individual', count: 33 }],
  dprk: [{ id: 7, slug: 'north-korea', count: 5 }, { id: 8, slug: 'north-korea-individual', count: 6 }],
  'election-interference': [{ id: 9, slug: 'election-interference', count: 6 }, { id: 10, slug: 'election-interference-individual', count: 13 }],
  'hostages-kidnapping': [{ id: 5231, slug: 'hostages-kidnapping', count: 16 }],
};

const sources = (over: Partial<RewardSources> = {}) => {
  const asked: string[] = [];
  const s: RewardSources = {
    json: vi.fn(async (url: string) => {
      asked.push(url);
      if (url.startsWith(FBI_WANTED_URL)) {
        const kind = new URL(url).searchParams.get('poster_classification')!;
        return { total: FBI_TOTALS[kind], items: [NOTICE] };
      }
      const taxonomy = url.slice(RFJ_API.length + 1).split('?')[0];
      if (!url.endsWith('&starcom_origin=starcom.app')) throw new Error(`asked without the site: ${url}`);
      return RFJ_TERMS[taxonomy];
    }),
    header: vi.fn(async (url: string) => {
      asked.push(url);
      if (!url.endsWith('&starcom_origin=starcom.app')) throw new Error(`asked without the site: ${url}`);
      return url.includes('hostages-kidnapping_exclude=5231') ? '272' : '288';
    }),
    ...over,
  };
  return { s, asked };
};

describe('the FBI programme', () => {
  it('counts each classification by one total, and never asks for missing people, kidnappings or children', async () => {
    const { s, asked } = sources();
    const fbi = await readFbiProgramme(s);
    expect(asked.map((u) => new URL(u).searchParams.get('poster_classification'))).toEqual(['ten', 'terrorist', 'fraudster', 'information', 'default']);
    expect(asked.every((u) => new URL(u).searchParams.get('pageSize') === '1')).toBe(true);
    expect(fbi.kinds.map((k) => [k.label, k.count])).toEqual([
      ['Ten Most Wanted', 13], ['Most Wanted Terrorists', 22], ['Most wanted white-collar fugitives', 17], ['Seeking information', 288], ['Other wanted notices', 723],
    ]);
    expect(fbi.total).toBe(1063);
  });

  it('carries no one: no name, picture or amount from the notice sent beside each total', async () => {
    const fbi = JSON.stringify(await readFbiProgramme(sources().s));
    expect(fbi).not.toMatch(/A PERSON|10,000|images/);
  });

  it('fails when a total does not read, rather than counting it as none', async () => {
    const { s } = sources({ json: vi.fn(async () => ({ items: [NOTICE] })) });
    await expect(readFbiProgramme(s)).rejects.toThrow(/count/);
  });
});

describe('Rewards for Justice', () => {
  it('counts its kinds from the category terms, which carry no notice', async () => {
    const { s, asked } = sources();
    const rfj = await readRfjProgramme(s, rfjOriginParam('starcom.app'));
    expect(rfj.kinds.map((k) => [k.label, k.count])).toEqual([
      ['Terrorism financing', 41], ['Acts of terrorism', 36], ['Cyber attacks on critical infrastructure', 50], ['North Korea', 11], ['Election interference', 19],
    ]);
    expect(asked.filter((u) => u.includes('/rewards?'))).toEqual([`${RFJ_API}/rewards?per_page=1&_fields=id&hostages-kidnapping_exclude=5231&starcom_origin=starcom.app`]);
  });

  it('gives its total less the hostage cases, and the law and the decider it names', async () => {
    const rfj = await readRfjProgramme(sources().s, rfjOriginParam('starcom.app'));
    expect(rfj.total).toBe(272);
    expect(rfj.basis).toMatch(/22 U\.S\.C\. §2708/);
    expect(rfj.decidedBy).toBe('the U.S. Secretary of State');
  });
});

describe("Rewards for Justice's CDN, which keeps the first site's CORS header an hour", () => {
  it('is asked for a copy of its own by each site', () => {
    expect(rfjOriginParam('starcom.app')).toBe('&starcom_origin=starcom.app');
    expect(rfjOriginParam('localhost:5230')).toBe('&starcom_origin=localhost%3A5230');
    expect(rfjOriginParam('')).toBe('&starcom_origin=starcom');
  });
});

describe('readRewardProgrammes', () => {
  it('keeps the programme that answers and names the one that did not', async () => {
    const { s } = sources();
    const json = s.json;
    s.json = vi.fn(async (url: string) => {
      if (url.startsWith(RFJ_API)) throw new Error('rewardsforjustice.net answered 503');
      return json(url);
    });
    const read = await readRewardProgrammes(s);
    expect(read.programmes.map((p) => p.id)).toEqual(['fbi']);
    expect(read.failed).toEqual(['Rewards for Justice']);
  });

  it('states no amount anywhere', async () => {
    const read = await readRewardProgrammes(sources().s);
    expect(JSON.stringify(read)).not.toMatch(/\$|amount|reward_max|reward_min/i);
  });
});

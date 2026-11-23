/**
 * A portfolio as its intern hands it over (decision D-EX, EX12, EX20, EX29): one HTML page an advisor
 * reads without anything else, carrying the exact signed record of the work and its own checker; and
 * the same record as JSON. Every word is the page's text, never its markup.
 *
 * @vitest-environment node
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey, nip19, verifyEvent } from 'nostr-tools';
import { portfolioJsonFile, renderPortfolioHtml, signPortfolio } from '../renderPortfolio';
import { verifyNostrEvents } from '../portfolioVerifier';
import type { Portfolio } from '../gatherPortfolio';
import { APP_KINDS } from '../../nostr/kindRegistry';

const secret = generateSecretKey();
const KEY = getPublicKey(secret);
const sign = async (e: { kind: number; created_at: number; tags: string[][]; content: string }) => finalizeEvent(e, secret);
const published = finalizeEvent({ kind: 30082, created_at: 1_791_900_000, tags: [['d', 'x']], content: '{}' }, secret);

const portfolio: Portfolio = {
  format: 'starcom.portfolio', version: 1, key: KEY, madeAt: '2026-12-20T10:00:00.000Z',
  items: [
    { kind: 'report', at: '2026-12-03T10:00:00.000Z', shown: true, title: 'Flood <img src=x onerror="steal()">', text: '</script><script>steal()</script> The river rose.', status: 'PUBLISHED' },
    { kind: 'case', at: '2026-12-02T10:00:00.000Z', shown: false, listedBecause: 'Private' },
    { kind: 'claim', at: '2026-12-05T10:00:00.000Z', shown: true, title: 'Case C-1 position', text: '{}', eventIds: [published.id] },
  ],
  events: [published],
  read: { relays: ['wss://record.cosmiccodex.app'], complete: true },
};

const embedded = (html: string) => {
  const match = /<script type="application\/octet-stream" id="portfolio-data">([^<]*)<\/script>/.exec(html);
  return JSON.parse(Buffer.from(match![1], 'base64').toString('utf8')) as { portfolio: string; attestation: ReturnType<typeof finalizeEvent> };
};

describe('signPortfolio', () => {
  it('signs the portfolio\'s exact text: an attestation of its own kind naming the text\'s SHA-256', async () => {
    const { text, attestation } = await signPortfolio(portfolio, sign, () => new Date('2026-12-20T10:00:00.000Z'));
    expect(text).toBe(JSON.stringify(portfolio));
    expect(attestation.kind).toBe(APP_KINDS.PORTFOLIO_ATTESTATION);
    expect(attestation.kind).toBeGreaterThanOrEqual(20000);
    expect(attestation.kind).toBeLessThan(30000);
    expect(attestation.tags).toContainEqual(['x', createHash('sha256').update(text).digest('hex')]);
    expect(attestation.pubkey).toBe(KEY);
    expect(verifyEvent(attestation)).toBe(true);
  });
});

describe('renderPortfolioHtml', () => {
  it('is readable as it stands: the key, the work in full where shown, the rest listed, every word as text', async () => {
    const signed = await signPortfolio(portfolio, sign);
    const html = renderPortfolioHtml(signed, portfolio, { name: 'Ada' });
    expect(html).toContain(nip19.npubEncode(KEY));
    expect(html).toContain('Ada');
    expect(html).toContain('Flood &lt;img src=x onerror=&quot;steal()&quot;&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;/script&gt;&lt;script&gt;steal()&lt;/script&gt; The river rose.');
    expect(html).toContain('A Private case, opened 2 Dec 2026');
    expect(html.match(/<script(?![^>]*application\/octet-stream)/g)).toHaveLength(1);
  });

  it('carries the exact signed text, which matches its attestation, and every event in it checks', async () => {
    const signed = await signPortfolio(portfolio, sign);
    const carried = embedded(renderPortfolioHtml(signed, portfolio, {}));
    expect(carried.portfolio).toBe(signed.text);
    expect(carried.attestation.tags).toContainEqual(['x', createHash('sha256').update(carried.portfolio).digest('hex')]);
    const events = [...(JSON.parse(carried.portfolio) as Portfolio).events, carried.attestation];
    expect((await verifyNostrEvents(events)).every((r) => r.ok)).toBe(true);
  });

  it('puts its checker in the page by its source', async () => {
    const html = renderPortfolioHtml(await signPortfolio(portfolio, sign), portfolio, {});
    expect(html).toContain('BIP0340/challenge');
    expect(html).toContain('Check every signature');
  });
});

describe('portfolioJsonFile', () => {
  it('is the signed text and its attestation, so anyone can hash the one and check the other', async () => {
    const signed = await signPortfolio(portfolio, sign);
    const file = JSON.parse(portfolioJsonFile(signed));
    // A plain copy: nostr-tools marks a signed event with a property JSON does not carry.
    expect(file).toEqual({ format: 'starcom.portfolio.signed', portfolio: signed.text, attestation: JSON.parse(JSON.stringify(signed.attestation)) });
  });
});

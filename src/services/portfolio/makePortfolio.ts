/**
 * Making a portfolio in the app (decision D-EX, EX12, EX20, EX26, EX28–EX31): the key's work gathered
 * from this browser and from Starcom's public relays, signed by the key at the person's click, written
 * as the page and its JSON record.
 *
 * The public relays are where public work goes: Starcom's publish relays, and the ones it reads, never
 * the team's internal relays, which carry Limited work (EX28, EX30). The read is bounded: a relay that
 * does not answer within READ_LIMIT_MS ends it, and the portfolio says it may be missing published work
 * rather than looking whole.
 */
import type { Event, Filter } from 'nostr-tools';
import { evidenceStore } from '../../extension/evidenceStore';
import { EVIDENCE_TAG } from '../../extension/evidenceItems';
import { intelReportService } from '../intel/IntelReportService';
import { intelWorkspaceManager } from '../intel/IntelWorkspaceManager';
import { nostrIdentityService } from '../identity/NostrIdentityService';
import { ownName } from '../identity/names';
import { DEFAULT_READ_RELAYS, internalRelays, publishRelays } from '../nostr/publishTargets';
import { readComplete } from '../nostr/readComplete';
import { createRelayPool } from '../nostr/relayPool';
import { gatherPortfolio, type Portfolio } from './gatherPortfolio';
import { portfolioJsonFile, renderPortfolioHtml, signPortfolio, type SignedPortfolio } from './renderPortfolio';

/** How long the relays may take to send everything the key published. */
export const READ_LIMIT_MS = 45_000;

const sameRelay = (url: string) => url.trim().replace(/\/+$/, '').toLowerCase();

/** Where public work is: the publish relays and the read relays, never the internal ones. */
export function publicRelays(
  lists: { publish: string[][]; read: readonly string[]; internal: string[] } = {
    publish: [publishRelays('INTEL'), publishRelays('FINDING'), publishRelays('MISSION')],
    read: DEFAULT_READ_RELAYS,
    internal: internalRelays(),
  },
): string[] {
  const internal = new Set(lists.internal.map(sameRelay));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const relay of [...lists.publish.flat(), ...lists.read]) {
    const key = sameRelay(relay);
    if (internal.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(relay.trim());
  }
  return out;
}

/** What Starcom publishes, by kind: reports, claims, refutations, mission packages, comments and verdicts. */
export function publishedFilters(key: string): Filter[] {
  return [
    { kinds: [30023], authors: [key], '#t': ['starcom_intel'] },
    ...[30082, 30083, 30079, 1111, 1985].map((kind) => ({ kinds: [kind], authors: [key] })),
  ];
}

/** What a key published, read whole from the relays, or as far as the read got, saying why. */
export function readPublished(
  key: string,
  relays: string[],
  read: typeof readComplete = (pool, r, filters, handlers) => readComplete(pool, r, filters, handlers),
  pool: Parameters<typeof readComplete>[0] = createRelayPool(),
  limitMs = READ_LIMIT_MS,
): Promise<{ events: Event[]; complete: boolean; relays: string[]; note?: string }> {
  return new Promise((resolve) => {
    const events: Event[] = [];
    let done = false;
    let reading: { close(): void } | null = null;
    const finish = (complete: boolean, note?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reading?.close();
      resolve({ events, complete, relays, ...(note ? { note } : {}) });
    };
    const timer = setTimeout(() => finish(false, `the relays had not sent everything after ${limitMs / 1000} s`), limitMs);
    reading = read(pool, relays, publishedFilters(key), {
      onevent: (event) => { events.push(event); },
      oncomplete: () => finish(true),
      onfail: (reasons) => finish(false, reasons.map((r) => `${r.url}: ${r.reason}`).join('; ')),
    });
    if (done) reading.close();
  });
}

export interface MadePortfolio {
  portfolio: Portfolio;
  signed: SignedPortfolio;
  html: string;
  json: string;
}

/** The person's portfolio, signed by their key at their click. Refused when this browser has no key. */
export async function makePortfolio(): Promise<MadePortfolio> {
  const { pubkey } = await nostrIdentityService.whoAmI();
  if (!pubkey) throw new Error('This browser has no key, so no work is under one yet.');
  await intelWorkspaceManager.ensureInitialized();
  const relays = publicRelays();
  const portfolio = await gatherPortfolio({
    key: pubkey,
    reports: () => intelReportService.listReports(),
    cases: () => intelWorkspaceManager.getCases(),
    missions: () => intelWorkspaceManager.getMissions(),
    evidence: () => Promise.all(intelWorkspaceManager.getIntelItems()
      .filter((item) => item.tags.includes(EVIDENCE_TAG))
      .map(async (item) => ({ item, custody: await evidenceStore.getRecord(item.id).catch(() => undefined) }))),
    published: (key) => readPublished(key, relays),
  });
  const signed = await signPortfolio(portfolio, (event) => nostrIdentityService.signWithExisting(event));
  return { portfolio, signed, html: renderPortfolioHtml(signed, portfolio, { name: ownName() ?? undefined }), json: portfolioJsonFile(signed) };
}

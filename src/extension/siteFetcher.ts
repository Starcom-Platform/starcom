/**
 * The app's one way to read another site (decision D-EX, EX32, W10b): the desktop app's fetch when it is
 * there, else Starcom Uplink's, else none.
 *
 * A browser tab cannot read another site's pages or headers. The desktop app can, and NetRunner's page
 * scan was written against it. Uplink offers the same read, so the scan works in a browser too, and its
 * answer arrives in the desktop's shape. The desktop app still wins when both are there: it records
 * each redirect hop, sets headers a browser may not, and keeps the answer as evidence as it arrives.
 *
 * Through Uplink, a site is asked for at its first read, in Uplink's own window, with the purpose the
 * tool gave (EX3). A refusal is said in words and never turned into "found nothing".
 */
import { isNativeHost, nativeHost, type NativeFetchResponse } from '../services/native/nativeHost';
import type { Refusal, SiteFetched } from './protocol';
import { refusalSaid } from './purposes';
import { sitePattern } from './uplink/siteFetch';
import { askUplink, checkUplink, uplinkNow, useStarcomUplink, type UplinkState } from './useStarcomUplink';

export type FetchRoute = 'desktop' | 'uplink';

export interface SiteFetcher {
  via: FetchRoute;
  /** The target's own answer; throws with words saying why not. */
  fetch(url: string, purpose: string, options?: { timeoutMs?: number }): Promise<NativeFetchResponse>;
}

/** How long the person has to answer Uplink's window asking for a site. */
const GRANT_WAIT_MS = 120_000;

/** Uplink's answer in the desktop's shape. A browser follows redirects silently, so only the end is named. */
export function asNativeResponse(fetched: SiteFetched): NativeFetchResponse {
  return {
    ok: fetched.status >= 200 && fetched.status < 300,
    status: fetched.status,
    statusText: fetched.statusText,
    headers: fetched.headers,
    body: fetched.body,
    finalUrl: fetched.finalUrl,
    redirects: fetched.redirected ? [fetched.finalUrl] : [],
    elapsedMs: fetched.elapsedMs,
    bytes: fetched.bytes,
    truncated: fetched.truncated,
  };
}

const said = (answer: { refusal: Refusal; reason: string }) => new Error(refusalSaid(answer.refusal, answer.reason));

/** A read through Uplink: the site asked for at first use, then read; or why not. */
export async function fetchThroughUplink(
  url: string,
  purpose: string,
  options: { timeoutMs?: number } = {},
  ask: typeof askUplink = askUplink,
): Promise<NativeFetchResponse> {
  const args = { url, ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}) };
  // Uplink's own limit, its pace, and a margin for the bridge.
  const readWait = (options.timeoutMs ?? 15_000) + 15_000;
  let answer = await ask('site.fetch', purpose, args, readWait);
  if (answer.ok === false && answer.refusal === 'not-granted') {
    const granted = await ask('permissions.request', purpose, { origins: [sitePattern(url)] }, GRANT_WAIT_MS);
    if (granted.ok === false) throw said(granted);
    answer = await ask('site.fetch', purpose, args, readWait);
  }
  if (answer.ok === false) throw said(answer);
  return asNativeResponse(answer.result);
}

/** Which route can read another site: the desktop app, else Uplink when it reads sites, else none. */
export function siteFetchRoute(uplink: UplinkState, native: boolean): FetchRoute | null {
  if (native) return 'desktop';
  return uplink.status === 'connected' && uplink.hello.capabilities.some((c) => c.id === 'site.fetch' && c.ready) ? 'uplink' : null;
}

/** The route as a component reads it, so a page-scan button is offered only when something can read the page. */
export const useSiteFetchRoute = (): FetchRoute | null => siteFetchRoute(useStarcomUplink(), isNativeHost());

/** The desktop app's fetch, else Uplink's, else null: then no tool here can read another site. */
export async function siteFetcher(): Promise<SiteFetcher | null> {
  const host = nativeHost();
  if (host) return { via: 'desktop', fetch: (url, _purpose, options) => host.fetch({ url, ...(options?.timeoutMs ? { timeoutMs: options.timeoutMs } : {}) }) };
  if (uplinkNow().status === 'checking') await checkUplink();
  if (siteFetchRoute(uplinkNow(), false) !== 'uplink') return null;
  return { via: 'uplink', fetch: (url, purpose, options) => fetchThroughUplink(url, purpose, options) };
}

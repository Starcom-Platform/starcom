/**
 * Uplink's fetch broker, its rules (decision D-EX, EX32, W10a): NetRunner reads a site the person
 * allowed through Uplink, as it reads one through the desktop app, and gets the site's own answer and
 * headers, which a page cannot see.
 *
 * - **Public sites only.** Never the person's own network or this machine, however the address is
 *   written: the browser's URL parser has already turned `2130706433` and `0x7f.1` into `127.0.0.1`
 *   by the time a hostname is read here. Never Starcom itself, which reads its own pages.
 * - **Read plainly.** GET or HEAD, no body, no cookies, no referrer, and only an Accept header set. It
 *   never reads as the person (the rule "no acting as anyone").
 * - **Within limits.** A size cap, a time limit, and a gap between two reads of one site.
 * - **Only sites the person allowed**, each asked for at first use, or every site in power mode.
 *
 * What it cannot hold: a browser follows redirects without saying through where, and resolves names
 * itself. A public site that redirects to a private address, or a name that resolves to one, is
 * requested before Uplink can see where it went. The answer is then refused, but the request was sent,
 * as any web page's request to that address could be.
 *
 * Pure but for web streams, so the app's tests import it as it is.
 */
import type { SiteFetchArgs, SiteFetched } from '../protocol';

export const SITE_FETCH = {
  timeoutMs: 15_000,
  maxTimeoutMs: 30_000,
  /** What a read keeps unless asked for less. */
  maxBytes: 2 * 1024 * 1024,
  hardMaxBytes: 5 * 1024 * 1024,
  /** Between two reads of one site. */
  gapMs: 1_000,
  maxUrlLength: 2048,
} as const;

/** Names that never leave the person's network. */
const LOCAL_NAMES = /(^|\.)(localhost|local|internal|lan|home|home\.arpa|corp|intranet)$/;

function ipv4Problem(host: string): string | null {
  const octets = host.split('.').map(Number);
  const [a, b] = octets;
  const local =
    a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 192 && b === 0 && octets[2] === 0)
    || (a === 198 && (b === 18 || b === 19));
  return local ? `${host} is on a private or local network, which Uplink never reaches` : null;
}

function ipv6Problem(host: string): string | null {
  const inner = host.slice(1, -1);
  // Unspecified, loopback and IPv4 written as IPv6 all start "::"; then unique-local, link-local,
  // multicast, and the NAT64 prefix that maps onto IPv4.
  const local = inner.startsWith('::') || /^f[cd]/.test(inner) || /^fe[89ab]/.test(inner) || inner.startsWith('ff') || inner.startsWith('64:ff9b');
  return local ? `${inner} is on a private or local network, which Uplink never reaches` : null;
}

/** Why Uplink will not read this host, or null when it may: a public site on the internet. */
export function addressProblem(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'starcom.app' || host === 'www.starcom.app') return 'Starcom reads its own pages itself';
  if (host.startsWith('[')) return ipv6Problem(host);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return ipv4Problem(host);
  if (LOCAL_NAMES.test(host)) return `${host} is a local name, which Uplink never reaches`;
  if (!host.includes('.')) return `${host} is not a site on the internet`;
  return null;
}

/** An Accept value: header characters only, so nothing can be added after it. */
const ACCEPT = /^[\w!#$%&'*+.^`|~/,;= -]{1,200}$/;

export type SiteFetchRequest = Required<Pick<SiteFetchArgs, 'url' | 'method' | 'timeoutMs' | 'maxBytes'>> & Pick<SiteFetchArgs, 'accept'>;

const clamp = (value: unknown, low: number, high: number, otherwise: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(Math.round(value), low), high) : otherwise;

/** The request as Uplink will make it, or why it will not. */
export function fetchProblem(args: unknown): { request: SiteFetchRequest } | { problem: string } {
  const a = (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>;
  if (typeof a.url !== 'string' || a.url.length > SITE_FETCH.maxUrlLength) return { problem: 'a read names one web address, under 2048 characters' };
  let url: URL;
  try { url = new URL(a.url); } catch { return { problem: `"${a.url.slice(0, 80)}" is not a web address` }; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { problem: 'Uplink reads only web pages (http and https)' };
  if (url.username || url.password) return { problem: 'Uplink never sends a name or password in an address' };
  const address = addressProblem(url.hostname);
  if (address) return { problem: address };
  const method = a.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') return { problem: 'Uplink only reads: GET or HEAD' };
  if (a.accept !== undefined && (typeof a.accept !== 'string' || !ACCEPT.test(a.accept))) return { problem: 'the Accept header is one plain value' };
  return {
    request: {
      url: url.toString(),
      method,
      ...(typeof a.accept === 'string' ? { accept: a.accept } : {}),
      timeoutMs: clamp(a.timeoutMs, 1_000, SITE_FETCH.maxTimeoutMs, SITE_FETCH.timeoutMs),
      maxBytes: clamp(a.maxBytes, 1, SITE_FETCH.hardMaxBytes, SITE_FETCH.maxBytes),
    },
  };
}

/** Whether the person allowed this address: its site, a parent site with its subdomains, or every site. */
export function siteAllowed(url: string, granted: readonly string[]): boolean {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  const scheme = parsed.protocol.slice(0, -1);
  const host = parsed.hostname.toLowerCase();
  return granted.some((pattern) => {
    const m = /^(\*|https?):\/\/(\*|\*\.[^/*]+|[^/*]+)\/\*$/.exec(pattern);
    if (!m || (m[1] !== '*' && m[1] !== scheme)) return false;
    const site = m[2].toLowerCase();
    if (site === '*') return true;
    if (site.startsWith('*.')) return host === site.slice(2) || host.endsWith(site.slice(1));
    return host === site;
  });
}

/** The pattern to ask the person for, to read this address: its one site. */
export const sitePattern = (url: string): string => {
  const parsed = new URL(url);
  return `${parsed.protocol}//${parsed.hostname}/*`;
};

/** How long to wait before reading a site again: the gap since the last read, or none. */
export const paceWait = (lastAt: number | undefined, now: number, gapMs: number = SITE_FETCH.gapMs): number =>
  lastAt === undefined ? 0 : Math.max(0, lastAt + gapMs - now);

/** A body read up to `maxBytes`, then left: an endless or enormous answer is cut, never held whole. */
export async function readCapped(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<{ bytes: Uint8Array; size: number; truncated: boolean }> {
  if (!body) return { bytes: new Uint8Array(0), size: 0, truncated: false };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - size;
    if (value.length > room) {
      chunks.push(value.subarray(0, room));
      size += room;
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    size += value.length;
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return { bytes, size, truncated };
}

const kilobytes = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

/** A read, in the activity log's words. */
export function describeFetched(fetched: SiteFetched): string {
  const ended = fetched.redirected ? `, ended at ${new URL(fetched.finalUrl).host}` : '';
  return `${fetched.status}, ${kilobytes(fetched.bytes)}${fetched.truncated ? ', cut at the cap' : ''}${ended}`;
}

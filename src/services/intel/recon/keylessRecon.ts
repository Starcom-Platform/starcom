/**
 * Reconnaissance that costs nothing and needs no account.
 *
 * ─── WHY THIS IS THE IMPORTANT TIER ────────────────────────────────────────
 *
 * NetRunner was built around four commercial adapters and three public CORS
 * proxies. The proxies are dead — measured 2026-09-02, two accept a connection
 * and never answer and the third returns a demo-access redirect — and the
 * adapters need keys an analyst with no income does not have. The result was a
 * tool that could not gather intelligence for the person it most needed to
 * serve.
 *
 * Every source below was probed for CORS before being written down, and every
 * one answers `access-control-allow-origin: *`. They work in a plain browser
 * tab, with no key, no proxy, no server and no desktop host.
 *
 * ─── AND WHY THEY ARE EPISTEMICALLY BETTER, NOT MERELY CHEAPER ─────────────
 *
 * Shodan and Censys largely scan the same internet the same way, so as feeds
 * they are close to dependent and corroboration between them is weak.
 * Certificate Transparency, authoritative DNS and RDAP are three genuinely
 * different observation methods run by different operators. Under this node's
 * feedId rules they can legitimately corroborate one another — which the paid
 * pair cannot. The free tier produces better-attested intelligence, not merely
 * cheaper.
 */
import { nativeHost } from '../../native/nativeHost';

const DEFAULT_TIMEOUT_MS = 15_000;

export interface ReconFailure {
  source: string;
  /** What went wrong, in terms that distinguish "nothing there" from "could not look". */
  detail: string;
}

/**
 * Somewhere to collect the evidence a lookup produced.
 *
 * Passed down rather than returned, because every function here already returns
 * the thing the caller asked for and threading a second value through all of
 * them would change five signatures to carry one list. The caller owns the
 * array and reads it afterwards.
 */
export type EvidenceSink = string[];

/**
 * One fetch path for both hosts.
 *
 * The desktop host performs the request where CORS does not apply and can set
 * headers a page may not; a browser does the same request under the same-origin
 * rules. Both work for every source here — the host is an enhancement, never a
 * requirement, because requiring it would put this tier out of reach of exactly
 * the people it exists for.
 *
 * When a sink is supplied AND a host is present, the response is fixed in the
 * evidence store as it arrives. Atomic with the request on purpose: hashing an
 * answer afterwards means asking again, and the second answer is a different
 * observation. In a browser nothing is captured and nothing pretends to be —
 * the entities a browser files carry no evidence id, which is true.
 */
async function getJson<T>(
  url: string,
  source: string,
  headers?: Record<string, string>,
  sink?: EvidenceSink,
): Promise<T> {
  const host = nativeHost();

  if (host) {
    const response = await host.fetch({
      url,
      headers,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      capture: sink !== undefined,
    });
    if (!response.ok) throw new Error(`${source} returned ${response.status}`);
    if (sink && response.evidence) sink.push(response.evidence.recordId);
    return JSON.parse(response.body) as T;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    // No timeout here previously in WebsiteScanner's proxy path was the bug
    // that made a dead host look like a hang; every request in this module is
    // bounded.
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`${source} returned ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Certificate Transparency ───────────────────────────────────────────────

interface CrtShRow {
  name_value?: string;
  issuer_name?: string;
  not_after?: string;
}

export interface SubdomainFinding {
  name: string;
  /** Distinct certificates naming it. Presence, not popularity. */
  certificates: number;
}

/**
 * Subdomains from Certificate Transparency logs.
 *
 * Passive: nothing is sent to the target. Every publicly-trusted certificate
 * issued since 2018 is logged, so this enumerates what an operator has ASKED to
 * be certified rather than what currently resolves. Those differ, and the
 * difference is often the finding — a name in CT that no longer resolves is a
 * decommissioned service, and one that resolves but appears in no certificate
 * was never meant to be public.
 */
export async function certificateTransparency(domain: string, sink?: EvidenceSink): Promise<SubdomainFinding[]> {
  const rows = await getJson<CrtShRow[]>(
    `https://crt.sh/?q=${encodeURIComponent(`%.${domain}`)}&output=json`,
    'crt.sh',
    undefined,
    sink,
  );

  const counts = new Map<string, number>();
  for (const row of rows) {
    // One row can name several hosts, newline-separated, and wildcards appear
    // as literal "*." entries which are a fact about the certificate rather
    // than a host that exists.
    for (const raw of (row.name_value ?? '').split('\n')) {
      const name = raw.trim().toLowerCase();
      if (name.length === 0 || name.startsWith('*.')) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, certificates]) => ({ name, certificates }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── DNS over HTTPS ─────────────────────────────────────────────────────────

interface DohAnswer { name: string; type: number; TTL?: number; data: string }
interface DohResponse { Status: number; Answer?: DohAnswer[] }

const DOH_RESOLVERS = [
  { id: 'google', url: 'https://dns.google/resolve' },
  { id: 'cloudflare', url: 'https://cloudflare-dns.com/dns-query' },
] as const;

export type ResolverId = (typeof DOH_RESOLVERS)[number]['id'];

export interface DnsAnswer {
  resolver: ResolverId;
  records: string[];
  /** NOERROR is 0; anything else is the resolver declining to answer. */
  status: number;
}

export async function dnsQuery(
  name: string,
  type: 'A' | 'AAAA' | 'MX' | 'TXT' | 'NS' | 'CNAME',
  resolver: ResolverId = 'google',
  sink?: EvidenceSink,
): Promise<DnsAnswer> {
  const entry = DOH_RESOLVERS.find((r) => r.id === resolver) ?? DOH_RESOLVERS[0];
  const response = await getJson<DohResponse>(
    `${entry.url}?name=${encodeURIComponent(name)}&type=${type}`,
    `${entry.id} DoH`,
    // Cloudflare requires it; Google accepts it. Harmless to send to both.
    { Accept: 'application/dns-json' },
    sink,
  );

  return {
    resolver: entry.id,
    status: response.Status,
    /**
     * Quotes stripped here, and this is load-bearing rather than cosmetic.
     *
     * Measured 2026-09-02: for the same TXT record, Google returns
     * `v=spf1 -all` and Cloudflare returns `"v=spf1 -all"`. Comparing those
     * two strings raw reports DISAGREEMENT between independent resolvers —
     * which dnsAcrossResolvers treats as evidence of manipulation or
     * censorship. Normalising at the point of parsing, before any comparison
     * exists, is what keeps the most novel capability here from crying wolf on
     * every domain with a TXT record.
     */
    records: (response.Answer ?? []).map((a) => a.data.replace(/^"|"$/g, '')),
  };
}

/**
 * Ask two independent resolvers the same question and compare.
 *
 * This is the capability with no paid equivalent. Two resolvers operated by
 * different organisations returning different answers for one name is evidence
 * of manipulation, split-horizon DNS, or censorship — and under this node's
 * feedId rules they are genuinely independent feeds, so agreement between them
 * corroborates in a way two commercial scanners never could.
 */
export async function dnsAcrossResolvers(
  name: string,
  type: 'A' | 'AAAA' | 'MX' | 'TXT' | 'NS' = 'A',
  sink?: EvidenceSink,
): Promise<{ answers: DnsAnswer[]; agree: boolean; failures: ReconFailure[] }> {
  const failures: ReconFailure[] = [];
  const answers: DnsAnswer[] = [];

  for (const resolver of DOH_RESOLVERS) {
    try {
      answers.push(await dnsQuery(name, type, resolver.id, sink));
    } catch (error) {
      failures.push({ source: resolver.id, detail: error instanceof Error ? error.message : 'failed' });
    }
  }

  // Sorted before comparison: record order is not a property of the zone, and
  // resolvers rotate it deliberately.
  const normalise = (records: string[]) => [...records].map((r) => r.toLowerCase()).sort().join('|');
  const agree = answers.length > 1 && new Set(answers.map((a) => normalise(a.records))).size === 1;

  return { answers, agree, failures };
}

export interface MailPosture {
  mx: string[];
  spf?: string;
  dmarc?: string;
  /** Absent policies are reported as absent, never as failures to look. */
  notes: string[];
}

/**
 * Mail infrastructure and anti-spoofing posture.
 *
 * A domain with MX records and no DMARC can be spoofed, which is a fact about
 * the target's exposure rather than a vulnerability in it. Reported as observed.
 */
export async function mailPosture(domain: string, sink?: EvidenceSink): Promise<MailPosture> {
  const notes: string[] = [];
  const [mxAnswer, txtAnswer, dmarcAnswer] = await Promise.all([
    dnsQuery(domain, 'MX', 'google', sink).catch(() => null),
    dnsQuery(domain, 'TXT', 'google', sink).catch(() => null),
    dnsQuery(`_dmarc.${domain}`, 'TXT', 'google', sink).catch(() => null),
  ]);

  const mx = mxAnswer?.records ?? [];
  const spf = txtAnswer?.records.find((r) => r.toLowerCase().startsWith('v=spf1'));
  const dmarc = dmarcAnswer?.records.find((r) => r.toLowerCase().startsWith('v=dmarc1'));

  if (mxAnswer === null) notes.push('MX lookup did not complete — posture is unknown, not absent.');
  else if (mx.length === 0) notes.push('No MX records: this domain does not receive mail.');
  if (txtAnswer !== null && spf === undefined) notes.push('No SPF record.');
  if (dmarcAnswer !== null && dmarc === undefined) notes.push('No DMARC record; mail from this domain can be spoofed.');

  return { mx, spf, dmarc, notes };
}

// ─── RDAP ───────────────────────────────────────────────────────────────────

interface RdapEvent { eventAction?: string; eventDate?: string }
interface RdapNoticeRaw { title?: string; description?: string[]; links?: Array<{ href?: string }> }
interface RdapResponse {
  handle?: string;
  ldhName?: string;
  status?: string[];
  events?: RdapEvent[];
  nameservers?: Array<{ ldhName?: string }>;
  notices?: RdapNoticeRaw[];
}

/** A registry's notice, as it sent it: its terms of use, how to report an inaccuracy. */
export interface RdapNotice {
  title?: string;
  text: string;
  /** Web addresses only: a notice is the registry's data, and is never trusted with a script link. */
  links: string[];
}

export interface Registration {
  handle?: string;
  domain?: string;
  status: string[];
  registered?: string;
  expires?: string;
  lastChanged?: string;
  nameservers: string[];
  /** The registry that answered, by its RDAP host. */
  registry: string;
  /** Its notices, shown with the answer: ARIN's terms, for one, travel with its data (D-EX EX33). */
  notices: RdapNotice[];
}

/** IANA's list of each top-level domain's RDAP service (RFC 9224), public domain (CC0). */
const IANA_DNS_BOOTSTRAP = 'https://data.iana.org/rdap/dns.json';

interface RdapBootstrap { services: Array<[string[], string[]]> }

/**
 * The registry's RDAP base for a domain, from IANA's bootstrap file: the longest matching suffix, over
 * https where the registry offers it. Null when IANA lists no RDAP service for it.
 */
export function rdapBaseFor(domain: string, file: RdapBootstrap): string | null {
  const labels = domain.toLowerCase().replace(/\.$/, '').split('.');
  for (let i = 0; i < labels.length; i++) {
    const suffix = labels.slice(i).join('.');
    const entry = file.services.find(([names]) => names.includes(suffix));
    if (entry) return entry[1].find((url) => url.startsWith('https://')) ?? entry[1][0] ?? null;
  }
  return null;
}

const isWebLink = (href: unknown): href is string => typeof href === 'string' && /^https?:\/\//i.test(href);

/**
 * Registration facts, from the protocol that replaced WHOIS.
 *
 * RDAP is JSON, is mandated by ICANN, and — unlike port-43 WHOIS — is reachable
 * from a browser. Registrant identity is usually redacted under privacy rules;
 * the DATES are not, and a domain registered a week before it was used is a
 * different object from one registered a decade ago.
 *
 * Asked of the registry itself, found from IANA's bootstrap file (D-EX EX33):
 * rdap.org, which answered before, is a third party that saw every query and
 * allows ten in ten seconds. The bootstrap file says a day is fresh enough, and
 * the browser keeps it that long.
 */
export async function registration(domain: string, sink?: EvidenceSink): Promise<Registration> {
  const file = await getJson<RdapBootstrap>(IANA_DNS_BOOTSTRAP, 'IANA', undefined, sink);
  const base = rdapBaseFor(domain, file);
  if (!base) {
    const tld = domain.toLowerCase().replace(/\.$/, '').split('.').pop();
    throw new Error(`The .${tld} registry offers no registration (RDAP) service, by IANA's list`);
  }
  const registry = new URL(base).host;
  const data = await getJson<RdapResponse>(
    `${base.endsWith('/') ? base : `${base}/`}domain/${encodeURIComponent(domain)}`,
    registry,
    undefined,
    sink,
  );
  const dateOf = (action: string) =>
    data.events?.find((e) => e.eventAction?.toLowerCase() === action)?.eventDate;

  return {
    handle: data.handle,
    domain: data.ldhName,
    status: data.status ?? [],
    registered: dateOf('registration'),
    expires: dateOf('expiration'),
    lastChanged: dateOf('last changed'),
    nameservers: (data.nameservers ?? []).map((n) => n.ldhName ?? '').filter(Boolean),
    registry,
    notices: (data.notices ?? [])
      .map((n) => ({
        ...(n.title ? { title: n.title } : {}),
        text: (n.description ?? []).join(' ').trim(),
        links: (n.links ?? []).map((l) => l.href).filter(isWebLink),
      }))
      .filter((n) => n.title || n.text),
  };
}

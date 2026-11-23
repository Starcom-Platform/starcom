/**
 * Reporting back on a taken mission (decision D-MF, MF11–MF13; its form since D-MX MX28 is NavCom's kind 1912, its
 * mission interchange §5.2). A report holds the counts the package asks for, one number for each, and the day: no
 * place, no people, no photos ("count things, never people"). It is sealed to the package's publisher by NIP-59, so
 * nobody else sees it, and it claims nothing.
 *
 * Its content is exactly NavCom's: the reporter's callsign, the day as YYYY-MM-DD and never a time, each count on the
 * package's own effect line, verbatim, and a salt. The salt is 32 random lowercase hex characters. Without it the id
 * inside the seal is a hash of things anyone can guess (the key, the callsign, the day, the lines), and a label that
 * names that id would name its author too. Its own time is the start of its UTC day, so not even the publisher
 * learns the moment.
 */
import type { AcceptedPackage } from '../MissionPackageIngest';

/** NavCom's report kind, live since 2026-10-06: the form a publisher reads every report in. */
export const REPORT_KIND = 1912;

export interface CountAsked {
  id: string;
  label: string;
  /** The package's own line for it, verbatim, as a report names it ("Naloxone kits carried or placed: a count"). */
  line?: string;
}

type Shape = Record<string, unknown>;
const asShape = (v: unknown): Shape | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Shape) : undefined);
const COUNT = /^(.+?):\s*a count\.?$/i;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * The counts a package names on its effect lines, each once. Only effect lines: a publisher drops any count whose
 * line it does not carry as an effect (NavCom §5.2), so a count on a performance line would be lost.
 */
export function countsAskedOf(pkg: AcceptedPackage): CountAsked[] {
  // Mecha Jono's effect lines, else those of a package made in Starcom (MX32; spec rev 18).
  const metadata = asShape(pkg.check.manifest?.metadata);
  const own = asShape(asShape(metadata?.mechaJono)?.format);
  const format = Array.isArray(own?.effect) ? own : asShape(metadata?.format);
  const effect = Array.isArray(format?.effect) ? format.effect : [];
  const counts: CountAsked[] = [];
  for (const item of effect) {
    const label = typeof item === 'string' ? COUNT.exec(item.trim())?.[1]?.trim() : undefined;
    if (label && !counts.some((c) => c.label === label)) counts.push({ id: slug(label), label, line: item as string });
  }
  return counts;
}

/** The UTC day of a moment, YYYY-MM-DD. */
export const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** 32 random lowercase hex characters, as a sealed report's salt is (NavCom §5.2). */
export function newSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ReportTemplate {
  kind: typeof REPORT_KIND;
  tags: string[][];
  content: string;
  /** Unix seconds: the start of its day. */
  createdAt: number;
  /** What it says, for the review to show in words; never sent beside the content. */
  given: Array<{ label: string; n: number }>;
}

/** A line a count stands on: the package's own, or, for a mission taken before lines were kept, the label's. */
const lineOf = (c: CountAsked): string => c.line ?? `${c.label}: a count`;

/** The report as it will be sealed: the counts given, in the order asked, and the day. */
export function reportTemplate(r: {
  coordinate: string; counts: readonly CountAsked[]; values: Readonly<Record<string, number>>; day: string;
  callsign?: string | null; salt?: string;
}): ReportTemplate {
  const given = r.counts.filter((c) => Number.isInteger(r.values[c.id]) && r.values[c.id] >= 0);
  const content = {
    ...(r.callsign ? { callsign: r.callsign } : {}),
    date: r.day,
    counts: given.map((c) => ({ line: lineOf(c), n: r.values[c.id] })),
    salt: r.salt ?? newSalt(),
  };
  return {
    kind: REPORT_KIND,
    tags: [['a', r.coordinate]],
    content: JSON.stringify(content),
    createdAt: Date.parse(`${r.day}T00:00:00Z`) / 1000,
    given: given.map((c) => ({ label: c.label, n: r.values[c.id] })),
  };
}

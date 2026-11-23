/**
 * Mecha Jono's `psi_` families, as their build kit v0 draws them (`kit/schemas_psi.md`; decision D-PW): the sky's
 * exact events, the day's field readings, the daily note, registrations sealed before scoring, results met or missed,
 * the week's ledger, alerts, and windows on the sky. Read from the kit's fixtures only until the key change (PW12);
 * no relay is read for these families before then, and none is ever read unsigned.
 *
 * Every family is drawn generically where the kit says so: an unknown channel by its id, an unknown sky class by its
 * words. A fixture says which of its values are invented; those are marked FIXTURE wherever they show (PW12).
 */
import { readWindow, type EventWindow } from './windowProfile';
import { layerKeys } from '../../config/publicInfrastructure';

/**
 * The only key `psi_` events are ever signed by: Mecha Jono's newest (kit README), as publishers.json says Psi Watch
 * reads it. A second copy of the key was written here until the EIN transition audit of 21 Nov 2026 (finding 4).
 */
export const PSI_SIGNER: string = layerKeys('psi_watch')[0] ?? '';

export const PSI_FAMILIES = [
  'psi_sky_event', 'psi_field', 'psi_brief', 'psi_registration', 'psi_scry_result', 'psi_ledger', 'psi_alert', 'psi_window', 'psi_mission_package',
] as const;
export type PsiFamily = (typeof PSI_FAMILIES)[number];

export interface PsiNote {
  kind: number;
  pubkey: string;
  created_at: number;
  tags: string[][];
  content: string;
}

/** A kit fixture: the event as it will be signed, and what in it is real or invented. */
export interface PsiFixture {
  event: PsiNote;
  fixture_note?: string;
  provenance?: { real?: string; invented?: string };
}

const tag = (note: PsiNote, name: string) => note.tags.find((t) => t[0] === name);
const tagsOf = (note: PsiNote, name: string) => note.tags.filter((t) => t[0] === name);
const numberOf = (value: string | undefined) => (value === undefined || value === '' ? undefined : Number(value));

/** The family a note belongs to, by its `t` tags; null for a note that is none of them. */
export function familyOf(note: PsiNote): PsiFamily | null {
  const ts = new Set(tagsOf(note, 't').map((t) => t[1]));
  if (!ts.has('psi_watch')) return null;
  return PSI_FAMILIES.find((family) => ts.has(family)) ?? null;
}

/** Why a note is refused, or null: signed by any key but the new one, or no psi family. */
export function refusalOf(note: PsiNote): 'not-our-key' | 'not-psi' | null {
  if (note.pubkey !== PSI_SIGNER) return 'not-our-key';
  return familyOf(note) ? null : 'not-psi';
}

const address = (note: PsiNote) => `${note.kind}:${note.pubkey}:${tag(note, 'd')?.[1] ?? ''}`;

export interface PsiSkyEvent {
  address: string;
  title: string;
  /** The class and its sub-kind: `aspect harmonic`, `lunation full`, `ingress sign`, … */
  sky: { class: string; sub: string };
  bodies: string[];
  /** The aspect's harmonic, with the kit's plain word and the classic one beside it. */
  harmonic?: { n: number; k: number; plain: string; classic: string; targetDeg: number };
  /** An ingress's frame: `tropical` or `sidereal_gc`, the signs it leaves and enters, the ayanamsa for sidereal_gc. */
  frame?: { frame: string; from: string; to: string; ayanamsa?: number };
  exact: number;
  window: EventWindow;
  content: string;
}

export function readSkyEvent(note: PsiNote): PsiSkyEvent | null {
  const window = readWindow(note.tags);
  const exact = numberOf(tag(note, 'exact')?.[1]);
  if (!window || exact === undefined) return null;
  const harmonic = tag(note, 'harmonic');
  const frame = tag(note, 'frame');
  const sky = tag(note, 'sky');
  return {
    address: address(note),
    title: tag(note, 'title')?.[1] ?? '',
    sky: { class: sky?.[1] ?? '', sub: sky?.[2] ?? '' },
    bodies: tagsOf(note, 'body').map((t) => t[1]),
    ...(harmonic ? { harmonic: { n: Number(harmonic[1]), k: Number(harmonic[2]), plain: harmonic[3], classic: harmonic[4], targetDeg: Number(harmonic[5]) } } : {}),
    ...(frame ? { frame: { frame: frame[1], from: frame[2], to: frame[3], ...(frame[4] ? { ayanamsa: Number(frame[4]) } : {}) } } : {}),
    exact,
    window,
    content: note.content,
  };
}

/** One reading of the field: its value as given (a class like "C1.9" stays words), its unit, when, and its percentile. */
export interface PsiChannel {
  id: string;
  value: string;
  unit: string;
  at: number;
  percentile?: number;
  history?: string;
  source: string;
  licence: string;
}

const readChannel = (t: string[]): PsiChannel => ({
  id: t[1], value: t[2], unit: t[3] ?? '', at: Number(t[4]),
  ...(numberOf(t[5]) !== undefined ? { percentile: Number(t[5]) } : {}),
  ...(t[6] ? { history: t[6] } : {}),
  source: t[7] ?? '', licence: t[8] ?? '',
});

export interface PsiField {
  address: string;
  title: string;
  channels: PsiChannel[];
  validFrom?: number;
  validUntil?: number;
  licences: string[];
  publishedAt: number;
}

export function readField(note: PsiNote): PsiField {
  return {
    address: address(note),
    title: tag(note, 'title')?.[1] ?? '',
    channels: tagsOf(note, 'channel').map(readChannel),
    validFrom: numberOf(tag(note, 'valid_from')?.[1]),
    validUntil: numberOf(tag(note, 'valid_until')?.[1]),
    licences: tagsOf(note, 'license').map((t) => t[1]),
    publishedAt: numberOf(tag(note, 'published_at')?.[1]) ?? note.created_at,
  };
}

/** The daily note: its title, the items it points at in order, and its plain lines by heading. */
export interface PsiBrief {
  address: string;
  title: string;
  points: string[];
  sections: { heading: string; lines: string[] }[];
}

export function readBrief(note: PsiNote): PsiBrief {
  const sections: PsiBrief['sections'] = [];
  for (const block of note.content.split(/\n\s*\n/)) {
    const [heading, ...lines] = block.split('\n').filter((line) => line.trim() !== '');
    if (heading) sections.push({ heading, lines });
  }
  return { address: address(note), title: tag(note, 'title')?.[1] ?? '', points: tagsOf(note, 'a').map((t) => t[1]), sections };
}

export interface PsiRegistration {
  address: string;
  id: string;
  title: string;
  rung: string;
  sealedAt: string;
  sha256: string;
}

export function readRegistration(note: PsiNote): PsiRegistration {
  const registration = tag(note, 'registration');
  return {
    address: address(note),
    id: registration?.[1] ?? '',
    title: tag(note, 'title')?.[1] ?? '',
    rung: tag(note, 'rung')?.[1] ?? '',
    sealedAt: tag(note, 'seal')?.[2] ?? '',
    sha256: registration?.[2] ?? '',
  };
}

export interface PsiLedger {
  address: string;
  title: string;
  counts: Record<string, number>;
  results: string[];
}

export function readLedger(note: PsiNote): PsiLedger {
  return {
    address: address(note),
    title: tag(note, 'title')?.[1] ?? '',
    counts: Object.fromEntries(tagsOf(note, 'count').map((t) => [t[1], Number(t[2])])),
    results: tagsOf(note, 'a').map((t) => t[1]),
  };
}

/** A registered result, as published: never recomputed (`schemas_psi.md` §2.5). */
export interface PsiScryResult {
  address: string;
  title: string;
  registration: string;
  verdict: string;
  /** The rate ratio and its interval, the window in words. */
  rr?: { value: number; low: number; high: number; window: string };
  zones: { zone: string; rr: number; p: number; expected: number }[];
  content: string;
}

export function readScryResult(note: PsiNote): PsiScryResult {
  const rr = tag(note, 'rr');
  return {
    address: address(note),
    title: tag(note, 'title')?.[1] ?? '',
    registration: tag(note, 'registration')?.[1] ?? '',
    verdict: tag(note, 'verdict')?.[1] ?? '',
    ...(rr ? { rr: { value: Number(rr[1]), low: Number(rr[2]), high: Number(rr[3]), window: rr[4] ?? '' } } : {}),
    zones: tagsOf(note, 'zone_rr').map((t) => ({ zone: t[1], rr: Number(t[2]), p: Number(t[3]), expected: Number(t[4]) })),
    content: note.content,
  };
}

/** An alert: three field channels high together in a Zone, while it holds. */
export interface PsiAlert {
  address: string;
  title: string;
  zone: { id: string; name: string };
  channels: PsiChannel[];
  validFrom?: number;
  validUntil?: number;
  state?: string;
  content: string;
}

export function readAlert(note: PsiNote): PsiAlert {
  const zone = tag(note, 'zone');
  return {
    address: address(note),
    title: tag(note, 'title')?.[1] ?? '',
    zone: { id: zone?.[1] ?? '', name: zone?.[2] ?? zone?.[1] ?? '' },
    channels: tagsOf(note, 'channel').map(readChannel),
    validFrom: numberOf(tag(note, 'valid_from')?.[1]),
    validUntil: numberOf(tag(note, 'valid_until')?.[1]),
    state: tag(note, 'window_state')?.[1],
    content: note.content,
  };
}

/** A focus or mission window on a sky event, in places. */
export interface PsiWindowNote {
  address: string;
  title: string;
  window: EventWindow;
  zones: { id: string; name: string }[];
  jurisdictions: string[];
  skyEvent?: string;
  state?: string;
}

export function readWindowNote(note: PsiNote): PsiWindowNote | null {
  const window = readWindow(note.tags);
  if (!window) return null;
  return {
    address: address(note),
    title: tag(note, 'title')?.[1] ?? '',
    window,
    zones: tagsOf(note, 'zone').map((t) => ({ id: t[1], name: t[2] ?? t[1] })),
    jurisdictions: tagsOf(note, 'jurisdiction').map((t) => t[1]),
    skyEvent: tag(note, 'a')?.[1],
    state: tag(note, 'window_state')?.[1],
  };
}

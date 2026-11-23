/**
 * Psi Watch's missions (decision D-PW, PW91–PW93): Mecha Jono's `psi_mission_package`, a PsiOps mission in the
 * PackageManifest envelope every received mission uses (their kit, schemas_psi 2.9), never tagged
 * `starcom_mission_package`, so the received missions' read never takes one. Read here from what Psi Watch holds
 * (usePsiKit: the live notes, and the kit's while none has come), each made the received package the mission's
 * card reads, with what only a psi mission carries: its window, the window's places, the engine and the
 * registration.
 *
 * A live package passes every check a received mission passes (verifyMissionPackageEvent, its own family's tag in
 * place of the other) or is not shown. The kit's sample is invented and unsigned: shown only with `?psi=kit`, as the
 * kit's samples are (PW48), and said to be a sample.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import type { AcceptedPackage } from '../../intel/MissionPackageIngest';
import { verifyMissionPackageEvent } from '../../intel/MissionPackageVerifier';
import { psiWindowOf, type PsiMissionWindow } from '../../intel/received/missionCard';
import type { ObjectiveAsk, PackageManifest } from '../../exchange/types';
import { validateManifest } from '../../exchange/schema';
import type { KitFixture } from '../kitFixtures';
import { readRegistration, readWindowNote, type PsiRegistration, type PsiWindowNote } from '../psiEvents';
import { readWindow, type EventWindow } from '../windowProfile';
import { psiWatchRelays } from '../../nostr/publishTargets';

/** The family's tag: carried by every psi mission, and the only family tag the check asks of one. */
export const PSI_MISSION_TAG = 'psi_mission_package';

/** Where a package from the build kit "arrived": nowhere, so said. */
export const KIT_RELAY = 'kit';

export interface PsiMission {
  /** Its address: kind, signer and `d`. */
  address: string;
  /** The package as the mission's card reads it: its asks named as the card names them (`label` read as the ask). */
  pkg: AcceptedPackage;
  /** The kit's invented, unsigned sample. */
  sample: boolean;
  title: string;
  window: PsiMissionWindow | null;
  /** The window as the window timeline draws it: the package's own, with its profile; else its window note's, when held. */
  curve: EventWindow | null;
  /** The window note it points to (its `a`), and that note when Psi Watch holds it. */
  windowAddress: string | null;
  windowNote: PsiWindowNote | null;
  engine: string | null;
  /** Its registration, as it names it, and the registration when Psi Watch holds it; null when it names none. */
  registration: string | null;
  registrationNote: PsiRegistration | null;
}

/** Where a moment stands against a window: before it, inside it, or after it. */
export type PsiWindowState = 'ahead' | 'open' | 'passed';

export function windowStateAt(window: PsiMissionWindow, atMs: number): PsiWindowState {
  if (atMs < window.fromMs) return 'ahead';
  return atMs > window.untilMs ? 'passed' : 'open';
}

type Shape = Record<string, unknown>;
const asShape = (v: unknown): Shape | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Shape) : undefined);
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const tagValue = (tags: readonly string[][], name: string) => tags.find((t) => t[0] === name)?.[1];
const addressOf = (event: { kind: number; pubkey: string; tags: string[][] }) => `${event.kind}:${event.pubkey}:${tagValue(event.tags, 'd') ?? ''}`;

/** A live note carries its signature; the kit's files carry none. */
const isSigned = (event: unknown): event is NostrEvent =>
  typeof (event as { sig?: unknown }).sig === 'string' && typeof (event as { id?: unknown }).id === 'string';

/**
 * Its asks as the card reads them. The kit names an ask's words `label` (`{ id, kind, label }`); a received
 * mission's ask is `ask`, and `done` absent means not done. Nothing else is changed.
 */
function asCardReads(manifest: PackageManifest): PackageManifest {
  const objectives = (manifest.objectives ?? []).map((raw) => {
    const o = raw as unknown as Shape;
    const ask = text(o.ask) ?? text(o.label) ?? '';
    return { ...(raw as object), id: String(o.id ?? ask), ask, done: o.done === true } as ObjectiveAsk;
  });
  return { ...manifest, objectives };
}

/** The kit's sample, read as it stands: its manifest must still be a manifest. */
function sampleCheck(content: string): PackageManifest | null {
  try {
    const manifest = JSON.parse(content) as PackageManifest;
    return validateManifest(manifest).valid ? manifest : null;
  } catch {
    return null;
  }
}

/**
 * Every psi mission in what Psi Watch holds, newest first: live ones that pass the checks, and the kit's sample when
 * the tab asked for samples (loadPsiKit leaves it out otherwise). Each with its window and, when held, the window's
 * note and the registration it names.
 */
export async function psiMissionsFrom(held: readonly KitFixture[]): Promise<PsiMission[]> {
  const windows = held.filter((f) => f.family === 'psi_window').map((f) => readWindowNote(f.event)).filter((n): n is PsiWindowNote => n !== null);
  const registrations = held.filter((f) => f.family === 'psi_registration').map((f) => readRegistration(f.event));
  const missions = await Promise.all(held.filter((f) => f.family === 'psi_mission_package').map(async (fixture): Promise<PsiMission | null> => {
    const { event } = fixture;
    let manifest: PackageManifest | null;
    let sample = false;
    if (isSigned(event)) {
      const check = await verifyMissionPackageEvent(event, {}, { appTag: PSI_MISSION_TAG });
      manifest = check.ok ? check.manifest ?? null : null;
    } else {
      manifest = sampleCheck(event.content);
      sample = true;
    }
    if (!manifest) return null;
    const psi = asShape(asShape(asShape(manifest.metadata)?.mechaJono)?.psi);
    const windowAddress = tagValue(event.tags, 'a') ?? text(psi?.window_note);
    const registration = text(psi?.registration);
    const window = psiWindowOf(asShape(manifest.metadata)?.mechaJono) ?? null;
    const windowNote = windowAddress ? windows.find((w) => w.address === windowAddress) ?? null : null;
    const profile = Array.isArray(psi?.profile) ? (psi.profile as unknown[]).map(String) : null;
    const own = window
      ? readWindow([['window', String(window.fromMs / 1000), String(window.peakMs / 1000), String(window.untilMs / 1000)], ...(profile ? [['profile', ...profile]] : [])])
      : null;
    const signed: NostrEvent = isSigned(event)
      ? event
      : { ...event, id: `kit:${fixture.file}`, sig: '' } as NostrEvent;
    return {
      address: addressOf(event),
      pkg: { event: signed, check: { ok: true, manifest: asCardReads(manifest) }, relay: sample ? KIT_RELAY : psiWatchRelays()[0] },
      sample,
      title: text(manifest.name) ?? '',
      window,
      curve: own ?? windowNote?.window ?? null,
      windowAddress: windowAddress ?? null,
      windowNote,
      engine: text(psi?.engine) ?? tagValue(event.tags, 'engine') ?? null,
      registration,
      registrationNote: registration ? registrations.find((r) => r.address === registration || r.id === registration) ?? null : null,
    };
  }));
  return missions.filter((m): m is PsiMission => m !== null).sort((a, b) => b.pkg.event.created_at - a.pkg.event.created_at);
}

/** Whether a received package is a psi mission, by its family's tag. */
export const isPsiMissionPackage = (pkg: AcceptedPackage): boolean =>
  pkg.event.tags.some((t) => t[0] === 't' && t[1] === PSI_MISSION_TAG);

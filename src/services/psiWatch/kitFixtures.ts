/**
 * Mecha Jono's build-kit v0 fixtures for PsiOps (decision D-PW, PW12), read from the build, never from a relay
 * (kept here in src, since docs/missions never reaches the deploy: guard-vercel-build-inputs checks every glob):
 * live `psi_` events start after the key change, signed by their new key only. Loaded only while the switch is on,
 * so nothing of them is in the app's first download.
 */
import { familyOf, refusalOf, type PsiFamily, type PsiFixture } from './psiEvents';
import { psiKitSamplesOn } from './psiKitSwitch';

const FILES = import.meta.glob<PsiFixture>('./kit-v0/fixtures/psi/*.json', { import: 'default' });

export interface KitFixture extends PsiFixture {
  /** The file's name in the kit, e.g. `psi_sky_event.lunation.json`. */
  file: string;
  family: PsiFamily;
}

/** Whether a file of the kit says any of it is invented: its own `provenance`, never a list kept here. */
export const isInventedSample = (fixture: PsiFixture): boolean => Boolean(fixture.provenance?.invented);

/**
 * Every PsiOps fixture in the kit, by family; any the kit's own rules would refuse is left out, and so is any file
 * with an invented part unless the tab asked for the samples (`?psi=kit`, PW48): the kit's invented result, ledger,
 * alert, window places and mission must never read as findings. The real ones (sky events, field readings, the sealed
 * registration, the brief) are everyone's.
 */
export async function loadPsiKit(options: { samples?: boolean } = {}): Promise<KitFixture[]> {
  const samples = options.samples ?? psiKitSamplesOn();
  const loaded = await Promise.all(Object.entries(FILES).map(async ([path, load]) => ({ file: path.split('/').pop() ?? path, ...(await load()) })));
  return loaded.flatMap((fixture) => {
    const family = familyOf(fixture.event);
    if (!samples && isInventedSample(fixture)) return [];
    return family && refusalOf(fixture.event) === null ? [{ ...fixture, family }] : [];
  });
}

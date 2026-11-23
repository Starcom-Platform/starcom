import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { loadPsiKit, type KitFixture } from '../../services/psiWatch/kitFixtures';
import { livePsiNotes, mergeKitAndLive, startLivePsi, subscribeLivePsi } from '../../services/psiWatch/livePsi';

export type PsiKitStatus = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * The build kit's PsiOps fixtures, read once the view opens (decision D-PW, PW12), and Mecha Jono's live notes once
 * their new key speaks (plan step 5a): the kit steps aside a family at a time as live notes of it arrive.
 */
export function usePsiKit(enabled: boolean): { fixtures: KitFixture[]; status: PsiKitStatus } {
  const [state, setState] = useState<{ fixtures: KitFixture[]; status: PsiKitStatus }>({ fixtures: [], status: 'idle' });
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    setState((was) => (was.status === 'ready' ? was : { fixtures: [], status: 'loading' }));
    loadPsiKit().then(
      (fixtures) => { if (live) setState({ fixtures, status: 'ready' }); },
      () => { if (live) setState({ fixtures: [], status: 'failed' }); },
    );
    return () => { live = false; };
  }, [enabled]);
  // The live notes, read while the view is open; nothing is read before the new key speaks (livePsi.ts).
  const liveNotes = useSyncExternalStore(subscribeLivePsi, livePsiNotes, livePsiNotes);
  useEffect(() => (enabled ? startLivePsi() : undefined), [enabled]);
  const fixtures = useMemo(() => mergeKitAndLive(state.fixtures, liveNotes), [state.fixtures, liveNotes]);
  return { fixtures, status: state.status };
}

import { useEffect, useState } from 'react';
import type { IntelStanding } from './operatorStanding';

/** Where an operator's standing stands, as this device reads it (D-MX: MX8, MX25). */
export type OperatorStanding =
  | { state: 'looking' }
  | { state: 'read'; intel: IntelStanding }
  /** No relay this node reads answered. */
  | { state: 'unreachable' };

/** An operator's standing, read when asked for: a card opened, not every name drawn. */
export function useOperatorStanding(operator: string | null): OperatorStanding {
  const [standing, setStanding] = useState<OperatorStanding>({ state: 'looking' });
  useEffect(() => {
    if (!operator) return;
    let live = true;
    setStanding({ state: 'looking' });
    import('./registerSources')
      .then(({ readOperatorStanding }) => readOperatorStanding(operator))
      .then((intel) => { if (live) setStanding({ state: 'read', intel }); })
      .catch(() => { if (live) setStanding({ state: 'unreachable' }); });
    return () => { live = false; };
  }, [operator]);
  return standing;
}

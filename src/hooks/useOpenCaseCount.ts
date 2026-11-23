import { useEffect, useState } from 'react';
import { intelCaseService } from '../services/intel/IntelCaseService';
import { caseGroup } from '../types/intel/IntelCaseUI';

/**
 * How many cases are open, as the Cases tabs count them, kept current (plan
 * item 1.8). Null until read, so nothing shows a 0 it has not counted.
 *
 * The globe's Investigation Hub and OpsCenter's admin panel each counted
 * "Active Investigations" from a store no case is written to, and read 0
 * while a case was open.
 */
export function useOpenCaseCount(): number | null {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => {
      intelCaseService.listCases()
        .then((cases) => { if (live) setCount(cases.filter((c) => caseGroup(c.status) === 'open').length); })
        .catch(() => { /* Left as it was: a failed read is not a count of zero. */ });
    };
    load();
    const off = intelCaseService.onChange(load);
    return () => { live = false; off(); };
  }, []);
  return count;
}

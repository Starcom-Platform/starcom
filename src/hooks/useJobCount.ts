import { useSyncExternalStore } from 'react';
import { jobs } from '../services/jobs/jobRegistry';

/** How many jobs are running or held (BD14): the phone bar's count on More. */
export function useJobCount(): number {
  const list = useSyncExternalStore(jobs.subscribe, jobs.snapshot, jobs.snapshot);
  return list.filter((j) => j.state === 'running' || j.state === 'held').length;
}

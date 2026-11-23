import { useEffect, useState } from 'react';
import { takenMissions, type TakenMission } from './takenMissions';

/** The missions taken on here, newest first, redrawn as one is taken, ticked or let go (D-MF, MF7). */
export function useTakenMissions(): TakenMission[] {
  const [, setVersion] = useState(0);
  useEffect(() => takenMissions.subscribe(() => setVersion((n) => n + 1)), []);
  return takenMissions.all();
}

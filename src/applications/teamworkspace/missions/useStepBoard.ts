/**
 * Where each step of a mission worked with a team stands, read from the team's relay (decision D-RS, RS55–RS57):
 * redrawn each minute, so a take frees itself after its 24 hours; null when the mission is worked alone.
 */
import { useEffect, useState } from 'react';
import type { TakenMission } from '../../../services/intel/received/takenMissions';
import { stepBoard, watchStepLabels, type StepLabel, type StepState } from '../../../services/roster/stepLabels';

const nowS = () => Math.floor(Date.now() / 1000);

export function useStepBoard(mission: TakenMission): { board: Record<string, StepState>; read: boolean } | null {
  const relay = mission.team?.relay;
  const coordinate = mission.coordinate;
  const [labels, setLabels] = useState<StepLabel[]>([]);
  const [read, setRead] = useState(false);
  const [now, setNow] = useState(nowS);
  useEffect(() => {
    if (!relay || !coordinate) return undefined;
    setLabels([]);
    setRead(false);
    const stop = watchStepLabels(relay, coordinate, { onLabels: setLabels, onRead: () => setRead(true) });
    const timer = setInterval(() => setNow(nowS()), 60_000);
    return () => { stop(); clearInterval(timer); };
  }, [relay, coordinate]);
  if (!relay || !coordinate) return null;
  return { board: stepBoard(labels, mission.steps.map((s) => s.id), now), read };
}


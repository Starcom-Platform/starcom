/**
 * The missions a person here has taken on (decision D-MF, MF7–MF10). A received package is a statement by the
 * node that signed it, not a record here (useReceivedPackages); taking it on is a decision made here, about
 * work the person will do. So it is kept on this device and sent nowhere (MF8): a public claim comes with
 * reporting back, through the publish review. Any mission is taken whole, desk or field (MF10), its steps a
 * checklist, its safety limits agreed first and kept at its head (MF9).
 *
 * Each keeps the words it was taken with: the package may be changed or closed by its publisher, and what a
 * person agreed to is what they took. It is apart from the missions a person writes (MF7), so nothing here
 * can be packaged or published as theirs.
 *
 * A mission is finished when every step of it is ticked, or, with no steps, marked so by hand; letting it go
 * keeps it finished, so a quest line it unlocked stays unlocked (decision D-RS, RS29).
 */
import type { AcceptedPackage } from '../MissionPackageIngest';
import { missionCardOf, type MissionPlace, type PsiMissionWindow } from './missionCard';
import { countsAskedOf, type CountAsked } from './missionReport';
import { coordinateFor } from '../missionPackageThread';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'TakenMissions' });
const LS_KEY = 'starcom_taken_missions_v1';
const LS_FINISHED_KEY = 'starcom_finished_missions_v1';

export interface TakenStep {
  id: string;
  ask: string;
  effortMinutes?: number;
  done: boolean;
  /** When it was ticked done, ISO. */
  doneAt?: string;
}

/** A report sent on a taken mission (MF11): its day, the counts given, and how many relays took it. */
export interface SentReport {
  day: string;
  values: Record<string, number>;
  sentAt: string;
  relays: number;
  /** The id inside its seal, which a settlement names (NavCom §5.3), and the key that sealed it; absent on one sent before. */
  id?: string;
  author?: string;
}

export interface TakenMission {
  /** The package's address (signer and `d`), as its card keys it. */
  key: string;
  /** The package's `a` coordinate, which a report names (kind:signer:d). */
  coordinate?: string;
  /** The counts it asks to be reported (MF12). */
  counts?: CountAsked[];
  reports?: SentReport[];
  signer: string;
  packageId: string;
  relay: string;
  /** Its mission line, as its card led with it. */
  title: string;
  subject?: string;
  limits?: string;
  where?: 'desk' | 'field';
  place?: MissionPlace;
  closesAt?: number;
  /** A psi mission's window (decision D-PW, PW93): its state is said beside it. */
  psiWindow?: PsiMissionWindow;
  /** Its family (`mission_family`): a safety night's offers no crew, meeting or chat (decision D-RR, kit 5.4). */
  family?: string;
  steps: TakenStep[];
  takenAt: string;
  /** The team working it together, by its relay (D-RS, RS55): its steps are then taken and checked there. */
  team?: { relay: string; name: string };
}

/** What taking needs from a card: everything but whether its steps are done. */
export type TakeInput = Omit<TakenMission, 'steps' | 'takenAt' | 'reports' | 'team'> & { steps: Array<Omit<TakenStep, 'done' | 'doneAt'>> };

/** A received package as taking keeps it: as its card reads it, and the steps not yet done, by their ids. */
export function takeInputOf(pkg: AcceptedPackage): TakeInput {
  const card = missionCardOf(pkg);
  const manifest = pkg.check.manifest;
  const d = pkg.event.tags.find((tag) => tag[0] === 'd')?.[1];
  const counts = countsAskedOf(pkg);
  return {
    key: card.key,
    ...(d ? { coordinate: coordinateFor(pkg.event.pubkey, d) } : {}),
    ...(counts.length ? { counts } : {}),
    signer: pkg.event.pubkey,
    packageId: manifest?.id ?? pkg.event.tags.find((tag) => tag[0] === 'd')?.[1] ?? pkg.event.id,
    relay: pkg.relay,
    title: card.headline,
    ...(card.subject ? { subject: card.subject } : {}),
    ...(card.limits ? { limits: card.limits } : {}),
    ...(card.where ? { where: card.where } : {}),
    ...(card.place ? { place: card.place } : {}),
    ...(card.closesAt !== undefined ? { closesAt: card.closesAt } : {}),
    ...(card.psiWindow ? { psiWindow: card.psiWindow } : {}),
    ...(pkg.event.tags.find((tag) => tag[0] === 'mission_family')?.[1] ? { family: pkg.event.tags.find((tag) => tag[0] === 'mission_family')![1] } : {}),
    steps: (manifest?.objectives ?? [])
      .filter((ask) => !ask.done && ask.ask.trim())
      .map((ask) => ({ id: ask.id, ask: ask.ask.trim(), ...(typeof ask.effortMinutes === 'number' && ask.effortMinutes > 0 ? { effortMinutes: ask.effortMinutes } : {}) })),
  };
}

export interface TakenMissionsStore {
  load(): TakenMission[];
  save(records: TakenMission[]): void;
  /** Missions finished and let go, or marked finished: when, by their coordinate. */
  loadFinished(): Record<string, string>;
  saveFinished(finished: Record<string, string>): void;
}

export class MemoryTakenMissionsStore implements TakenMissionsStore {
  private records: TakenMission[] = [];
  private finished: Record<string, string> = {};
  load(): TakenMission[] { return structuredClone(this.records); }
  save(records: TakenMission[]): void { this.records = structuredClone(records); }
  loadFinished(): Record<string, string> { return { ...this.finished }; }
  saveFinished(finished: Record<string, string>): void { this.finished = { ...finished }; }
}

const isTakenMission = (r: unknown): r is TakenMission => {
  const t = r as TakenMission | null;
  return !!t && typeof t === 'object'
    && [t.key, t.signer, t.packageId, t.title, t.takenAt].every((v) => typeof v === 'string')
    && Array.isArray(t.steps) && t.steps.every((s) => s && typeof s.id === 'string' && typeof s.ask === 'string' && typeof s.done === 'boolean');
};

export class BrowserTakenMissionsStore implements TakenMissionsStore {
  load(): TakenMission[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter(isTakenMission) : [];
    } catch {
      return [];
    }
  }
  save(records: TakenMission[]): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(records));
    } catch (err) {
      log.warn('Could not keep the missions taken on:', err instanceof Error ? err.message : String(err));
    }
  }
  loadFinished(): Record<string, string> {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(LS_FINISHED_KEY) ?? '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string'));
    } catch {
      return {};
    }
  }
  saveFinished(finished: Record<string, string>): void {
    try {
      localStorage.setItem(LS_FINISHED_KEY, JSON.stringify(finished));
    } catch (err) {
      log.warn('Could not keep the missions finished:', err instanceof Error ? err.message : String(err));
    }
  }
}

/** When a taken mission's last step was ticked, if every step is: one with no steps is not finished by taking it. */
function allTicked(mission: TakenMission): string | undefined {
  if (mission.steps.length === 0 || !mission.steps.every((s) => s.done)) return undefined;
  return mission.steps.map((s) => s.doneAt ?? mission.takenAt).sort().pop();
}

export class TakenMissions {
  private records = new Map<string, TakenMission>();
  /** Finished and let go, or marked finished by hand: when, by coordinate. */
  private finished = new Map<string, string>();
  private listeners = new Set<() => void>();

  constructor(private store: TakenMissionsStore = new MemoryTakenMissionsStore()) {
    for (const r of this.store.load()) this.records.set(r.key, r);
    for (const [coordinate, at] of Object.entries(this.store.loadFinished())) this.finished.set(coordinate, at);
  }

  /** Take a mission on, whole. Taking it again keeps when, and what, it was first taken with. */
  take(input: TakeInput, at: string = new Date().toISOString()): TakenMission {
    const existing = this.records.get(input.key);
    if (existing) return existing;
    const record: TakenMission = { ...input, steps: input.steps.map((s) => ({ ...s, done: false })), takenAt: at };
    this.records.set(record.key, record);
    this.persist();
    return record;
  }

  /** Tick a step done, or back. */
  setStepDone(key: string, stepId: string, done: boolean, at: string = new Date().toISOString()): void {
    const mission = this.records.get(key);
    const step = mission?.steps.find((s) => s.id === stepId);
    if (!mission || !step || step.done === done) return;
    const steps = mission.steps.map((s) => {
      if (s.id !== stepId) return s;
      const { doneAt: _, ...rest } = s;
      return done ? { ...rest, done, doneAt: at } : { ...rest, done };
    });
    this.records.set(key, { ...mission, steps });
    this.persist();
  }

  /** Work it with a team, by its relay, or alone again (D-RS, RS55). */
  setTeam(key: string, team: { relay: string; name: string } | null): void {
    const mission = this.records.get(key);
    if (!mission) return;
    if (!team) {
      if (!mission.team) return;
      const { team: _team, ...alone } = mission;
      this.records.set(key, alone);
    } else {
      if (mission.team?.relay === team.relay && mission.team.name === team.name) return;
      this.records.set(key, { ...mission, team: { relay: team.relay, name: team.name } });
    }
    this.persist();
  }

  /** Keeps a report sent on it, after the last. */
  addReport(key: string, report: SentReport): void {
    const mission = this.records.get(key);
    if (!mission) return;
    this.records.set(key, { ...mission, reports: [...(mission.reports ?? []), report] });
    this.persist();
  }

  /** Let a mission go: it is no longer yours to do. One finished stays finished. */
  release(key: string): void {
    const mission = this.records.get(key);
    if (!mission) return;
    const at = allTicked(mission);
    if (at && mission.coordinate && !this.finished.has(mission.coordinate)) this.finished.set(mission.coordinate, at);
    this.records.delete(key);
    this.persist();
  }

  /** When the mission at a package's coordinate was first finished: kept from when it was, or every step ticked. */
  finishedAt(coordinate: string): string | undefined {
    const kept = this.finished.get(coordinate);
    if (kept) return kept;
    const taken = [...this.records.values()].find((r) => r.coordinate === coordinate);
    return taken && allTicked(taken);
  }

  /** Mark one finished by hand, as one with no steps is; one already finished keeps when it was. */
  markFinished(coordinate: string, at: string = new Date().toISOString()): void {
    if (this.finishedAt(coordinate)) return;
    this.finished.set(coordinate, at);
    this.persist();
  }

  /** Undo a mark by hand. Ticked steps are unticked where they are. */
  unmarkFinished(coordinate: string): void {
    if (this.finished.delete(coordinate)) this.persist();
  }

  get(key: string): TakenMission | undefined {
    return this.records.get(key);
  }

  isTaken(key: string): boolean {
    return this.records.has(key);
  }

  /** The newest taken first. */
  all(): TakenMission[] {
    return [...this.records.values()].sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Test seam. */
  reset(): void {
    this.records.clear();
    this.finished.clear();
    this.persist();
  }

  private persist(): void {
    this.store.save(this.all());
    this.store.saveFinished(Object.fromEntries(this.finished));
    this.listeners.forEach((listener) => listener());
  }
}

export const takenMissions = new TakenMissions(
  typeof localStorage !== 'undefined' ? new BrowserTakenMissionsStore() : new MemoryTakenMissionsStore(),
);

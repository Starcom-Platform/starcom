/**
 * Each layer's notes as the note panel shows them (decision D-CT, CT3 and CT4): the note's own
 * title, text, time and sources, nothing added. A mark's GlobeNoteSet is built here, beside its
 * tooltip, so a click opens what the hover named.
 *
 * Sources are a note's `r` tags in order (D-CT, CT2), read by each layer's reader; a note read
 * before it kept them all falls back to its first, `url`.
 */
import type { AiWatchItem } from '../../../services/aiWatch/aiWatch';
import type { CivilUnrestItem } from '../../../services/civilUnrest/civilUnrest';
import type { FieldMission, HeroWatchItem } from '../../../services/heroWatch/heroWatch';
import type { RaverWatchItem } from '../../../services/raverWatch/raverWatch';
import { NO_ALERT_IS_NOT_SAFE } from '../../../services/raverWatch/raverWatchView';
import type { ConflictItem, WarItem } from '../../../services/warConflict/warConflict';
import type { GlobeNote, GlobeNoteSet } from './globeNoteStore';

const sourcesOf = (item: { sources?: string[]; url?: string }): string[] => item.sources ?? (item.url ? [item.url] : []);
const secondsToMs = (s: number): number | null => (Number.isFinite(s) && s > 0 ? s * 1000 : null);
/** Who posted it: its own key, or the key in its address (`<kind>:<pubkey>:<d>`); named, and labelled if an agent's. */
const authorOf = (item: { id: string; pubkey?: string }): { author?: string } => {
  const key = item.pubkey ?? /^\d+:([0-9a-f]{64}):/.exec(item.id)?.[1];
  return key && /^[0-9a-f]{64}$/.test(key) ? { author: key } : {};
};
/** It names a person as its source names them (D-NP): the panel labels it (NP1). */
const namesOf = (item: { namesPeople?: boolean }): { namesPeople?: true } => (item.namesPeople ? { namesPeople: true } : {});

export function aiWatchGlobeNote(item: AiWatchItem): GlobeNote {
  return {
    id: item.id, kind: 'AI Watch note', title: item.title, text: item.content,
    timeMs: secondsToMs(item.publishedAt), sources: sourcesOf(item), ...authorOf(item), ...namesOf(item),
  };
}

export function civilUnrestGlobeNote(item: CivilUnrestItem): GlobeNote {
  return {
    id: item.id, kind: item.section === 'ProtestSurges' ? 'Protest surge' : 'Day of unrest', title: item.title, text: item.content || item.summary || '',
    timeMs: secondsToMs(item.publishedAt), sources: sourcesOf(item), ...authorOf(item), ...namesOf(item),
    // A surge counts reporting, never protest (D-CU, CU4): the panel says so first.
    ...(item.section === 'ProtestSurges' ? { limits: 'A surge in reporting, not in protest.' } : {}),
  };
}

const HERO_KIND: Record<Exclude<HeroWatchItem['kind'], 'field_mission'>, string> = {
  station: 'Lifeboat station',
  operation: 'Relief operation',
  presence: 'Organisations at work',
  summary: 'Hero Watch week',
};

/** What a field mission asks, in its own words: its description, then each ask. */
function missionText(mission: FieldMission): string {
  const asks = mission.objectives.map((o) => `- ${o.ask}`);
  return [mission.description, ...(asks.length ? ['', 'What it asks:', ...asks] : [])].join('\n').trim();
}

export function heroWatchGlobeNote(item: HeroWatchItem): GlobeNote {
  if (item.kind === 'field_mission') {
    return {
      id: item.id, kind: item.state === 'open' ? 'Field mission' : `Field mission, ${item.state}`, title: item.title,
      text: missionText(item), timeMs: secondsToMs(item.createdAt), sources: sourcesOf(item), ...authorOf(item), ...namesOf(item),
      // Never shown without them (D-HW): the panel puts them first.
      ...(item.limits ? { limits: item.limits } : {}),
    };
  }
  return {
    id: item.id, kind: HERO_KIND[item.kind], title: item.title, text: item.content,
    timeMs: secondsToMs(item.createdAt), sources: sourcesOf(item), ...authorOf(item), ...namesOf(item),
  };
}

export function raverWatchGlobeNote(item: RaverWatchItem): GlobeNote {
  return {
    id: item.id, kind: item.layer === 'SceneEvents' ? 'Scene event' : 'Raver Watch note', title: item.title,
    text: item.content,
    timeMs: secondsToMs(item.createdAt), sources: sourcesOf(item), ...authorOf(item), ...namesOf(item),
    // A drug check finds only what it tests for (the legal review of 2026-10-17).
    ...(item.layer === 'DrugCheckAlerts' ? { limits: NO_ALERT_IS_NOT_SAFE } : {}),
  };
}

export function warConflictGlobeNote(item: ConflictItem | WarItem): GlobeNote {
  return {
    id: item.id, kind: item.family === 'war' ? 'War page' : 'Conflict note', title: item.title, text: item.content,
    timeMs: secondsToMs(item.reportedAt), sources: sourcesOf(item), ...authorOf(item), ...namesOf(item),
    ...(item.lenses?.length ? { lenses: item.lenses } : {}),
  };
}

/** A mark's notes, under a heading, or nothing when it has none. */
export function noteSet<T>(heading: string, items: readonly T[], as: (item: T) => GlobeNote): GlobeNoteSet | undefined {
  return items.length ? { heading, notes: items.map(as) } : undefined;
}

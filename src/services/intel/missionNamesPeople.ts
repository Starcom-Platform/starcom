/**
 * A mission names no one (decision D-NP, NP5; the operator, 13 October): a mission view, and the packages Starcom
 * sends to NavCom, refuse one whose text carries the words of a note that names a person. Missions name no one
 * today; this asserts it, against the tagged notes this app has read (namesPeople.ts).
 */
import type { PackageManifest } from '../exchange/types';
import { carriesNamedWords } from './namesPeople';

const strings = (value: unknown): string[] =>
  (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : typeof value === 'string' ? [value] : []);

/**
 * Every word a mission puts before a reader: its name and description, its reports' and intel's titles, each
 * objective's ask, what it hands back, who it is for and its limits, and Mecha Jono's format lines.
 */
export function missionWords(manifest: Pick<PackageManifest, 'name' | 'description'> & Partial<PackageManifest>): string {
  const format = (manifest.metadata as { mechaJono?: { format?: Record<string, unknown> } } | undefined)?.mechaJono?.format;
  return [
    manifest.name,
    manifest.description,
    ...(manifest.reports ?? []).map((r) => r.title),
    ...(manifest.intel ?? []).map((r) => r.title ?? ''),
    ...(manifest.objectives ?? []).flatMap((o) => [o.ask, o.handsBack ?? '', o.for ?? '', ...(o.limits ?? [])]),
    ...strings(format?.mission), ...strings(format?.limits), ...strings(format?.effect),
  ].filter(Boolean).join('\n');
}

/** Every word a Hero Watch field mission puts before a reader: its title, description, limits and asks. */
export function fieldMissionWords(mission: {
  title: string; description: string; limits: string; objectives: ReadonlyArray<{ ask: string; for?: string }>;
}): string {
  return [mission.title, mission.description, mission.limits, ...mission.objectives.flatMap((o) => [o.ask, o.for ?? ''])].filter(Boolean).join('\n');
}

/** Why a mission is refused for carrying a tagged note's words, or null when it carries none. */
export function missionNamesPeopleProblem(text: string): string | null {
  const passage = carriesNamedWords(text);
  return passage === null
    ? null
    : 'It carries the words of a note that names a person, and a mission names no one (decision D-NP, NP5).';
}

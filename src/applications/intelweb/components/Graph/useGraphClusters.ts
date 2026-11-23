/**
 * The clusters IntelWeb draws (decision D-IW, IW8): its notes grouped the way the reader chose, each
 * cluster named, and the notes in no group of that kind in one that says so. A hub that is a group's
 * own (a country when grouping by country, a tag when grouping by tags of its kind) gathers with it.
 */
import { useMemo } from 'react';
import { useMessages } from '../../../../i18n/app/i18n';
import { AREAS } from '../../../../features/globe/areas/areaRegistry';
import { useZoneIndex } from '../../../../features/globe/zones/useZoneIndex';
import { groupNotes, type GroupNote, type Grouping } from '../../../../services/intelweb/intelGroups';
import type { IntelNode } from './IntelGraph';
import type { GraphClusters } from './GraphEngine2D';

/** The cluster of the notes in no group of the kind chosen. */
const NONE = '';

/** The Spheres, by their members (the area registry's, read only here). */
const SPHERES = AREAS.flatMap((area) => (area.kind === 'sphere' && area.from === 'members' ? [{ code: area.code, members: area.members }] : []));
const AREA_NAMES = new Map(AREAS.map((area) => [area.code, area.name]));
const BY_TAG: ReadonlySet<Grouping> = new Set(['theatre', 'desk', 'source', 'category']);

const strings = (value: unknown): string[] | undefined =>
  (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined);
const pointOf = (value: unknown): [number, number] | undefined =>
  (Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number' ? [value[0], value[1]] : undefined);

export function useGraphClusters(nodes: readonly IntelNode[], by: Grouping): GraphClusters {
  const { lang, m } = useMessages();
  const { index } = useZoneIndex(by === 'zone' || by === 'sector');
  return useMemo(() => {
    const notes: GroupNote[] = nodes.filter((n) => n.type === 'report').map((n) => ({
      id: n.id,
      jurisdictions: strings(n.metadata?.jurisdictions),
      hashtags: strings(n.metadata?.hashtags),
      point: pointOf(n.metadata?.coordinates),
    }));
    const grouping = groupNotes(notes, by, { spheres: SPHERES, places: index ? [...index.byId.values()] : [] });
    const of = new Map(grouping.clusterOf);
    for (const id of grouping.ungrouped) of.set(id, NONE);
    const keys = new Set(grouping.groups.map((g) => g.key));
    for (const node of nodes) {
      const key = node.metadata?.key;
      if (typeof key !== 'string' || !keys.has(key)) continue;
      if ((by === 'country' && node.type === 'country') || (BY_TAG.has(by) && node.type === 'tag')) of.set(node.id, key);
    }
    let regions: Intl.DisplayNames | null = null;
    try { regions = new Intl.DisplayNames([lang], { type: 'region' }); } catch { /* the code stands */ }
    const nameOf = (key: string): string => {
      if (by === 'country') return regions?.of(key.toUpperCase()) ?? key.toUpperCase();
      if (by === 'zone' || by === 'sector') return index?.byId.get(key)?.name ?? key;
      if (by === 'sphere') return AREA_NAMES.get(key) ?? key;
      return `#${key}`;
    };
    const names = new Map(grouping.groups.map((g) => [g.key, nameOf(g.key)]));
    if (grouping.ungrouped.length) names.set(NONE, m.intelWeb.none[by]);
    return { of, names };
  }, [nodes, by, index, lang, m]);
}

/**
 * A selected country's relations (decision D-DP, DP5, DP16): its counterparts in the span shown, the
 * cooperative events it shares with each (CAMEO 03–08, Diplomacy's own) and the conflict events
 * (14–20, from the same GDELT snapshot), the most reported first. What the arcs are drawn from, and
 * the drawer's list when a country is selected.
 */
import type { RealGdeltEvent } from '../../services/geopolitical/gdeltEventExport';

export interface CountryRelation {
  counterpart: string;
  cooperation: number;
  conflict: number;
}

export function countryRelations(country: string, cooperation: readonly RealGdeltEvent[], conflict: readonly RealGdeltEvent[]): CountryRelation[] {
  const byCounterpart = new Map<string, CountryRelation>();
  const add = (events: readonly RealGdeltEvent[], kind: 'cooperation' | 'conflict') => {
    for (const event of events) {
      const counterpart = event.actor1ISO3 === country ? event.actor2ISO3 : event.actor2ISO3 === country ? event.actor1ISO3 : null;
      if (!counterpart || counterpart === country) continue;
      const relation = byCounterpart.get(counterpart) ?? { counterpart, cooperation: 0, conflict: 0 };
      relation[kind] += 1;
      byCounterpart.set(counterpart, relation);
    }
  };
  add(cooperation, 'cooperation');
  add(conflict, 'conflict');
  return [...byCounterpart.values()].sort((a, b) =>
    (b.cooperation + b.conflict) - (a.cooperation + a.conflict) || b.cooperation - a.cooperation || a.counterpart.localeCompare(b.counterpart));
}

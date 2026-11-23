/**
 * Finding an area by what it is called (BA24): for the header's search and the
 * report form's finder. A code typed exactly first, the bare eu among them,
 * then names with a word that starts with what was typed, as countries are
 * found (findCountry.ts).
 */
import { AREAS, areaCodeOf, type AreaKind } from './areaRegistry';

export interface FoundArea {
  code: string;
  name: string;
  kind: AreaKind;
}

export function findAreas(query: string, limit = 4): FoundArea[] {
  const q = query.trim().toLowerCase().replace(/[\s-]+/g, ' ');
  if (!q) return [];
  const exact = areaCodeOf(q);
  const byCode = AREAS.filter((area) => area.code === exact);
  const byName = AREAS.filter((area) => area.code !== exact
    && ` ${area.name.toLowerCase().replace(/[\s-]+/g, ' ')}`.includes(` ${q}`));
  return [...byCode, ...byName].slice(0, limit).map(({ code, name, kind }) => ({ code, name, kind }));
}

/**
 * The outlines a watch's territory is read against (D-WL, WL1): a country from the territory index, a US state from
 * Starcom's own lines, any area from the areas' shapes, as territoryResolver finds them for a report. Fetched only when
 * a watch names a territory, once each; a file that could not be read is tried again on the next read, and until then
 * its territories hold nothing, so a watch never pings on a guess.
 */
import { loadTerritories } from '../../components/Globe/Hooks/useTerritories';
import { loadUsStates } from '../raverWatch/usStates';
import { loadAreaShapes } from '../../features/globe/areas/areaShapes';
import { territoryResolver } from '../../features/globe/capture/territoryReports';
import type { PlaceOutline, Watch } from '../../features/watch/watchlist';

const NONE: PlaceOutline = () => null;
let whole: Promise<PlaceOutline> | null = null;

/** The outlines for these watches: none to fetch while no watch names a territory. */
export function watchOutline(list: readonly Watch[]): Promise<PlaceOutline> {
  if (!list.some((w) => w.place.kind === 'territory')) return Promise.resolve(NONE);
  whole ??= Promise.all([loadTerritories(), loadUsStates(), loadAreaShapes()]).then(([territories, states, areas]) => {
    if (!territories || !states || !areas) whole = null;
    const resolve = territoryResolver(territories, states, areas);
    return (code: string) => resolve(code);
  });
  return whole;
}

export function resetWatchOutlineForTests(): void {
  whole = null;
}

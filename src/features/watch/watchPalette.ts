/**
 * Watching a place from the palette (D-WL, WL4, WL9): "watch japan", "watch ring of fire", "watch around here". Offered
 * once the box starts with the verb, the reader's own ("beobachte", "vigiar") or the English: a country from the
 * territory index, any area Starcom draws (a Zone, a continent, a union, a sphere) from the registry, and a circle
 * 300 km around the middle of the view, named by the country or the area it lies in.
 */
import type { PaletteResult } from '../palette/palette';
import { paletteMatch } from '../palette/palette';
import { fill, messagesNow } from '../../i18n/app/i18n';
import { AREAS } from '../globe/areas/areaRegistry';
import { getInspectorActions } from '../globe/inspector/inspectorActions';
import { loadTerritories } from '../../components/Globe/Hooks/useTerritories';
import { showHUDNotification } from '@utils/hudNotifications';
import { addWatch, DEFAULT_CIRCLE_KM, type WatchPlace } from './watchlist';
import { placeWords } from './watchWords';
import type { TerritoryIndex } from '../../services/intel/coverage/territoryIndex';

/** The words after the verb, or null when the box does not start with it (three letters of it at least). */
export function afterVerb(query: string, verbs: readonly string[]): string | null {
  const [first = '', ...rest] = query.trim().toLowerCase().split(/\s+/);
  if (first.length < 3) return null;
  return verbs.some((verb) => { const v = verb.toLowerCase(); return v.startsWith(first) || first.startsWith(v); }) ? rest.join(' ') : null;
}

/** Watches a place and says so: "Watched: Japan", or that twenty are watched already. */
export function watchAndSay(place: WatchPlace): void {
  const w = messagesNow().watch;
  const made = addWatch(place);
  showHUDNotification('refused' in made
    ? { title: w.label, message: w.full, type: 'warning', duration: 6000, glyph: 'action:watchlist' }
    : { title: w.watched, message: placeWords(made.watch.place, w), type: 'info', duration: 4000, glyph: 'action:watchlist' });
}

/** The territory a point lies in, by name; its coordinates where none holds it (the sea). */
export function hereName(at: { lat: number; lng: number }, index: TerritoryIndex | undefined): string {
  const name = index?.at(at.lat, at.lng);
  return name ?? `${Math.abs(at.lat).toFixed(1)}°${at.lat >= 0 ? 'N' : 'S'} ${Math.abs(at.lng).toFixed(1)}°${at.lng >= 0 ? 'E' : 'W'}`;
}

/** The palette's Watch commands for what is typed. */
export async function watchResults(query: string): Promise<readonly PaletteResult[]> {
  const w = messagesNow().watch;
  const rest = afterVerb(query, [w.verb, 'watch']);
  if (rest === null) return [];
  const index = await loadTerritories();
  const keywords = `${w.verb} watch`;
  const centre = getInspectorActions().centre?.() ?? null;
  const here: PaletteResult[] = centre ? [(() => {
    const name = hereName(centre, index);
    return {
      id: 'watch:here', section: 'commands' as const, title: w.watchHere,
      description: fill(w.watchHereSays, { km: DEFAULT_CIRCLE_KM, place: name }),
      glyph: 'action:watchlist' as const, keywords: `${keywords} here around`,
      run: () => watchAndSay({ kind: 'circle', lat: centre.lat, lng: centre.lng, km: DEFAULT_CIRCLE_KM, name }),
    };
  })()] : [];
  if (!rest) return here;
  const place = (code: string, name: string): PaletteResult => ({
    id: `watch:${code}`, section: 'places', title: fill(w.watchPlace, { place: name }), description: w.watchPlaceSays,
    glyph: 'action:watchlist', keywords: `${keywords} ${name}`,
    run: () => watchAndSay({ kind: 'territory', code, name }),
  });
  const countries = (index?.countries() ?? []).map((c) => place(c.code.toLowerCase(), c.name));
  const areas = AREAS.filter((a) => a.from !== 'covered').map((a) => place(a.code, a.name));
  // With a place typed, "around here" is offered only where the words fit it too, scored among the places: "watch
  // japan" puts Japan first, never the circle Enter would otherwise pick.
  return paletteMatch([...countries, ...areas, ...here.map((r) => ({ ...r, section: 'places' as const }))], query);
}

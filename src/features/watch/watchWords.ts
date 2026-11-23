/**
 * A watch and its pings in the reader's words (D-WL; D-ML): its place's name, a circle's "300 km around Tokyo", a
 * notice's title and line, and the inspector's line naming the watches an item landed in.
 */
import { fill, listed } from '../../i18n/app/i18n';
import type { Messages } from '../../i18n/app/en';
import { placeOf } from '../../services/quakes/quakePings';
import { isRecordItem, type WatchPing } from '../../services/watch/watchPings';
import type { WatchPlace } from './watchlist';

export type WatchMessages = Messages['watch'];

/** A watch's name: its place's, or so many km around it. */
export const placeWords = (place: WatchPlace, w: WatchMessages): string =>
  (place.kind === 'circle' ? fill(w.around, { km: String(place.km), place: place.name }) : place.name);

const ALERTS = ['green', 'orange', 'red'] as const;

/** The layer each Record kind is drawn by, as the layers name themselves in every language. */
export const RECORD_LAYER = { intel: 'Intel Reports', war: 'War & Conflict', unrest: 'Civil Unrest' } as const;

/** How long ago, in the reader's words: "just now", "3 min ago", "2 h ago". */
export function agoIn(ms: number, w: WatchMessages): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return w.ago.now;
  const m = Math.round(s / 60);
  return m < 60 ? fill(w.ago.min, { n: m }) : fill(w.ago.h, { n: Math.round(m / 60) });
}

/** The notice's title and line: "New in Japan", "M5.1, 30 km S of Tokyo, Japan, 3 min ago". */
export function pingNotice(ping: WatchPing, w: WatchMessages, nowMs: number): { title: string; message: string } {
  const { item } = ping;
  const ago = agoIn(nowMs - item.timeMs, w);
  const message = isRecordItem(item)
    ? fill(w.recordWords, { kind: RECORD_LAYER[item.kind], what: item.title, ago })
    : item.kind === 'quake'
      ? fill(w.quakeWords, { m: item.level.toFixed(1), place: placeOf(item.event as Parameters<typeof placeOf>[0]), ago })
      : fill(w.hazardWords, { alert: w.alerts[ALERTS[item.level] ?? 'green'], what: item.event.description ?? item.event.type, ago });
  return { title: fill(w.newIn, { place: placeWords(ping.watches[0].place, w) }), message };
}

/** The inspector's line: "In your watches: Japan, 300 km around Tokyo". */
export const watchedInWords = (ping: WatchPing, w: WatchMessages): string =>
  fill(w.watchedIn, { places: listed(ping.watches.map((x) => placeWords(x.place, w))) });

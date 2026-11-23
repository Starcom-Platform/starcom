/**
 * What the globe says while its layers load, and after (decision D-LS, critique C4).
 *
 * From the shown layers, their feeds (each tagged with its layer), what each layer drew, and when each feed was
 * first seen loading: the feeds still loading, with the time waited and the progress a layer counts (LS2); the
 * feeds that failed, and why; and the layers whose feeds are all in and which drew nothing (LS4), in their feeds'
 * own words. Nothing is claimed that is not known: a layer that cannot say what it drew is never called empty,
 * and a feed that has not reported yet is waited on, not counted a failure.
 *
 * A feed's state is the share card's and the key's (shareCardProvenance.ts, feedState): one reading of each source.
 */
import { feedState, type FeedProvenance } from '../capture/shareCardProvenance';

export interface FeedWait {
  /** Stable while the feed loads, though its name may change as its items arrive (feedKeys). */
  key: string;
  layer: string;
  name: string;
  /** How the feed is named where space is short, when it has a short name. */
  shortName?: string;
  /** Since the feed was first seen loading; 0 when this is the first look. */
  waitedMs: number;
  progress?: { done: number; total: number };
}

export interface FeedFailure {
  key: string;
  layer: string;
  name: string;
  error: string;
}

export interface EmptyLayer {
  layer: string;
  /** Its feeds' names, which say why where the layer knows ("1 past its end, not drawn"). */
  feeds: string[];
}

export interface LoadStatus {
  loading: FeedWait[];
  failed: FeedFailure[];
  empty: EmptyLayer[];
}

export interface LoadStatusInput {
  /** The layers shown, by the layer catalogue's id. */
  shown: readonly string[];
  feeds: readonly FeedProvenance[];
  /** Whether a layer drew anything: true, false, or null when it cannot say. */
  drew: (layer: string) => boolean | null;
  /** When each feed was first seen loading, by its key (feedKeys). */
  firstLoadingAt: ReadonlyMap<string, number>;
  now: number;
}

/**
 * Each feed's key across renders: its layer and its place among that layer's feeds. Not its name, which a layer
 * may change while it loads (Raver Watch's names list the sources as their items arrive), and a new name would
 * restart the seconds waited and open a second job.
 */
export function feedKeys(feeds: readonly FeedProvenance[]): string[] {
  const seen = new Map<string, number>();
  return feeds.map((f) => {
    const layer = f.layer ?? '';
    const at = seen.get(layer) ?? 0;
    seen.set(layer, at + 1);
    return `${layer}#${at}`;
  });
}

/**
 * Whether a feed is still loading: loading with nothing in, or counting its progress short of its total. The
 * second is a read partly in, Intel Reports' relays one by one: the feed has a time, which feedState calls
 * loaded, and the rest is still to come. A refresh in flight over data in hand, with no count, is in.
 */
export function isStillLoading(feed: FeedProvenance, now: number): boolean {
  if (feedState(feed, new Date(now)).kind === 'loading') return true;
  return feed.loading === true && !feed.error && !!feed.progress && feed.progress.done < feed.progress.total;
}

/** Whether a feed is still being waited on: still loading, or not yet reported at all. */
export function isWaiting(feed: FeedProvenance, now: number): boolean {
  return isStillLoading(feed, now) || feedState(feed, new Date(now)).kind === 'never';
}

export function layerLoadStatus({ shown, feeds, drew, firstLoadingAt, now }: LoadStatusInput): LoadStatus | null {
  const status: LoadStatus = { loading: [], failed: [], empty: [] };
  const date = new Date(now);
  const keys = feedKeys(feeds);
  for (const layer of shown) {
    const own = feeds.map((f, i) => ({ f, key: keys[i] })).filter(({ f }) => f.layer === layer);
    let settled = true;
    let failed = false;
    for (const { f, key } of own) {
      const state = feedState(f, date);
      if (isWaiting(f, now)) {
        settled = false;
        const since = firstLoadingAt.get(key);
        status.loading.push({
          key, layer, name: f.name, ...(f.shortName ? { shortName: f.shortName } : {}),
          waitedMs: since === undefined ? 0 : Math.max(0, now - since),
          ...(f.progress ? { progress: f.progress } : {}),
        });
      } else if (state.kind === 'failed') {
        failed = true;
        status.failed.push({ key, layer, name: f.name, error: state.error });
      }
    }
    if (own.length > 0 && settled && !failed && drew(layer) === false) status.empty.push({ layer, feeds: own.map(({ f }) => f.name) });
  }
  return status.loading.length || status.failed.length || status.empty.length ? status : null;
}

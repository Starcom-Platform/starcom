/**
 * Two copies of Starcom in one browser, one workspace (found 2026-10-11, building Uplink's side panel,
 * decision D-EX, E2, W6).
 *
 * Each copy of the app (a tab, another tab, Uplink's side panel) keeps the whole workspace in memory
 * and saved it whole. So a copy open since morning, saving anything at all, wrote back the workspace as
 * it was when it opened, and every case, report and capture another copy had made since was gone. The
 * side panel made two copies the usual case.
 *
 * Now a copy saves only its own changes over what is stored: what it added, altered or took out since
 * it last read or wrote the workspace, record by record, by each record's id. What another copy saved
 * stays. Where both changed one record, the later save of it stands, as one copy's did before for all.
 */

/** The workspace's collections: lists of records, each with an id (the deletion log: kind, id and when). */
const COLLECTIONS = ['reports', 'intel', 'packages', 'relationships', 'cases', 'missions', 'deletions'] as const;
export type Collection = (typeof COLLECTIONS)[number];

type Workspace = { version?: number; metadata?: unknown } & { [K in Collection]?: unknown[] };

export interface CollectionChanges {
  /**
   * Records added or altered, in this copy's order, each with the key of the record before it here:
   * null when it was put in front of records this copy had, END when this copy had none before it.
   */
  put: Array<{ key: string; record: unknown; after: string | null | typeof END }>;
  /** Keys of records this copy took out. */
  removed: string[];
}
export type Changes = Partial<Record<Collection, CollectionChanges>>;

/** Goes after everything stored: added to a list this copy held empty, as records are added, at the end. */
const END = Symbol('end');

const keyOf = (collection: Collection, record: unknown): string => {
  const r = (record ?? {}) as Record<string, unknown>;
  if (collection === 'deletions') return `${String(r.kind)}:${String(r.id)}:${String(r.deletedAt)}`;
  return typeof r.id === 'string' || typeof r.id === 'number' ? String(r.id) : JSON.stringify(record);
};

/** What `current` changed since `base`, by collection; collections it did not touch are left out. */
export function changesSince(base: Workspace, current: Workspace): Changes {
  const changes: Changes = {};
  for (const collection of COLLECTIONS) {
    const before = new Map((base[collection] ?? []).map((r) => [keyOf(collection, r), JSON.stringify(r)]));
    const now = current[collection] ?? [];
    const kept = new Set<string>();
    const put: CollectionChanges['put'] = [];
    let after: string | null | typeof END = before.size === 0 ? END : null;
    for (const record of now) {
      const key = keyOf(collection, record);
      kept.add(key);
      if (before.get(key) !== JSON.stringify(record)) put.push({ key, record, after });
      after = key;
    }
    const removed = [...before.keys()].filter((key) => !kept.has(key));
    if (put.length || removed.length) changes[collection] = { put, removed };
  }
  return changes;
}

/**
 * The stored workspace `latest` with `changes` laid over it: each changed record replaces its stored
 * one, or goes in after the record it followed; each record taken out goes. Everything else, and the
 * stored metadata, is `latest`'s; the state version is the newer of the two.
 */
export function mergeWorkspaces<W extends Workspace>(latest: W, changes: Changes, version?: number): W {
  const merged = { ...latest } as W;
  if (version !== undefined && (latest.version ?? 0) < version) merged.version = version;
  for (const collection of COLLECTIONS) {
    const change = changes[collection];
    if (!change) continue;
    const gone = new Set(change.removed);
    const list = (latest[collection] ?? []).filter((r) => !gone.has(keyOf(collection, r)));
    for (const { key, record, after } of change.put) {
      const at = list.findIndex((r) => keyOf(collection, r) === key);
      if (at >= 0) { list[at] = record; continue; }
      if (after === END) { list.push(record); continue; }
      const before = after === null ? -1 : list.findIndex((r) => keyOf(collection, r) === after);
      // The record it followed is gone from what is stored: at the end, as records are added.
      if (after !== null && before === -1) list.push(record);
      else list.splice(before + 1, 0, record);
    }
    (merged as Workspace)[collection] = list;
  }
  return merged;
}

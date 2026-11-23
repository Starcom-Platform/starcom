#!/usr/bin/env tsx
/**
 * What Mecha Jono publishes that this build does not know (decision IX1).
 *
 * Their spec moves: on 3 October their handoff doc listed Interchange 3.6.0 to
 * 3.6.3 and Raver Watch v1.5 and v1.6, all published after Starcom's build of
 * the layers. Read against the live notes, five War & Conflict event types had
 * no glyph and were drawn as plain reports, two sources had no name, so a card
 * printed "from mofa_jp", and 16 scene-news notes were refused. That was found
 * by chance. This finds it on purpose: it reads The Record as the layers do,
 * through the same readers, and lists
 *   - event types the glyph table does not know, and sources without a name;
 *   - notes refused, by why, with the tags of the kinds no layer reads;
 *   - the version their discovery manifest states, for the person reading.
 *
 * Read-only: it sends REQ and CLOSE, and nothing else. A spot check, run when
 * they post a new version; there is no schedule (the owner's decision IX1).
 *
 * Usage:   npm run audit:interchange            (Node 22: it uses the global WebSocket)
 * Exit 0: nothing unknown. 1: something this build does not know, listed.
 * 2: The Record could not be read, which says nothing about the notes.
 */
import type { Event, Filter } from 'nostr-tools';
import { THE_RECORD_RELAY, RAVER_WATCH_PUBLISHERS, WAR_CONFLICT_PUBLISHERS } from '../src/config/publicInfrastructure';
import { readWarConflictNote } from '../src/services/warConflict/warConflict';
import { eventGlyphKnown, sourceNamed } from '../src/services/warConflict/warConflictView';
import { readRaverWatchNote, unreadKindOf } from '../src/services/raverWatch/raverWatch';

const cannotRead = (why: string): never => {
  console.error(`\n  CANNOT READ THE RECORD: ${why}\n  This says nothing about the notes.\n`);
  process.exit(2);
};
if (typeof WebSocket === 'undefined') cannotRead('this Node has no WebSocket; run it under Node 22');

/** Every event a filter matches, a page before the oldest at a time: The Record sends at most 500 per filter. */
async function readAll(socket: WebSocket, filter: Filter): Promise<Event[]> {
  const events = new Map<string, Event>();
  let until: number | undefined;
  for (let page = 0; ; page += 1) {
    const id = `audit-${page}-${Math.random().toString(36).slice(2, 8)}`;
    const fresh = await new Promise<number>((resolve, reject) => {
      let count = 0;
      const timer = setTimeout(() => reject(new Error(`no end of stored events after 30 s (${JSON.stringify(filter)})`)), 30_000);
      const listen = (message: MessageEvent) => {
        const frame = JSON.parse(String(message.data));
        if (frame[1] !== id) return;
        if (frame[0] === 'EVENT' && !events.has(frame[2].id)) { events.set(frame[2].id, frame[2]); count += 1; }
        if (frame[0] === 'EOSE' || frame[0] === 'CLOSED') {
          clearTimeout(timer);
          socket.removeEventListener('message', listen);
          socket.send(JSON.stringify(['CLOSE', id]));
          if (frame[0] === 'CLOSED') reject(new Error(`closed: ${frame[2]}`)); else resolve(count);
        }
      };
      socket.addEventListener('message', listen);
      socket.send(JSON.stringify(['REQ', id, until === undefined ? filter : { ...filter, until }]));
    });
    if (fresh === 0) return [...events.values()];
    until = Math.min(...[...events.values()].map((e) => e.created_at));
  }
}

const tally = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
const listed = (map: Map<string, number>) => [...map].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`).join(', ');

const socket = new WebSocket(THE_RECORD_RELAY);
await new Promise<void>((resolve, reject) => {
  socket.addEventListener('open', () => resolve(), { once: true });
  socket.addEventListener('error', () => reject(new Error('the connection failed')), { once: true });
}).catch((e) => cannotRead(String(e)));

let unknown = 0;
try {
  const manifest = await readAll(socket, { kinds: [30078], authors: [...WAR_CONFLICT_PUBLISHERS], '#d': ['mecha-jono:interchange'] });
  const version = manifest[0]?.tags.find((t) => t[0] === 'version')?.[1]
    ?? (() => { try { return JSON.parse(manifest[0]?.content ?? '{}').version; } catch { return undefined; } })();
  console.log(`\n  Their discovery manifest: ${manifest.length ? `version ${version ?? 'not stated'}` : 'not found'}`);

  // War & Conflict, as the layer reads it.
  const war = await readAll(socket, { kinds: [30023], authors: [...WAR_CONFLICT_PUBLISHERS], '#t': ['conflict_desk', 'war_map'] });
  const events = new Map<string, number>();
  const sources = new Map<string, number>();
  const warRefused = new Map<string, number>();
  for (const event of war) {
    const read = readWarConflictNote(event);
    if ('refused' in read) { tally(warRefused, read.refused); continue; }
    // A war's note names no event or source of its own; an item's names both.
    if (read.family !== 'item' || read.retracted) continue;
    for (const id of new Set(read.events.map((e) => e.id))) if (!eventGlyphKnown(id)) tally(events, id);
    if (read.source && !sourceNamed(read.source)) tally(sources, read.source);
  }
  console.log(`\n  War & Conflict: ${war.length} notes read`);
  console.log(`    event types with no glyph: ${listed(events) || 'none'}`);
  console.log(`    sources with no name: ${listed(sources) || 'none'}`);
  console.log(`    refused: ${listed(warRefused) || 'none'}`);
  unknown += events.size + sources.size;

  // Raver Watch, a kind at a time, as the layer reads it.
  const raver = [
    ...await readAll(socket, { kinds: [30023], authors: [...RAVER_WATCH_PUBLISHERS], '#t': ['raver_watch'] }),
    ...await readAll(socket, { kinds: [31923], authors: [...RAVER_WATCH_PUBLISHERS], '#t': ['raver_watch'] }),
  ];
  const raverRefused = new Map<string, number>();
  const kinds = new Map<string, number>();
  for (const event of raver) {
    const read = readRaverWatchNote(event, [...RAVER_WATCH_PUBLISHERS]);
    if (!('refused' in read)) continue;
    tally(raverRefused, read.refused);
    const kind = unreadKindOf(event);
    if (kind) tally(kinds, kind);
  }
  console.log(`\n  Raver Watch: ${raver.length} notes read`);
  console.log(`    kinds no layer reads: ${listed(kinds) || 'none'}`);
  console.log(`    refused: ${listed(raverRefused) || 'none'}`);
  unknown += kinds.size;
} catch (e) {
  cannotRead(e instanceof Error ? e.message : String(e));
} finally {
  socket.close();
}

console.log(unknown ? `\n  ${unknown} things this build does not know: give each a glyph, a name or a layer, or decide to leave it.\n`
  : '\n  Nothing they publish is unknown to this build.\n');
process.exit(unknown ? 1 : 0);

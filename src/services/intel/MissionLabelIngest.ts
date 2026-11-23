/**
 * NavCom's labels on the packages this app shows (interchange rev 11; D-MX:
 * MX1, MX5): kind 1985 in `navcom.mission`, filtered `#a` for those
 * packages, from every relay this node reads. Operators publish them to
 * NavCom's relays, relay.damus.io and nos.lol; Mecha Jono's settlements go to
 * The Record (NavCom's section 5.0). The read set has all three.
 *
 * Like the reply ingest beside it, it refuses an unverifiable signature and a
 * label naming no package it asked about, and subscribes to nothing when
 * there is nothing to ask about: an empty `#a` is, on most relays, no filter.
 *
 * It reads; it never writes, and keeps no label past its expiry.
 */
import { verifyEvent, type Event as NostrEvent, type Filter, type SimplePool } from 'nostr-tools';
import { createRelayPool } from '../nostr/relayPool';
import { readRelays } from '../nostr/publishTargets';
import { readMissionLabel, MISSION_LABEL_KIND, MISSION_LABEL_NAMESPACE, type MissionLabel, type MissionLabelValue } from './missionLabels';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'MissionLabels' });

/** Rebuilt from its fields before verifying: a cached result survives a spread copy (see missionCapability.ts). */
const canonical = (e: NostrEvent): NostrEvent => ({
  id: e.id, pubkey: e.pubkey, created_at: e.created_at,
  kind: e.kind, tags: e.tags, content: e.content, sig: e.sig,
} as NostrEvent);

export class MissionLabelIngest {
  private pool: SimplePool | null = null;
  private closers: Array<() => void> = [];
  private seenIds = new Set<string>();
  private listeners = new Set<(label: MissionLabel) => void>();
  private answeredListeners = new Set<() => void>();
  private watching = new Set<string>();
  private words = '';
  private answered = new Set<string>();

  constructor(private readonly relays: string[] = [...readRelays('MISSION')]) {}

  subscribe(listener: (label: MissionLabel) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Told when a relay has sent everything it holds: before that, no labels seen means nothing. */
  onAnswered(listener: () => void): () => void {
    this.answeredListeners.add(listener);
    return () => this.answeredListeners.delete(listener);
  }

  /** How many relays have sent all they hold for this filter. */
  relaysAnswered(): number {
    return this.answered.size;
  }

  /**
   * Reads the labels on these packages; only those saying one of `words`, when given. NavCom asks for a report's
   * labels by word (§5.3), so a busy mission's claims cannot push them past a relay's limit.
   */
  start(coordinates: string[], words: readonly MissionLabelValue[] = []): void {
    const wanted = [...new Set(coordinates.filter((c) => c.trim().length > 0))];
    if (wanted.length === 0) {
      this.stop();
      return;
    }
    const said = [...new Set(words)].sort().join(' ');
    const unchanged = wanted.length === this.watching.size && wanted.every((c) => this.watching.has(c)) && said === this.words;
    if (this.pool && unchanged) return;

    this.stop();
    this.watching = new Set(wanted);
    this.words = said;
    this.pool = createRelayPool();
    const filter: Filter & { '#a': string[]; '#L': string[]; '#l'?: string[] } = {
      kinds: [MISSION_LABEL_KIND], '#L': [MISSION_LABEL_NAMESPACE], '#a': wanted, ...(said ? { '#l': said.split(' ') } : {}),
    };
    for (const relay of this.relays) {
      const sub = this.pool.subscribeMany([relay], filter, {
        onevent: (event: NostrEvent) => this.handle(event, relay),
        oneose: () => {
          this.answered.add(relay);
          this.answeredListeners.forEach((listener) => { try { listener(); } catch (error) { log.warn('a listener threw', error); } });
        },
        onclose: (reason: unknown) => log.debug(`label subscription closed on ${relay}`, reason),
      });
      this.closers.push(() => sub.close?.());
    }
  }

  private handle(event: NostrEvent, relay: string): void {
    if (!event?.id || this.seenIds.has(event.id)) return;
    this.seenIds.add(event.id);
    if (!verifyEvent(canonical(event))) {
      log.debug('refused a label whose signature does not verify', { id: event.id, relay });
      return;
    }
    const label = readMissionLabel(event);
    if (!label) return;
    // Only the words asked for, as only the packages: a relay may answer a filter loosely.
    if (this.words && !this.words.split(' ').includes(label.value)) return;
    // Only the packages asked about: a relay may answer a filter loosely.
    const coordinates = label.coordinates.filter((c) => this.watching.has(c));
    if (coordinates.length === 0) return;
    const asked = { ...label, coordinates };
    this.listeners.forEach((listener) => { try { listener(asked); } catch (error) { log.warn('a label listener threw', error); } });
  }

  stop(): void {
    this.closers.forEach((close) => { try { close(); } catch { /* already closed */ } });
    this.closers = [];
    if (this.pool) {
      try { this.pool.close(this.relays); } catch { /* already closed */ }
      this.pool = null;
    }
    this.watching.clear();
    this.words = '';
    this.answered.clear();
  }
}

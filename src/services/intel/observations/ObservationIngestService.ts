import type { Observation, Source } from '../../../types/intel/SourceObservation';
import type { SourceAdapter } from './adapters/types';
import { dedupeObservations } from './createObservation';
import {
  initialStatus, recordFailure, recordSuccess, summariseCoverage,
  type CoverageSummary, type SourceIngestStatus,
} from './sourceIngestStatus';
import { createLogger } from '@utils/logger';

const log = createLogger({ prefix: 'ObservationIngest' });

/**
 * Runs the source adapters and holds what they produced.
 *
 * This is the piece that was missing. Every adapter, the shared envelope,
 * derived weight, integrity-by-source and ingest status were all built and
 * tested, and none of them had a single runtime call site — "six sources feed
 * one correlation engine" was true of the test suite and nothing else. An
 * orphan-export guard now refuses that state; this is what makes it green.
 *
 * A fetcher is supplied per source rather than owned here, so this service
 * stays testable without network and so a source whose fetch path does not
 * exist yet is a registration that is simply absent, not a silent failure.
 */

export interface RegisteredSource<TRaw = unknown> {
  adapter: SourceAdapter<TRaw>;
  /** Fetches this source's raw records. Rejects on failure; never returns partial silently. */
  fetch: () => Promise<TRaw[]>;
}

export class ObservationIngestService {
  private sources: RegisteredSource[] = [];
  private observations: Observation[] = [];
  private statuses = new Map<string, SourceIngestStatus>();

  register<TRaw>(source: RegisteredSource<TRaw>): void {
    this.sources.push(source as RegisteredSource);
    this.statuses.set(source.adapter.source.id, initialStatus(source.adapter.source));
  }

  /**
   * Poll every registered source once.
   *
   * One source failing does not fail the run. Six sources exist precisely so
   * that losing one degrades the picture rather than emptying it — and the
   * loss is recorded as `unreachable` rather than as an empty result, so a
   * quiet map is distinguishable from a blind one.
   */
  async ingestAll(now: () => Date = () => new Date()): Promise<{
    observations: Observation[];
    coverage: CoverageSummary;
  }> {
    const collected: Observation[] = [];

    await Promise.all(this.sources.map(async ({ adapter, fetch }) => {
      const id = adapter.source.id;
      const previous = this.statuses.get(id) ?? initialStatus(adapter.source);
      try {
        const raw = await fetch();
        const { observations, dropped } = adapter.toObservations(raw);
        collected.push(...observations);
        this.statuses.set(id, recordSuccess(previous, { observations: observations.length, dropped: dropped.length }, now()));
        if (dropped.length) {
          // Dropped records are a data-quality signal, not noise to swallow —
          // a source quietly discarding most of its input looks identical to a
          // source with little data.
          log.warn(`${id}: dropped ${dropped.length} record(s)`, dropped.slice(0, 3));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.statuses.set(id, recordFailure(previous, message, now()));
        log.warn(`${id}: unreachable — ${message}`);
      }
    }));

    // Polled sources re-deliver the same records every cycle. Without this,
    // repetition would present to the correlation engine as independent
    // corroboration, which is the worst mistake it can make.
    this.observations = dedupeObservations([...this.observations, ...collected]);

    return { observations: this.observations, coverage: this.coverage() };
  }

  getObservations(): Observation[] {
    return this.observations;
  }

  getStatuses(): SourceIngestStatus[] {
    return [...this.statuses.values()];
  }

  coverage(): CoverageSummary {
    return summariseCoverage(this.getStatuses());
  }

  /** Sources registered, for the Phase 1 gate's "six sources" claim. */
  registeredSourceIds(): string[] {
    return this.sources.map(s => s.adapter.source.id);
  }

  /** The sources registered, so a panel can name a feed by its own label (plan item 3.6). */
  registeredSources(): Source[] {
    return this.sources.map(s => s.adapter.source);
  }

  reset(): void {
    this.observations = [];
    this.statuses.clear();
    this.sources = [];
  }
}

export const observationIngestService = new ObservationIngestService();

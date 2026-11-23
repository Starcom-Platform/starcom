/**
 * Names as published (decision D-NP) at the intel intake: a report names a person when its publisher's own
 * `t=names_people` says so, never because its text writes "#names_people", which the intake also reads as a hashtag.
 */
import { describe, it, expect } from 'vitest';
import { NostrStarcomIntelIngest } from '../NostrStarcomIntelIngest';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { carriesNamedWords } from '../namesPeople';

type Handler = (event: unknown, relay: string) => void;
const handle = (ingest: NostrStarcomIntelIngest, event: unknown) =>
  (ingest as unknown as { readEvent: Handler }).readEvent(event, 'wss://test');

const note = (extraTags: string[][], content: string, id: string) => ({
  id, pubkey: 'a'.repeat(64), created_at: 1_790_000_000, kind: 30023, sig: '',
  tags: [['t', 'starcom_intel'], ['jurisdiction', 'us-va'], ['d', `starcom-intel-${id}`], ...extraTags],
  content,
});

const read = (event: unknown): IntelReportUI | undefined => {
  const ingest = new NostrStarcomIntelIngest({ relays: [], searchRelays: [] });
  const seen: IntelReportUI[] = [];
  ingest.subscribe((r) => seen.push(r as IntelReportUI));
  handle(ingest, event);
  return seen[0];
};

describe('a report that names a person', () => {
  it('is marked so by its publisher\'s t tag, and its words are remembered for the missions', () => {
    const report = read(note([['t', 'names_people']], 'Governor Jane Roe signs the budget bill into law today, as reported.', 'one'));
    expect(report?.namesPeople).toBe(true);
    expect(carriesNamedWords('A mission quoting: governor Jane Roe signs the budget bill into law today, as reported')).not.toBeNull();
  });

  it('is not marked by a #names_people in its text alone', () => {
    const report = read(note([], 'An open thread about a federal award #names_people', 'two'));
    expect(report).toBeDefined();
    expect(report?.hashtags).toContain('names_people');
    expect(report?.namesPeople).toBeUndefined();
    expect(carriesNamedWords('An open thread about a federal award')).toBeNull();
  });
});

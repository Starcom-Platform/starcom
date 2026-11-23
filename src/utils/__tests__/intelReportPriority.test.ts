import { describe, it, expect } from 'vitest';
import { getIntelReportPriority } from '../intelReportPriority';

describe('getIntelReportPriority', () => {
  it('classifies URGENT or CRITICAL tags as critical', () => {
    expect(getIntelReportPriority({ tags: ['URGENT'] })).toBe('critical');
    expect(getIntelReportPriority({ tags: ['CRITICAL'] })).toBe('critical');
  });

  it('classifies HIGH tag as high', () => {
    expect(getIntelReportPriority({ tags: ['HIGH'] })).toBe('high');
  });

  it('classifies MEDIUM tag as medium', () => {
    expect(getIntelReportPriority({ tags: ['MEDIUM'] })).toBe('medium');
  });

  it('classifies an explicit LOW tag as low', () => {
    // There was no LOW check at all before: 'low' existed only as the
    // fallthrough, so showLow never once meant "someone said low".
    expect(getIntelReportPriority({ tags: ['LOW'] })).toBe('low');
  });

  // This block previously asserted 'low' for both cases — it pinned the bug.
  // Untagged reports were being narrated as low priority and then hidden by the
  // globe's showLow: false default, which made every report the app creates for
  // itself invisible on its own globe.
  it('reports unset when nobody stated a priority — not low', () => {
    expect(getIntelReportPriority({ tags: ['OSINT', 'random'] })).toBe('unset');
    expect(getIntelReportPriority({ tags: [] })).toBe('unset');
  });

  it('reports unset for the tags the app itself assigns when creating a report', () => {
    // The globe context menu, the offline path, and Nostr ingest respectively.
    // None of these is a priority statement, and all three were being hidden.
    expect(getIntelReportPriority({ tags: ['user-created', 'context-menu'] })).toBe('unset');
    expect(getIntelReportPriority({ tags: ['location', 'offline'] })).toBe('unset');
    expect(getIntelReportPriority({ tags: ['nostr', 'relay:wss://relay.damus.io'] })).toBe('unset');
  });

  it('prioritizes critical over other tags when multiple are present', () => {
    expect(getIntelReportPriority({ tags: ['LOW', 'HIGH', 'CRITICAL'] })).toBe('critical');
  });
});

/*
 * The case that made this classifier decorative for every ingested report
 * (decision D-F, step 6, part 4).
 *
 * The ingest's normalizeHashtag lowercases every hashtag it collects, and
 * reportToMarker merges those hashtags into the marker's tags. So an author
 * writing #CRITICAL on a Nostr post produced a marker tagged `critical`, and
 * exact uppercase membership classified it `unset`. The four upper tiers of the
 * globe's priority filter had never once fired on a report from the network;
 * showUnset was the only reason any of them were drawn.
 *
 * Every test above passes uppercase tags, which is why the suite agreed with the
 * bug. Nothing in the tree emits an uppercase priority tag from code — the only
 * way to produce one is to type it by hand into a tag field.
 */
describe('getIntelReportPriority: the author wrote it in whatever case they liked', () => {
  it('reads a lowercase priority tag, which is the only kind the ingest produces', () => {
    expect(getIntelReportPriority({ tags: ['critical'] })).toBe('critical');
    expect(getIntelReportPriority({ tags: ['urgent'] })).toBe('critical');
    expect(getIntelReportPriority({ tags: ['high'] })).toBe('high');
    expect(getIntelReportPriority({ tags: ['medium'] })).toBe('medium');
    expect(getIntelReportPriority({ tags: ['low'] })).toBe('low');
  });

  it('reads whatever case it is given', () => {
    expect(getIntelReportPriority({ tags: ['Critical'] })).toBe('critical');
    expect(getIntelReportPriority({ tags: ['UrGeNt'] })).toBe('critical');
    expect(getIntelReportPriority({ tags: ['High'] })).toBe('high');
  });

  /*
   * The exact shape a Nostr report arrives in: internal provenance tags from the
   * ingest, plus the author's hashtags, lowercased and merged by reportToMarker.
   */
  it('classifies a report as it actually arrives from a relay', () => {
    expect(getIntelReportPriority({
      tags: ['nostr', 'relay:wss://relay.damus.io', 'critical', 'geoint'],
    })).toBe('critical');
  });

  /*
   * Still exact membership, not a substring match. This is the distinction that
   * keeps a tag which merely CONTAINS a priority word out of that bucket — and
   * the tree already carries such tags: caseDataGenerator writes
   * 'critical-infrastructure'.
   */
  it('does not treat a tag that merely contains a priority word as one', () => {
    expect(getIntelReportPriority({ tags: ['critical-infrastructure'] })).toBe('unset');
    expect(getIntelReportPriority({ tags: ['high-value', 'person'] })).toBe('unset');
    expect(getIntelReportPriority({ tags: ['lowland'] })).toBe('unset');
    expect(getIntelReportPriority({ tags: ['mediumwave'] })).toBe('unset');
  });

  it('keeps critical ahead of the rest regardless of case', () => {
    expect(getIntelReportPriority({ tags: ['low', 'HIGH', 'critical'] })).toBe('critical');
    expect(getIntelReportPriority({ tags: ['medium', 'high'] })).toBe('high');
  });

  /*
   * Whitespace and a leading '#' are what a hand-typed tag field produces.
   * normalizeHashtag strips both on the ingest path; a tag typed into
   * IntelWorkspaceConsole or ReportEditPanel is only trimmed.
   */
  it('reads a tag someone typed with a hash or a space', () => {
    expect(getIntelReportPriority({ tags: ['#critical'] })).toBe('critical');
    expect(getIntelReportPriority({ tags: [' high '] })).toBe('high');
  });
});

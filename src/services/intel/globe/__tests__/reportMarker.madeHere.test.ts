/**
 * Your own report is not drawn as from an earlier session (plan item 9.5).
 *
 * A mark is faded when its copy was received before this session began, since
 * a live copy may since have replaced it (decision D-F, step 4.4). A report
 * made on this device was never received: nothing live replaces it. Its
 * received time fell back to when it was made, so from the next session on it
 * was drawn faded, for good.
 */
import { describe, it, expect } from 'vitest';
import { reportToMarker } from '../reportMarker';
import { isFromEarlierSession, earlierSessionSummary } from '../../../../components/Globe/earlierSession';
import type { IntelReportUI } from '../../../../types/intel/IntelReportUI';

const made = new Date('2026-09-20T12:00:00Z');
const sessionStarted = Date.parse('2026-09-28T09:00:00Z');

const mine = {
  id: 'made-here', title: 'Berth 4 cranes', content: 'Seen from the quay.', author: 'me', tags: [],
  latitude: 29.76, longitude: -95.37, createdAt: made, updatedAt: made, status: 'DRAFT',
  history: [{ action: 'CREATED', timestamp: made.toISOString(), user: 'me' }],
} as unknown as IntelReportUI;

describe('a report made on this device, drawn in a later session', () => {
  it('is not faded, and not counted as from an earlier session', () => {
    const marker = reportToMarker(mine)!;
    expect(marker.receivedAtMs).toBeUndefined();
    expect(isFromEarlierSession(marker, sessionStarted)).toBe(false);
    expect(earlierSessionSummary([marker], sessionStarted)).toBeNull();
  });

  it('while one received before this session still is', () => {
    const received = { ...mine, id: 'received', history: [{ action: 'IMPORTED', timestamp: made.toISOString(), user: 'nostr' }] } as unknown as IntelReportUI;
    const marker = reportToMarker(received)!;
    expect(isFromEarlierSession(marker, sessionStarted)).toBe(true);
  });
});

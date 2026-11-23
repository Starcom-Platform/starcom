/**
 * The reports sealed to a publisher on its mission (MX32): their counts on the lines it asks, the day, the reporter's
 * callsign, where each stands, and Settle and Challenge through the review; an inbox to post when none is named.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { MissionUI } from '../../../../types/intel/MissionUI';

const ME = 'a'.repeat(64);
const COORD = `30079:${ME}:starcom_mission_package_m1`;
vi.mock('../../../../services/identity/NostrIdentityService', () => ({ nostrIdentityService: { signerPubkey: () => 'a'.repeat(64), getPubkey: () => null, subscribeSigner: () => () => {} } }));
const inbox = vi.hoisted(() => ({ named: ['wss://inbox.example'] as string[] }));
vi.mock('../../../../services/nostr/inboxRelays', () => ({ inboxRelays: vi.fn(async () => inbox.named) }));
const reviews = vi.hoisted(() => ({ labels: [] as Array<{ id: string; word: string }>, inbox: 0 }));
vi.mock('../../../../services/publishing/reportLabels', () => ({
  reviewReportLabel: vi.fn(async (_m: unknown, r: { id: string }, word: string) => { reviews.labels.push({ id: r.id, word }); return { status: 'sent', result: { relays: 1 } }; }),
  reviewInboxList: vi.fn(async () => { reviews.inbox += 1; return { status: 'sent', result: { relays: 1 } }; }),
}));
const ingest = vi.hoisted(() => ({ listeners: new Set<(l: unknown) => void>(), words: [] as unknown[] }));
vi.mock('../../../../services/intel/MissionLabelIngest', () => ({
  MissionLabelIngest: class {
    subscribe(fn: (l: unknown) => void) { ingest.listeners.add(fn); return () => ingest.listeners.delete(fn); }
    start(_c: string[], words: unknown) { ingest.words.push(words); }
    stop() {}
  },
}));
const store = vi.hoisted(() => ({ reports: [] as unknown[] }));
vi.mock('../../../../services/intel/received/receivedReports', () => ({
  reportsOn: () => store.reports,
  subscribeReceivedReports: () => () => {},
}));

import { MissionReportsReceived } from '../MissionReportsReceived';
import { eventOutbox } from '../../../../services/intel/outbox/EventOutbox';
import { finalizeEvent, generateSecretKey } from 'nostr-tools';

const DAY = Date.parse('2026-10-22T00:00:00Z') / 1000;
const mission = (over: Partial<MissionUI> = {}) => ({ id: 'm1', title: 'Test the taps', publishedAs: COORD, countLines: ['Taps tested: a count'], ...over }) as MissionUI;
const report = { id: 'r'.repeat(64), coordinate: COORD, from: 'b'.repeat(64), callsign: 'Kestrel', day: '2026-10-22',
  counts: [{ line: 'Taps tested: a count', n: 12 }, { line: 'Not asked: a count', n: 9 }], at: DAY };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse('2026-10-23T12:00:00Z'));
  inbox.named = ['wss://inbox.example'];
  reviews.labels.length = 0; reviews.inbox = 0;
  ingest.listeners.clear(); ingest.words.length = 0;
  store.reports = [report];
  return () => vi.useRealTimers();
});

describe('MissionReportsReceived', () => {
  it('shows each report\'s asked counts, day, callsign and standing, read by mission and word, and settles or challenges through the review', async () => {
    render(<MissionReportsReceived mission={mission()} />);
    const row = screen.getByTestId('mission-report-received');
    expect(row).toHaveTextContent('Taps tested 12');
    expect(row).not.toHaveTextContent('Not asked');
    expect(row).toHaveTextContent('22 Oct 2026 · from Kestrel · settles by itself on 29 Oct 2026');
    expect(ingest.words).toEqual([['settled', 'witnessed', 'challenged']]);
    fireEvent.click(screen.getByTestId('mission-report-settle'));
    await waitFor(() => expect(reviews.labels).toEqual([{ id: report.id, word: 'settled' }]));
    fireEvent.click(screen.getByTestId('mission-report-challenge'));
    await waitFor(() => expect(reviews.labels[1]).toEqual({ id: report.id, word: 'challenged' }));
  });

  it('says it is settled by its publisher once its own label is read, and offers Settle no more', () => {
    render(<MissionReportsReceived mission={mission()} />);
    act(() => { ingest.listeners.forEach((tell) => tell({ id: 'l1', pubkey: ME, value: 'settled', coordinates: [COORD], report: report.id, createdAt: DAY + 3600 })); });
    expect(screen.getByTestId('mission-report-received')).toHaveTextContent('settled by its publisher');
    expect(screen.queryByTestId('mission-report-settle')).toBeNull();
  });

  it('offers no challenge after the seven days, says when no report has come, and asks for the inbox when none is named', async () => {
    vi.setSystemTime(Date.parse('2026-11-05T00:00:00Z'));
    const { unmount } = render(<MissionReportsReceived mission={mission()} />);
    expect(screen.queryByTestId('mission-report-challenge')).toBeNull();
    unmount();
    store.reports = [];
    inbox.named = [];
    render(<MissionReportsReceived mission={mission()} />);
    expect(screen.getByTestId('mission-reports-received')).toHaveTextContent('No report has reached you yet.');
    await waitFor(() => expect(screen.getByTestId('mission-reports-no-inbox')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Post your inbox' }));
    await waitFor(() => expect(reviews.inbox).toBe(1));
  });

  it('shows nothing for a mission that asks no counts, or one not published', () => {
    const { container, rerender } = render(<MissionReportsReceived mission={mission({ countLines: [] })} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<MissionReportsReceived mission={mission({ publishedAs: undefined })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('what waits because no relay took it (W1b)', () => {
  const secret = generateSecretKey();
  const kept = (kind: number, tags: string[][]) => eventOutbox.keep(finalizeEvent({ kind, tags, content: '', created_at: DAY }, secret), ['wss://one.example']);

  it('says a settlement waits, in place of Settle, and cancelling it brings Settle back', async () => {
    await kept(1985, [['L', 'navcom.mission'], ['l', 'settled', 'navcom.mission'], ['e', report.id], ['a', COORD]]);
    render(<MissionReportsReceived mission={mission()} />);
    const line = await screen.findByTestId('mission-report-settle-kept');
    expect(line).toHaveTextContent('Your settlement waits to send: no relay answered.');
    expect(screen.queryByTestId('mission-report-settle')).toBeNull();
    expect(screen.getByTestId('mission-report-challenge')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel sending' }));
    await waitFor(() => expect(screen.getByTestId('mission-report-settle')).toBeTruthy());
    expect(await eventOutbox.waiting()).toEqual([]);
  });
});

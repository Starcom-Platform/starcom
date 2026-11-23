/**
 * What the report popup shows when a value was given, and when it was not.
 *
 * It read its timestamp as Unix seconds and multiplied by 1000, while
 * reportToMarker writes milliseconds, which put the shown date tens of
 * thousands of years ahead. And a report with no source tag was labelled
 * "UNKNOWN", as though that were the name of a source.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { IntelReportPopup } from '../IntelReportPopup';
import type { IntelReportOverlayMarker } from '../../../../interfaces/IntelReportOverlay';

vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp: vi.fn() }),
}));

const report = (over: Partial<IntelReportOverlayMarker>): IntelReportOverlayMarker => ({
  pubkey: 'report-unstated', title: 'A Report', content: 'Body', tags: [],
  latitude: 10, longitude: 20, timestamp: Date.UTC(2026, 2, 2, 15, 15), author: 'analyst',
  ...over,
});

const renderPopup = (over: Partial<IntelReportOverlayMarker>) => render(
  <MemoryRouter>
    <IntelReportPopup report={report(over)} visible={true} onClose={vi.fn()} />
  </MemoryRouter>
);

/** Elements whose own text (not their children's) satisfies the test. */
const ownText = (test: (text: string) => boolean) => (_content: string, el: Element | null) =>
  test([...(el?.childNodes ?? [])].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(''));

describe('IntelReportPopup report time', () => {
  it('shows the day, year and time the milliseconds name, in UTC', () => {
    const ms = Date.UTC(2026, 2, 2, 15, 15);
    renderPopup({ timestamp: ms });

    // It printed the viewer's local time and zone name (decision D-E, step 9).
    expect(screen.getAllByText(ownText((t) => t.includes('2 Mar 2026 15:15Z'))).length).toBeGreaterThan(0);
  });

  it('says no time was given rather than printing one', () => {
    renderPopup({ timestamp: Number.NaN });
    expect(screen.getAllByText(/no stated time/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Unknown time|Invalid date/)).not.toBeInTheDocument();
  });
});

describe('IntelReportPopup collection source', () => {
  it('says no source was stated, rather than naming one UNKNOWN', () => {
    renderPopup({ tags: [] });
    expect(screen.getAllByText(ownText((t) => t.includes('NO STATED SOURCE'))).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(ownText((t) => /\bUNKNOWN\b/.test(t)))).toHaveLength(0);
  });

  it('shows a stated source as given', () => {
    renderPopup({ tags: ['OSINT'] });
    expect(screen.getAllByText(ownText((t) => t.includes('OSINT'))).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(ownText((t) => t.includes('NO STATED SOURCE')))).toHaveLength(0);
  });
});

/**
 * The analysis cards say only what the report stated (decision D-C;
 * D-F step 14).
 *
 * Every report's popup rendered four "analysis" cards computed from keyword
 * tags, with a default when no keyword matched: Threat Level LOW, Source
 * Reliability 30%, "Assessment pending", recommended actions "Continue
 * monitoring for developments" and "Archive report for future analysis", and
 * related intelligence "Historical precedents in intelligence database" and
 * "Analysis indicates potential for follow-up activity". Collection Method fell
 * back to "Multi-Source" — on the same popup whose header says NO STATED SOURCE.
 *
 * A report ingested from Nostr carries none of those keywords (its hashtags are
 * kept apart from its tags), so every such report was shown as LOW threat at 30%
 * confidence, with actions nobody recommended. D-C decided this: "nobody said"
 * is not "someone said low", and a hard-coded weight "would put a lie directly
 * into what an analyst sees first".
 */
describe('IntelReportPopup analysis — stated or not stated, never invented', () => {
  it('invents no threat level, confidence or collection method for a report that stated none', () => {
    renderPopup({ tags: [] });

    expect(screen.queryAllByText(ownText((t) => /\bLOW\b/.test(t)))).toHaveLength(0);
    expect(screen.queryAllByText(ownText((t) => /\d+%/.test(t)))).toHaveLength(0);
    expect(screen.queryAllByText(ownText((t) => t.includes('Multi-Source')))).toHaveLength(0);
    expect(screen.getAllByText(ownText((t) => t.includes('no stated threat level'))).length).toBeGreaterThan(0);
    expect(screen.getAllByText(ownText((t) => t.includes('no stated confidence'))).length).toBeGreaterThan(0);
    expect(screen.getAllByText(ownText((t) => t.includes('no stated collection method'))).length).toBeGreaterThan(0);
  });

  it('writes no recommended actions or related intelligence of its own', () => {
    renderPopup({ tags: ['CYBER', 'CRITICAL'] });

    for (const invented of [
      'Continue monitoring', 'Archive report', 'Alert security teams', 'Coordinate with relevant agencies',
      'Historical precedents', 'potential for follow-up', 'ongoing cyber threat campaign',
      'Routine monitoring recommended', 'Immediate defensive measures',
    ]) {
      expect(screen.queryAllByText(ownText((t) => t.includes(invented)))).toHaveLength(0);
    }
  });

  it('shows a threat level the report stated, as stated', () => {
    renderPopup({ tags: ['HIGH'] });

    expect(screen.getAllByText(ownText((t) => /\bHIGH\b/.test(t))).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(ownText((t) => t.includes('no stated threat level')))).toHaveLength(0);
  });

  /*
   * A topic is not a threat level. WEAPONS used to become HIGH and SURVEILLANCE
   * MEDIUM: an inference from what a report is ABOUT, presented as a rating the
   * report gave.
   */
  it('does not turn a topic into a threat level', () => {
    renderPopup({ tags: ['WEAPONS', 'SURVEILLANCE'] });

    expect(screen.queryAllByText(ownText((t) => /\b(HIGH|MEDIUM)\b/.test(t)))).toHaveLength(0);
    expect(screen.getAllByText(ownText((t) => t.includes('no stated threat level'))).length).toBeGreaterThan(0);
  });

  it('shows a confidence the report stated as a word, not a percentage it never gave', () => {
    renderPopup({ tags: ['PROBABLE'] });

    expect(screen.getAllByText(ownText((t) => /\bPROBABLE\b/.test(t))).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(ownText((t) => /\d+%/.test(t)))).toHaveLength(0);
  });

  it('shows a stated collection method as given', () => {
    renderPopup({ tags: ['SIGINT'] });

    expect(screen.getAllByText(ownText((t) => t.includes('Signals Intelligence'))).length).toBeGreaterThan(0);
  });
});

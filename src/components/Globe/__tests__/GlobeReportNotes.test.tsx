/**
 * The globe's report notes: how many reports from the network it is showing, beside
 * the notes it already gave about what it did not draw (decision D-F, step 1).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GlobeReportNotes } from '../GlobeReportNotes';

const onPhone = (matches: boolean) => vi.stubGlobal('matchMedia', vi.fn(() => ({
  matches, media: '', addEventListener: () => {}, removeEventListener: () => {},
})));

const none = { networkShown: 0, totalMatching: 0, shown: 0, hiddenByPriority: 0, placedByWritten: 0, judgedByWindow: 0, untimed: 0 };

describe('GlobeReportNotes', () => {
  it('says how many reports from the network the globe is showing', () => {
    render(<GlobeReportNotes {...none} networkShown={7} totalMatching={7} shown={7} />);

    expect(screen.getByTestId('globe-network-report-count')).toHaveTextContent('Showing 7 reports from the network');
  });

  // K3: each note leads with its glyph from the registry, where it led with an emoji.
  it('leads each note with its glyph, and no emoji', () => {
    const { container } = render(
      <GlobeReportNotes {...none} networkShown={7} totalMatching={30} shown={25} hiddenByPriority={4} placedByWritten={2} judgedByWindow={9} untimed={1}
        fromEarlierSession={{ count: 3, newestReceivedAtMs: Date.UTC(2026, 9, 5) }} />,
    );
    const drawn = [...container.querySelectorAll('svg[data-symbol]')].map((svg) => svg.getAttribute('data-symbol'));
    expect(drawn).toEqual(['note:network', 'note:earlierSession', 'note:matched', 'note:filtered', 'note:writtenTime', 'note:untimed']);
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  /* The big-three lens choice (D-CT, CT5): what it hides is said, with the way back to every report. */
  it('says how many reports the lens filter hides, and shows every report again on asking', () => {
    const onClearLens = vi.fn();
    render(<GlobeReportNotes {...none} networkShown={3} totalMatching={3} shown={3} hiddenByLens={12} onClearLens={onClearLens} />);
    expect(screen.getByTestId('globe-intel-hidden-by-lens')).toHaveTextContent('12 hidden by your lens filter');
    fireEvent.click(screen.getByRole('button', { name: 'Show every report' }));
    expect(onClearLens).toHaveBeenCalledTimes(1);
  });

  it('says nothing when there is nothing to say', () => {
    const { container } = render(<GlobeReportNotes {...none} totalMatching={3} shown={3} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('still says what it matched and did not draw', () => {
    render(<GlobeReportNotes {...none} totalMatching={30} shown={25} hiddenByPriority={4} />);

    expect(screen.getByTestId('globe-intel-report-reduction-notice')).toHaveTextContent('30 reports matched — showing 25');
    expect(screen.getByTestId('globe-intel-report-reduction-notice')).toHaveTextContent('4 hidden by your priority filter');
    expect(screen.queryByTestId('globe-network-report-count')).not.toBeInTheDocument();
  });

  /*
   * The 14.7 s of silence measured on a first visit (decision D-F, step 4). The
   * component returned null whenever nothing had arrived and nothing was reduced,
   * so there was no state to fill — the globe was silent as well as empty.
   */
  it('says it is listening while the ingest is running and nothing has arrived', () => {
    render(<GlobeReportNotes {...none} listening={{ connected: 3, total: 5 }} />);

    expect(screen.getByTestId('globe-intel-listening'))
      .toHaveTextContent('Listening for reports — 3 of 5 relays connected');
  });

  it('stays silent when the ingest is not running', () => {
    const { container } = render(<GlobeReportNotes {...none} listening={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  /* The state the globe holds at second one, before the ingest has started. */
  it('says it is connecting before the ingest has started', () => {
    render(<GlobeReportNotes {...none} listening="starting" />);

    expect(screen.getByTestId('globe-intel-listening'))
      .toHaveTextContent('Listening for reports — connecting to relays');
  });

  it('stops saying it is connecting once reports have arrived', () => {
    render(<GlobeReportNotes {...none} networkShown={2} totalMatching={2} shown={2} listening="starting" />);

    expect(screen.queryByTestId('globe-intel-listening')).not.toBeInTheDocument();
  });

  /*
   * Once reports are on the globe, the count is the better sentence: saying both
   * would have the globe describe itself as waiting for what it is already showing.
   */
  it('stops saying it is listening once reports have arrived', () => {
    render(<GlobeReportNotes {...none} networkShown={7} totalMatching={7} shown={7} listening={{ connected: 5, total: 5 }} />);

    expect(screen.getByTestId('globe-network-report-count')).toBeInTheDocument();
    expect(screen.queryByTestId('globe-intel-listening')).not.toBeInTheDocument();
  });
});

/*
 * Marks drawn from storage rather than received in this session
 * (decision D-F, step 4.4).
 *
 * The case that matters is the one with NOTHING live: the globe was empty
 * whenever the public relays were unreachable — 2/5 and 3/5 reachable on one
 * afternoon, delivery going 7 → 2 → 0 between runs — so these marks ARE the
 * picture, and a viewer has to be told it is old.
 */
describe('GlobeReportNotes: intel from an earlier session', () => {
  const received = Date.parse('2026-09-17T14:20:00.000Z');

  it('says how many and when the most recent was received', () => {
    render(<GlobeReportNotes {...none} fromEarlierSession={{ count: 7, newestReceivedAtMs: received }} />);

    const note = screen.getByTestId('globe-intel-earlier-session');
    expect(note).toHaveTextContent('7 marks from an earlier session');
    expect(note).toHaveTextContent('the most recent received');
  });

  /*
   * The relays-down case. Nothing arrived live, so without this the notes would
   * render nothing at all and the globe would show old intel in silence.
   */
  it('says it even when nothing arrived live', () => {
    render(<GlobeReportNotes {...none} networkShown={0} fromEarlierSession={{ count: 3, newestReceivedAtMs: received }} />);

    expect(screen.getByTestId('globe-intel-earlier-session')).toHaveTextContent('3 marks');
  });

  it('says it in the singular for one mark', () => {
    render(<GlobeReportNotes {...none} fromEarlierSession={{ count: 1, newestReceivedAtMs: received }} />);

    const note = screen.getByTestId('globe-intel-earlier-session');
    expect(note).toHaveTextContent('1 mark from an earlier session');
    expect(note).toHaveTextContent('until it arrives again');
  });

  it('says nothing about an earlier session when every mark is live', () => {
    render(<GlobeReportNotes {...none} networkShown={7} totalMatching={7} shown={7} />);

    expect(screen.queryByTestId('globe-intel-earlier-session')).not.toBeInTheDocument();
  });
});

describe('GlobeReportNotes — reports with no stated time (D-F step 15)', () => {
  it('says how many a paused cursor could not place, and why', () => {
    render(<GlobeReportNotes {...none} totalMatching={9} shown={7} judgedByWindow={9} untimed={2} />);

    expect(screen.getByTestId('globe-intel-untimed')).toHaveTextContent('2 of 9 reports not placed on the timeline — no stated time.');
  });

  it('says nothing about it when every report has a time', () => {
    render(<GlobeReportNotes {...none} totalMatching={3} shown={3} judgedByWindow={3} untimed={0} />);

    expect(screen.queryByTestId('globe-intel-untimed')).not.toBeInTheDocument();
  });
});

/*
 * Where the cap cuts, the notice offers to draw more (BA4): Mecha Jono's
 * briefing found 50 of 128 drawn and nothing to change it.
 */
describe('GlobeReportNotes: showing more where the cap cuts', () => {
  it('offers to show more when the cap cut the list, and chooses through the chooser', () => {
    const onChooseCap = vi.fn();
    render(<GlobeReportNotes {...none} totalMatching={128} shown={50} cap={{ cap: 50, from: 'setting' }} onChooseCap={onChooseCap} />);
    expect(screen.queryByTestId('report-cap-chooser')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    fireEvent.click(screen.getByRole('button', { name: '250' }));
    expect(onChooseCap).toHaveBeenCalledWith(250);
  });

  it('offers nothing when nothing was cut', () => {
    render(<GlobeReportNotes {...none} totalMatching={30} shown={25} hiddenByPriority={5} cap={{ cap: 50, from: 'setting' }} onChooseCap={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    render(<GlobeReportNotes {...none} totalMatching={128} shown={50} />);
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });
});

describe('GlobeReportNotes on a phone (BD6)', () => {
  // The notes ran the left column over the key and the buttons on a phone.
  afterEach(() => vi.unstubAllGlobals());

  it('fold to their first line and how many more there are, and open on a tap', () => {
    onPhone(true);
    render(<GlobeReportNotes {...none} networkShown={50} totalMatching={52} shown={50} hiddenByPriority={2} />);
    const toggle = screen.getByTestId('globe-report-notes-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle.textContent).toContain('50');
    expect(toggle.textContent).toContain('2 more');
    expect(screen.queryByTestId('globe-intel-report-reduction-notice')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByTestId('globe-report-notes-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('globe-intel-report-reduction-notice')).toBeInTheDocument();
  });

  it('show one note whole, with nothing to fold', () => {
    onPhone(true);
    render(<GlobeReportNotes {...none} networkShown={7} totalMatching={7} shown={7} />);
    expect(screen.queryByTestId('globe-report-notes-toggle')).not.toBeInTheDocument();
    expect(screen.getByTestId('globe-network-report-count')).toBeInTheDocument();
  });

  it('stay open on a wider window', () => {
    onPhone(false);
    render(<GlobeReportNotes {...none} networkShown={50} totalMatching={52} shown={50} hiddenByPriority={2} />);
    expect(screen.queryByTestId('globe-report-notes-toggle')).not.toBeInTheDocument();
    expect(screen.getByTestId('globe-intel-report-reduction-notice')).toBeInTheDocument();
  });
});

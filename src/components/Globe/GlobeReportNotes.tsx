import React, { useState } from 'react';
import { Docked } from '../Dock/Docked';
import { usePhone } from '../../hooks/usePhone';
import { Glyph } from '../../symbols/Glyph';
import type { GlyphName } from '../../symbols/uiSymbols';
import { ReportCapChooser } from './ReportCapChooser';
import {
  connectingToRelays, hiddenByOperatorFilter, listeningForReports, matchedVersusShown,
  networkReportsShown, placedByWrittenTime, drawnFromEarlierSession, untimedNotPlaced,
} from '../../services/epistemic/epistemicLanguage';
import { formatUtcDateTime } from '../../utils/utcTime';

export interface GlobeReportNotesProps {
  /** Reports from the network among those drawn. */
  networkShown: number;
  /** What passed the report service's filters, before the cap. */
  totalMatching: number;
  /** The report cap in force, and who set it (BA4–BA7): with onChooseCap, a cut list offers to show more. */
  cap?: { cap: number | null; from: 'setting' | 'handle' };
  onChooseCap?: (cap: number | null) => void;
  /** Reports drawn. */
  shown: number;
  /** Received and not drawn, because of the operator's priority filter. */
  hiddenByPriority: number;
  /** Received and not drawn, because none of the big-three lenses chosen is on them (D-CT, CT5). */
  hiddenByLens?: number;
  /** Clears the lens choice, to show every report again. */
  onClearLens?: () => void;
  /** Paused only: reports placed by when they were written, for want of an event time. */
  placedByWritten: number;
  judgedByWindow: number;
  /**
   * Paused only: reports left off the timeline because no time of theirs can be
   * read (D-F step 15). They used to be stamped "now" and shown as brand new.
   */
  untimed?: number;
  /**
   * The ingest while it is running and nothing has arrived yet, or null when it is
   * not running. A globe that is not fetching must not claim to be listening.
   */
  listening?: { connected: number; total: number } | 'starting' | null;
  /**
   * Marks on the globe drawn from storage rather than received in this session,
   * and the most recent of their receipts (decision D-F, step 4.4).
   *
   * Derived from the marks actually drawn, not from what hydration reported, so
   * this and the faded marks cannot disagree: a report replaced by a live arrival
   * stops being counted here by the same rule that stops it being faded.
   */
  fromEarlierSession?: { count: number; newestReceivedAtMs: number } | null;
}

const box: React.CSSProperties = {
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  color: '#00ffff',
  padding: '8px 12px',
  borderRadius: '4px',
  fontSize: '12px',
  maxWidth: '280px',
  lineHeight: 1.4,
};

/** A note: its glyph from the registry (K3), where an emoji led it, then its words. */
type Said = readonly [glyph: GlyphName, text: string];
const glyphBox: React.CSSProperties = { display: 'inline-flex', verticalAlign: '-2px', marginRight: 6 };
const Note: React.FC<{ said: Said }> = ({ said: [glyph, text] }) => (
  <><span style={glyphBox}><Glyph name={glyph} size={13} /></span>{text}</>
);

const toggle: React.CSSProperties = {
  display: 'block', padding: 0, background: 'none', border: 'none',
  color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer',
};

/**
 * What the globe's report layer is showing, and what it did not draw.
 *
 * How many reports from the network it is showing comes first (decision D-F, step 1).
 * A first visitor has reports from the network and nothing else, so the globe shows
 * them while the timeline counts intel items with an event date and the analysis
 * status has nothing of theirs to analyse. Saying what the globe counts is what stops
 * 7 reports and "0 events" reading as a contradiction.
 *
 * The rest are two separate reductions, said separately on purpose. "There are more
 * past the cap" and "we received these and chose not to draw them" have different
 * causes and different fixes, and one number would misdescribe both. The cap used to
 * truncate silently; this could not say so until the pipeline's matching count
 * carried the service's real pre-cap figure (see
 * useGlobeIntelReportPipeline.precap.test.ts).
 */
export const GlobeReportNotes: React.FC<GlobeReportNotesProps> = ({
  networkShown, totalMatching, shown, hiddenByPriority, hiddenByLens = 0, onClearLens, placedByWritten, judgedByWindow,
  untimed = 0, listening = null, fromEarlierSession = null, cap, onChooseCap,
}) => {
  const [choosing, setChoosing] = useState(false);
  // On a phone, several notes fold to the first and a count (BD6): they ran the
  // left column over the key and the camera buttons.
  const phone = usePhone();
  const [open, setOpen] = useState(!phone);
  const reduced = totalMatching > shown || hiddenByPriority > 0 || hiddenByLens > 0 || placedByWritten > 0 || untimed > 0;
  /*
   * Only while nothing has arrived. Once the globe is showing reports, saying it is
   * still listening would have it describe itself as waiting for what it already has.
   */
  const showListening = Boolean(listening) && networkShown === 0;
  if (!reduced && networkShown === 0 && !showListening && !fromEarlierSession) return null;

  // Each note's glyph and words once, for the notes and for the folded line.
  const listeningNote: Said | null = showListening && listening
    ? ['note:listening', listening === 'starting' ? connectingToRelays().text : listeningForReports(listening.connected, listening.total).text]
    : null;
  const networkNote: Said | null = networkShown > 0 ? ['note:network', networkReportsShown(networkShown).text] : null;
  const earlierNote: Said | null = fromEarlierSession
    ? ['note:earlierSession', drawnFromEarlierSession(fromEarlierSession.count, formatUtcDateTime(fromEarlierSession.newestReceivedAtMs)).text]
    : null;
  const matchedNote: Said | null = totalMatching > shown ? ['note:matched', matchedVersusShown(totalMatching, shown).text] : null;
  const lines = [
    listeningNote, networkNote, earlierNote,
    matchedNote, hiddenByPriority > 0, hiddenByLens > 0, placedByWritten > 0, untimed > 0,
  ].filter(Boolean);
  const first = listeningNote ?? networkNote ?? earlierNote ?? matchedNote;
  const foldable = phone && lines.length > 1;

  if (foldable && !open) {
    return (
      <Docked slot="globeReportNotes">
        <div style={box}>
          <button type="button" style={toggle} aria-expanded={false} onClick={() => setOpen(true)} data-testid="globe-report-notes-toggle">
            ▸ {first ? <Note said={first} /> : 'Notes'} · {lines.length - 1} more
          </button>
        </div>
      </Docked>
    );
  }

  return (
    <Docked slot="globeReportNotes">
      <div style={box}>
        {foldable && (
          <button type="button" style={toggle} aria-expanded onClick={() => setOpen(false)} data-testid="globe-report-notes-toggle">
            ▾ Notes
          </button>
        )}
        {listeningNote && <div data-testid="globe-intel-listening"><Note said={listeningNote} /></div>}
        {networkNote && <div data-testid="globe-network-report-count"><Note said={networkNote} /></div>}
        {/* Said whether or not anything arrived live: these ARE the globe's
            marks when the relays are unreachable, and a viewer has to know the
            picture is old. */}
        {earlierNote && <div data-testid="globe-intel-earlier-session"><Note said={earlierNote} /></div>}
        {reduced && (
          <div data-testid="globe-intel-report-reduction-notice">
            {/* "matched / showing" rather than "showing N of M", because the pre-cap
                figure counts what passed the service's date, tag and radius filters,
                and the priority filter only ran over the page received. Stating the
                two numbers without asserting why they differ is the only claim the
                data supports. */}
            {matchedNote && <div><Note said={matchedNote} /></div>}
            {/* Where the cap cut the list, a way to draw more (BA4): the globe drew all
                the cap allows and more matched. Fewer drawn than the cap is the
                priority filter's doing, said above, not the cap's. */}
            {cap && cap.cap !== null && shown >= cap.cap && totalMatching > shown && onChooseCap && (
              choosing
                ? <ReportCapChooser cap={cap.cap} from={cap.from} onChoose={(next) => { onChooseCap(next); setChoosing(false); }} />
                : <button type="button" onClick={() => setChoosing(true)}>Show more</button>
            )}
            {hiddenByPriority > 0 && (
              <div title="Change this under Report Filtering in the Intel Watch settings.">
                <Note said={['note:filtered', hiddenByOperatorFilter(hiddenByPriority, 'priority filter').text]} />
              </div>
            )}
            {/* The big-three lens choice (D-CT, CT5): what it hides, and where it is changed. */}
            {hiddenByLens > 0 && (
              <div title="Change this under Intel Reports settings, on the left rail." data-testid="globe-intel-hidden-by-lens">
                <Note said={['note:filtered', hiddenByOperatorFilter(hiddenByLens, 'lens filter').text]} />
                {onClearLens && <button type="button" onClick={onClearLens}>Show every report</button>}
              </div>
            )}
            {/* Only while paused: live, the globe places nothing in time (decision D-E). */}
            {placedByWritten > 0 && (
              <div data-testid="globe-intel-placed-by-written">
                <Note said={['note:writtenTime', placedByWrittenTime(placedByWritten, judgedByWindow, 'report').text]} />
              </div>
            )}
            {untimed > 0 && (
              <div data-testid="globe-intel-untimed">
                <Note said={['note:untimed', untimedNotPlaced(untimed, judgedByWindow, 'report').text]} />
              </div>
            )}
          </div>
        )}
      </div>
    </Docked>
  );
};

export default GlobeReportNotes;

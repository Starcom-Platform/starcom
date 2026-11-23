/**
 * How much this node can see, measured several ways at once.
 *
 * Each axis answers a different "coverage of WHAT?", and the panel shows them
 * together rather than picking one — see services/intel/coverage for why a
 * single number would make a choice look like a fact.
 *
 * Three things it does deliberately, and each is the opposite of what a
 * dashboard usually does:
 *
 *   An axis with no honest denominator shows no percentage. The grid reports
 *   how many cells hold something and stops; a share of every cell on Earth
 *   would measure the planet rather than the corpus.
 *
 *   An axis that cannot be computed says so, with the reason, instead of
 *   rendering zero. Zero and unmeasured look identical and mean opposite
 *   things — one says we looked.
 *
 *   Every axis carries what it CANNOT see, on hover. A blind spot nobody
 *   states reads as none.
 *
 * It starts folded to one line, the relays and the cells, and says how many
 * lines it holds back (BD4). At 1280×720 the five lines ran the left column
 * over the clock and the minimap. Opened, it scrolls inside its dock.
 */
import React, { useId, useState } from 'react';
import ChevronRight from '@mui/icons-material/ChevronRight';
import { Docked } from '../Dock/Docked';
import type { CoverageAxis } from '../../services/intel/coverage/coverage';
import type { NostrRelayState } from '../../services/intel/NostrStarcomIntelIngest';
import { RelayLights, RelayHealthList, CapacityGauge } from '../Shared/RelayHealth';

// A column that can shrink, so the dock's limit reaches the scrolling lines.
const wrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 3, minHeight: 0,
  pointerEvents: 'auto', maxWidth: 320,
  fontFamily: 'var(--sc-font-data)', fontSize: 11, lineHeight: 1.4,
  padding: '4px 8px', borderRadius: 3,
  background: 'rgba(20,30,45,0.82)', border: '1px solid rgba(120,160,200,0.35)', color: '#c8dcf0',
};
// Wraps whole: in a narrow dock the line goes under the name, not into a column beside it.
const toggle: React.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, padding: 0, textAlign: 'left',
  background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer',
};
const heading: React.CSSProperties = {
  color: '#8fb8dc', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
};
const lines: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, minHeight: 0, overflowY: 'auto' };
const unmeasured: React.CSSProperties = { color: '#9aa8b8' };

/** Names as a reader would say them, not as the type spells them. */
const LABEL: Record<CoverageAxis['id'], string> = {
  // The globe's note and the strip say "connected" too (plan item 1.8).
  sources: 'relays connected',
  questions: 'missions resting on evidence',
  grid: 'cells holding intel',
  'stated-jurisdiction': 'stated jurisdictions',
  'derived-territory': 'territories with intel',
};

const line = (axis: CoverageAxis): string => {
  if (!axis.result) return `${LABEL[axis.id]}: not measured`;
  const { expected, covered, unplaced } = axis.result;
  // A percentage only where a denominator exists to divide by.
  const head = expected === null ? `${covered}` : `${covered} of ${expected}`;
  return `${LABEL[axis.id]}: ${head}${unplaced > 0 ? ` · ${unplaced} unplaced` : ''}`;
};

/** The folded line's words for an axis, short, and never a zero for "not measured". */
const SHORT: Partial<Record<CoverageAxis['id'], (r: NonNullable<CoverageAxis['result']>) => string>> = {
  sources: (r) => `${r.covered}${r.expected === null ? '' : ` of ${r.expected}`} relays`,
  grid: (r) => `${r.covered} cells`,
};
const SHORT_NAME: Partial<Record<CoverageAxis['id'], string>> = { sources: 'relays', grid: 'cells' };

const folded = (axes: readonly CoverageAxis[]): string => {
  const shown = axes.filter((axis) => SHORT[axis.id]);
  const words = shown.map((axis) => (axis.result ? SHORT[axis.id]!(axis.result) : `${SHORT_NAME[axis.id]} not measured`));
  const rest = axes.length - shown.length;
  return [...words, ...(rest > 0 ? [`${rest} more`] : [])].join(' · ');
};

/** The relays' state and the time it is read at, for their lights and the gauge (BD11, BD12). */
export interface CoverageHealth {
  relays: readonly NostrRelayState[];
  now: number;
}

export const CoveragePanel: React.FC<{ axes: readonly CoverageAxis[]; health?: CoverageHealth }> = ({ axes, health }) => {
  const [open, setOpen] = useState(false);
  const linesId = useId();
  if (axes.length === 0) return null;

  return (
    <Docked slot="coverage">
      <div style={wrap} data-testid="coverage-panel">
        <button
          type="button"
          style={toggle}
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          aria-controls={linesId}
          data-testid="coverage-toggle"
        >
          <ChevronRight style={{ fontSize: 14, transform: open ? 'rotate(90deg)' : undefined }} aria-hidden />
          <span style={heading}>Coverage</span>
          {health && health.relays.length > 0 && (
            <>
              <RelayLights relays={health.relays} now={health.now} />
              <CapacityGauge relays={health.relays} now={health.now} />
            </>
          )}
          {!open && <span>{folded(axes)}</span>}
        </button>
        {/* `hidden` alone loses to an inline display, so the style says it too. */}
        <div id={linesId} style={{ ...lines, display: open ? 'flex' : 'none' }} hidden={!open} data-testid="coverage-lines">
          {health && health.relays.length > 0 && (
            <div data-testid="coverage-relays"><RelayHealthList relays={health.relays} now={health.now} /></div>
          )}
          {axes.map((axis) => (
            <div
              key={axis.id}
              data-testid={`coverage-${axis.id}`}
              style={axis.result ? undefined : unmeasured}
              // The blind spot and the reason live in the hover rather than the
              // line, so the panel stays readable while never dropping them.
              title={axis.result ? axis.blindSpot : `${axis.why} — ${axis.blindSpot}`}
            >
              {line(axis)}
            </div>
          ))}
        </div>
      </div>
    </Docked>
  );
};

export default CoveragePanel;

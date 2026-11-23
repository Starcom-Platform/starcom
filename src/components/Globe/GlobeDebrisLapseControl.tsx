import React, { useSyncExternalStore } from 'react';
import PlayArrow from '@mui/icons-material/PlayArrow';
import Stop from '@mui/icons-material/Stop';
import { Docked } from '../Dock/Docked';
import {
  getDebrisLapse, playDebrisLapse, stopDebrisLapse, subscribeDebrisLapse,
} from '../../features/globe/debrisLapse/debrisLapseStore';
import { formatUtcDate } from '../../utils/utcTime';

/**
 * The debris clouds' spread since each breakup, played beside the globe (D-GV GV2, step 6; the owner chose a
 * modelled spread, 2026-10-24).
 *
 * Shown only while Satellites draws debris whose spread can be played. While it plays it says the day drawn, that
 * the picture is modelled, and what the model leaves out, so a lapse taken for a record of where each piece was is
 * corrected beside it.
 */
export const DEBRIS_LAPSE_CAVEAT =
  "Modelled: each piece's orbital plane turned back by the Earth's oblateness to its cloud's breakup. Drag, and where each piece was along its orbit, are not modelled.";

const box: React.CSSProperties = {
  backgroundColor: 'var(--sc-surface-frame)',
  border: '1px solid var(--sc-divider)',
  color: 'var(--sc-text-body)',
  padding: '4px 8px',
  borderRadius: '4px',
  fontSize: '11px',
  lineHeight: 1.35,
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  maxWidth: '260px',
};

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '8px' };

const button = (playing: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  height: '26px',
  padding: '0 8px',
  cursor: 'pointer',
  borderRadius: '3px',
  border: '1px solid var(--sc-accent)',
  backgroundColor: playing ? 'var(--sc-cyan-900)' : 'transparent',
  color: 'var(--sc-accent)',
  fontSize: '11px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
});

const when: React.CSSProperties = { fontFamily: 'var(--sc-font-data)', color: 'var(--sc-text-heading)', whiteSpace: 'nowrap' };

const caveat: React.CSSProperties = { margin: 0, color: 'var(--sc-text-secondary)' };

export const GlobeDebrisLapseControl: React.FC = () => {
  const { available, atMs } = useSyncExternalStore(subscribeDebrisLapse, getDebrisLapse, getDebrisLapse);
  if (!available) return null;
  const playing = atMs !== null;
  return (
    <Docked slot="globeDebrisLapse">
      <div data-testid="globe-debris-lapse" role="group" aria-label="Debris spread since each breakup" style={box}>
        <div style={row}>
          <button
            type="button"
            onClick={playing ? stopDebrisLapse : playDebrisLapse}
            aria-pressed={playing}
            title={playing ? 'Stop, and show the satellites as they are now' : 'Play how the three debris clouds spread since each breakup, modelled'}
            style={button(playing)}
          >
            {playing ? <Stop style={{ fontSize: '16px' }} /> : <PlayArrow style={{ fontSize: '16px' }} />}
            <span>{playing ? 'Stop' : 'Debris spread'}</span>
          </button>
          {playing && (
            <span data-testid="globe-debris-lapse-at" style={when}>Modelled · {formatUtcDate(atMs, { year: true })}</span>
          )}
        </div>
        {playing && <p style={caveat}>{DEBRIS_LAPSE_CAVEAT}</p>}
      </div>
    </Docked>
  );
};

export default GlobeDebrisLapseControl;

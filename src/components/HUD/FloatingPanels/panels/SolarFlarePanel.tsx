import React, { useCallback, useEffect, useState } from 'react';
import { FloatingPanelData } from '../FloatingPanelContext';
import { NOAADataProvider } from '../../../../services/data-management/providers/NOAADataProvider';
import type { NOAASolarFlareEvent } from '../../../../services/data-management/providers/NOAADataTypes';
import { usePopup } from '../../../Popup/PopupManager';
import NOAAStatusPopup from '../../Popups/NOAAStatusPopup';
import UtcTime from '../../../Shared/UtcTime';

interface SolarFlarePanelProps {
  data?: FloatingPanelData;
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // matches NOAA's own update cadence
const noaaProvider = new NOAADataProvider();

function formatDuration(begin?: string, end?: string): string {
  if (!begin || !end) return 'Ongoing';
  const ms = new Date(end).getTime() - new Date(begin).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'Ongoing';
  return `${Math.round(ms / 60000)} min`;
}

function getFlareColor(flareClass: string) {
  switch (flareClass.charAt(0)) {
    case 'X': return '#ff4444';
    case 'M': return '#ffaa00';
    case 'C': return '#00c4ff';
    case 'B': return '#00ff88';
    default: return '#94a3b8';
  }
}

const SolarFlarePanel: React.FC<SolarFlarePanelProps> = () => {
  const { showPopup } = usePopup();
  const [flare, setFlare] = useState<NOAASolarFlareEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await noaaProvider.fetchData('solar-xray-flares');
      setFlare(result as NOAASolarFlareEvent);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const openStatus = () => {
    showPopup({ component: NOAAStatusPopup, backdrop: true, zIndex: 3100 });
  };

  return (
    <div>
      <h3>☀️ Solar Flare Event</h3>

      {loading ? (
        <p>Loading NOAA data…</p>
      ) : error || !flare ? (
        <p>NOAA solar flare data unavailable.</p>
      ) : (
        <>
          <div className="dataGrid">
            <div className="dataItem">
              <div className="dataLabel">Flare Class</div>
              <div className="dataValue" style={{ color: getFlareColor(flare.class_type) }}>
                {flare.class_type}
              </div>
            </div>
            <div className="dataItem">
              <div className="dataLabel">Region</div>
              <div className="dataValue">{flare.location ?? 'Unknown'}</div>
            </div>
          </div>

          <div className="dataGrid">
            <div className="dataItem">
              <div className="dataLabel">Peak Time</div>
              <div className="dataValue">{flare.max_time ? <UtcTime at={flare.max_time} /> : '—'}</div>
            </div>
            <div className="dataItem">
              <div className="dataLabel">Duration</div>
              <div className="dataValue">{formatDuration(flare.begin_time, flare.end_time)}</div>
            </div>
          </div>

          <div style={{ margin: '12px 0' }}>
            <div className="dataLabel">Status:</div>
            <p style={{ margin: '4px 0', display: 'flex', alignItems: 'center' }}>
              <span className={`statusIndicator ${flare.status === 'ongoing' ? 'statusWarning' : 'statusGood'}`}></span>
              {flare.status}
            </p>
          </div>

          <div style={{ marginTop: '12px' }}>
            <button className="actionBtn" onClick={openStatus}>📡 NOAA Status</button>
          </div>

          <div style={{ marginTop: '8px', fontSize: '0.6rem', color: '#64748b' }}>
            Updated: {flare.time_tag ? <UtcTime at={flare.time_tag} /> : '—'}
          </div>
        </>
      )}
    </div>
  );
};

export default SolarFlarePanel;

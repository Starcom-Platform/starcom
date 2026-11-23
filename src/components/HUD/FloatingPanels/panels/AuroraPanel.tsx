import React, { useCallback, useEffect, useState } from 'react';
import { FloatingPanelData } from '../FloatingPanelContext';
import { fetchLiveKpSnapshot } from '../../../../services/SpaceWeatherLive';
import { usePopup } from '../../../Popup/PopupManager';
import NOAAStatusPopup from '../../Popups/NOAAStatusPopup';
import UtcTime from '../../../Shared/UtcTime';

interface AuroraPanelProps {
  data?: FloatingPanelData;
}

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // matches NOAA's own update cadence

// Standard NOAA Kp-index interpretation, not a fabricated value.
function kpToActivity(kp: number): 'Low' | 'Moderate' | 'High' {
  if (kp >= 7) return 'High';
  if (kp >= 4) return 'Moderate';
  return 'Low';
}

function kpToVisibility(kp: number): string {
  if (kp >= 7) return 'Mid Latitude';
  if (kp >= 5) return 'High Latitude';
  return 'Polar Only';
}

const AuroraPanel: React.FC<AuroraPanelProps> = () => {
  const { showPopup } = usePopup();
  const [kp, setKp] = useState<number | null>(null);
  const [quality, setQuality] = useState<'live' | 'fallback' | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const result = await fetchLiveKpSnapshot();
    setKp(result.snapshot.kp);
    setTimestamp(result.snapshot.timestamp);
    setQuality(result.quality);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const openStatus = () => {
    showPopup({ component: NOAAStatusPopup, backdrop: true, zIndex: 3100 });
  };

  const activity = kp !== null ? kpToActivity(kp) : null;

  const getActivityColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'low': return '#00ff88';
      case 'moderate': return '#ffaa00';
      case 'high': return '#ff6b6b';
      default: return '#94a3b8';
    }
  };

  return (
    <div>
      <h3>🌌 Aurora Activity</h3>
      {loading ? (
        <p>Loading NOAA data…</p>
      ) : (
        <>
          <div className="dataGrid">
            <div className="dataItem">
              <div className="dataLabel">Activity Level</div>
              <div className="dataValue" style={{ color: activity ? getActivityColor(activity) : undefined }}>
                {activity ?? 'Unknown'}
              </div>
            </div>
            <div className="dataItem">
              <div className="dataLabel">Kp Index</div>
              <div className="dataValue">{kp !== null ? kp.toFixed(1) : '—'}</div>
            </div>
          </div>

          <p>
            <span className="dataLabel">Visibility:</span> {kp !== null ? kpToVisibility(kp) : 'Unknown'}
          </p>

          <div style={{ marginTop: '12px' }}>
            <button className="actionBtn" onClick={openStatus}>📡 NOAA Status</button>
          </div>

          <div style={{ marginTop: '8px', fontSize: '0.6rem', color: '#64748b' }}>
            {quality === 'live' ? 'Live NOAA data' : 'Cached data (NOAA unreachable)'}
            {timestamp && <> · Updated: <UtcTime at={timestamp} /></>}
          </div>
        </>
      )}
    </div>
  );
};

export default AuroraPanel;

// DataPointList.tsx
// Data point list component for the categories tab
import React from 'react';
import { MarqueeDataPoint } from '../interfaces';
import styles from './DataPointList.module.css';
import { EIA_BACKED_CATEGORY_IDS, NEEDS_EIA_KEY } from '../topbarCategories';

/** A category that resolved to nothing, as the data hook words it. */
const hasNoData = (p: MarqueeDataPoint): boolean =>
  p.value === 'no data' || p.value === 'N/A' || p.value === NEEDS_EIA_KEY;

const isEiaBacked = (id: string): boolean =>
  (EIA_BACKED_CATEGORY_IDS as readonly string[]).includes(id);

export interface DataPointListProps {
  dataPoints: MarqueeDataPoint[];
  highlightedDataPoint: string | null;
}

const DataPointList: React.FC<DataPointListProps> = ({
  dataPoints,
  highlightedDataPoint,
}) => {
  const handleDataPointClick = (dataPoint: MarqueeDataPoint) => {
    // Scroll to the specific data point settings section
    const element = document.getElementById(`datapoint-${dataPoint.id}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const getStatusColor = (dataPoint: MarqueeDataPoint): string => {
    if (dataPoint.value === 'Loading...') return '#f59e0b';
    if (dataPoint.value === 'Error' || dataPoint.value === 'N/A') return '#ef4444';
    // Absent is not an error and not a success: a muted grey, not red or green.
    if (hasNoData(dataPoint)) return '#94a3b8';
    return '#10b981';
  };

  const getStatusIcon = (dataPoint: MarqueeDataPoint): string => {
    if (dataPoint.value === 'Loading...') return '⏳';
    if (dataPoint.value === 'Error') return '❌';
    if (dataPoint.value === 'N/A') return '⚠️';
    /**
     * A category holding nothing is not "OK". It fell through to a green tick
     * because it is neither loading nor errored — so someone who clicked a
     * blank marquee entry to ask why was told everything was fine. That is the
     * same overstatement as the invented figures this marquee used to print.
     */
    if (hasNoData(dataPoint)) return '—';
    return '✅';
  };

  return (
    <div className={styles.dataPointList}>
      {dataPoints.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📭</div>
          <p className={styles.emptyTitle}>No Active Data Points</p>
          <p className={styles.emptyDescription}>
            Enable some categories above to see active data points here.
          </p>
        </div>
      ) : (
        <div className={styles.dataPointGrid}>
          {dataPoints.map((dataPoint) => (
            <div
              key={dataPoint.id}
              id={`datapoint-${dataPoint.id}`}
              className={`${styles.dataPointCard} ${
                highlightedDataPoint === dataPoint.id ? styles.highlighted : ''
              }`}
              onClick={() => handleDataPointClick(dataPoint)}
            >
              <div className={styles.dataPointHeader}>
                <div className={styles.dataPointIcon}>{dataPoint.icon}</div>
                <div className={styles.dataPointInfo}>
                  <div className={styles.dataPointLabel}>{dataPoint.label}</div>
                  <div className={styles.dataPointId}>{dataPoint.id}</div>
                </div>
                <div className={styles.dataPointStatus}>
                  <span 
                    className={styles.statusIcon}
                    style={{ color: getStatusColor(dataPoint) }}
                  >
                    {getStatusIcon(dataPoint)}
                  </span>
                </div>
              </div>
              
              <div className={styles.dataPointValue}>
                <span className={styles.valueLabel}>Current Value:</span>
                <span 
                  className={styles.value}
                  style={{ color: getStatusColor(dataPoint) }}
                >
                  {dataPoint.value}
                </span>
              </div>

              {/*
                The one place a newcomer can be told WHY it is blank — from
                the hook's own statement that there is no key, not inferred
                from emptiness, which would blame a key that is set on a day
                EIA is down.
              */}
              {dataPoint.value === NEEDS_EIA_KEY && (
                <div className={styles.noDataHint}>
                  No EIA credential. These figures come from the US Energy
                  Information Administration, which needs a free API key. Add
                  yours under Keys, in this window. It is used from your
                  browser and never sent to Starcom.
                </div>
              )}
              {dataPoint.value === 'no data' && isEiaBacked(dataPoint.id) && (
                <div className={styles.noDataHint}>
                  EIA was asked with your key and sent nothing usable. It may be
                  down, or may have refused the key.
                </div>
              )}
              
              <div className={styles.dataPointFooter}>
                <span className={styles.configureHint}>
                  Click to configure settings
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DataPointList;

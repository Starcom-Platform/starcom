// IntelReportTooltip.tsx
// Enhanced lightweight tooltip component for Intel Report 3D model hover states

import React, { useMemo } from 'react';
import { IntelReportOverlayMarker, markerTimeMs } from '../../../interfaces/IntelReportOverlay';
import { formatCoordinate } from '../../../types/intel/SourceObservation';
import { IntelReportGlyph } from '../IntelReportGlyph/IntelReportGlyph';
import styles from './IntelReportTooltip.module.css';
import { notStated } from '../../../services/epistemic/epistemicLanguage';
import { describeRecordTime, markerRecordTime } from '../../../services/intel/recordTime';
import { formatUtcDateTime } from '../../../utils/utcTime';
import ReportSeverity from '../../Intel/ReportSeverity';
import { LensBadges } from '../../Intel/BigThreeLens';
import { NamesPeopleLabel } from '../../Intel/NamesPeopleLabel';

interface IntelReportTooltipProps {
  report: IntelReportOverlayMarker | null;
  position: { x: number; y: number };
  visible: boolean;
  onClose?: () => void;
  boundaryElement?: HTMLElement | null; // For smart positioning
  entityLabel?: string;
  showConfidenceTag?: boolean;
}

export const IntelReportTooltip: React.FC<IntelReportTooltipProps> = ({
  report,
  position,
  visible,
  boundaryElement,
  entityLabel = 'Intel Report',
  showConfidenceTag = false
}) => {
  // Memoized timestamp formatting for performance
  const recordTimeMs = markerTimeMs(report);

  const formattedTimestamp = useMemo(() => {
    if (recordTimeMs === null) return notStated('time');
    // With the year: a scraped record can be from another year entirely.
    return formatUtcDateTime(recordTimeMs, { year: true });
  }, [recordTimeMs]);

  // Which time placed this report, when its producer says (decision D-E).
  const recordTime = useMemo(() => {
    const time = report ? markerRecordTime(report) : null;
    return time ? describeRecordTime(time) : null;
  }, [report]);


  // Smart positioning to keep tooltip within viewport
  const tooltipStyle = useMemo(() => {
    const { x, y } = position;
    let finalX = x;
    let transform = 'translate(-50%, -100%)';
    
    if (boundaryElement || typeof window !== 'undefined') {
      const boundary = boundaryElement || document.documentElement;
      const tooltipWidth = 320; // Max width from CSS
      const tooltipHeight = 150; // Estimated height
      const padding = 20; // Safety padding
      
      // Horizontal positioning
      if (x - tooltipWidth / 2 < padding) {
        // Too close to left edge
        transform = 'translate(0%, -100%)';
        finalX = padding;
      } else if (x + tooltipWidth / 2 > boundary.clientWidth - padding) {
        // Too close to right edge
        transform = 'translate(-100%, -100%)';
        finalX = boundary.clientWidth - padding;
      }
      
      // Vertical positioning
      if (y - tooltipHeight < padding) {
        // Too close to top, show below cursor
        transform = transform.replace('-100%', '20px');
      }
    }
    
    return {
      left: finalX,
      top: y,
      transform
    };
  }, [position, boundaryElement]);

  // Coarsened to the stated precision — see formatCoordinate. Two decimals
  // happened to be close for the default case; it was a coincidence, not a rule.
  const coordinateDisplay = useMemo(
    () => formatCoordinate(report?.latitude, report?.longitude, report?.geoPrecisionM, { absent: 'no position' }),
    [report?.latitude, report?.longitude, report?.geoPrecisionM]
  );

  const confidenceDisplay = useMemo(() => {
    if (!showConfidenceTag) {
      return null;
    }

    // An 'unknown' tag and no tag at all are the same fact: nobody stated how
    // precise the position is. Shown as that, not as a fifth, vaguer tier.
    const confidenceTag = (report?.tags || []).find((tag) => {
      const normalized = tag?.toLowerCase();
      return normalized === 'exact' || normalized === 'city' || normalized === 'region' || normalized === 'country';
    });

    return confidenceTag ? confidenceTag.toUpperCase() : notStated('precision').toUpperCase();
  }, [report?.tags, showConfidenceTag]);

  const stalenessDisplay = useMemo(() => {
    // No usable time, no age to judge. The date line already says no time was
    // given; calling it STALE would read that absence as a finding.
    if (!showConfidenceTag || recordTimeMs === null) {
      return null;
    }

    const daysOld = Math.max(0, Math.floor((Date.now() - recordTimeMs) / 86400000));
    if (daysOld > 30) {
      return { label: `STALE ${daysOld}D`, degraded: true };
    }

    return { label: 'FRESH', degraded: false };
  }, [recordTimeMs, showConfidenceTag]);

  const displayedTags = useMemo(() => {
    return (report?.tags || []).slice(0, 3).map((tag) => ({
      raw: tag,
      display: tag.length > 20 ? `${tag.slice(0, 20)}…` : tag
    }));
  }, [report?.tags]);

  // Early return after hooks
  if (!visible || !report) return null;

  return (
    <div
      className={`${styles.tooltip} ${visible ? styles.visible : ''}`}
      style={tooltipStyle}
      role="tooltip"
      aria-live="polite"
      aria-label={`${entityLabel}: ${report.title}`}
      tabIndex={-1} // Allow focus for keyboard users
    >
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.glyphBox}>
            {/* The mark hovered, as the globe draws it: a person for an RLSH entity (SVG glyphs everywhere, 2026-10-08). */}
            <IntelReportGlyph report={report} size={48} />
          </div>
          <div className={styles.headerInfo}>
            <h4 className={styles.title}>{report.title || 'Untitled Report'}</h4>
            {typeof report.groupSize === 'number' && report.groupSize > 1 && (
              /*
               * Says a stack is a stack.
               *
               * The RLSH source geocodes to a city centroid, so co-location is
               * the norm: 197 markers occupy 107 coordinates, and San Diego is
               * one pin that is fourteen people. Only the representative is
               * pickable, and without this line nothing tells a reader the
               * other thirteen exist — the popup can already page through them,
               * but nobody would think to try.
               */
              <div
                className={styles.priority}
                title={`${report.groupSize} entries share this location; the popup can page through them`}
              >
                +{report.groupSize - 1} more here
              </div>
            )}
            {/* One reading, shared with the report panel and the popup (plan item 1.9). */}
            <ReportSeverity priority={report.priority} tags={report.tags} />
            {/* The big-three lenses it is sorted under (D-CT, CT6). */}
            <LensBadges tags={report.tags} />
            <NamesPeopleLabel namesPeople={report.namesPeople} sources={report.sourceLinks} />
          </div>
        </div>
        
        <div className={styles.details}>
          <div
            className={styles.timestamp}
            title={recordTime ? `${recordTime.label}: ${recordTime.text}` : `Report timestamp: ${formattedTimestamp}`}
          >
            📅 {recordTime ? `${recordTime.label} ${recordTime.text}` : formattedTimestamp}
          </div>
          
          <div className={styles.location} title={`Report location: ${coordinateDisplay}`}>
            🌍 {coordinateDisplay}
          </div>

          {confidenceDisplay && (
            <div className={styles.tags}>
              <span className={`${styles.tag} ${!['EXACT', 'CITY', 'REGION'].includes(confidenceDisplay)? styles.tagDegraded : ''}`} title={`Geospatial confidence: ${confidenceDisplay}`}>
                🧭 {confidenceDisplay}
              </span>
              {stalenessDisplay && (
                <span className={`${styles.tag} ${stalenessDisplay.degraded ? styles.tagDegraded : ''}`} title={`Recency status: ${stalenessDisplay.label}`}>
                  ⏱ {stalenessDisplay.label}
                </span>
              )}
            </div>
          )}
          
          {report.tags && report.tags.length > 0 && (
            <div className={styles.tags}>
              {displayedTags.map((tag, index) => (
                <span key={`${tag.raw}-${index}`} className={styles.tag} title={`Tag: ${tag.raw}`}>
                  {tag.display}
                </span>
              ))}
              {report.tags.length > 3 && (
                <span className={styles.tagMore} title={`${report.tags.length - 3} more tags`}>
                  +{report.tags.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
        
        <div className={styles.footer}>
          <span className={styles.hint}>Click for details</span>
        </div>
      </div>
      
      <div className={styles.arrow} aria-hidden="true" />
    </div>
  );
};

export default IntelReportTooltip;

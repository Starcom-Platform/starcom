// IntelReportPopup.tsx
// Enhanced detailed popup component for Intel Report 3D model click interactions

import React, { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { List } from 'lucide-react';
import { useApplicationRouter } from '../../../hooks/useApplicationRouter';
import { IntelReportOverlayMarker, markerTimeMs } from '../../../interfaces/IntelReportOverlay';
import { notStated } from '../../../services/epistemic/epistemicLanguage';
import { describeRecordTime, markerRecordTime } from '../../../services/intel/recordTime';
import { formatCoordinate } from '../../../types/intel/SourceObservation';
import { IntelReportGlyph } from '../IntelReportGlyph/IntelReportGlyph';
import styles from './IntelReportPopup.module.css';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { listInWords } from '../../../utils/listInWords';
import KeyName from '../../Identity/KeyName';
import { createLogger } from '@utils/logger';
import ReportSeverity from '../../Intel/ReportSeverity';
import ReviewsPanel from '../../Reviews/ReviewsPanel';
import { reportReviewTarget } from '../../../services/reviews/reviewTargets';
import { intelWorkspaceManager } from '../../../services/intel/IntelWorkspaceManager';
import { fromRelayFeed, reportDownloadRefusal } from '../../../services/intel/bundles/bundleDistribution';
import { isInformationVisibility } from '../../../types/intel/IntelItemUI';
import Translatable from '../../Translation/Translatable';
import SourceLinks from '../../Intel/SourceLinks';
import { LensBadges } from '../../Intel/BigThreeLens';
import { NamesPeopleLabel } from '../../Intel/NamesPeopleLabel';
import { useMessages } from '../../../i18n/app/i18n';
import { openEventChart } from '../../../features/psi/eventChartPanel';
import { psiKitOn } from '../../../services/psiWatch/psiKitSwitch';

/**
 * Why a report drawn here may not be written out (plan item 9.13b, decision
 * G8d), or null. The globe draws your own reports too, and one of those
 * follows the rule its own Export does; one someone published came from a
 * relay, and goes. Read without waiting: the workspace is read before any of
 * its reports can be drawn, so a report it cannot find is not one of yours.
 */
function exportRefusalFor(id: string): string | null {
  let stored;
  try {
    stored = intelWorkspaceManager.getReports().find((r) => r.id === id);
  } catch {
    return null;
  }
  if (!stored) return null;
  const metadata = (stored.metadata ?? {}) as { visibility?: unknown; history?: Array<{ action?: string; user?: string }> };
  const visibility = isInformationVisibility(metadata.visibility) ? metadata.visibility : undefined;
  if (visibility === undefined && !fromRelayFeed({ history: metadata.history })) {
    return 'Nobody has chosen who may receive this report yet. Choose on its page first.';
  }
  return reportDownloadRefusal({ visibility, history: metadata.history });
}
/**
 * Whether a report drawn here is Public, the only content the cloud may ever be sent on the person's key
 * (D-ML, ML6): one of your own by its stored distribution; one that came from the relay feed was published,
 * unless it is marked otherwise; one the workspace cannot find was published by someone else.
 */
function isPublicHere(id: string): boolean {
  let stored;
  try {
    stored = intelWorkspaceManager.getReports().find((r) => r.id === id);
  } catch {
    return false;
  }
  if (!stored) return true;
  const metadata = (stored.metadata ?? {}) as { visibility?: unknown; history?: Array<{ action?: string; user?: string }> };
  return metadata.visibility === 'public' || (metadata.visibility === undefined && fromRelayFeed({ history: metadata.history }));
}
const log = createLogger({ prefix: 'IntelReportPopup' });

interface IntelReportPopupProps {
  report: IntelReportOverlayMarker | null;
  visible: boolean;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  /**
   * Opened from a place's menu (K8, BA8): which of the place's reports this is,
   * and the way back to the menu. Absent for a report opened on its own.
   */
  place?: { at: number; of: number; onBack: () => void };
  loading?: boolean;
  error?: string | null;
}

export const IntelReportPopup: React.FC<IntelReportPopupProps> = ({
  report,
  visible,
  onClose,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  place,
  loading = false,
  error = null
}) => {
  const { m } = useMessages();
  const [isClosing, setIsClosing] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const { navigateToApp } = useApplicationRouter();
  // A report read from a relay can be reviewed (plan item 5.1); the panel opens on asking.
  const [showReviews, setShowReviews] = useState(false);
  const [exportRefused, setExportRefused] = useState<string | null>(null);
  const reviewTarget = useMemo(() => (report ? reportReviewTarget({
    id: report.pubkey, nostrEventId: report.nostrEventId, nostrKind: report.nostrKind, tags: report.tags, author: report.author,
  }) : null), [report]);

  // Enhanced keyboard navigation with focus management
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!visible) return;
    
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        onClose();
        break;
      case 'ArrowLeft':
        if (hasPrevious && onPrevious) {
          event.preventDefault();
          onPrevious();
        }
        break;
      case 'ArrowRight':
        if (hasNext && onNext) {
          event.preventDefault();
          onNext();
        }
        break;
      case 'Tab':
        // Trap focus within popup
        if (popupRef.current) {
          const focusableElements = popupRef.current.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          const firstElement = focusableElements[0] as HTMLElement;
          const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
          
          if (event.shiftKey && document.activeElement === firstElement) {
            event.preventDefault();
            lastElement?.focus();
          } else if (!event.shiftKey && document.activeElement === lastElement) {
            event.preventDefault();
            firstElement?.focus();
          }
        }
        break;
    }
  }, [visible, onClose, onPrevious, onNext, hasPrevious, hasNext]);

  // Enhanced effect with focus management
  useEffect(() => {
    if (visible) {
      // Store previous focus
      previousFocusRef.current = document.activeElement as HTMLElement;
      
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      
      // Focus the popup for accessibility
      setTimeout(() => {
        popupRef.current?.focus();
      }, 100);
    } else {
      document.body.style.overflow = '';
      
      // Restore previous focus
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [visible, handleKeyDown]);

  // Memoized timestamp formatting with error handling
  const recordTimeMs = markerTimeMs(report);

  const formattedTimestamp = useMemo(() => {
    if (recordTimeMs === null) return notStated('time');

    return formatUtcDateTime(recordTimeMs, { year: true });
  }, [recordTimeMs]);

  // Which time placed this report, when its producer says (decision D-E).
  const recordTime = useMemo(() => {
    const time = report ? markerRecordTime(report) : null;
    return time ? describeRecordTime(time) : null;
  }, [report]);


  /*
   * ─── THE CLASSIFICATION BADGE IS GONE, AND SO IS THE WORK I DID ON IT ────
   *
   * `56eddefd` added markerClassification to fix a real bug: the badge scanned
   * `tags` and fell back to 'UNCLASSIFIED', so a TOP_SECRET report rendered
   * UNCLASSIFIED beside its full content. Carrying the field through fixed the
   * display.
   *
   * But the tree had already recorded that the product was dropping
   * classification, and I had read it. So the fix was correct about the bug and
   * wrong about the direction: it made an honest badge for a scheme that was
   * being removed. This reverts it, which is what Stage 8 said it would do.
   *
   * Nothing displays handling here now. The popup shows the two things that
   * actually bear on whether to trust a report — its collection source and its
   * collection method, both already rendered below — and a globe marker is the
   * wrong surface for a distribution rule anyway: the rule governs where the
   * report may GO, which is a decision made at publish time, not a label to
   * read off a pin.
   */

  // Memoized source extraction
  const sourceInfo = useMemo(() => {
    const tags = report?.tags || [];
    const sourceTags = tags.filter(tag => 
      tag.startsWith('SOURCE_') || 
      ['SIGINT', 'HUMINT', 'OSINT', 'IMAGERY', 'TECHNICAL'].includes(tag)
    );
    // No source tag means nobody stated one, which is not a source called UNKNOWN.
    return sourceTags.length > 0 ? sourceTags[0] : notStated('source').toUpperCase();
  }, [report?.tags]);

  // What the report stated about its threat level and confidence — null, never a default.
  const threatStated = statedThreatLevel(report?.tags);
  const confidenceStated = statedConfidence(report?.tags);

  // Enhanced close handler with animation
  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200); // Match CSS animation duration
  }, [onClose]);

  // Enhanced overlay click handler
  // handleOverlayClick lived here: it checked event.target === event.currentTarget
  // before closing, so a drag starting inside the popup and ending on the backdrop
  // would not dismiss it. Modal makes that check itself, for every dialog, so the
  // wrapper is gone and handleClose is passed directly.

  /**
   * Coordinate display, coarsened to the precision the source actually claimed.
   *
   * This was `toFixed(4)` — about eleven metres — for a marker whose position
   * may have come from a 20km geohash cell that the observer chose deliberately
   * to protect themselves. `formatCoordinate` falls back to
   * DEFAULT_GEO_PRECISION_M when a marker states no precision, which is the
   * conservative reading of "the source did not say" rather than the flattering
   * one.
   */
  const coordinateDisplay = useMemo(
    () => formatCoordinate(report?.latitude, report?.longitude, report?.geoPrecisionM, {
      absent: 'no position',
      showUncertainty: true,
    }),
    [report?.latitude, report?.longitude, report?.geoPrecisionM]
  );

  if (!visible) return null;

  // Show loading state
  if (loading) {
    return (
      <>
        {/*
          * `styles.visible` is not decoration here. `.popup` is opacity: 0 and
          * only `.visible` raises it, and these three branches never added it —
          * so the loading, error and not-found states rendered fully
          * transparent. Clicking a marker showed a backdrop and nothing else
          * while it loaded, and nothing at all when it failed.
          */}
        <div className={`${styles.popup} ${styles.visible}`}>
          <div className={styles.loadingContainer}>
            <div className={styles.spinner} aria-label="Loading report details..." />
            <p>Loading Intel Report details...</p>
          </div>
        </div>
            </>
    );
  }

  // Show error state
  if (error) {
    return (
      <>
        {/*
          * `styles.visible` is not decoration here. `.popup` is opacity: 0 and
          * only `.visible` raises it, and these three branches never added it —
          * so the loading, error and not-found states rendered fully
          * transparent. Clicking a marker showed a backdrop and nothing else
          * while it loaded, and nothing at all when it failed.
          */}
        <div className={`${styles.popup} ${styles.visible}`}>
          <div className={styles.errorContainer}>
            <h3>Error Loading Report</h3>
            <p>{error}</p>
            <button onClick={handleClose} className={styles.actionButton}>
              Close
            </button>
          </div>
        </div>
            </>
    );
  }

  // Show report not available state
  if (!report) {
    return (
      <>
        {/*
          * `styles.visible` is not decoration here. `.popup` is opacity: 0 and
          * only `.visible` raises it, and these three branches never added it —
          * so the loading, error and not-found states rendered fully
          * transparent. Clicking a marker showed a backdrop and nothing else
          * while it loaded, and nothing at all when it failed.
          */}
        <div className={`${styles.popup} ${styles.visible}`}>
          <div className={styles.errorContainer}>
            <h3>Report Not Available</h3>
            <p>The requested Intel Report could not be found.</p>
            <button onClick={handleClose} className={styles.actionButton}>
              Close
            </button>
          </div>
        </div>
            </>
    );
  }

  return (
    /* PopupFrame is the dialog — see CountryInfoPopup for the reasoning. */
    <>
      <div
        ref={popupRef}
        className={`${styles.popup} ${visible ? styles.visible : ''} ${isClosing ? styles.closing : ''}`}
        onClick={(e) => e.stopPropagation()}
        aria-labelledby="popup-title"
        aria-describedby="popup-content"
        tabIndex={-1}
      >
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.titleSection}>
              <div className={styles.glyphTile}>
                {/* The report's own mark, as the globe draws it (SVG glyphs everywhere, 2026-10-08). */}
                <IntelReportGlyph report={report} size={96} className={styles.headerGlyph} />
              </div>
              <div className={styles.titleInfo}>
                <h2 id="popup-title" className={styles.title}>
                  {report.title || 'Untitled Report'}
                </h2>
                <p className={styles.subtitle}>
                  {sourceInfo} • {coordinateDisplay}
                </p>
                <div className={styles.headerTags}>
                  {/* One reading, shared with the report panel and the tooltip (plan item 1.9).
                      This copy matched uppercase tags only and called an unassessed
                      report STANDARD. */}
                  <ReportSeverity priority={report.priority} tags={report.tags} />
                  {/* The big-three lenses it is sorted under (D-CT, CT6): the publisher's sorting, not a finding. */}
                  <LensBadges tags={report.tags} />
                  {/* It names a person, as its source names them (D-NP, NP1). */}
                  <NamesPeopleLabel namesPeople={report.namesPeople} sources={report.sourceLinks} />
                </div>
              </div>
            </div>
          </div>
          <button
            className={styles.closeButton}
            onClick={handleClose}
            aria-label="Close popup"
          >
            ×
          </button>
        </div>

        <div id="popup-content" className={styles.content}>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <span className={styles.summaryIcon} aria-hidden="true">📅</span>
              <div className={styles.summaryCopy}>
                <span className={styles.summaryLabel}>{recordTime?.label ?? 'Timestamp'}</span>
                <span className={styles.summaryValue}>{recordTime?.text ?? formattedTimestamp}</span>
              </div>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryIcon} aria-hidden="true">🌍</span>
              <div className={styles.summaryCopy}>
                <span className={styles.summaryLabel}>Location</span>
                <span className={styles.summaryValue}>
                  {/* About a territory as a whole (BA3): it names no point, so none is given. */}
                  {report.aboutTerritories?.length ? `About ${listInWords(report.aboutTerritories)} as a whole` : coordinateDisplay}
                </span>
              </div>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryIcon} aria-hidden="true">📡</span>
              <div className={styles.summaryCopy}>
                <span className={styles.summaryLabel}>Source</span>
                <span className={styles.summaryValue}>{sourceInfo}</span>
              </div>
            </div>
          </div>

          <section className={`${styles.panel} ${styles.descriptionPanel}`}>
            <h3 className={styles.panelTitle}>Report Narrative</h3>
            <p className={styles.descriptionText}>
              {report.content || 'No detailed description available for this intelligence report.'}
            </p>
            {/* A report from abroad, read in the language shown, on this device (D-ML, T1). */}
            {report.content && <Translatable text={report.content} publicContent={isPublicHere(report.pubkey)} testId="report-narrative-translate" />}
          </section>

          {/* Where its information was published, to follow (D-CT, CT2): its r tags, the original first. */}
          {report.sourceLinks?.length ? (
            <section className={styles.panel} data-testid="report-popup-sources">
              <SourceLinks links={report.sourceLinks} headingClassName={styles.panelTitle} />
            </section>
          ) : null}

          {report.tags && report.tags.length > 0 && (
            <section className={`${styles.panel} ${styles.tagsPanel}`}>
              <h3 className={styles.panelTitle}>Tags &amp; Classifications</h3>
              <div className={styles.tags}>
                {report.tags.map((tag, index) => (
                  <span key={`${tag}-${index}`} className={styles.tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/*
            What the report STATED about itself, and nothing else (decision D-C;
            D-F step 14). These cards used to compute a threat level, a
            confidence percentage, recommended actions and related intelligence
            from keyword tags, with a default for every miss — LOW, 30%,
            "Continue monitoring", "Historical precedents in intelligence
            database". A Nostr report carries none of those keywords, so every
            one was shown as LOW at 30% with actions nobody recommended. D-C:
            "nobody said" is not "someone said low". The actions and
            related-intelligence cards had no stated form at all, so they are
            gone rather than emptied.
          */}
          <section className={styles.analysisGrid}>
            <div className={`${styles.analysisCard} ${styles.panel}`}>
              <div className={styles.analysisHeader}>
                <span className={styles.analysisIcon} aria-hidden="true">🛡️</span>
                <h4 className={styles.analysisTitle}>Threat Level</h4>
              </div>
              <div className={styles.threatLevel}>
                {threatStated ? (
                  <span className={`${styles.threatIndicator} ${THREAT_CLASS[threatStated]}`}>{threatStated}</span>
                ) : (
                  <span className={styles.analysisText}>{notStated('threat level')}</span>
                )}
              </div>
            </div>

            <div className={`${styles.analysisCard} ${styles.panel}`}>
              <div className={styles.analysisHeader}>
                <span className={styles.analysisIcon} aria-hidden="true">📊</span>
                <h4 className={styles.analysisTitle}>Confidence</h4>
              </div>
              <div className={styles.threatLevel}>
                <span className={styles.analysisText}>{confidenceStated ?? notStated('confidence')}</span>
              </div>
            </div>
          </section>

          <section className={`${styles.panel} ${styles.infoPanel}`}>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Report ID</span>
                <span className={styles.infoValue}>{report.pubkey.slice(0, 8)}...</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Author</span>
                <span className={styles.infoValue}><KeyName pubkey={report.author} /></span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Collection Method</span>
                <span className={styles.infoValue}>{statedCollectionMethod(report.tags) ?? notStated('collection method')}</span>
              </div>
            </div>
          </section>
        </div>

        <div className={styles.footer}>
          <div className={styles.navigation}>
            {place && (
              <button
                type="button"
                className={`${styles.navButton} ${styles.placeButton}`}
                onClick={place.onBack}
                aria-label={`Back to the ${place.of} reports here`}
              >
                <List size={14} aria-hidden="true" /> {place.of} here
              </button>
            )}
            <button
              className={`${styles.navButton} ${!hasPrevious ? styles.disabled : ''}`}
              onClick={onPrevious}
              disabled={!hasPrevious}
              aria-label="Previous report"
            >
              ← Previous
            </button>
            {place && <span className={styles.position}>{place.at} of {place.of} here</span>}
            <button
              className={`${styles.navButton} ${!hasNext ? styles.disabled : ''}`}
              onClick={onNext}
              disabled={!hasNext}
              aria-label="Next report"
            >
              Next →
            </button>
          </div>
          {exportRefused && <p className={styles.notice} role="alert">{exportRefused}</p>}
          <div className={styles.actions}>
            <button
              className={styles.actionButton}
              onClick={() => {
                const refusal = exportRefusalFor(report.pubkey);
                setExportRefused(refusal);
                if (refusal) return;
                const exportData = {
                  report,
                  // What the report stated, and null where it stated nothing —
                  // this used to export the invented level, percentage and actions.
                  stated: {
                    threatLevel: threatStated,
                    confidence: confidenceStated,
                    collectionMethod: statedCollectionMethod(report.tags),
                  }
                };
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `intel-report-${report.pubkey.slice(0, 8)}-analysis.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                log.debug('Exported detailed analysis for', report.pubkey);
              }}
            >
              📄 Export Analysis
            </button>
            <button
              className={styles.actionButton}
              onClick={() => navigateToApp('inteldashboard', undefined, { reportId: report.pubkey })}
            >
              📊 Open in Intel Dashboard
            </button>
            {/* Its chart, then and now (D-PW, PW7, PW85): the report's time and place, while Psi Watch is shown; the popup closes for it. */}
            {markerTimeMs(report) !== null && Number.isFinite(report.latitude) && Number.isFinite(report.longitude) && psiKitOn() && (
              <button
                className={styles.actionButton}
                title={m.psiWatch.chart.actionTitle}
                data-testid="report-popup-chart"
                onClick={() => {
                  openEventChart({ title: report.title, timeMs: markerTimeMs(report) as number, place: { lat: report.latitude, lng: report.longitude }, layer: 'Intel Reports' });
                  // The popup stands over the globe and every panel: it gives way to the chart.
                  handleClose();
                }}
              >
                {m.psiWatch.chart.action}
              </button>
            )}
            {reviewTarget && (
              <button className={styles.actionButton} aria-expanded={showReviews} onClick={() => setShowReviews((open) => !open)}>
                💬 Reviews
              </button>
            )}
          </div>
          {reviewTarget && showReviews && (
            <div data-testid="report-popup-reviews" style={{ marginTop: 12 }}>
              <ReviewsPanel target={reviewTarget} itemTitle={report.title} onDark />
            </div>
          )}
        </div>
      </div>
        </>
  );
};

// What a report stated about itself, read from its tags — or null, never a default.

/** Threat levels a tag can STATE. A topic (WEAPONS, SURVEILLANCE) is not one. */
const STATED_THREAT = ['CRITICAL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const;
type StatedThreat = typeof STATED_THREAT[number];

const THREAT_CLASS: Record<StatedThreat, string> = {
  CRITICAL: styles.threatCritical,
  URGENT: styles.threatCritical,
  HIGH: styles.threatHigh,
  MEDIUM: styles.threatMedium,
  LOW: styles.threatLow,
};

export function statedThreatLevel(tags: readonly string[] = []): StatedThreat | null {
  return STATED_THREAT.find((level) => tags.includes(level)) ?? null;
}

/**
 * A confidence the report STATED, as its word. There is no percentage: the old
 * 95/80/65/50/30 were a mapping this file invented, and a collection method
 * (SIGINT, HUMINT) is not a confidence at all.
 */
const STATED_CONFIDENCE = ['VERIFIED', 'CONFIRMED', 'PROBABLE', 'POSSIBLE'] as const;

export function statedConfidence(tags: readonly string[] = []): string | null {
  return STATED_CONFIDENCE.find((word) => tags.includes(word)) ?? null;
}

const COLLECTION_METHOD: Record<string, string> = {
  SIGINT: 'Signals Intelligence',
  HUMINT: 'Human Intelligence',
  IMAGERY: 'Imagery Intelligence',
  OSINT: 'Open Source Intelligence',
  TECHNICAL: 'Technical Intelligence',
};

/** Null when no tag states one — this used to say "Multi-Source". */
export function statedCollectionMethod(tags: readonly string[] = []): string | null {
  const tag = Object.keys(COLLECTION_METHOD).find((t) => tags.includes(t));
  return tag ? COLLECTION_METHOD[tag] : null;
}

export default IntelReportPopup;

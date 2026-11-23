import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { rlshGeoPrecisionM, type RLSHOverlayMarker } from '../../../interfaces/RLSHOverlay';
import { formatCoordinate } from '../../../types/intel/SourceObservation';
import { labelled, notRecorded, notStated } from '../../../services/epistemic/epistemicLanguage';
import styles from '../IntelReportPopup/IntelReportPopup.module.css';
import { rlshTelemetryService } from '../../../services/RLSHTelemetryService';
import { formatUtcDateTime, localTimeTitle } from '../../../utils/utcTime';
import { createLogger } from '@utils/logger';
import { openRlshPanel } from '../../../features/rlsh/rlshPanel';
import { useMessages } from '../../../i18n/app/i18n';
const log = createLogger({ prefix: 'RLSHPopup' });

interface RLSHNavigationContext {
  totalCount: number;
  currentPosition: number;
  groupSize: number;
  groupPosition: number;
  groupScoped: boolean;
}

interface RLSHPopupProps {
  marker: RLSHOverlayMarker | null;
  visible: boolean;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  loading?: boolean;
  error?: string | null;
  navigationContext?: RLSHNavigationContext;
}

const CANONICAL_SOURCE_ALLOWLIST = [
  'example.org',
  'wiki.rlsh.net',
  'wikipedia.org',
  'fandom.com'
];

interface CanonicalUrlValidation {
  normalizedUrl: string | null;
  isValid: boolean;
  reason: 'missing-url' | 'unsupported-protocol' | 'host-not-allowlisted' | 'invalid-url' | null;
}

const normalizeAndValidateCanonicalUrl = (value: string | null | undefined): CanonicalUrlValidation => {
  const trimmed = value?.trim() || '';
  if (!trimmed) {
    return { normalizedUrl: null, isValid: false, reason: 'missing-url' };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { normalizedUrl: null, isValid: false, reason: 'unsupported-protocol' };
    }

    const hostname = parsed.hostname.toLowerCase();
    const isAllowlisted = CANONICAL_SOURCE_ALLOWLIST.some((domain) => {
      const normalizedDomain = domain.toLowerCase();
      return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
    });

    if (!isAllowlisted) {
      return { normalizedUrl: null, isValid: false, reason: 'host-not-allowlisted' };
    }

    return { normalizedUrl: parsed.toString(), isValid: true, reason: null };
  } catch {
    return { normalizedUrl: null, isValid: false, reason: 'invalid-url' };
  }
};

const confidenceLabelMap: Record<RLSHOverlayMarker['geoConfidence'], string> = {
  exact: 'Exact',
  city: 'City',
  region: 'Region',
  country: 'Country',
  // Nobody stated how precise the position is: not a fifth, vaguer tier.
  unknown: labelled('', notStated('precision'))
};

const confidenceBadgeToneMap: Record<RLSHOverlayMarker['geoConfidence'], 'priorityLow' | 'priorityMedium' | 'priorityHigh' | 'priorityCritical'> = {
  exact: 'priorityLow',
  city: 'priorityMedium',
  region: 'priorityHigh',
  country: 'priorityHigh',
  unknown: 'priorityCritical'
};


const deepLinkReasonMessageMap: Record<Exclude<CanonicalUrlValidation['reason'], null>, string> = {
  'missing-url': 'No canonical source URL is available for this entity.',
  'unsupported-protocol': 'Canonical source URL must use HTTP or HTTPS.',
  'host-not-allowlisted': 'Canonical source host is not in the approved allowlist.',
  'invalid-url': 'Canonical source URL is malformed.'
};

/**
 * What to tell a reader about this person's registration.
 *
 * Was `registrationApproved ? 'Approved' : 'Pending curation'`. 195 of the 197
 * markers are scraped from wiki.rlsh.net by a third party and carry no
 * registration at all, so every one of them claimed to be in a review queue
 * they never joined — about real, named people who did not ask to be in this
 * dataset. "Nobody submitted this" is not "we have not got to it yet".
 */
type RegistrationStatus = 'approved' | 'submitted' | 'none';

const REGISTRATION_LABEL: Record<RegistrationStatus, string> = {
  approved: 'Approved',
  submitted: 'Submitted — awaiting review',
  none: 'Not registered — record sourced from wiki.rlsh.net',
};

/**
 * The header's short form of the same answer, from the same status.
 *
 * The header used to decide for itself (`registrationApproved ? 'Approved' :
 * 'Pending'`), so every scraped record carried an orange PENDING badge directly
 * above a card saying it was never registered. One status, two lengths.
 */
const REGISTRATION_BADGE: Record<RegistrationStatus, { text: string; tone: 'priorityLow' | 'priorityMedium' | null }> = {
  approved: { text: 'Approved', tone: 'priorityLow' },
  submitted: { text: 'Submitted', tone: 'priorityMedium' },
  // Neutral, not amber: it is how nearly every record in this dataset arrived.
  none: { text: 'Not registered', tone: null },
};

const registrationStatusFor = (marker: { registrationStatus?: string; registrationApproved?: boolean } | null): RegistrationStatus => {
  const status = marker?.registrationStatus
    ?? (marker?.registrationApproved ? 'approved' : 'none');
  return status === 'approved' || status === 'submitted' ? status : 'none';
};

const registrationLabelFor = (marker: { registrationStatus?: string; registrationApproved?: boolean } | null): string =>
  REGISTRATION_LABEL[registrationStatusFor(marker)];

/** The role, and whether the person claimed it or this app assumed it. */
const roleLabelFor = (marker: { roleLabel?: string; roleSource?: string } | null): string => {
  const label = marker?.roleLabel || 'Hero';
  return marker?.roleSource === 'registered' ? label : `${label} (assumed)`;
};

export const RLSHPopup: React.FC<RLSHPopupProps> = ({
  marker,
  visible,
  onClose,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  loading = false,
  error = null,
  navigationContext
}) => {
  const { m } = useMessages();
  const [isClosing, setIsClosing] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 180);
  }, [onClose]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab' && popupRef.current) {
        const focusableElements = Array.from(
          popupRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
        ).filter((element) => !element.hasAttribute('disabled'));

        if (focusableElements.length === 0) {
          event.preventDefault();
          popupRef.current.focus();
          return;
        }

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];
        const active = document.activeElement;

        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
          return;
        }

        if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
          return;
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
        return;
      }

      if (event.key === 'ArrowLeft' && hasPrevious && onPrevious) {
        event.preventDefault();
        onPrevious();
        return;
      }

      if (event.key === 'ArrowRight' && hasNext && onNext) {
        event.preventDefault();
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    setTimeout(() => popupRef.current?.focus(), 50);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    };
  }, [visible, handleClose, hasPrevious, onPrevious, hasNext, onNext]);

  const locationLabel = useMemo(() => {
    if (!marker) {
      return 'Unknown location';
    }

    const parts = [marker.city, marker.region, marker.countryCode?.toUpperCase()].filter(Boolean);
    return parts.length > 0
      ? parts.join(', ')
      : formatCoordinate(marker.latitude, marker.longitude, rlshGeoPrecisionM(marker.geoConfidence));
  }, [marker]);

  /**
   * How old the record says it is. With no usable update time there is no age
   * to judge, and "Stale" would read that absence as a finding.
   */
  const recencyLabel = useMemo(() => {
    if (!marker) {
      return null;
    }

    const parsed = Date.parse(marker.updatedAt);
    if (!Number.isFinite(parsed)) {
      return labelled('', notStated('update time'));
    }

    const daysOld = Math.max(0, Math.floor((Date.now() - parsed) / 86400000));
    return daysOld > 30 ? `Stale (${daysOld}d)` : 'Fresh';
  }, [marker]);

  const registrationBadge = REGISTRATION_BADGE[registrationStatusFor(marker)];

  // When the record was updated and last verified: NaN where it does not say.
  const updatedMs = marker ? Date.parse(marker.updatedAt) : Number.NaN;
  const lastVerifiedMs = marker?.lastVerifiedAt ? Date.parse(marker.lastVerifiedAt) : Number.NaN;
  const updatedTitle = Number.isFinite(updatedMs) ? localTimeTitle(updatedMs) : undefined;
  const lastVerifiedTitle = Number.isFinite(lastVerifiedMs) ? localTimeTitle(lastVerifiedMs) : undefined;

  const updatedLabel = useMemo(() => {
    if (!Number.isFinite(updatedMs)) {
      return notRecorded();
    }

    return formatUtcDateTime(updatedMs, { year: true });
  }, [updatedMs]);

  /**
   * The date, and how old it is, because the date alone reads as reassurance.
   *
   * Every one of the 197 embedded markers carries the SAME lastVerifiedAt —
   * 2026-03-02 — because it is the timestamp of one bulk scrape of
   * wiki.rlsh.net, not the result of anyone checking this person's entry. A
   * field called "last verified" showing a specific date implies an act of
   * verification against that record, and none happened.
   *
   * Renaming it is a schema change across the interface, the service, the
   * popup and its tests, and would not by itself tell a reader the figure is
   * six months old. Saying the age does. What it cannot fix is the word
   * "verified" — that is recorded as a known overstatement, not resolved here.
   */
  const lastVerifiedLabel = useMemo(() => {
    if (!Number.isFinite(lastVerifiedMs)) {
      return notRecorded();
    }

    const days = Math.floor((Date.now() - lastVerifiedMs) / 86_400_000);
    const shown = formatUtcDateTime(lastVerifiedMs, { year: true });
    if (days < 0) return shown;
    if (days === 0) return `${shown} (today)`;
    if (days < 31) return `${shown} (${days} day${days === 1 ? '' : 's'} ago)`;
    const months = Math.floor(days / 30);
    return `${shown} — ${months} month${months === 1 ? '' : 's'} old`;
  }, [lastVerifiedMs]);

  const aliasesLabel = useMemo(() => {
    if (!marker?.aliases || marker.aliases.length === 0) {
      return notRecorded();
    }

    return marker.aliases.join(', ');
  }, [marker?.aliases]);

  const riskFlagsLabel = useMemo(() => {
    if (!marker?.riskFlags || marker.riskFlags.length === 0) {
      return notRecorded();
    }

    return marker.riskFlags.join(', ');
  }, [marker?.riskFlags]);

  /**
   * Portraits that would not load, so the popup can say so instead of showing
   * a broken frame.
   *
   * All 191 hotlinked images live on wiki-images.rlsh.net, which sits behind
   * Cloudflare's bot challenge — measured at 0 of 12 loading in a real browser,
   * and 403 regardless of Referer, so it is not hotlink protection but blanket
   * bot filtering. An <img> request cannot solve a JavaScript challenge, so the
   * inline preview cannot work from here at all.
   *
   * The LINK still works: a person clicking it navigates, passes the challenge
   * like any other visitor, and sees the image. So the failure is specific —
   * "we cannot inline this" — and saying "No hero image" would be false, since
   * there is one and we know its address.
   */
  const [unloadable, setUnloadable] = useState<ReadonlySet<string>>(() => new Set());
  const markUnloadable = useCallback((url: string) => {
    setUnloadable((prev) => (prev.has(url) ? prev : new Set(prev).add(url)));
  }, []);

  const mediaUrl = useMemo(() => {
    if (!marker?.imageUrl) {
      return null;
    }

    try {
      const parsed = new URL(marker.imageUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.toString();
      }

      return null;
    } catch {
      return null;
    }
  }, [marker?.imageUrl]);

  const symbolImageUrl = useMemo(() => {
    if (!marker?.symbolImageUrl) {
      return null;
    }

    try {
      const parsed = new URL(marker.symbolImageUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.toString();
      }

      return null;
    } catch {
      return null;
    }
  }, [marker?.symbolImageUrl]);

  const nostrNpub = useMemo(() => {
    const value = marker?.nostrNpub?.trim() || '';
    if (!value) {
      return '';
    }

    return /^npub1[ac-hj-np-z02-9]{20,}$/i.test(value) ? value : '';
  }, [marker?.nostrNpub]);

  const contactEmail = useMemo(() => {
    const value = marker?.contactEmail?.trim() || '';
    if (!value) {
      return '';
    }

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : '';
  }, [marker?.contactEmail]);

  const socialLinks = useMemo(() => {
    if (!marker?.socialLinks || marker.socialLinks.length === 0) {
      return [] as string[];
    }

    return marker.socialLinks.filter((link) => {
      try {
        const parsed = new URL(link);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    });
  }, [marker?.socialLinks]);

  const teamLabel = useMemo(() => {
    if (!marker?.team || marker.team.length === 0) {
      return notRecorded();
    }

    return marker.team.join(', ');
  }, [marker?.team]);

  const affiliatesLabel = useMemo(() => {
    if (!marker?.affiliates || marker.affiliates.length === 0) {
      return notRecorded();
    }

    return marker.affiliates.join(', ');
  }, [marker?.affiliates]);

  const attributionLabel = useMemo(() => {
    if (!marker) {
      return 'Source: unknown · ID: unknown';
    }

    return `Source: ${marker.source.provider} · ID: ${marker.source.sourceId}`;
  }, [marker]);

  const canonicalUrlValidation = useMemo(() => {
    return normalizeAndValidateCanonicalUrl(marker?.canonicalUrl);
  }, [marker?.canonicalUrl]);

  const deepLinkDisabledReason = useMemo(() => {
    if (canonicalUrlValidation.isValid || !canonicalUrlValidation.reason) {
      return null;
    }

    return deepLinkReasonMessageMap[canonicalUrlValidation.reason];
  }, [canonicalUrlValidation]);

  useEffect(() => {
    if (!visible || !marker || canonicalUrlValidation.isValid) {
      return;
    }

    log.warn('RLSH canonical URL validation failed', {
      markerId: marker.id,
      provider: marker.source.provider,
      url: marker.canonicalUrl,
      reason: canonicalUrlValidation.reason
    });
  }, [visible, marker, canonicalUrlValidation]);

  const handleOpenSource = useCallback(() => {
    if (!canonicalUrlValidation.normalizedUrl || !canonicalUrlValidation.isValid) {
      rlshTelemetryService.emit('rlsh_deeplink_click', {
        sourceProvider: marker?.source.provider,
        result: 'failure',
        reason: canonicalUrlValidation.reason || 'invalid-deeplink'
      });
      return;
    }

    window.open(canonicalUrlValidation.normalizedUrl, '_blank', 'noopener,noreferrer');
    rlshTelemetryService.emit('rlsh_deeplink_click', {
      sourceProvider: marker?.source.provider,
      result: 'success'
    });
  }, [canonicalUrlValidation, marker?.source.provider]);

  const handleCopySource = useCallback(async () => {
    if (!canonicalUrlValidation.normalizedUrl || !canonicalUrlValidation.isValid) {
      return;
    }

    await navigator.clipboard?.writeText(canonicalUrlValidation.normalizedUrl);
  }, [canonicalUrlValidation]);

  const handleCopyNpub = useCallback(async () => {
    if (!nostrNpub) {
      rlshTelemetryService.emit('rlsh_contact_intent', {
        sourceProvider: marker?.source.provider,
        result: 'failure',
        reason: 'missing-npub'
      });
      return;
    }

    await navigator.clipboard?.writeText(nostrNpub);
    rlshTelemetryService.emit('rlsh_contact_intent', {
      sourceProvider: marker?.source.provider,
      result: 'success',
      reason: 'npub-copied'
    });
  }, [nostrNpub, marker?.source.provider]);

  const handleBlockedDirectMessage = useCallback(() => {
    rlshTelemetryService.emit('rlsh_dm_blocked', {
      sourceProvider: marker?.source.provider,
      result: 'degraded',
      // Not built, for everyone. It asked anonymous viewers to sign in with a
      // wallet, which is retired (plan item 4.4).
      reason: 'dm-feature-not-enabled'
    });
  }, [marker?.source.provider]);

  if (!visible) {
    return null;
  }

  if (loading) {
    return (
      <>
        <div className={`${styles.popup} ${styles.visible}`} onClick={(e) => e.stopPropagation()}>
          <div className={styles.loadingContainer}>
            <div className={styles.spinner} aria-label="Loading RLSH details..." />
            <p>Loading RLSH entity details...</p>
          </div>
        </div>
      </>
    );
  }

  if (error || !marker) {
    return (
      <>
        <div className={`${styles.popup} ${styles.visible}`} onClick={(e) => e.stopPropagation()}>
          <div className={styles.errorContainer}>
            <h3>RLSH Entity Unavailable</h3>
            <p>{error || 'The selected RLSH entity could not be loaded.'}</p>
            <button onClick={handleClose} className={styles.actionButton}>Close</button>
          </div>
        </div>
      </>
    );
  }

  return (
    /*
     * PopupFrame is the dialog — see CountryInfoPopup for the reasoning. Three
     * of these branches each added a Modal and an inner role, so one marker
     * announced itself as three nested dialogs.
     *
     * The frame's name is static ("RLSH marker detail") rather than the marker's
     * own, and that is not a compromise: the marker is fetched inside this
     * component, so during the loading and error branches above there IS no
     * name to give. A label has to be true before the data arrives. The heading
     * below still carries the entity name for anyone reading the content.
     */
    <>
      <div
        ref={popupRef}
        className={`${styles.popup} ${styles.rlshPopup} ${styles.visible} ${isClosing ? styles.closing : ''}`}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h2 id="rlsh-popup-title" className={styles.title}>{marker.displayName}</h2>
            <p className={styles.subtitle}>{locationLabel} • {marker.source.provider}</p>
            <div className={styles.headerTags}>
              <span className={`${styles.priority} ${styles[confidenceBadgeToneMap[marker.geoConfidence]]}`}>
                {confidenceLabelMap[marker.geoConfidence]}
              </span>
              <span className={styles.classification}>
                {roleLabelFor(marker)}
              </span>
              <span className={registrationBadge.tone ? `${styles.priority} ${styles[registrationBadge.tone]}` : styles.classification}>
                {registrationBadge.text}
              </span>
              <span className={styles.classification}>
                {recencyLabel}
              </span>
            </div>
          </div>
          <button className={styles.closeButton} onClick={handleClose} aria-label="Close popup">×</button>
        </div>

        <div className={`${styles.content} ${styles.rlshContent}`}>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <span className={styles.summaryIcon} aria-hidden="true">📍</span>
              <div className={styles.summaryCopy}>
                <span className={styles.summaryLabel}>Coordinates</span>
                {/*
                  * Coarsened to match the confidence badge two cards over,
                  * which already said "City". This was toFixed(4) — the badge
                  * and the number contradicted each other, and these positions
                  * are city centroids standing for up to fourteen people each.
                  */}
                <span className={styles.summaryValue}>
                  {formatCoordinate(marker.latitude, marker.longitude, rlshGeoPrecisionM(marker.geoConfidence), { showUncertainty: true })}
                </span>
              </div>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryIcon} aria-hidden="true">🛰️</span>
              <div className={styles.summaryCopy}>
                <span className={styles.summaryLabel}>Geo Confidence</span>
                <span className={styles.summaryValue}>{confidenceLabelMap[marker.geoConfidence]}</span>
              </div>
            </div>
            <div className={styles.summaryCard}>
              <span className={styles.summaryIcon} aria-hidden="true">📅</span>
              <div className={styles.summaryCopy}>
                <span className={styles.summaryLabel}>Updated</span>
                <span className={styles.summaryValue} title={updatedTitle}>{updatedLabel}</span>
              </div>
            </div>
          </div>

          <section className={`${styles.panel} ${styles.descriptionPanel} ${styles.rlshSection}`}>
            <h3 className={styles.panelTitle}>Profile Summary</h3>
            <p className={styles.descriptionText}>{marker.summary || 'No summary available.'}</p>
          </section>

          <section className={`${styles.panel} ${styles.rlshSection}`}>
            <h3 className={styles.panelTitle}>Mission Snapshot</h3>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryCard}>
                <span className={styles.summaryIcon} aria-hidden="true">🧭</span>
                <div className={styles.summaryCopy}>
                  <span className={styles.summaryLabel}>Role</span>
                  <span className={styles.summaryValue}>{roleLabelFor(marker)}</span>
                </div>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryIcon} aria-hidden="true">📌</span>
                <div className={styles.summaryCopy}>
                  <span className={styles.summaryLabel}>Status</span>
                  <span className={styles.summaryValue}>{marker.status || notRecorded()}</span>
                </div>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryIcon} aria-hidden="true">🛟</span>
                <div className={styles.summaryCopy}>
                  <span className={styles.summaryLabel}>Registration</span>
                  <span className={styles.summaryValue}>{registrationLabelFor(marker)}</span>
                </div>
              </div>
            </div>
          </section>

          <section className={`${styles.panel} ${styles.tagsPanel} ${styles.rlshSection}`}>
            <h3 className={styles.panelTitle}>Tags</h3>
            <div className={styles.tags}>
              {(marker.tags.length > 0 ? marker.tags : ['UNTAGGED']).map((tag) => (
                <span key={tag} className={styles.tag}>{tag}</span>
              ))}
            </div>
          </section>

          <section className={`${styles.panel} ${styles.rlshSection}`}>
            <h3 className={styles.panelTitle}>Profile Metadata</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Aliases</span>
                <span className={styles.infoValue}>{aliasesLabel}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Identity</span>
                <span className={styles.infoValue}>{marker.identity || notRecorded()}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Status</span>
                <span className={styles.infoValue}>{marker.status || notRecorded()}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Category</span>
                <span className={styles.infoValue}>{marker.category || notRecorded()}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Team</span>
                <span className={styles.infoValue}>{teamLabel}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Affiliates</span>
                <span className={styles.infoValue}>{affiliatesLabel}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Foes</span>
                <span className={styles.infoValue}>{marker.foes || notRecorded()}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Actions</span>
                <span className={styles.infoValue}>{marker.actions || notRecorded()}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Equipment</span>
                <span className={styles.infoValue}>{marker.equipment || notRecorded()}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Abilities</span>
                <span className={styles.infoValue}>{marker.abilities || notRecorded()}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Location Text</span>
                <span className={styles.infoValue}>{marker.locationText || notRecorded()}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Last Verified</span>
                <span className={styles.infoValue} title={lastVerifiedTitle}>{lastVerifiedLabel}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Risk Flags</span>
                <span className={styles.infoValue}>{riskFlagsLabel}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Media URL</span>
                <span className={styles.infoValue}>
                  {mediaUrl ? (
                    <a href={mediaUrl} target="_blank" rel="noopener noreferrer">Open media</a>
                  ) : 'No media URL provided'}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Symbol URL</span>
                <span className={styles.infoValue}>
                  {symbolImageUrl ? (
                    <a href={symbolImageUrl} target="_blank" rel="noopener noreferrer">Open symbol</a>
                  ) : 'No symbol URL provided'}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Entity ID</span>
                <span className={styles.infoValue}>{marker.id}</span>
              </div>
            </div>
          </section>

          <section className={`${styles.panel} ${styles.rlshSection} ${styles.referenceMediaPanel}`}>
            <h3 className={styles.panelTitle}>Reference Media</h3>
            <div className={styles.referenceMediaGrid}>
              <div className={`${styles.infoItem} ${styles.mediaCard}`}>
                <span className={styles.infoLabel}>Hero Image</span>
                {mediaUrl ? (
                  <>
                    {unloadable.has(mediaUrl) ? (
                      <span className={styles.infoValue}>
                        Preview blocked by the source host — the link below still opens it.
                      </span>
                    ) : (
                      <img
                        className={styles.mediaPreview}
                        src={mediaUrl}
                        alt={`${marker.displayName} profile`}
                        loading="lazy"
                        onError={() => markUnloadable(mediaUrl)}
                      />
                    )}
                    <a className={styles.mediaLink} href={mediaUrl} target="_blank" rel="noopener noreferrer">
                      Open hero media
                    </a>
                  </>
                ) : (
                  <span className={styles.infoValue}>No hero image</span>
                )}
              </div>
              <div className={`${styles.infoItem} ${styles.mediaCard}`}>
                <span className={styles.infoLabel}>Symbol Image</span>
                {symbolImageUrl ? (
                  <>
                    {unloadable.has(symbolImageUrl) ? (
                      <span className={styles.infoValue}>
                        Preview blocked by the source host — the link below still opens it.
                      </span>
                    ) : (
                      <img
                        className={styles.mediaPreview}
                        src={symbolImageUrl}
                        alt={`${marker.displayName} symbol`}
                        loading="lazy"
                        onError={() => markUnloadable(symbolImageUrl)}
                      />
                    )}
                    <a className={styles.mediaLink} href={symbolImageUrl} target="_blank" rel="noopener noreferrer">
                      Open symbol media
                    </a>
                  </>
                ) : (
                  <span className={styles.infoValue}>No symbol image</span>
                )}
              </div>
            </div>
          </section>

          <section className={`${styles.panel} ${styles.rlshSection}`}>
            <h3 className={styles.panelTitle}>Profile Text</h3>
            <p className={styles.descriptionText}>{marker.fullText || marker.summary || 'No profile text available.'}</p>
          </section>

          <section className={`${styles.panel} ${styles.rlshSection}`}>
            <h3 className={styles.panelTitle}>Direct Contact</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Nostr npub</span>
                <span className={styles.infoValue}>{nostrNpub || 'Not provided'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Email</span>
                <span className={styles.infoValue}>{contactEmail || 'Not provided'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Socials</span>
                <span className={styles.infoValue}>
                  {socialLinks.length > 0
                    ? socialLinks.map((link) => (
                      <React.Fragment key={link}>
                        <a href={link} target="_blank" rel="noopener noreferrer">{link}</a>
                        <br />
                      </React.Fragment>
                    ))
                    : 'Not provided'}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Nostr DM</span>
                <span className={styles.infoValue}>
                  Direct Nostr messages are not built yet.
                </span>
              </div>
              {nostrNpub && (
                <div className={styles.infoItem}>
                  <span className={styles.infoLabel}>Nostr Use</span>
                  <span className={styles.infoValue}>Paste npub into your Nostr client to chat directly.</span>
                </div>
              )}
            </div>
          </section>

          <section className={`${styles.panel} ${styles.rlshSection}`}>
            <h3 className={styles.panelTitle}>Provenance</h3>
            <div className={styles.infoGrid}>
              {/* Listed is not vouched for (D-RS, RS45, RS49). */}
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Vetting</span>
                <span className={styles.infoValue}>A profile its hero submitted. Starcom has not vetted or endorsed anyone here.</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Attribution</span>
                <span className={styles.infoValue}>{attributionLabel}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Provider</span>
                <span className={styles.infoValue}>{marker.source.provider}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Source ID</span>
                <span className={styles.infoValue}>{marker.source.sourceId}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Wiki Deep Link</span>
                <span className={styles.infoValue}>
                  {canonicalUrlValidation.isValid && canonicalUrlValidation.normalizedUrl
                    ? <a href={canonicalUrlValidation.normalizedUrl} target="_blank" rel="noopener noreferrer">Open profile page</a>
                    : 'Deep link unavailable'}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Source Updated</span>
                <span className={styles.infoValue} title={updatedTitle}>{updatedLabel}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Confidence Context</span>
                <span className={styles.infoValue}>{confidenceLabelMap[marker.geoConfidence]}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Schema</span>
                <span className={styles.infoValue}>{marker.schemaVersion}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Role</span>
                <span className={styles.infoValue}>{roleLabelFor(marker)}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Registration</span>
                <span className={styles.infoValue}>{registrationLabelFor(marker)}</span>
              </div>
            </div>
          </section>
        </div>

        <div className={styles.footer}>
          <div className={styles.navigation}>
            <button
              className={`${styles.navButton} ${!hasPrevious ? styles.disabled : ''}`}
              onClick={onPrevious}
              disabled={!hasPrevious}
            >
              Previous
            </button>
            {navigationContext && (
              <span className={styles.classification} data-testid="rlsh-nav-position">
                {navigationContext.groupScoped && navigationContext.groupPosition > 0
                  ? `${navigationContext.groupPosition}/${navigationContext.groupSize} in group · ${navigationContext.currentPosition}/${navigationContext.totalCount} total`
                  : `${navigationContext.currentPosition}/${navigationContext.totalCount}`}
              </span>
            )}
            <button
              className={`${styles.navButton} ${!hasNext ? styles.disabled : ''}`}
              onClick={onNext}
              disabled={!hasNext}
            >
              Next
            </button>
          </div>

          <div className={styles.actions}>
            <button
              className={`${styles.actionButton} ${styles.disabled}`}
              onClick={handleBlockedDirectMessage}
              aria-disabled="true"
              title="Direct in-app Nostr DM is under construction"
            >
              Direct Message (Soon)
            </button>
            <button
              className={`${styles.actionButton} ${!nostrNpub ? styles.disabled : ''}`}
              onClick={handleCopyNpub}
              disabled={!nostrNpub}
              title={nostrNpub ? 'Copy Nostr npub' : 'Nostr npub unavailable'}
            >
              Copy npub
            </button>
            <button
              className={`${styles.actionButton} ${!canonicalUrlValidation.isValid ? styles.disabled : ''}`}
              onClick={handleCopySource}
              disabled={!canonicalUrlValidation.isValid}
              title={canonicalUrlValidation.isValid ? 'Copy canonical URL' : `Canonical URL unavailable (${canonicalUrlValidation.reason || 'unknown'})`}
            >
              Copy Source URL
            </button>
            <button
              className={`${styles.actionButton} ${!canonicalUrlValidation.isValid ? styles.disabled : ''}`}
              onClick={handleOpenSource}
              disabled={!canonicalUrlValidation.isValid}
              title={canonicalUrlValidation.isValid ? 'Open canonical source' : `Canonical URL unavailable (${canonicalUrlValidation.reason || 'unknown'})`}
            >
              Open Source
            </button>
            {/* A hero's own card, made here and published through the review (D-RF): no form elsewhere. */}
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => openRlshPanel('mine')}
              data-testid="rlsh-popup-card"
            >
              {m.rlsh.register}
            </button>
          </div>

          {!canonicalUrlValidation.isValid && deepLinkDisabledReason && (
            <div className={styles.infoItem} role="status" aria-live="polite">
              <span className={styles.infoLabel}>Deep-link disabled</span>
              <span className={styles.infoValue}>{deepLinkDisabledReason}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default RLSHPopup;

import React, { useEffect, useRef } from 'react';
import styles from './SupportFunnelModal.module.css';
import { DiscordIcon, TelegramIcon, GitHubIcon } from './SupportSocialIcons';
import { useScrollLock, useFocusTrap } from '../Popup/modalBehavior';

export type SupportFunnelModalProps = {
  isOpen: boolean;
  headline: string;
  subhead: string;
  disclosure: string;
  onClose: () => void;
  onOpenNostr: () => void;
  onOpenFund: () => void;
  onLearnMore: () => void;
  onRequestInvite: () => void;
  onRegisterNow: () => void;
  onOpenTrainingPrograms: () => void;
  onOpenDiscord: () => void;
  onOpenTelegram: () => void;
  onOpenGitHub: () => void;
  fallbackLink: string | null;
  learnMoreOpen: boolean;
  learnMoreBody: React.ReactNode;
  copyToast: boolean;
  offline: boolean;
  disableNostr?: boolean;
  disableFund?: boolean;
  devWarning?: string | null;
  forceReducedMotion?: boolean;
};

const SupportFunnelModal: React.FC<SupportFunnelModalProps> = ({
  isOpen,
  headline,
  subhead,
  disclosure,
  onClose,
  onOpenNostr,
  onOpenFund,
  onLearnMore,
  onRequestInvite,
  onRegisterNow,
  onOpenTrainingPrograms,
  onOpenDiscord,
  onOpenTelegram,
  onOpenGitHub,
  fallbackLink,
  learnMoreOpen,
  learnMoreBody,
  copyToast,
  offline,
  disableNostr = false,
  disableFund = false,
  devWarning = null,
  forceReducedMotion = undefined,
}) => {
  const learnBodyId = 'support-learn-body';
  const modalRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const reducedMotion = forceReducedMotion ?? prefersReducedMotion;

  // The focus trap and scroll lock come from Popup/modalBehavior, shared with
  // Modal and PopupManager. This component had its own copy of the trap —
  // correct, and the fourth implementation of the same rule in this codebase.
  // Four copies drift; one does not. The scroll lock is new: the page behind
  // this dialog used to keep scrolling under it.
  useScrollLock(isOpen);
  useFocusTrap(modalRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={headline} data-reduced-motion={reducedMotion ? 'true' : 'false'}>
      <div className={styles.modal} ref={modalRef}>
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close support modal">
          ✕
        </button>
        <div className={styles.scanlines} aria-hidden="true" />
        <div className={styles.modalContent}>
          <div className={styles.header}>
            <div>
              <h2 className={styles.title}>{headline}</h2>
              <p className={styles.subhead}>{subhead}</p>
              <div className={styles.badgeRow}>
                <span className={styles.badge}>Earth Alliance</span>
                <span className={styles.badge}>Decentralized Network</span>
                <span className={styles.badge}>Mission Ready</span>
              </div>
            </div>
          </div>

          {offline && <div className={styles.offlineNotice}>Offline: links may need connectivity. You can still copy the invite.</div>}

          <div className={styles.ctaRow}>
            {/* data-testid because the copy moves: these were "Join The Nostr
                Ops" and "Fund The Mission" when their tests were written, and
                the rename left two suites asserting buttons that no longer
                existed. The behaviour under test — disabled when no URL is
                configured — did not change. */}
            <button type="button" data-testid="support-funnel-nostr" className={styles.primaryButton} onClick={onOpenNostr} disabled={disableNostr}>
              Join Coms Uplink
            </button>
            <button type="button" data-testid="support-funnel-fund" className={styles.secondaryButton} onClick={onOpenFund} disabled={disableFund}>
              Fund The Alliance
            </button>
          </div>
          <ul className={styles.ctaBullets}>
            <li>Starcom runs secure communications, intel tools, and a global operative network.</li>
            <li>Access to the ops channel is invite-only to keep conversations focused and protected.</li>
            <li>Your support keeps our servers running and the network strong against interference.</li>
          </ul>
          <div className={styles.panelDivider} aria-hidden="true" />

          <div className={styles.sectionLabel}>More Ways to Act</div>
          <div className={styles.secondaryActions}>
            <button type="button" className={styles.tertiaryButton} onClick={onRequestInvite}>
              <span className={styles.buttonIcon} aria-hidden="true">➤</span>
              <span><strong>Request Access</strong> to Ops</span>
            </button>
            <button type="button" className={styles.tertiaryButton} onClick={onRegisterNow}>
              <span className={styles.buttonIcon} aria-hidden="true">✎</span>
              <span><strong>Register Now</strong></span>
            </button>
            <button type="button" className={styles.tertiaryButton} onClick={onOpenTrainingPrograms}>
              <span className={styles.buttonIcon} aria-hidden="true">🎯</span>
              <span><strong>Training Programs</strong></span>
            </button>
          </div>

          {copyToast && (
            <div className={styles.copyToast} role="status" aria-live="polite">
              Invite copied
            </div>
          )}

          {devWarning && <div className={styles.copyToast}>{devWarning}</div>}

          {fallbackLink && (
            <a className={styles.fallbackLink} href={fallbackLink} target="_blank" rel="noreferrer">
              Pop-up blocked—open link
            </a>
          )}

          <div className={styles.sectionLabel}>Join the Channels</div>
          <div className={styles.socialActions}>
            <button type="button" className={`${styles.tertiaryButton} ${styles.socialButton}`} onClick={onOpenDiscord} aria-label="Open Discord">
              <span className={styles.buttonIcon} aria-hidden="true">
                <DiscordIcon />
              </span>
            </button>
            <button type="button" className={`${styles.tertiaryButton} ${styles.socialButton}`} onClick={onOpenTelegram} aria-label="Open Telegram">
              <span className={styles.buttonIcon} aria-hidden="true">
                <TelegramIcon />
              </span>
            </button>
            <button type="button" className={`${styles.tertiaryButton} ${styles.socialButton}`} onClick={onOpenGitHub} aria-label="Open GitHub">
              <span className={styles.buttonIcon} aria-hidden="true">
                <GitHubIcon />
              </span>
            </button>
          </div>

          <div className={styles.learnMore} data-open={learnMoreOpen ? 'true' : 'false'}>
            <button
              type="button"
              className={styles.learnHeading}
              onClick={onLearnMore}
              aria-expanded={learnMoreOpen}
              aria-controls={learnBodyId}
            >
              <span className={styles.learnHeadingIcon} aria-hidden="true">{learnMoreOpen ? '−' : '+'}</span>
              <span className={styles.learnHeadingText}>Why this matters</span>
            </button>
            {learnMoreOpen && (
              <div className={styles.learnGlow}>
                <div className={styles.learnBody} id={learnBodyId}>
                  {learnMoreBody}
                  <div className={styles.learnDivider} aria-hidden="true" />
                  <div className={styles.disclosure}>{disclosure}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupportFunnelModal;

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getSupportFunnelConfig } from '../../config/supportFunnelConfig';
import { useSupportFunnelState } from '../../hooks/useSupportFunnelState';
import { trackSupportEvent } from '../../services/supportFunnelTracking';
import { getExperimentContext } from '../../services/supportFunnelExperiments';
import { SUPPORT_FUNNEL_OPEN_EVENT } from './supportFunnelEvents';
import { hasEngagedWithGlobe, onGlobeEngaged } from '../Globe/globeEngagement';
import { isPipelineGuideOpen, onPipelineGuideChange } from '../HUD/NewUserHint/pipelineGuideOpen';
import SupportFunnelModal from './SupportFunnelModal';
import styles from './SupportFunnelModal.module.css';

const HEADLINE = 'Help build Starcom.\nOpen tools for public intelligence.';
const SUBHEAD = 'Starcom is free and open source, built independently. Join the chat, help with the work, or fund the servers and relays.';
const DISCLOSURE = 'Contributions to Starcom are personal support for an independent open-source project. They are not tax-deductible and are not processed as charitable donations. No goods, services, or benefits are provided in exchange. Subject to U.S. law; treated as voluntary personal gifts.';
const DISCORD_URL = 'https://discord.gg/Mea5v8pQmt';
const TELEGRAM_URL = 'https://t.me/starcomintelgroup';
const GITHUB_URL = 'https://github.com/Starcom-Platform/starcom';
const SURVEY_URL = 'https://app.formbricks.com/s/cmlhj2oar01rdti011yl3hu2u';
/** Long enough to read "Invite copied" once; short enough not to linger. */
const COPY_TOAST_MS = 2500;
const REGISTER_NOW_URL = 'https://app.formbricks.com/s/cmm54smb8cw71t801migiqoz0';
const TRAINING_PROGRAMS_URL = 'https://archangel.agency/internships/';
const LEARN_BODY = (
  <>
    <div className={styles.learnTldr}>
      Your support keeps Starcom free to use, and its servers and relays running.<br />
      What people publish on it is signed and open, so anyone can check the work.
    </div>
    <div className={styles.learnMedium}>
      <p>Starcom is not a company or a charity. It is an independent open-source project.</p>
      <p>Join the chat to help: find sources, check reports, and publish what you find.</p>
      <p>Fund the project to keep the servers and relays running, so anyone can read and publish open records.</p>
      <ul className={styles.learnBullets}>
        <li>Public data on a live globe, free to use.</li>
        <li>Records signed by the people who publish them.</li>
        <li>Open code, open data and open standards.</li>
      </ul>
    </div>
    <div className={styles.learnDepth}>
      <p>Starcom is the reference app of the Earth Intelligence Network: open software, data and standards that anyone can run or build on.</p>
      <p>It asks you to check its work, not to trust it. Published records are signed and open, and the code is public.</p>
      <p>Contributions pay for the servers and relays, and for the time to keep building.</p>
    </div>
  </>
);

const SupportFunnelRoot: React.FC = () => {
  const config = useMemo(() => getSupportFunnelConfig(), []);
  const { eligible, markImpression, markSnooze, markDismiss, markAction } = useSupportFunnelState(config);
  const { sessionId, variant } = useMemo(() => getExperimentContext(config), [config]);

  const [open, setOpen] = useState(false);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [copyToast, setCopyToast] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);
  const [fallbackLink, setFallbackLink] = useState<string | null>(null);
  const [lastImpressionAt, setLastImpressionAt] = useState<number>(0);
  const [variantExposed, setVariantExposed] = useState(false);

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  // Static read: the cast form makes Vite emit the whole env object.
  const mode = typeof import.meta !== 'undefined' ? import.meta.env.MODE : 'production';
  const isDevLike = mode !== 'production';
  const env = mode || 'production';
  const disableFund = !config.fundraiserUrl;
  const disableNostr = !config.nostrUrl;
  const devWarning = isDevLike && (disableFund || disableNostr)
    ? 'Support funnel URLs missing: check VITE_SUPPORT_FUNNEL_FUND_URL / VITE_SUPPORT_FUNNEL_NOSTR_URL.'
    : null;

  useEffect(() => {
    if (!open) return;
    const nowTs = Date.now();
    if (nowTs - lastImpressionAt < 3000) return;
    setLastImpressionAt(nowTs);
    markImpression();
    trackSupportEvent({ event: 'funnel_impression', variant, sessionId, env });
    if (!variantExposed && variant) {
      trackSupportEvent({ event: 'variant_exposure', variant, sessionId, env });
      setVariantExposed(true);
    }
  }, [env, lastImpressionAt, markImpression, open, sessionId, variant, variantExposed]);

  /**
   * The globe gets the screen first, and the ask follows the person's own use of it.
   *
   * This opened the instant it became eligible, which on a fresh profile is
   * immediately: a full-screen ask over a globe the newcomer had never seen,
   * intercepting every control including the bottom navigation. It then waited 15
   * seconds and for a painted globe, which is about when a first visit's reports
   * arrive and the globe turns to them, and it opened alongside the pipeline guide.
   *
   * Decision D-F, step 3: a first visit sees the globe, with one thing over it at a
   * time. So the ask opens only after the person has used the globe (moved it, or
   * opened a report and closed it again; see globeEngagement), never on a timer, and
   * never while the pipeline guide is open. Someone who never uses the globe is not
   * asked by it; SUPPORT OPS in the bottom bar still opens it. Nothing here changes
   * who is eligible, only when it appears.
   *
   * The globe and the guide are mounted elsewhere in App's tree, so each says what
   * it knows through a small module rather than a context.
   */
  // Read when mounted, then followed: the person may have used the globe, or opened
  // the guide, before this mounted or between its first render and its listening.
  const [globeUsed, setGlobeUsed] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    setGlobeUsed(hasEngagedWithGlobe());
    return onGlobeEngaged(() => setGlobeUsed(true));
  }, []);

  useEffect(() => {
    setGuideOpen(isPipelineGuideOpen());
    return onPipelineGuideChange(() => setGuideOpen(isPipelineGuideOpen()));
  }, []);

  useEffect(() => {
    if (!eligible || sessionClosed || open || !globeUsed || guideOpen) return;
    setOpen(true);
    setFallbackLink(null);
    trackSupportEvent({ event: 'entry_open', target: 'entry', variant, sessionId, env });
  }, [eligible, env, globeUsed, guideOpen, open, sessionClosed, sessionId, variant]);

  /**
   * Closing persists.
   *
   * This previously called markAction('close'), which records lastAction and
   * nothing else — `eligible` is computed from `dismissed` and `snoozeUntil`,
   * neither of which it touches. Suppression relied entirely on the
   * `sessionClosed` component state, so ANY remount of this component reopened
   * the modal over whatever the user had navigated to, including the bottom
   * navigation bar.
   *
   * markSnooze() is what the existing snoozeDays config (default 30, clamped
   * 7-45) was built for. It was destructured here and never called; the hook
   * that implements it is fully tested, and nothing tested that anyone invoked
   * it.
   */
  const handleClose = () => {
    setOpen(false);
    setSessionClosed(true);
    markSnooze();
    setFallbackLink(null);
    trackSupportEvent({ event: 'action_dismiss', target: 'dismiss', variant, sessionId, env });
  };


  const openWindow = (url: string, target: 'nostr' | 'fund' | 'discord' | 'telegram' | 'github' | 'survey' | 'store' | 'training_programs') => {
    const win = window.open(url, '_blank', 'noopener');
    const blocked = !win || win.closed;
    if (blocked) {
      setFallbackLink(url);
      trackSupportEvent({ event: 'fallback_open_link', target, variant, sessionId, env, reason: 'popup_blocked' });
    } else {
      setFallbackLink(null);
    }
  };

  const handleOpenNostr = () => {
    markAction('nostr');
    trackSupportEvent({ event: 'cta_nostr_click', target: 'nostr', variant, sessionId, env });
    openWindow(config.nostrUrl, 'nostr');
    setOpen(false);
    setSessionClosed(true);
    markSnooze();
  };

  const handleOpenFund = () => {
    markAction('fund');
    trackSupportEvent({ event: 'cta_fund_click', target: 'fund', variant, sessionId, env });
    openWindow(config.fundraiserUrl, 'fund');
    setOpen(false);
    setSessionClosed(true);
    markSnooze();
  };

  const handleOpenDiscord = () => {
    trackSupportEvent({ event: 'cta_external_click', target: 'discord', variant, sessionId, env });
    markAction('discord');
    openWindow(DISCORD_URL, 'discord');
  };

  const handleOpenTelegram = () => {
    trackSupportEvent({ event: 'cta_external_click', target: 'telegram', variant, sessionId, env });
    markAction('telegram');
    openWindow(TELEGRAM_URL, 'telegram');
  };

  const handleOpenGitHub = () => {
    trackSupportEvent({ event: 'cta_external_click', target: 'github', variant, sessionId, env });
    markAction('github');
    openWindow(GITHUB_URL, 'github');
  };

  const handleLearnMore = () => {
    setLearnOpen(prev => !prev);
    trackSupportEvent({ event: 'cta_learn_more', target: 'learn', variant, sessionId, env });
    markAction('learn');
  };

  /*
   * Copy the invite link, for the case the offline notice describes.
   *
   * The modal has said "Offline: links may need connectivity. You can still copy
   * the invite." since it was written, and there was no way to — no clipboard
   * call, no copy button, and an "Invite copied" toast whose state nothing ever
   * set. This is the missing half.
   *
   * The toast is shown only after the write resolves. A clipboard can refuse —
   * denied permission, an insecure context — and saying "copied" when it did
   * not would be worse than saying nothing. On refusal the link is surfaced
   * instead, so the person can still take it by hand.
   */
  const copyToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (copyToastTimer.current) clearTimeout(copyToastTimer.current);
  }, []);

  const copyInvite = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(SURVEY_URL);
      setCopyToast(true);
      if (copyToastTimer.current) clearTimeout(copyToastTimer.current);
      copyToastTimer.current = setTimeout(() => setCopyToast(false), COPY_TOAST_MS);
    } catch {
      setFallbackLink(SURVEY_URL);
    }
  };

  const handleRequestInvite = () => {
    trackSupportEvent({ event: 'cta_request_invite', target: 'request_invite', variant, sessionId, env });
    markAction('request_invite');
    if (offline) {
      // Opening a window is the one thing guaranteed to fail offline. The modal
      // stays open, because the confirmation is rendered inside it, and nothing
      // is snoozed — the person has a link to use later, not a finished action.
      void copyInvite();
      return;
    }
    openWindow(SURVEY_URL, 'survey');
    setOpen(false);
    setSessionClosed(true);
    markSnooze();
  };

  const handleRegisterNow = () => {
    trackSupportEvent({ event: 'cta_external_click', target: 'register_now', variant, sessionId, env });
    markAction('register_now');
    openWindow(REGISTER_NOW_URL, 'survey');
    setOpen(false);
    setSessionClosed(true);
    markSnooze();
  };

  const handleOpenTrainingPrograms = () => {
    trackSupportEvent({ event: 'cta_external_click', target: 'training_programs', variant, sessionId, env });
    markAction('training_programs');
    openWindow(TRAINING_PROGRAMS_URL, 'training_programs');
    setOpen(false);
    setSessionClosed(true);
    markSnooze();
  };

  /**
   * The Support Ops entry asks for the modal; it no longer lives here.
   *
   * It was a button fixed to the bottom-right corner of every screen, over
   * whatever each screen put there: a Cases row's actions and its next-page
   * button, the globe's LIVE button, a bot's Run Mission. It now sits in the
   * bottom navigation bar, which never overlaps a screen's content.
   */
  useEffect(() => {
    if (!config.enabled) return;
    const onRequest = () => {
      setSessionClosed(false);
      setOpen(true);
      setFallbackLink(null);
      trackSupportEvent({ event: 'entry_open', target: 'entry', variant, sessionId, env });
    };
    window.addEventListener(SUPPORT_FUNNEL_OPEN_EVENT, onRequest);
    return () => window.removeEventListener(SUPPORT_FUNNEL_OPEN_EVENT, onRequest);
  }, [config.enabled, env, sessionId, variant]);

  // If feature disabled, render nothing
  if (!config.enabled) {
    return null;
  }

  return (
    <>
      <SupportFunnelModal
        isOpen={open}
        headline={HEADLINE}
        subhead={SUBHEAD}
        disclosure={DISCLOSURE}
        onClose={handleClose}
        onOpenNostr={handleOpenNostr}
        onOpenFund={handleOpenFund}
        onLearnMore={handleLearnMore}
        onRequestInvite={handleRequestInvite}
        onRegisterNow={handleRegisterNow}
        onOpenTrainingPrograms={handleOpenTrainingPrograms}
        onOpenDiscord={handleOpenDiscord}
        onOpenTelegram={handleOpenTelegram}
        onOpenGitHub={handleOpenGitHub}
        fallbackLink={fallbackLink}
        learnMoreOpen={learnOpen}
        learnMoreBody={LEARN_BODY}
        copyToast={copyToast}
        offline={offline}
        disableFund={disableFund}
        disableNostr={disableNostr}
        devWarning={devWarning}
      />
    </>
  );
};

export default SupportFunnelRoot;

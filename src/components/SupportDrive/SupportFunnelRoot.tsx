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

const HEADLINE = 'Intelligence Reborn.\nJoin the Starcom Initiative.';
const SUBHEAD = 'Become the Spark that Ignites the Earth Intelligence Network. Join the secure ops channel. Help build the Earth Intelligence Network. Strengthen our defenses against control.';
const DISCLOSURE = 'Contributions to Starcom are personal support for an independent open-source project. They are not tax-deductible and are not processed as charitable donations. No goods, services, or benefits are provided in exchange. Subject to U.S. law; treated as voluntary personal gifts.';
const DISCORD_URL = 'https://discord.gg/Mea5v8pQmt';
const TELEGRAM_URL = 'https://t.me/starcomintelgroup';
const GITHUB_URL = 'https://github.com/Arch-Angel-Agency-LLC/starcom-app';
const SURVEY_URL = 'https://app.formbricks.com/s/cmlhj2oar01rdti011yl3hu2u';
/** Long enough to read "Invite copied" once; short enough not to linger. */
const COPY_TOAST_MS = 2500;
const REGISTER_NOW_URL = 'https://app.formbricks.com/s/cmm54smb8cw71t801migiqoz0';
const TRAINING_PROGRAMS_URL = 'https://archangel.agency/internships/';
const LEARN_BODY = (
  <>
    <div className={styles.learnTldr}>
      Your support keeps our communications alive, our operatives resourced, and the mission completely uncaptured.<br />
      Every contribution directly strengthens the Earth Alliance we are building right now.
    </div>
    <div className={styles.learnMedium}>
      <p>Starcom is not a company or a charity — it is an independent open-source project run by people who refuse to let centralized control win.</p>
      <p>When you join the ops channel you add real eyes, real minds, and real signal to a network that cannot be shut down.</p>
      <p>When you support the network you keep the relays online, the servers running, and the intelligence pipelines protected from interference — so the operatives on the ground can keep working.</p>
      <p>This is how we turn “someone should do something” into “we are the ones doing it.”</p>
      <ul className={styles.learnBullets}>
        <li>Start the chain reaction that ends the long dark.</li>
        <li>Build the base that lets the whole alliance stand tall.</li>
        <li>Shine so others can find their way to the alliance.</li>
        <li>Lay the first stones of a network no one can shut down.</li>
      </ul>
    </div>
    <div className={styles.learnDepth}>
      <p>We are living in a rare window where the old systems of control are being exposed faster than they can adapt. Files are dropping, alliances are forming across old lines, and millions of people are waking up to the same realization: if we do not build our own uncaptured networks now, we will not get another chance.</p>
      <p>Starcom is being built right now to become one of the few truly operational, decentralized projects—running real OSINT pipelines and operative communications without asking permission.</p>
      <p>The Earth Intelligence Network exists to take back intelligence from captured institutions and place it in the hands of the people. For too long we have been at the mercy of corruption; it is time to take responsibility. This is a critical step to establishing the Earth Alliance and freeing humanity from the looming global oppression.</p>
      <p>Every dollar, every relay kept alive, every new operative who joins is a brick in a wall that the old powers cannot tear down. This is not hope. This is infrastructure for the next phase of human freedom.</p>
      <p>The Earth Alliance is not coming. It is being built — right now, by us.</p>
      <p>That is why this matters.</p>
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

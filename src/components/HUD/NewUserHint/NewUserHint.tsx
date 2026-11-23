/**
 * The pipeline guide: what this app is for, and where you actually are in it.
 *
 * This replaced a card that said "Join a cyber investigation team to access
 * group chat and start collaborating," offering "Find Teams" and a Ctrl+K
 * tip. That described neither what Starcom produces nor how, and — being
 * static prose — could not notice when it stopped being true.
 *
 * Two deliberate choices:
 *
 *  1. STEPS ARE DERIVED, NOT NARRATED. Completion comes from real counts in
 *     the canonical stores (see usePipelineProgress), so the guide cannot
 *     claim you have done something you haven't, or keep asking for something
 *     you already did. A scripted tour drifts the moment a screen moves;
 *     this one can only be wrong about what is useful, never about what is.
 *  2. IT OUTLIVES FIRST RUN. The old card showed once, on the first visit
 *     ever, then never again — so the pipeline was undiscoverable for anyone
 *     who dismissed it, and for everyone who arrived after someone else had.
 *     This stays available while the pipeline is incomplete, and steps aside
 *     for good once a Mission Package has actually been built (or the
 *     operator dismisses it).
 */
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApplicationRouter } from '../../../hooks/useApplicationRouter';
import { APPLICATIONS, type ApplicationId } from '../../../components/Router/EnhancedApplicationRouter';
import { PIPELINE } from '../../../services/intel/pipeline/pipeline';
import styles from './NewUserHint.module.css';
import { Docked } from '../../Dock/Docked';
import { usePipelineProgress, type PipelineProgress } from './usePipelineProgress';
import { setPipelineGuideOpen } from './pipelineGuideOpen';
import { startCoach } from '../../Coach/coachOpen';

const DISMISSED_KEY = 'starcom-pipeline-guide-dismissed';

interface PipelineStep {
  id: string;
  label: string;
  /** What the operator does here, in their terms — not the screen's name. */
  detail: string;
  actionLabel: string;
  /**
   * Destination. Most steps target a registered app via navigateToApp.
   *
   * Cases used to be the exception: it lived ONLY at the standalone
   * /cases-dashboard route, inside no registered app, unreachable by
   * navigateToApp. A step pointing at the nearest app would have opened the
   * wrong screen while looking like it worked, so this type carried the
   * distinction rather than hiding it.
   *
   * Cases is a registered application now and this step targets it like any
   * other. The route variant stays, because the reason it exists has not gone
   * away — the next surface that lives outside the app system will need it,
   * and a type that can only express one kind of destination is how the
   * wrong-screen bug comes back.
   */
  target: { kind: 'app'; app: ApplicationId; tab?: string } | { kind: 'route'; path: string };
  done: boolean;
}

/**
 * What the guide adds to a pipeline stage (plan item 1.10): how it knows the
 * stage is done, from real records, and what to do there, in the operator's
 * words. The stage's name, its order and where it is come from pipeline.ts,
 * which the build checks against the code; this used to write all four steps
 * out by hand, and its "collect" step pointed at NetRunner while the pipeline
 * said the Intel Dashboard. A stage the pipeline drops or renames drops out
 * of the guide rather than being described from memory.
 */
const GUIDE: Partial<Record<string, (p: PipelineProgress) => { done: boolean; detail: string }>> = {
  collect: ({ reportCount }) => ({
    done: reportCount > 0,
    detail: reportCount > 0
      ? `${reportCount} intel report${reportCount === 1 ? '' : 's'} in your workspace`
      : 'Write a report in the Intel Dashboard, or run a bot in NetRunner: either files a real Intel Report',
  }),
  investigate: ({ caseCount, openCaseCount }) => ({
    done: caseCount > 0,
    detail: caseCount > 0
      ? `${caseCount} case${caseCount === 1 ? '' : 's'}, ${openCaseCount} open`
      : 'Group related reports into an investigation — a mission is built from a case',
  }),
  assemble: ({ missionCount }) => ({
    done: missionCount > 0,
    detail: missionCount > 0
      ? `${missionCount} mission${missionCount === 1 ? '' : 's'} started`
      : 'Attach reports and cases to a briefing with objectives',
  }),
  publish: ({ packagedMissionCount }) => ({
    done: packagedMissionCount > 0,
    detail: packagedMissionCount > 0
      ? `${packagedMissionCount} signed Mission Package built`
      : 'Mark a mission Ready to publish, then publish it',
  }),
};

function guideSteps(progress: PipelineProgress): PipelineStep[] {
  return PIPELINE.flatMap((stage) => {
    const guide = GUIDE[stage.id];
    if (!guide) return [];
    const { done, detail } = guide(progress);
    const surface = stage.surface;
    const app = surface.kind === 'app' ? APPLICATIONS.find((a) => a.id === surface.app) : undefined;
    return [{
      id: stage.id,
      label: stage.label,
      detail,
      // Named for where it lands: "Open Missions", not the app that holds the tab.
      actionLabel: surface.kind === 'app' && surface.tab
        ? `Open ${surface.tab[0].toUpperCase()}${surface.tab.slice(1)}`
        : app ? `Open ${app.name}` : 'Open',
      target: surface.kind === 'app'
        ? { kind: 'app' as const, app: surface.app as ApplicationId, ...(surface.tab ? { tab: surface.tab } : {}) }
        : { kind: 'route' as const, path: surface.path },
      done,
    }];
  });
}

const NewUserHint: React.FC = () => {
  const [dismissed, setDismissed] = useState(false);
  // Opens collapsed to its title line, so a first visit sees the globe (decision D-F,
  // step 3). Expanded on arrival, at 1280×720 it ran past the globe's area onto the
  // bottom bar while the support ask opened over the centre.
  const [isMinimized, setIsMinimized] = useState(true);
  const { navigateToApp } = useApplicationRouter();
  const navigate = useNavigate();
  const location = useLocation();
  const progress = usePipelineProgress();
  const { loading } = progress;

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISSED_KEY) === 'true');
  }, []);

  const steps = guideSteps(progress);

  const allDone = steps.every((s) => s.done);

  // Only over the globe (the app's landing surface), never while loading a
  // count that would make a step flash "not done", and not once the operator
  // has either finished the pipeline or said they're done hearing about it.
  const shown = location.pathname === '/' && !loading && !dismissed && !allDone;

  // Whether it is open over the globe, for the support ask, which waits while it is
  // (decision D-F, step 3).
  const openOverGlobe = shown && !isMinimized;
  useEffect(() => {
    setPipelineGuideOpen(openOverGlobe);
  }, [openOverGlobe]);
  useEffect(() => () => setPipelineGuideOpen(false), []);

  if (!shown) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem(DISMISSED_KEY, 'true');
  };

  /**
   * Just navigate. This deliberately does NOT minimise first: switching to a
   * standalone app unmounts this docked component entirely (verified live —
   * the card and its minimised chip are both absent from the DOM once
   * OpsCenter is showing), so setting minimised state here would be a
   * no-op dressed up as behaviour. Coming back to the globe re-mounts it
   * collapsed, and the step you just completed counts as done when it is opened.
   */
  const go = (target: PipelineStep['target']) => {
    if (target.kind === 'route') {
      navigate(target.path);
      return;
    }
    if (target.tab) navigateToApp(target.app, 'standalone', { initialTab: target.tab });
    else navigateToApp(target.app, 'standalone');
  };

  if (isMinimized) {
    const remaining = steps.filter((s) => !s.done).length;
    return (
      <Docked slot="newUserHint">
        <div className={styles.minimizedHint}>
          <button
            className={styles.minimizedButton}
            onClick={() => setIsMinimized(false)}
            title="Show the intel pipeline guide"
          >
            🎯 Pipeline · {remaining} left
          </button>
        </div>
      </Docked>
    );
  }

  return (
    <Docked slot="newUserHint">
      <div className={styles.newUserHint}>
        <div className={styles.hintCard}>
          <div className={styles.hintHeader}>
            <div className={styles.hintTitle}>
              <span className={styles.icon}>🎯</span>
              Intel → Mission Package
            </div>
            <div className={styles.hintControls}>
              <button
                className={styles.minimizeButton}
                onClick={() => setIsMinimized(true)}
                title="Minimize"
              >
                —
              </button>
              <button
                className={styles.closeButton}
                onClick={handleDismiss}
                title="Dismiss for good"
              >
                ×
              </button>
            </div>
          </div>

          <div className={styles.hintContent}>
            <p>What Starcom produces, and where you are in it:</p>

            <ol className={styles.pipelineSteps}>
              {steps.map((step) => (
                <li
                  key={step.id}
                  className={step.done ? styles.stepDone : styles.step}
                  data-testid={`pipeline-step-${step.id}`}
                >
                  <div className={styles.stepLabel}>
                    <span className={styles.stepMark}>{step.done ? '✓' : '○'}</span>
                    {step.label}
                  </div>
                  <div className={styles.stepDetail}>{step.detail}</div>
                  {!step.done && (
                    <button
                      className={styles.stepAction}
                      onClick={() => go(step.target)}
                      data-testid={`pipeline-action-${step.id}`}
                    >
                      {step.actionLabel} →
                    </button>
                  )}
                </li>
              ))}
            </ol>

            {/* Step by step on the real screens, with the person's own work (plan item 6.1). */}
            <button type="button" className={styles.stepAction} onClick={() => startCoach()} data-testid="start-coach">
              Coach me through it →
            </button>

            <div className={styles.quickTips}>
              <div className={styles.tip}>
                <strong>Ctrl+K</strong> — everything else, including IntelAnalyzer and IntelWeb
              </div>
            </div>
          </div>
        </div>
      </div>
    </Docked>
  );
};

export default NewUserHint;

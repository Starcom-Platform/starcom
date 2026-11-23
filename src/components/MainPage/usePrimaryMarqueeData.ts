import { useEffect, useMemo, useState } from 'react';
import type { SectionId } from '../../styles/tokens';
import { useApplicationRouter } from '../../hooks/useApplicationRouter';
import { useFeatureFlag } from '../../utils/featureFlags';
import { intelReportService } from '../../services/intel/IntelReportService';
import type { IntelReportStatus, IntelReportUI } from '../../types/intel/IntelReportUI';
import { formatUtcDateTime } from '../../utils/utcTime';
import { signalsForScreen } from './marqueeSignalsForScreen';
import { useRelayCount } from '../../hooks/useRelayCount';
import {
  nostrStarcomIntelIngest,
  type NostrRelayState,
  type NostrStarcomIntelIngestMetrics
} from '../../services/intel/NostrStarcomIntelIngest';

export interface PrimaryMarqueeSignal {
  id: string;
  label: string;
  value: string;
}

export interface PrimaryMarqueeData {
  title: string;
  /** What the screen the person is on carries (decision D-F, step 3.4). */
  signals: PrimaryMarqueeSignal[];
  /** Every readout, for the status panel the strip opens. */
  allSignals: PrimaryMarqueeSignal[];
  /** Whether the Globe is the screen, which adds its energy readings and settings to the strip (K4). */
  /** The open screen's section, whose tint its frame wears (BD10); none before an app opens. */
  section: SectionId | null;
  onGlobe: boolean;
}

interface NostrMarqueeSnapshot {
  active: boolean;
  relayConnected: number;
  relayTotal: number;
  probeOpen: number;
  probeRun: number;
  probeTotal: number;
  // NostrStarcomIntelIngest is the #starcom_intel pipeline. It no longer only
  // accepts geo-bearing events — an event naming a jurisdiction, or no place at
  // all, is kept too — so these metrics are no longer interchangeable with
  // "GEOINT" and `acceptedPlaceless` is the part the globe cannot draw.
  ingest: NostrStarcomIntelIngestMetrics;
}

interface ThroughputSample {
  timestamp: number;
  intelAccepted: number;
}

interface IntelWorkflowCounters {
  total: number;
  byStatus: Record<IntelReportStatus, number>;
}

const MARQUEE_ACTIVE_SAMPLE_MS = 15000;
const MARQUEE_IDLE_SAMPLE_MS = 60000;
/**
 * The soonest the ingest's own change signal reads it again. Read at load, the ingest
 * had not started, and the next timed read was a minute away (decision D-F, step 1).
 * Once a second at most, so a burst of events is one read.
 */
const CHANGE_SAMPLE_MIN_MS = 1000;

const defaultWorkflowCounters = (): IntelWorkflowCounters => ({
  total: 0,
  byStatus: {
    DRAFT: 0,
    SUBMITTED: 0,
    REVIEWED: 0,
    APPROVED: 0,
    ARCHIVED: 0
  }
});

const summarizeWorkflow = (reports: IntelReportUI[]): IntelWorkflowCounters => {
  const counters = defaultWorkflowCounters();
  counters.total = reports.length;

  reports.forEach((report) => {
    counters.byStatus[report.status] += 1;
  });

  return counters;
};

const getNostrSnapshot = (): NostrMarqueeSnapshot => {
  const relayStatus = nostrStarcomIntelIngest.getRelayStatus();
  const probeStatus = nostrStarcomIntelIngest.getRelayProbeStatus();

  return {
    active: nostrStarcomIntelIngest.isActive(),
    relayConnected: relayStatus.filter((relay: NostrRelayState) => relay.connected).length,
    relayTotal: relayStatus.length,
    probeOpen: probeStatus.filter((probe) => probe.status === 'open').length,
    // Probes run in development builds only; the rest read 'not-run'. One under
    // way ('pending') has not run either.
    probeRun: probeStatus.filter((probe) => probe.status !== 'pending' && probe.status !== 'not-run').length,
    probeTotal: probeStatus.length,
    ingest: nostrStarcomIntelIngest.getMetrics()
  };
};

const computeWindowRate = (
  samples: ThroughputSample[],
  windowMs: number,
  key: 'intelAccepted'
): number => {
  if (samples.length < 2) return 0;

  const latest = samples[samples.length - 1];
  const cutoff = latest.timestamp - windowMs;
  const oldestInWindow = samples.find((sample) => sample.timestamp >= cutoff) ?? samples[0];

  const deltaCount = latest[key] - oldestInWindow[key];
  const deltaTimeMs = latest.timestamp - oldestInWindow.timestamp;

  if (deltaCount <= 0 || deltaTimeMs <= 0) return 0;

  const perMinute = (deltaCount * 60000) / deltaTimeMs;
  return Math.round(perMinute * 10) / 10;
};

const toPercent = (numerator: number, denominator: number): number => {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
};

/** In UTC, marked Z, like every other time readout (decision D-E). It read local time marked L. */
const formatTimestamp = (timestamp: Date): string => formatUtcDateTime(timestamp.getTime(), { year: true });

export const usePrimaryMarqueeData = (): PrimaryMarqueeData => {
  const { currentApp, getApplication, presentationMode, history } = useApplicationRouter();
  const uiTestingDiagnosticsEnabled = useFeatureFlag('uiTestingDiagnosticsEnabled');
  const [timestamp, setTimestamp] = useState<Date>(new Date());
  const [nostrSnapshot, setNostrSnapshot] = useState<NostrMarqueeSnapshot>(() => getNostrSnapshot());
  /**
   * The reports' counts, or where the read of them stands. The STATUS panel is
   * a second copy of these readouts, started afresh each time it opens, and it
   * said "TOTAL 0" until its read finished, beside a strip saying "TOTAL 1"; a
   * failed read said 0 too (plan item 1.8).
   */
  const [workflowCounters, setWorkflowCounters] = useState<IntelWorkflowCounters | 'reading' | 'failed'>('reading');
  // The relays, counted as everywhere else and at the same moment (plan item 1.8).
  const relays = useRelayCount();
  const [throughputSamples, setThroughputSamples] = useState<ThroughputSample[]>(() => {
    const initialSnapshot = getNostrSnapshot();
    return [{
      timestamp: Date.now(),
      intelAccepted: initialSnapshot.ingest.accepted
    }];
  });

  useEffect(() => {
    const updateTimestamp = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      setTimestamp(new Date());
    };

    updateTimestamp();
    const interval = setInterval(updateTimestamp, 60000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setTimestamp(new Date());
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const refreshWorkflow = async () => {
      try {
        const reports = await intelReportService.listReports();
        if (!mounted) return;
        setWorkflowCounters(summarizeWorkflow(reports));
      } catch {
        if (!mounted) return;
        setWorkflowCounters('failed');
      }
    };

    void refreshWorkflow();
    const unsubscribe = intelReportService.onChange((reports) => {
      if (!mounted) return;
      setWorkflowCounters(summarizeWorkflow(reports));
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let lastSampleAt = 0;

    const scheduleNext = (delay: number) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(sampleMetrics, delay);
    };

    const sampleMetrics = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        scheduleNext(MARQUEE_IDLE_SAMPLE_MS);
        return;
      }

      const nextSnapshot = getNostrSnapshot();
      const now = Date.now();
      lastSampleAt = now;

      setNostrSnapshot(nextSnapshot);
      setThroughputSamples((previousSamples) => {
        const nextSamples = [
          ...previousSamples,
          {
            timestamp: now,
            intelAccepted: nextSnapshot.ingest.accepted
          }
        ].filter((sample) => now - sample.timestamp <= 5 * 60 * 1000);

        return nextSamples;
      });

      scheduleNext(nextSnapshot.active ? MARQUEE_ACTIVE_SAMPLE_MS : MARQUEE_IDLE_SAMPLE_MS);
    };

    sampleMetrics();

    const sampleSoon = () => {
      const wait = CHANGE_SAMPLE_MIN_MS - (Date.now() - lastSampleAt);
      if (wait <= 0) sampleMetrics();
      else scheduleNext(wait);
    };
    const offChange = nostrStarcomIntelIngest.onChange(sampleSoon);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        sampleMetrics();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      offChange();
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const title = useMemo(() => {
    const currentAppConfig = currentApp ? getApplication(currentApp) : null;
    return currentAppConfig?.name ?? 'Starcom Platform';
  }, [currentApp, getApplication]);

  const signals = useMemo<PrimaryMarqueeSignal[]>(() => {
    const lane = currentApp ? currentApp.toUpperCase() : 'COMMAND HUB';
    const mode = presentationMode.toUpperCase();
    // "N of M relays connected", the globe's words, in the strip's capitals.
    const relayStatus = relays.total > 0
      ? `${relays.connected} OF ${relays.total} CONNECTED`
      : 'NO RELAYS';
    // A different count: relays that accepted a test connection when probed.
    // It shared the relays' readout ("2/6 UP | PROBE 0/6 OPEN"), and has its own.
    // Only probes that ran count: one that never ran says nothing about a relay.
    const probeStatus = nostrSnapshot.probeRun > 0
      ? `${nostrSnapshot.probeOpen} REACHED OF ${nostrSnapshot.probeRun} PROBED`
      : 'NOT RUN';
    const workflowValue = workflowCounters === 'reading' ? 'READING'
      : workflowCounters === 'failed' ? 'NOT READ'
        : `TOTAL ${workflowCounters.total} | D ${workflowCounters.byStatus.DRAFT} S ${workflowCounters.byStatus.SUBMITTED} R ${workflowCounters.byStatus.REVIEWED} A ${workflowCounters.byStatus.APPROVED}`;
    const archiveValue = workflowCounters === 'reading' ? 'READING'
      : workflowCounters === 'failed' ? 'NOT READ'
        : `${workflowCounters.byStatus.ARCHIVED} ARCHIVED`;
    const ingestDrops = nostrSnapshot.ingest.droppedNoGeo + nostrSnapshot.ingest.droppedInvalid;
    const intelAcceptanceRatio = toPercent(nostrSnapshot.ingest.accepted, nostrSnapshot.ingest.seen);
    /*
     * How much of what this node HOLDS names no place — not how much it turned
     * away for lacking one, which is what this showed until 2026-09-20 and is
     * now always zero, because placeless intel is kept.
     *
     * Measured against `accepted` rather than `seen` on purpose: the question a
     * globe-primary node needs answered is what share of its own intel its
     * primary surface cannot draw. Against `seen` that share would shrink every
     * time a stranger published something unrelated.
     */
    const placelessRatio = toPercent(nostrSnapshot.ingest.acceptedPlaceless, nostrSnapshot.ingest.accepted);

    const intelRate1m = computeWindowRate(throughputSamples, 60 * 1000, 'intelAccepted');
    const intelRate5m = computeWindowRate(throughputSamples, 5 * 60 * 1000, 'intelAccepted');

    // What it rests on is measured: whether any relay answered. It also read
    // the Solana link and the wallet sign-in, both retired (plan item 4.4).
    // Before ingest starts no relay has been tried, so it says so: it read
    // NOMINAL from the first frame (plan item 8.3b).
    const diagnosticsState = !relays.active ? 'STANDBY' : relays.connected === 0 ? 'WATCH' : 'NOMINAL';

    const fullSignalSet: PrimaryMarqueeSignal[] = [
      {
        id: 'timestamp',
        label: 'MISSION TIME',
        value: formatTimestamp(timestamp)
      },
      {
        id: 'mission-lane',
        label: 'MISSION LANE',
        value: lane
      },
      {
        id: 'presentation-mode',
        label: 'ROUTE MODE',
        value: mode
      },
      {
        id: 'nostr-relays',
        label: 'NOSTR RELAYS',
        value: relays.active ? relayStatus : 'INGEST STANDBY'
      },
      {
        id: 'relay-probes',
        label: 'RELAY PROBES',
        value: probeStatus
      },
      {
        id: 'nostr-ingest-counters',
        label: 'NOSTR INGEST',
        value: `SEEN ${nostrSnapshot.ingest.seen} | ACCEPT ${nostrSnapshot.ingest.accepted} | DROP ${ingestDrops}`
      },
      {
        id: 'nostr-throughput-window',
        label: 'INGEST RATE',
        value: `${intelRate1m}/${intelRate5m} MPM`
      },
      {
        id: 'geoint-quality-ratio',
        label: 'GEOINT QUALITY',
        value: `ACCEPT ${intelAcceptanceRatio}% | PLACELESS ${placelessRatio}%`
      },
      {
        id: 'operator-diagnostics',
        label: 'OPERATOR DIAG',
        value: `${diagnosticsState} | UI ${uiTestingDiagnosticsEnabled ? 'ON' : 'OFF'}`
      },
      {
        id: 'intel-workflow-counters',
        label: 'INTEL WORKFLOW',
        value: workflowValue
      },
      {
        id: 'intel-workflow-archive',
        label: 'INTEL ARCHIVE',
        value: archiveValue
      },
      {
        id: 'navigation-depth',
        label: 'NAV HISTORY',
        value: `${history.length} APP${history.length === 1 ? '' : 'S'} THIS SESSION`
      }
    ];

    return fullSignalSet;
  }, [
    currentApp,
    presentationMode,
    relays,
    nostrSnapshot.probeOpen,
    nostrSnapshot.probeRun,
    nostrSnapshot.probeTotal,
    nostrSnapshot.ingest.seen,
    nostrSnapshot.ingest.accepted,
    nostrSnapshot.ingest.droppedNoGeo,
    nostrSnapshot.ingest.acceptedPlaceless,
    nostrSnapshot.ingest.droppedInvalid,
    uiTestingDiagnosticsEnabled,
    workflowCounters,
    throughputSamples,
    history.length,
    timestamp
  ]);

  // The strip shows what bears on this screen; the status panel holds them all.
  const screenSignals = useMemo(() => signalsForScreen(currentApp, signals), [currentApp, signals]);

  return {
    title,
    signals: screenSignals,
    allSignals: signals,
    onGlobe: currentApp === 'cybercommand',
    section: currentApp ? getApplication(currentApp)?.section ?? null : null,
  };
};

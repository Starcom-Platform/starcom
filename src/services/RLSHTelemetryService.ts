import type { RLSHOverlayMarker } from '../interfaces/RLSHOverlay';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'RLSHTelemetryService' });

export type RLSHTelemetryEventName =
  | 'rlsh_mode_switch'
  | 'rlsh_markers_loaded'
  | 'rlsh_hover'
  | 'rlsh_popup_open'
  | 'rlsh_deeplink_click'
  | 'rlsh_contact_intent'
  | 'rlsh_dm_blocked'
  | 'rlsh_fallback_used'
  | 'rlsh_pipeline_step';

export interface RLSHTelemetryEvent {
  name: RLSHTelemetryEventName;
  sessionId: string;
  mode: 'CyberCommand.RLSH';
  step?: string;
  provider?: string;
  endpoint?: string;
  durationMs?: number;
  receivedCount?: number;
  filteredCount?: number;
  parsedCount?: number;
  cacheSize?: number;
  markerCount?: number;
  geoConfidenceMix?: Record<RLSHOverlayMarker['geoConfidence'], number>;
  sourceProvider?: string;
  result?: 'success' | 'failure' | 'degraded';
  reason?: string;
  timestamp: string;
}

export interface RLSHTelemetrySummary {
  sessionId: string;
  totalEvents: number;
  countsByName: Record<RLSHTelemetryEventName, number>;
  failureCounters: {
    validationFailures: number;
    fallbackFailures: number;
    deeplinkFailures: number;
    pipelineFailures: number;
  };
  alerts: string[];
}

class RLSHTelemetryService {
  private static readonly MAX_EVENTS = 200;
  private static readonly ALERT_DEEPLINK_FAILURES = 5;
  private static readonly ALERT_FALLBACK_USES = 3;
  private readonly sessionId = `rlsh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  private events: RLSHTelemetryEvent[] = [];
  private countsByName: Record<RLSHTelemetryEventName, number> = {
    rlsh_mode_switch: 0,
    rlsh_markers_loaded: 0,
    rlsh_hover: 0,
    rlsh_popup_open: 0,
    rlsh_deeplink_click: 0,
    rlsh_contact_intent: 0,
    rlsh_dm_blocked: 0,
    rlsh_fallback_used: 0,
    rlsh_pipeline_step: 0
  };
  private failureCounters: RLSHTelemetrySummary['failureCounters'] = {
    validationFailures: 0,
    fallbackFailures: 0,
    deeplinkFailures: 0,
    pipelineFailures: 0
  };

  emit(
    name: RLSHTelemetryEventName,
    data: Omit<RLSHTelemetryEvent, 'name' | 'sessionId' | 'mode' | 'timestamp'> = {}
  ): void {
    const event: RLSHTelemetryEvent = {
      name,
      sessionId: this.sessionId,
      mode: 'CyberCommand.RLSH',
      timestamp: new Date().toISOString(),
      ...data
    };

    this.countsByName[name] += 1;
    this.trackFailureCounters(event);

    this.events.unshift(event);
    this.events = this.events.slice(0, RLSHTelemetryService.MAX_EVENTS);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('rlsh.telemetry', { detail: event }));
    }

    if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
      log.debug('[RLSH][Telemetry]', event);
    }
  }

  getRecentEvents(limit = 50): RLSHTelemetryEvent[] {
    return this.events.slice(0, limit).map((event) => ({ ...event }));
  }

  getSummary(): RLSHTelemetrySummary {
    const alerts: string[] = [];

    if (this.failureCounters.deeplinkFailures >= RLSHTelemetryService.ALERT_DEEPLINK_FAILURES) {
      alerts.push('deeplink-failures-threshold-exceeded');
    }

    if (this.countsByName.rlsh_fallback_used >= RLSHTelemetryService.ALERT_FALLBACK_USES) {
      alerts.push('fallback-usage-threshold-exceeded');
    }

    return {
      sessionId: this.sessionId,
      totalEvents: this.events.length,
      countsByName: { ...this.countsByName },
      failureCounters: { ...this.failureCounters },
      alerts
    };
  }

  private trackFailureCounters(event: RLSHTelemetryEvent): void {
    if (event.result !== 'failure') {
      return;
    }

    if (event.name === 'rlsh_deeplink_click' || event.name === 'rlsh_contact_intent' || event.name === 'rlsh_dm_blocked') {
      this.failureCounters.deeplinkFailures += 1;
    }

    if (event.name === 'rlsh_fallback_used') {
      this.failureCounters.fallbackFailures += 1;
    }

    if (event.name === 'rlsh_markers_loaded' && event.reason === 'validation') {
      this.failureCounters.validationFailures += 1;
    }

    if (event.name === 'rlsh_markers_loaded' && event.reason === 'pipeline') {
      this.failureCounters.pipelineFailures += 1;
    }

    if (event.name === 'rlsh_pipeline_step' && event.reason === 'pipeline') {
      this.failureCounters.pipelineFailures += 1;
    }
  }
}

export const rlshTelemetryService = new RLSHTelemetryService();

import { rlshTelemetryService } from '../RLSHTelemetryService';
import { rlshVisualizationService } from '../RLSHVisualizationService';

describe('RLSH telemetry + diagnostics', () => {
  it('records required telemetry events with non-PII dimensions', () => {
    const before = rlshTelemetryService.getSummary();

    rlshTelemetryService.emit('rlsh_mode_switch', { result: 'success' });
    rlshTelemetryService.emit('rlsh_markers_loaded', {
      markerCount: 3,
      geoConfidenceMix: { exact: 1, city: 1, region: 1, country: 0, unknown: 0 },
      sourceProvider: 'primary_wiki',
      result: 'success'
    });
    rlshTelemetryService.emit('rlsh_hover', { markerCount: 3, result: 'success' });
    rlshTelemetryService.emit('rlsh_popup_open', { markerCount: 3, result: 'success' });
    rlshTelemetryService.emit('rlsh_deeplink_click', { sourceProvider: 'primary_wiki', result: 'success' });

    const after = rlshTelemetryService.getSummary();

    expect(after.countsByName.rlsh_mode_switch).toBeGreaterThan(before.countsByName.rlsh_mode_switch);
    expect(after.countsByName.rlsh_markers_loaded).toBeGreaterThan(before.countsByName.rlsh_markers_loaded);
    expect(after.countsByName.rlsh_hover).toBeGreaterThan(before.countsByName.rlsh_hover);
    expect(after.countsByName.rlsh_popup_open).toBeGreaterThan(before.countsByName.rlsh_popup_open);
    expect(after.countsByName.rlsh_deeplink_click).toBeGreaterThan(before.countsByName.rlsh_deeplink_click);
    expect(after.sessionId).toMatch(/^rlsh-/);
  });

  it('surfaces threshold alerts for repeated deeplink failures and is exposed via service debug stats', () => {
    for (let index = 0; index < 5; index += 1) {
      rlshTelemetryService.emit('rlsh_deeplink_click', {
        sourceProvider: 'primary_wiki',
        result: 'failure',
        reason: 'invalid-url'
      });
    }

    const telemetrySummary = rlshTelemetryService.getSummary();
    expect(telemetrySummary.failureCounters.deeplinkFailures).toBeGreaterThanOrEqual(5);
    expect(telemetrySummary.alerts).toContain('deeplink-failures-threshold-exceeded');

    const debugStats = rlshVisualizationService.getDebugStats();
    expect(debugStats.telemetrySummary.sessionId).toBe(telemetrySummary.sessionId);
    expect(debugStats.telemetrySummary.failureCounters.deeplinkFailures).toBeGreaterThanOrEqual(5);
  });
});

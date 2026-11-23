/**
 * The tooltip, fed what the producers really write.
 *
 * Its older test built reports in Unix seconds, the unit the tooltip assumed.
 * Both producers write milliseconds, so in the running app every RLSH tooltip
 * showed the wrong day and FRESH for a record scraped six months before, while
 * the popup for the same record said "Stale (195d)". Fixture and component
 * agreed with each other and not with the data. This one takes a profile, in the shape the service holds,
 * through the service's own conversion. (It took one from the scraped dataset, gone since RS49.)
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { IntelReportTooltip } from '../IntelReportTooltip';
import { rlshVisualizationService } from '../../../../services/RLSHVisualizationService';
import type { RLSHOverlayMarker } from '../../../../interfaces/RLSHOverlay';
import { formatUtcDateTime } from '../../../../utils/utcTime';

const internals = rlshVisualizationService as unknown as { cache: RLSHOverlayMarker[] };

afterEach(() => {
  internals.cache = [];
  vi.useRealTimers();
});

describe('IntelReportTooltip reads the time the producers write', () => {
  it('shows an RLSH profile as stale, counted from the day it was updated', async () => {
    const record: RLSHOverlayMarker = {
      schemaVersion: '1.0.0', id: 'rlsh-test-profile', displayName: 'Test Hero', summary: 'A profile for a test.',
      canonicalUrl: 'https://example.org/heroes/test-hero', latitude: 45.5, longitude: -122.7, region: 'Oregon',
      countryCode: 'US', updatedAt: '2026-03-02T15:15:26.827Z', status: 'Active',
      source: { provider: 'navcom_submitted_profiles', sourceId: 'test-hero' }, geoConfidence: 'region', tags: [],
    };
    const updatedMs = Date.parse(record!.updatedAt);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(updatedMs + 195 * 86_400_000);

    internals.cache = [record!];
    const [marker] = await rlshVisualizationService.getIntelCompatibleMarkers({ limit: 1, roleFilter: 'all', statusFilter: 'all' });
    expect(marker).toBeDefined();

    render(
      <IntelReportTooltip
        report={marker}
        position={{ x: 200, y: 200 }}
        visible={true}
        entityLabel="RLSH Entity"
        showConfidenceTag={true}
      />
    );

    // In UTC with the year; it was the viewer's local date and time (decision D-E, step 9).
    const shown = screen.getByTitle(/^Report timestamp:/).getAttribute('title');
    expect(shown).toBe(`Report timestamp: ${formatUtcDateTime(updatedMs, { year: true })}`);
    expect(screen.getByTitle('Recency status: STALE 195D')).toBeInTheDocument();
  });

  it('says no time was given instead of judging an age', () => {
    render(
      <IntelReportTooltip
        report={{ pubkey: 'x', title: 'Untimed', content: '', tags: ['RLSH'], latitude: 1, longitude: 1, timestamp: Number.NaN, author: 'a' }}
        position={{ x: 200, y: 200 }}
        visible={true}
        showConfidenceTag={true}
      />
    );

    expect(screen.getByTitle('Report timestamp: no stated time')).toBeInTheDocument();
    expect(screen.queryByTitle(/Recency status/)).not.toBeInTheDocument();
    expect(screen.getByTitle('Geospatial confidence: NO STATED PRECISION')).toBeInTheDocument();
  });
});

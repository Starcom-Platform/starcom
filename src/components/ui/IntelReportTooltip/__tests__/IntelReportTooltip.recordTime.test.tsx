/**
 * The report tooltip says which time placed the report (decision D-E).
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { IntelReportTooltip } from '../IntelReportTooltip';
import type { IntelReportOverlayMarker } from '../../../../interfaces/IntelReportOverlay';

const marker = (over: Partial<IntelReportOverlayMarker>): IntelReportOverlayMarker => ({
  pubkey: 'p1', title: 'Substation fire', content: '', tags: [],
  latitude: 29.7, longitude: -95.3, timestamp: Date.UTC(2026, 6, 27), author: 'analyst',
  kind: 'intel', ...over,
});

const show = (m: IntelReportOverlayMarker) => render(<IntelReportTooltip report={m} visible position={{ x: 10, y: 10 }} />);

describe('IntelReportTooltip: which time placed the report', () => {
  it('says when the event happened', () => {
    show(marker({ timeBasis: 'event', timePrecisionMs: 86_400_000 }));
    expect(screen.getByTitle('Happened: 27 Jul 2026')).toHaveTextContent('Happened 27 Jul 2026');
  });

  it('says when the report was written, and that no event time was stated', () => {
    show(marker({ timeBasis: 'written', timestamp: Date.UTC(2026, 8, 14, 9, 5) }));
    expect(screen.getByTitle('Written: 14 Sep 2026 09:05Z (no stated event time)')).toBeInTheDocument();
  });
});

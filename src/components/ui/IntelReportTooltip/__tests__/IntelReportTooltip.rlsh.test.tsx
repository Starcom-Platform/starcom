import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { IntelReportTooltip } from '../IntelReportTooltip';
import { vi } from 'vitest';

describe('IntelReportTooltip RLSH badge rendering', () => {
  it('renders confidence and stale badges in RLSH tooltip mode', () => {
    const report = {
      pubkey: 'rlsh-1',
      title: 'Night Beacon',
      content: 'Placeholder',
      tags: ['RLSH', 'COUNTRY'],
      latitude: 40.7128,
      longitude: -74.006,
      timestamp: Date.now() - 40 * 86400000, // milliseconds, as both producers write it
      author: 'primary_wiki'
    };

    render(
      <IntelReportTooltip
        report={report}
        position={{ x: 200, y: 200 }}
        visible={true}
        entityLabel="RLSH Entity"
        showConfidenceTag={true}
      />
    );

    expect(screen.getByTitle('Geospatial confidence: COUNTRY')).toBeInTheDocument();
    expect(screen.getByTitle('Recency status: STALE 40D')).toBeInTheDocument();
  });
});

// SVG glyphs everywhere (2026-10-08): the tooltip shows the mark hovered, a person for an RLSH entity.
describe('IntelReportTooltip glyph', () => {
  it('shows a person for an RLSH entity, as the globe draws it, and a document for a report', () => {
    const base = { pubkey: 'r', title: 'T', content: '', tags: [], latitude: 1, longitude: 2, timestamp: Date.now(), author: 'a' };
    const { unmount } = render(<IntelReportTooltip report={{ ...base, kind: 'rlsh' }} position={{ x: 0, y: 0 }} visible />);
    expect(screen.getByTestId('intel-report-glyph').dataset.glyph).toBe('rlsh');
    unmount();
    render(<IntelReportTooltip report={{ ...base, tags: ['actionable'] }} position={{ x: 0, y: 0 }} visible />);
    expect(screen.getByTestId('intel-report-glyph').dataset.glyph).toBe('actionable');
  });
});

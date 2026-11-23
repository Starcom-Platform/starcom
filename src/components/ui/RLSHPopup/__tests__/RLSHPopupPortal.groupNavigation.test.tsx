import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RLSHPopupPortal } from '../RLSHPopupPortal';
import type { RLSHOverlayMarker } from '../../../../interfaces/RLSHOverlay';

const mockGetMarkers = vi.fn<() => Promise<RLSHOverlayMarker[]>>();

vi.mock('../../../../services/RLSHVisualizationService', () => ({
  rlshVisualizationService: {
    getMarkers: () => mockGetMarkers()
  }
}));

vi.mock('../RLSHPopup', () => ({
  RLSHPopup: ({ marker, navigationContext, onNext, onPrevious }: {
    marker: { id: string } | null;
    navigationContext?: { totalCount: number; currentPosition: number; groupSize: number; groupPosition: number; groupScoped: boolean };
    onNext?: () => void;
    onPrevious?: () => void;
  }) => (
    <div>
      <div data-testid="active-marker">{marker?.id || 'none'}</div>
      <div data-testid="nav-context">
        {navigationContext
          ? `${navigationContext.groupScoped ? 'group' : 'list'}:${navigationContext.groupPosition}/${navigationContext.groupSize}|${navigationContext.currentPosition}/${navigationContext.totalCount}`
          : 'none'}
      </div>
      <button data-testid="next" onClick={onNext}>next</button>
      <button data-testid="prev" onClick={onPrevious}>prev</button>
    </div>
  )
}));

const makeMarker = (id: string, latitude: number, longitude: number, updatedAt: string): RLSHOverlayMarker => ({
  schemaVersion: '1.0.0',
  id,
  displayName: id,
  summary: `${id} summary`,
  canonicalUrl: 'https://wiki.rlsh.net/wiki/sample',
  latitude,
  longitude,
  updatedAt,
  source: {
    provider: 'primary_wiki',
    sourceId: id
  },
  geoConfidence: 'city',
  tags: ['RLSH']
});

describe('RLSHPopupPortal group navigation UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prioritizes initial group and reports group/list navigation context', async () => {
    mockGetMarkers.mockResolvedValue([
      makeMarker('other-1', 40.7128, -74.0060, '2026-01-01T00:00:00.000Z'),
      makeMarker('group-b', 32.7157, -117.1611, '2026-03-03T00:00:00.000Z'),
      makeMarker('group-a', 32.7157, -117.1611, '2026-03-02T00:00:00.000Z')
    ]);

    render(
      <RLSHPopupPortal
        initialMarkerId="group-a"
        initialGroupId="32.71570|-117.16110"
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('active-marker')).toHaveTextContent('group-a');
    });

    expect(screen.getByTestId('nav-context')).toHaveTextContent('group:2/2|2/3');

    fireEvent.click(screen.getByTestId('prev'));

    await waitFor(() => {
      expect(screen.getByTestId('active-marker')).toHaveTextContent('group-b');
    });

    expect(screen.getByTestId('nav-context')).toHaveTextContent('group:1/2|1/3');

    fireEvent.click(screen.getByTestId('next'));
    fireEvent.click(screen.getByTestId('next'));

    await waitFor(() => {
      expect(screen.getByTestId('active-marker')).toHaveTextContent('other-1');
    });

    expect(screen.getByTestId('nav-context')).toHaveTextContent('group:0/2|3/3');
  });
});

/**
 * The context menu previously had 13 actions; several were decorative stubs.
 * "Add Marker" and "Set Waypoint" (near-duplicate "mark this spot" actions,
 * neither backed by anything real) are now one real "Bookmark Location"
 * action; "Leave Comment" (redundant with the already-working "Report
 * Incident", which navigates to Cases Dashboard) was removed outright.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GlobeContextMenu } from '../GlobeContextMenu';

describe('GlobeContextMenu — action set', () => {
  it('no longer renders the removed/consolidated actions', () => {
    render(
      <GlobeContextMenu
        visible={true}
        position={{ x: 10, y: 10 }}
        geoLocation={{ lat: 1, lng: 2 }}
        onClose={vi.fn()}
        onAction={vi.fn()}
      />
    );

    expect(screen.queryByText('Set Waypoint')).not.toBeInTheDocument();
    expect(screen.queryByText('Add Marker')).not.toBeInTheDocument();
    expect(screen.queryByText('Leave Comment')).not.toBeInTheDocument();
  });

  it('renders the consolidated Bookmark Location action and invokes onAction with its id', () => {
    const onAction = vi.fn();
    render(
      <GlobeContextMenu
        visible={true}
        position={{ x: 10, y: 10 }}
        geoLocation={{ lat: 1, lng: 2 }}
        onClose={vi.fn()}
        onAction={onAction}
      />
    );

    fireEvent.click(screen.getByText('Bookmark Location'));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toMatchObject({ id: 'bookmark-location' });
    expect(onAction.mock.calls[0][1]).toMatchObject({ geoLocation: { lat: 1, lng: 2 } });
  });

  it('still renders the actions that already worked (spot-check)', () => {
    render(
      <GlobeContextMenu
        visible={true}
        position={{ x: 10, y: 10 }}
        geoLocation={{ lat: 1, lng: 2 }}
        onClose={vi.fn()}
        onAction={vi.fn()}
      />
    );

    expect(screen.getByText('Create Intel Report')).toBeInTheDocument();
    expect(screen.getByText('Report Incident')).toBeInTheDocument();
    expect(screen.getByText('Share Location')).toBeInTheDocument();
  });
});

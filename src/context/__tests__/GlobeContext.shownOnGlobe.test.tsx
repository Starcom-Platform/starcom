/**
 * The Case or Mission shown on the globe outlives the globe, as the focus does.
 *
 * The globe unmounts on every app switch while GlobeProvider lives above it.
 * "Show on the globe" sets the record from its own screen and then switches to
 * the globe, so the record has to be in the provider before the globe exists,
 * and still be there each time the operator comes back, until they clear it.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { GlobeProvider, useGlobeContext } from '../GlobeContext';

let globe: ReturnType<typeof useGlobeContext> | null = null;
const Controls: React.FC = () => {
  globe = useGlobeContext();
  return null;
};
const GlobeStandIn: React.FC = () => {
  const { shownOnGlobe } = useGlobeContext();
  return <div data-testid="shown">{shownOnGlobe ? `${shownOnGlobe.kind}:${shownOnGlobe.id}` : 'every report'}</div>;
};
const Shell: React.FC<{ globeMounted: boolean }> = ({ globeMounted }) => (
  <GlobeProvider>
    <Controls />
    {globeMounted && <GlobeStandIn />}
  </GlobeProvider>
);

describe('GlobeContext — the record shown on the globe', () => {
  it('shows every report until a record is shown', () => {
    render(<Shell globeMounted />);
    expect(screen.getByTestId('shown').textContent).toBe('every report');
  });

  it('keeps the shown record while the globe is unmounted and remounted, until it is cleared', () => {
    const { rerender } = render(<Shell globeMounted={false} />);
    act(() => globe!.showRecordOnGlobe({ kind: 'mission', id: 'mission-1' }));

    rerender(<Shell globeMounted />);
    expect(screen.getByTestId('shown').textContent).toBe('mission:mission-1');
    rerender(<Shell globeMounted={false} />);
    rerender(<Shell globeMounted />);
    expect(screen.getByTestId('shown').textContent).toBe('mission:mission-1');

    act(() => globe!.clearShownOnGlobe());
    expect(screen.getByTestId('shown').textContent).toBe('every report');
  });
});

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@mui/icons-material/ExpandMore', () => ({ default: () => null }));
vi.mock('@mui/icons-material/ExpandLess', () => ({ default: () => null }));

// The panels navigate now; mock the router the same way CorroborationGapsPanel's
// suite does rather than wrapping every panel test in the whole provider.
const navigateToApp = vi.fn();
vi.mock('../../../../hooks/useApplicationRouter', () => ({
  useApplicationRouter: () => ({ navigateToApp }),
}));

let corroboratedFindings: { entityRef: string; attribute: 'location'; value: { lat: number; lon: number }; confidence: number; sourceCount: number; algorithmVersion: number }[] = [];

vi.mock('../../state/CorrelationContext', () => ({
  // excludedReports: reports the lifecycle gate held out of the evidence pool.
  // Empty here — these tests are about findings, and the panel now reads it to
  // decide whether an empty state is genuinely empty or merely gated.
  useCorrelation: () => ({ corroboratedFindings, excludedReports: [], names: currentNames })
}));

const publishFindingMock = vi.fn();
// The panel publishes through the publish review (plan item 0.1). The review
// itself is tested in services/publishing; here it answers as a confirm would,
// or, where a test says so, as a cancel.
vi.mock('../../../../services/publishing/findings', () => ({
  reviewFinding: (...args: unknown[]) => publishFindingMock(...args)
}));

import FindingsPanel from '../FindingsPanel';
import { buildReadableNames } from '../../state/readableNames';
const NO_NAMES = buildReadableNames([], []);
let currentNames = NO_NAMES;

function makeFinding(overrides: Partial<(typeof corroboratedFindings)[number]> = {}) {
  return {
    // publicationPolicy refuses evidence that is not explicitly known-real, so a
    // fixture without this could never publish in production — these tests were
    // exercising a path the gate would have refused. eventsAdapter sets it to
    // false for human-authored reports, which is what these represent.
    isMock: false,
    entityRef: 'John Smith',
    attribute: 'location' as const,
    value: { lat: 40.7128, lon: -74.006 },
    confidence: 0.81,
    sourceCount: 3,
    algorithmVersion: 1,
    ...overrides
  };
}

describe('FindingsPanel', () => {
  it('renders nothing when there are no corroborated findings', () => {
    corroboratedFindings = [];
    const { container } = render(<FindingsPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('reads a registry finding by its names, with each id on hover (plan item 3.6)', () => {
    const LEI = '391200XXYCPAKDL8MN50';
    currentNames = buildReadableNames([{
      id: 'e1', title: 't', timestamp: '2026-08-18T00:00:00.000Z', category: 'X', tags: [], sourceType: 'OBSERVATION',
      sourceId: 'g', entityRefs: [LEI], subjectName: 'Lohner Capital GmbH',
      claim: { attribute: 'headquartersCity', value: 'Q1726' }, valueLabel: 'Munich',
    }], []);
    corroboratedFindings = [makeFinding({ entityRef: LEI, attribute: 'headquartersCity' as never, value: 'Q1726' as never })];
    try {
      render(<FindingsPanel />);
      const row = screen.getByTestId('corroborated-finding');
      expect(row.textContent).toContain('Lohner Capital GmbH — headquarters city: Munich');
      expect(row.textContent).not.toContain(LEI);
      expect(screen.getByText('Lohner Capital GmbH').getAttribute('title')).toBe(LEI);
      expect(screen.getByText('Munich').getAttribute('title')).toBe('Q1726');
    } finally {
      currentNames = NO_NAMES;
    }
  });

  it('keeps a place finding as it reads today: a name, and "location"', () => {
    corroboratedFindings = [makeFinding()];
    render(<FindingsPanel />);
    expect(screen.getByTestId('corroborated-finding').textContent).toContain('John Smith — location');
    expect(screen.getByText('John Smith').getAttribute('title')).toBeNull();
  });

  it('lists each finding with its confidence and source count', () => {
    corroboratedFindings = [makeFinding()];
    render(<FindingsPanel />);
    expect(screen.getByText('John Smith', { exact: false })).toBeTruthy();
    expect(screen.getByText('81% confidence')).toBeTruthy();
    expect(screen.getByText('3 sources')).toBeTruthy();
  });

  it('clicking "Publish Finding" calls publishFinding with that finding and shows Published on success', async () => {
    corroboratedFindings = [makeFinding()];
    publishFindingMock.mockReset();
    publishFindingMock.mockResolvedValue({ broadcast: { success: true, eventId: 'evt-1' } });

    render(<FindingsPanel />);
    await userEvent.click(screen.getByText('Publish Finding'));

    expect(publishFindingMock).toHaveBeenCalledWith(makeFinding());
    await waitFor(() => expect(screen.getByText('Published')).toBeTruthy());
  });

  it('shows Retry (not stuck on Publishing) when the broadcast fails', async () => {
    corroboratedFindings = [makeFinding()];
    publishFindingMock.mockReset();
    publishFindingMock.mockResolvedValue({ broadcast: { success: false, error: 'no relays' } });

    render(<FindingsPanel />);
    await userEvent.click(screen.getByText('Publish Finding'));

    await waitFor(() => expect(screen.getByText('Retry')).toBeTruthy());
  });

  it('leaves the finding unpublished and the button ready when the review is cancelled', async () => {
    render(<FindingsPanel />);
    publishFindingMock.mockReset();
    publishFindingMock.mockResolvedValue(null);

    fireEvent.click(screen.getByRole('button', { name: /Publish Finding/i }));

    await waitFor(() => expect(publishFindingMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((screen.getByRole('button', { name: /Publish Finding/i }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText('Published')).toBeNull();
  });

  it('the Publish button is disabled once a finding is successfully published', async () => {
    corroboratedFindings = [makeFinding()];
    publishFindingMock.mockReset();
    publishFindingMock.mockResolvedValue({ broadcast: { success: true, eventId: 'evt-1' } });

    render(<FindingsPanel />);
    await userEvent.click(screen.getByText('Publish Finding'));

    await waitFor(() => {
      const btn = screen.getByText('Published').closest('button');
      expect(btn).toBeDisabled();
    });
  });
});

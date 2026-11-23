/**
 * The RLSH popup gives when a record was updated and last verified in UTC, with
 * the year and the local time on hover (decision D-E, settled 2026-09-14 for step
 * 9). It printed the browser's local time with no zone.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../../../services/RLSHTelemetryService', () => ({
  rlshTelemetryService: { emit: () => {} },
}));

import { RLSHPopup } from '../RLSHPopup';
import { localTimeTitle } from '../../../../utils/utcTime';

const updated = Date.UTC(2026, 1, 14, 10);
const verified = Date.UTC(2026, 2, 2, 15, 15);

const marker = {
  schemaVersion: '1.0.0',
  id: 'rlsh-1',
  displayName: 'Night Beacon',
  summary: 'Community patrol and aid.',
  canonicalUrl: '',
  latitude: 40.7128,
  longitude: -74.006,
  updatedAt: new Date(updated).toISOString(),
  source: { provider: 'primary_wiki', sourceId: 'night-beacon' },
  geoConfidence: 'country' as const,
  tags: ['RLSH'],
  aliases: [],
  riskFlags: [],
  lastVerifiedAt: new Date(verified).toISOString(),
  imageUrl: '',
};

/** The value element beside each label with exactly this text. */
const valuesBeside = (label: string) =>
  screen.getAllByText(label, { exact: true }).map((el) => el.nextElementSibling as HTMLElement);

afterEach(() => {
  vi.useRealTimers();
});

describe('RLSHPopup: when a record was updated and verified', () => {
  it('gives when it was updated in UTC, with the year and the local time on hover', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 8, 14));
    render(<RLSHPopup marker={marker} visible={true} onClose={() => {}} />);

    const values = [...valuesBeside('Updated'), ...valuesBeside('Source Updated')];
    expect(values.length).toBeGreaterThan(1);
    for (const value of values) {
      expect(value).toHaveTextContent('14 Feb 2026 10:00Z');
      expect(value).toHaveAttribute('title', localTimeTitle(updated));
    }
  });

  it('gives when it was last verified in UTC, with how old that is', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 8, 14));
    render(<RLSHPopup marker={marker} visible={true} onClose={() => {}} />);

    const [value] = valuesBeside('Last Verified');
    expect(value).toHaveTextContent('2 Mar 2026 15:15Z — 6 months old');
    expect(value).toHaveAttribute('title', localTimeTitle(verified));
  });
});

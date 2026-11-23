/**
 * The space weather details say what each provider answered (plan item 8.3b).
 * A provider nothing had asked read "Ready".
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SpaceWeatherDetailsPopover from '../SpaceWeatherDetailsPopover';

const meta = { label: '', detail: 'detail', icon: '' };
const providerMeta = {
  legacy: { ...meta, label: 'Legacy' },
  enterprise: { ...meta, label: 'Enterprise' },
  enhanced: { ...meta, label: 'Enhanced' },
};

describe('SpaceWeatherDetailsPopover, provider status', () => {
  it('says ready, unavailable, or not checked yet, as each provider answered', () => {
    render(
      <SpaceWeatherDetailsPopover
        onClose={() => {}}
        providerMeta={providerMeta}
        providerStatus={{
          legacy: { available: true, lastTested: new Date() },
          enterprise: { available: false, lastTested: new Date(), error: 'HTTP 502' },
          enhanced: { available: null },
        }}
      />,
    );
    expect(screen.getByText('Legacy · Ready')).toBeTruthy();
    expect(screen.getByText('Enterprise · Unavailable')).toBeTruthy();
    expect(screen.getByText('Enhanced · Not checked yet')).toBeTruthy();
  });
});

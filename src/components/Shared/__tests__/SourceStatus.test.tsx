/**
 * One way to say how a source stands (plan item 8.3c). Each state has a word
 * and a glyph, so colour is never the only signal.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SourceStatusList, SourceStatusBadge, type SourceStatus } from '../SourceStatus';

describe('SourceStatusList', () => {
  it('says each source\'s state in words, with what else is known', () => {
    const sources: SourceStatus[] = [
      { id: 'day', label: 'Daylight surface', state: 'ready', detail: '1.2 s' },
      { id: 'night', label: 'City lights', state: 'timeout', detail: 'drawn flat' },
      { id: 'relief', label: 'Relief', state: 'waiting' },
    ];
    render(<SourceStatusList sources={sources} label="Globe imagery" />);
    expect(screen.getByRole('list', { name: 'Globe imagery' })).toBeTruthy();
    expect(screen.getByTestId('source-day').textContent).toMatch(/Daylight surface: ready · 1\.2 s$/);
    expect(screen.getByTestId('source-night').textContent).toMatch(/City lights: timed out · drawn flat$/);
    expect(screen.getByTestId('source-night').getAttribute('data-state')).toBe('timeout');
    expect(screen.getByTestId('source-relief').textContent).toMatch(/Relief: waiting$/);
  });
});

describe('SourceStatusBadge', () => {
  it('carries its state for its colour, and its text', () => {
    render(<SourceStatusBadge state="paused" text="Paused (budget)" />);
    const badge = screen.getByText('Paused (budget)');
    expect(badge.getAttribute('data-state')).toBe('paused');
  });
});

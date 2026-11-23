/**
 * The coverage panel, which is mostly about what it refuses to print.
 *
 * A percentage where no denominator exists, or a zero where nothing was
 * measured, are both readable, confident and wrong — and both are what a
 * dashboard does by default.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../Dock/Docked', () => ({
  Docked: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CoveragePanel } from '../CoveragePanel';
import type { CoverageAxis } from '../../../services/intel/coverage/coverage';

const axis = (over: Partial<CoverageAxis> & Pick<CoverageAxis, 'id'>): CoverageAxis => ({
  measures: 'something', blindSpot: 'a blind spot long enough to be real', result: null,
  ...over,
});

describe('CoveragePanel', () => {
  it('renders nothing before anything has been measured', () => {
    const { container } = render(<CoveragePanel axes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('prints a share only where a denominator exists', () => {
    render(<CoveragePanel axes={[
      axis({ id: 'sources', result: { expected: 6, covered: 1, items: 6, unplaced: 0 } }),
      axis({ id: 'grid', result: { expected: null, covered: 12, items: 40, unplaced: 0 } }),
    ]} />);
    expect(screen.getByTestId('coverage-sources').textContent).toBe('relays connected: 1 of 6');
    // No "of N": the denominator would be every cell on Earth.
    expect(screen.getByTestId('coverage-grid').textContent).toBe('cells holding intel: 12');
  });

  it('says not measured rather than printing a zero', () => {
    render(<CoveragePanel axes={[
      axis({ id: 'derived-territory', why: 'no point-in-polygon yet' }),
    ]} />);
    const row = screen.getByTestId('coverage-derived-territory');
    expect(row.textContent).toBe('territories with intel: not measured');
    expect(row.textContent).not.toMatch(/\b0\b/);
  });

  it('carries the reason it could not measure, where a reader can reach it', () => {
    render(<CoveragePanel axes={[
      axis({ id: 'stated-jurisdiction', why: 'reports carry no stated jurisdiction' }),
    ]} />);
    expect(screen.getByTestId('coverage-stated-jurisdiction').getAttribute('title'))
      .toContain('reports carry no stated jurisdiction');
  });

  it('carries the blind spot of an axis it COULD measure', () => {
    // The computable axes are the ones a reader is most likely to trust, so
    // their limits are the ones most worth stating.
    render(<CoveragePanel axes={[
      axis({
        id: 'sources', blindSpot: 'An answering relay is not one with anything to say.',
        result: { expected: 6, covered: 1, items: 6, unplaced: 0 },
      }),
    ]} />);
    expect(screen.getByTestId('coverage-sources').getAttribute('title'))
      .toBe('An answering relay is not one with anything to say.');
  });

  it('shows unplaced items beside the count, never folded into it', () => {
    render(<CoveragePanel axes={[
      axis({ id: 'grid', result: { expected: null, covered: 3, items: 10, unplaced: 7 } }),
    ]} />);
    expect(screen.getByTestId('coverage-grid').textContent).toBe('cells holding intel: 3 · 7 unplaced');
  });

  describe('folded to one line (BD4)', () => {
    // At 1280×720 the left column ran over the clock and the minimap; folded, the
    // panel takes one line until it is opened.
    const axes = [
      axis({ id: 'sources', result: { expected: 6, covered: 5, items: 6, unplaced: 0 } }),
      axis({ id: 'grid', result: { expected: null, covered: 0, items: 8, unplaced: 8 } }),
      axis({ id: 'derived-territory', why: 'not loaded' }),
    ];

    it('starts folded, saying the relays and the cells, and how many lines it holds back', () => {
      render(<CoveragePanel axes={axes} />);
      const toggle = screen.getByTestId('coverage-toggle');
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(toggle.textContent).toContain('5 of 6 relays');
      expect(toggle.textContent).toContain('0 cells');
      expect(toggle.textContent).toContain('1 more');
      expect((screen.getByTestId('coverage-lines') as HTMLElement).hidden).toBe(true);
      // An inline display beats the hidden attribute in a browser, which jsdom does not model.
      expect((screen.getByTestId('coverage-lines') as HTMLElement).style.display).toBe('none');
    });

    it('wraps its line whole under the name in a narrow corner, not into a column beside it', () => {
      render(<CoveragePanel axes={axes} />);
      expect(screen.getByTestId('coverage-toggle').style.flexWrap).toBe('wrap');
    });

    it('opens to every line, and folds again', () => {
      render(<CoveragePanel axes={axes} />);
      const toggle = screen.getByTestId('coverage-toggle');
      fireEvent.click(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect((screen.getByTestId('coverage-lines') as HTMLElement).hidden).toBe(false);
      expect(toggle.getAttribute('aria-controls')).toBe(screen.getByTestId('coverage-lines').id);
      fireEvent.click(toggle);
      expect((screen.getByTestId('coverage-lines') as HTMLElement).hidden).toBe(true);
    });

    it('says an axis it could not measure is not measured, folded too', () => {
      render(<CoveragePanel axes={[axis({ id: 'sources', why: 'no relays yet' })]} />);
      expect(screen.getByTestId('coverage-toggle').textContent).toContain('relays not measured');
      expect(screen.getByTestId('coverage-toggle').textContent).not.toMatch(/\b0\b/);
    });
  });
});

// BD11, BD12: the relays' lights and the capacity gauge on the folded line, the list when opened.
describe('CoveragePanel with relay health', () => {
  const now = Date.UTC(2026, 9, 5, 12);
  const health = {
    now,
    relays: [
      { url: 'wss://a.example', connected: true, lastAnsweredAt: now - 5_000 },
      { url: 'wss://b.example', connected: false },
    ],
  };
  const axes = [axis({ id: 'sources', result: { expected: 2, covered: 1, items: 2, unplaced: 0 } })];

  it('shows a light a relay and the gauge while folded', () => {
    render(<CoveragePanel axes={axes} health={health} />);
    const toggle = screen.getByTestId('coverage-toggle');
    expect(toggle.querySelectorAll('[data-light]')).toHaveLength(2);
    expect(toggle.querySelector('[role="meter"]')).not.toBeNull();
  });

  it('lists each relay when opened', () => {
    render(<CoveragePanel axes={axes} health={health} />);
    fireEvent.click(screen.getByTestId('coverage-toggle'));
    const list = screen.getByTestId('coverage-relays');
    expect(list.textContent).toContain('a.example');
    expect(list.textContent).toContain('down');
  });
});


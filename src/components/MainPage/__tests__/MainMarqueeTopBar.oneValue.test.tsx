/**
 * Each readout says one thing (plan item 1.8). The strip kept the value before
 * a change in the page, hidden only by its colour, so the page held "TOTAL 1"
 * and "TOTAL 0" at once, and "2/6 UP" beside "1/6 UP", for anything reading it:
 * a screen reader, a copy and paste, a search. And the copy drawn for the loop
 * was read out a second time.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';

const marquee = vi.hoisted(() => ({
  data: { title: 'Intel', signals: [{ id: 'intel-workflow', label: 'INTEL WORKFLOW', value: 'TOTAL 0' }], allSignals: [] as unknown[] },
}));
vi.mock('../usePrimaryMarqueeData', () => ({ usePrimaryMarqueeData: () => marquee.data }));
vi.mock('../../Popup/PopupManager', () => ({ usePopup: () => ({ showPopup: vi.fn() }) }));

import MainMarqueeTopBar from '../MainMarqueeTopBar';

/** The text a screen reader would reach: aria-hidden subtrees left out. */
const spoken = (el: Element): string => [...el.childNodes].map((n) =>
  n.nodeType === 3 ? n.textContent : (n as Element).getAttribute?.('aria-hidden') === 'true' ? '' : spoken(n as Element)).join('');

afterEach(() => vi.useRealTimers());

describe('MainMarqueeTopBar — one value per readout', () => {
  it('keeps no earlier value in the page once a change has shown, and reads the loop once', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<MainMarqueeTopBar />);
    marquee.data = { ...marquee.data, signals: [{ id: 'intel-workflow', label: 'INTEL WORKFLOW', value: 'TOTAL 1' }] };
    rerender(<MainMarqueeTopBar />);
    act(() => { vi.advanceTimersByTime(1000); });
    rerender(<MainMarqueeTopBar />);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(container.textContent).toContain('TOTAL 1');
    expect(container.textContent).not.toContain('TOTAL 0');
    expect(spoken(container).match(/TOTAL \d/g)).toEqual(['TOTAL 1']);
  });
});

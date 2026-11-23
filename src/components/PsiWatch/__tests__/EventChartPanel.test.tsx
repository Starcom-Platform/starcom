/**
 * An event chart, then and now (D-PW, PW60, PW85–PW87): opened for an item, the wheel and the three lists; the frame
 * switched and said; one of the left panels, so Story or RLSH opening closes it; Escape closes it.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EventChartPanel } from '../EventChartPanel';
import { spreadLabels } from '../ChartWheel';
import { setChartCardMaker } from '../../../features/psi/chartCardMaker';
import { eventChart, openEventChart, resetEventChartForTests } from '../../../features/psi/eventChartPanel';
import { openStoryPanel, resetStoryPanelForTests } from '../../../features/story/storyPanel';
import { openRlshPanel, resetRlshPanelForTests, rlshPanel } from '../../../features/rlsh/rlshPanel';

const SUBJECT = { title: 'Quake near Aleppo', timeMs: Date.UTC(2026, 9, 27, 2, 18), place: { lat: 36.2, lng: 37.1 } };

beforeEach(() => { resetEventChartForTests(); resetStoryPanelForTests(); resetRlshPanelForTests(); });

describe('EventChartPanel', () => {
  it('draws the wheel and lists the bodies then, now in its houses, and the aspects across', () => {
    act(() => openEventChart(SUBJECT));
    render(<EventChartPanel />);
    expect(screen.getByTestId('event-chart-subject')).toHaveTextContent('Quake near Aleppo');
    const wheel = screen.getByTestId('chart-wheel');
    // The angles named just outside the rim, inside the drawing's own margin (they were cut off at its edge).
    const [vx, vy, vw, vh] = (wheel.getAttribute('viewBox') ?? '').split(' ').map(Number);
    for (const id of ['chart-asc', 'chart-mc']) {
      const text = screen.getByTestId(id);
      const x = Number(text.getAttribute('x'));
      const y = Number(text.getAttribute('y'));
      expect(x).toBeGreaterThan(vx + 10);
      expect(x).toBeLessThan(vx + vw - 10);
      expect(y).toBeGreaterThan(vy + 5);
      expect(y).toBeLessThan(vy + vh - 5);
    }
    // Eleven bodies then and eleven now, each marked on its ring.
    expect(within(wheel).getAllByText(/^(Su|Mo|Me|Ve|Ma|Ju|Sa|Ur|Ne|Pl|NN)ʀ?$/)).toHaveLength(22);
    expect(within(screen.getByTestId('event-chart-then')).getAllByRole('listitem')).toHaveLength(11);
    const now = within(screen.getByTestId('event-chart-now')).getAllByRole('listitem');
    expect(now).toHaveLength(11);
    expect(now.every((li) => /house \d+/.test(li.textContent ?? ''))).toBe(true);
    expect(screen.getByText('Experimental')).toBeInTheDocument();
    expect(screen.getByTestId('event-chart-stated')).toHaveTextContent(/Galactic Centre .*Placidus/);
  });

  it('switches the frame and says so', () => {
    act(() => openEventChart(SUBJECT));
    render(<EventChartPanel />);
    fireEvent.click(screen.getByTestId('event-chart-frame-tropical'));
    expect(eventChart().frame).toBe('tropical');
    expect(screen.getByTestId('event-chart-stated')).toHaveTextContent(/^Tropical/);
  });

  it('is one of the left panels, and Escape closes it', () => {
    act(() => openEventChart(SUBJECT));
    render(<EventChartPanel />);
    act(() => openStoryPanel(null));
    expect(eventChart().open).toBe(false);
    act(() => openEventChart(SUBJECT));
    act(() => openRlshPanel('mine'));
    expect(eventChart().open).toBe(false);
    act(() => openEventChart(SUBJECT));
    expect(rlshPanel().open).toBe(false);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(eventChart().open).toBe(false);
  });
});

describe("the chart's card (PW87)", () => {
  it('asks for the chart\'s shot, the item\'s place and the chart at the cursor and frame shown, and saves the card', async () => {
    const maker = vi.fn(async () => ({ ok: true, card: { dataUrl: 'data:image/png;base64,iVBORw0KGgo=' } }));
    setChartCardMaker(maker);
    global.URL.createObjectURL = vi.fn(() => 'blob:card') as unknown as typeof URL.createObjectURL;
    global.URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;
    act(() => openEventChart(SUBJECT));
    render(<EventChartPanel />);
    fireEvent.click(screen.getByTestId('event-chart-frame-tropical'));
    fireEvent.click(screen.getByTestId('event-chart-card'));
    await waitFor(() => expect(screen.getByTestId('event-chart-card-said')).toHaveTextContent(/^Card downloaded: starcom-chart-2026-10-27T02-18-00-000Z\.png$/));
    expect(maker).toHaveBeenCalledWith(expect.objectContaining({
      subject: { view: { lat: 36.2, lng: 37.1, altitude: 1.8 } },
      card: { chart: expect.objectContaining({ at: SUBJECT.timeMs / 1000, lat: 36.2, lng: 37.1, title: 'Quake near Aleppo', frame: 'tropical' }) },
    }));
    setChartCardMaker(null);
  });

  it('says why when no card could be made', async () => {
    setChartCardMaker(async () => ({ ok: false, reason: 'the globe had not drawn' }));
    act(() => openEventChart(SUBJECT));
    render(<EventChartPanel />);
    fireEvent.click(screen.getByTestId('event-chart-card'));
    await waitFor(() => expect(screen.getByTestId('event-chart-card-said')).toHaveTextContent('The card could not be made: the globe had not drawn'));
    setChartCardMaker(null);
  });
});

describe('spreadLabels', () => {
  it('keeps crowded labels apart, in order, and leaves the rest where they are', () => {
    expect(spreadLabels([10, 12, 13, 200])).toEqual([10, 18, 26, 200]);
    expect(spreadLabels([200, 10])).toEqual([200, 10]);
  });
});

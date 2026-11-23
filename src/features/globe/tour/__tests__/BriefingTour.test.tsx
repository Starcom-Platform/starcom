/**
 * The briefing tour's button, picker and caption (record
 * docs/missions/01-architecture-decisions/briefing-playlists.md, BP1, BP3, BP4).
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BriefingTourButton, BriefingTourCaption } from '../BriefingTour';
import type { BriefingTour } from '../useBriefingTour';

const tour = (over: Partial<BriefingTour> = {}): BriefingTour => ({
  state: 'off', playlist: null, caption: null, notice: null,
  start: vi.fn(), pause: vi.fn(), resume: vi.fn(), end: vi.fn(), dismissNotice: vi.fn(),
  ...over,
});
const atStop = {
  playlist: 'War & Conflict today', progress: '3 of 12 · 40 in all', title: 'Airstrike on a market',
  why: 'Deaths reported · Russo-Ukrainian war', lines: ['Reported 9 Oct 2026 08:00Z', 'from UN News'],
};

describe('the Tour button (BP1, BP3)', () => {
  it('offers the four playlists, Hero Watch\'s week last (HW13), and starts the one picked', () => {
    const t = tour();
    render(<BriefingTourButton tour={t} ready />);
    fireEvent.click(screen.getByRole('button', { name: 'Tour' }));
    const items = screen.getAllByRole('menuitem').map((el) => el.textContent);
    expect(items).toEqual(['War & Conflict today', 'Raver Watch tonight', 'Heat watch', 'Hero Watch this week']);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Raver Watch tonight' }));
    expect(t.start).toHaveBeenCalledWith('raves');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('waits for the globe, and ends a tour under way', () => {
    const { rerender } = render(<BriefingTourButton tour={tour()} ready={false} />);
    expect(screen.getByRole('button', { name: 'Tour' })).toBeDisabled();
    const running = tour({ state: 'playing', playlist: 'war' });
    rerender(<BriefingTourButton tour={running} ready />);
    fireEvent.click(screen.getByRole('button', { name: 'End tour' }));
    expect(running.end).toHaveBeenCalled();
  });
});

describe('the caption (BP4)', () => {
  it('says where it is, what it is, why it is shown, and its own lines', () => {
    render(<BriefingTourCaption tour={tour({ state: 'playing', playlist: 'war', caption: atStop })} />);
    expect(screen.getByText('War & Conflict today · 3 of 12 · 40 in all')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Airstrike on a market' })).toBeInTheDocument();
    expect(screen.getByText('Deaths reported · Russo-Ukrainian war')).toBeInTheDocument();
    expect(screen.getByText('from UN News')).toBeInTheDocument();
  });

  it('says the playlist\'s name once at the opening, and keeps a long title whole for hover and a screen reader', () => {
    const opening = { playlist: 'War & Conflict today', progress: '', title: 'War & Conflict today', why: '12 stops, worst first, by region', lines: [] };
    render(<BriefingTourCaption tour={tour({ state: 'playing', playlist: 'war', caption: opening })} />);
    expect(screen.getAllByText('War & Conflict today')).toHaveLength(1);
    expect(screen.getByText('Briefing tour')).toBeInTheDocument();
    expect(screen.getByRole('heading')).toHaveAttribute('title', 'War & Conflict today');
  });

  it('pauses and resumes, and ends', () => {
    const playing = tour({ state: 'playing', playlist: 'war', caption: atStop });
    const { rerender } = render(<BriefingTourCaption tour={playing} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(playing.pause).toHaveBeenCalled();
    const paused = tour({ state: 'paused', playlist: 'war', caption: atStop });
    rerender(<BriefingTourCaption tour={paused} />);
    expect(screen.getByText(/· Paused$/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(paused.resume).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    expect(paused.end).toHaveBeenCalled();
  });

  it('says what it is loading, and can be ended while it loads', () => {
    const loading = tour({ state: 'loading', playlist: 'heat' });
    render(<BriefingTourCaption tour={loading} />);
    expect(screen.getByText('Loading Heat watch…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'End' }));
    expect(loading.end).toHaveBeenCalled();
  });

  it('says why a tour did not play, until dismissed, and nothing when there is nothing to say', () => {
    const noticed = tour({ notice: 'Raver Watch tonight has nothing to tour right now.' });
    const { rerender, container } = render(<BriefingTourCaption tour={noticed} />);
    expect(screen.getByRole('status')).toHaveTextContent('Raver Watch tonight has nothing to tour right now.');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(noticed.dismissNotice).toHaveBeenCalled();
    rerender(<BriefingTourCaption tour={tour()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SupportFunnelRoot from '../SupportFunnelRoot';
import { markGlobeEngaged, resetGlobeEngagementForTests } from '../../Globe/globeEngagement';
import { setPipelineGuideOpen, resetPipelineGuideForTests } from '../../HUD/NewUserHint/pipelineGuideOpen';

/**
 * When the support ask opens by itself, and that closing it persists.
 *
 * WHEN (decision D-F, step 3). A first visit sees the globe, with one thing over
 * it at a time. The ask opened 15 seconds after load once the globe had painted,
 * which is about when a first visit's reports arrive and the globe turns to them,
 * and it opened over the pipeline guide. It now opens only after the person has
 * used the globe, never on a timer, and never while the pipeline guide is open.
 * Someone who never uses the globe is not asked by it; SUPPORT OPS in the bottom
 * bar still opens it (supportFunnel.entry.test.tsx).
 *
 * PERSISTENCE. handleClose called markAction('close'), which records
 * `lastAction` and nothing else. Eligibility is computed from `dismissed` and
 * `snoozeUntil`, neither of which it touched, so suppression relied entirely on
 * a component-state flag. Any remount reopened the modal over whatever the user
 * had navigated to — including the bottom navigation bar, which it then
 * swallowed clicks for. The snooze machinery was implemented, configurable
 * (snoozeDays, default 30), and unit-tested in useSupportFunnelState. Nothing
 * tested that the component ever called it. It did not.
 */

const STORAGE_KEY = 'support_funnel_v1';

const readState = () => {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
};

const closeButton = () => screen.queryByRole('button', { name: /close support modal/i });

beforeEach(() => {
  window.localStorage.clear();
  vi.stubEnv('VITE_SUPPORT_FUNNEL_ENABLED', 'true');
  resetGlobeEngagementForTests();
  resetPipelineGuideForTests();
  // paintGlobe appends straight to body, which testing-library's cleanup does
  // not own.
  document.body.querySelectorAll('canvas').forEach((c) => c.remove());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** A canvas the size of the globe; jsdom paints nothing and reports zero-size rects. */
const paintGlobe = () => {
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => ({ width: 1400, height: 700, x: 0, y: 0, top: 0, left: 0, right: 1400, bottom: 700, toJSON: () => ({}) });
  document.body.appendChild(canvas);
  return canvas;
};

describe('support funnel — opens after the person has used the globe', () => {
  it('does not open on load', () => {
    paintGlobe();
    render(<SupportFunnelRoot />);
    expect(closeButton()).toBeNull();
  });

  it('never opens on a timer, even once the globe has painted', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    paintGlobe();
    render(<SupportFunnelRoot />);

    act(() => { vi.advanceTimersByTime(120_000); });

    expect(closeButton()).toBeNull();
  });

  it('opens once the person has used the globe', () => {
    render(<SupportFunnelRoot />);

    act(() => markGlobeEngaged());

    expect(closeButton()).toBeTruthy();
  });

  it('opens when the person used the globe before it mounted', () => {
    markGlobeEngaged();
    render(<SupportFunnelRoot />);
    expect(closeButton()).toBeTruthy();
  });

  it('waits while the pipeline guide is open, and opens when it closes', () => {
    render(<SupportFunnelRoot />);

    act(() => setPipelineGuideOpen(true));
    act(() => markGlobeEngaged());
    expect(closeButton()).toBeNull();

    act(() => setPipelineGuideOpen(false));
    expect(closeButton()).toBeTruthy();
  });

  it('waits for a guide that was already open when it mounted', () => {
    setPipelineGuideOpen(true);
    markGlobeEngaged();

    render(<SupportFunnelRoot />);

    expect(closeButton()).toBeNull();
  });
});

describe('support funnel — closing persists across remounts', () => {
  const openFunnel = () => {
    markGlobeEngaged();
    return render(<SupportFunnelRoot />);
  };

  it('records a snooze in persistent storage when closed', () => {
    openFunnel();
    fireEvent.click(screen.getByRole('button', { name: /close support modal/i }));

    const state = readState();
    // Not merely lastAction: eligibility is computed from snoozeUntil.
    expect(state?.snoozeUntil).toBeTruthy();
    expect(state.snoozeUntil).toBeGreaterThan(Date.now());
  });

  it('stays closed after a remount — the actual defect', () => {
    const first = openFunnel();
    fireEvent.click(screen.getByRole('button', { name: /close support modal/i }));
    first.unmount();

    // A route change remounts this component, and the person has still used the
    // globe. Before the fix, the modal reappeared here and covered the app.
    render(<SupportFunnelRoot />);
    expect(closeButton()).toBeNull();
  });

  it('stays closed after acting on a CTA, so someone who joined is not re-prompted', () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({ closed: false } as unknown as Window);
    const first = openFunnel();

    const nostrBtn = screen.getAllByRole('button').find(b => /uplink|nostr/i.test(b.textContent || ''));
    if (nostrBtn) fireEvent.click(nostrBtn);
    first.unmount();

    render(<SupportFunnelRoot />);
    expect(closeButton()).toBeNull();
    openSpy.mockRestore();
  });

  it('reopens once the snooze window has genuinely expired', () => {
    // Snooze recorded in the past — suppression must not be permanent.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      impressionSeen: true, snoozeUntil: Date.now() - 1000, dismissed: false, lastAction: 'snooze',
    }));

    openFunnel();
    expect(closeButton()).toBeTruthy();
  });
});

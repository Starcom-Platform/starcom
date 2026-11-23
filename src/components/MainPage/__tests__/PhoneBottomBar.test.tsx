/**
 * The bar on a phone (K2, BD5): five buttons, Globe, Cases, Missions, Intel and
 * More. At 390 px the nine buttons of the desktop bar needed about 415 px, so it
 * scrolled sideways with no labels. Intel opens a sheet of the three intel apps;
 * More holds the rest, Support and Settings.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { PhoneBottomBar } from '../PhoneBottomBar';
import { PHONE_BAR } from '../phoneBar';
import { jobs } from '../../../services/jobs/jobRegistry';
import { DESTINATIONS, type Destination } from '../../Router/EnhancedApplicationRouter';
import { MAIN_SETTINGS_EVENT } from '../../Settings/settingsEvents';

const setup = (current: string | null = 'cybercommand', supportEnabled = true) => {
  const onNavigate = vi.fn();
  const onSupport = vi.fn();
  const isActive = (d: Destination) => d.app === current;
  render(<PhoneBottomBar isActive={isActive} onNavigate={onNavigate} supportEnabled={supportEnabled} onSupport={onSupport} />);
  return { onNavigate, onSupport };
};

const bar = () => screen.getByTestId('phone-bar');
const barButtons = () => within(bar()).getAllByRole('button').filter((b) => !b.closest('[data-testid^="phone-sheet"]'));

describe('PhoneBottomBar', () => {
  it('shows five buttons, each with its name', () => {
    setup();
    expect(barButtons().map((b) => b.textContent?.trim())).toEqual(['Globe', 'Cases', 'Missions', 'Intel', 'More'].map((n) => expect.stringContaining(n)));
    expect(barButtons()).toHaveLength(5);
  });

  it('reaches every application once, from the bar or from a sheet', () => {
    const reached = PHONE_BAR.flatMap((entry) => ('apps' in entry ? entry.apps : [entry.app]));
    expect([...reached].sort()).toEqual(DESTINATIONS.map((d) => d.app).sort());
  });

  it('opens an app plain from the bar', () => {
    const { onNavigate } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cases' }));
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ app: 'cases' }));
  });

  it('opens the three intel apps in a sheet, each with what it is for, and closes it on a choice', () => {
    const { onNavigate } = setup();
    const intel = screen.getByRole('button', { name: 'Intel' });
    expect(intel.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(intel);
    expect(intel.getAttribute('aria-expanded')).toBe('true');
    const sheet = screen.getByTestId('phone-sheet-intel');
    expect(intel.getAttribute('aria-controls')).toBe(sheet.id);
    const items = within(sheet).getAllByRole('button');
    expect(items.map((b) => b.getAttribute('data-app'))).toEqual(['inteldashboard', 'intelanalyzer', 'intelweb']);
    for (const app of ['inteldashboard', 'intelanalyzer', 'intelweb']) {
      const d = DESTINATIONS.find((x) => x.app === app)!;
      expect(within(sheet).getByText(d.description)).toBeTruthy();
    }
    fireEvent.click(items[1]);
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ app: 'intelanalyzer' }));
    expect(screen.queryByTestId('phone-sheet-intel')).toBeNull();
  });

  it('holds NetRunner, MarketExchange, Support and Settings under More', () => {
    const { onSupport } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const sheet = screen.getByTestId('phone-sheet-more');
    expect(within(sheet).getAllByRole('button').map((b) => b.getAttribute('data-app') ?? b.textContent?.trim()))
      .toEqual(['netrunner', 'marketexchange', expect.stringContaining('Support'), expect.stringContaining('Settings')]);
    fireEvent.click(within(sheet).getByRole('button', { name: /Support/ }));
    expect(onSupport).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('phone-sheet-more')).toBeNull();
  });

  it("opens the app's settings from More, since the phone's header has no room for their gear", () => {
    setup();
    const asked = vi.fn();
    window.addEventListener(MAIN_SETTINGS_EVENT, asked);
    try {
      fireEvent.click(screen.getByRole('button', { name: 'More' }));
      fireEvent.click(within(screen.getByTestId('phone-sheet-more')).getByRole('button', { name: /Settings/ }));
      expect(asked).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('phone-sheet-more')).toBeNull();
    } finally {
      window.removeEventListener(MAIN_SETTINGS_EVENT, asked);
    }
  });

  it('switches applications with the switch sound, from the bar and from a sheet', () => {
    setup();
    for (const name of ['Globe', 'Cases', 'Missions']) {
      expect(screen.getByRole('button', { name }).getAttribute('data-sfx')).toBe('switch');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Intel' }));
    for (const item of within(screen.getByTestId('phone-sheet-intel')).getAllByRole('button')) {
      expect(item.getAttribute('data-sfx')).toBe('switch');
    }
  });

  it('leaves Support out of More when support is off', () => {
    setup('cybercommand', false);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(within(screen.getByTestId('phone-sheet-more')).queryByRole('button', { name: /Support/ })).toBeNull();
  });

  it('marks the button whose app, or one of whose apps, is open', () => {
    setup('intelweb');
    expect(screen.getByRole('button', { name: 'Intel' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Globe' }).getAttribute('aria-current')).toBeNull();
  });

  it('opens one sheet at a time, and closes it on Escape', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Intel' }));
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByTestId('phone-sheet-intel')).toBeNull();
    expect(screen.getByTestId('phone-sheet-more')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('phone-sheet-more')).toBeNull();
  });

  // BD10: a button's marker wears the tint of its app's section; a sheet's button, the open app's.
  it("marks each button with its section's tint", () => {
    setup('intelweb');
    expect(screen.getByRole('button', { name: 'Missions' }).style.getPropertyValue('--section-tint')).toBe('var(--sc-tint-assemble)');
    expect(screen.getByRole('button', { name: 'Intel' }).style.getPropertyValue('--section-tint')).toBe('var(--sc-tint-analyse)');
  });
});

// BD14: on a phone the running jobs are a count on More, and the rail at the top of its sheet.
describe('PhoneBottomBar and the job rail', () => {
  afterEach(() => act(() => jobs.clearForTest()));

  it('counts the running jobs on More, and shows them in its sheet', () => {
    setup();
    act(() => { jobs.start({ kind: 'publish', label: 'Publish finding' }); });
    const more = screen.getByRole('button', { name: 'More' });
    expect(within(more).getByTestId('job-count').textContent).toBe('1');
    fireEvent.click(more);
    expect(within(screen.getByTestId('phone-sheet-more')).getByRole('list', { name: 'Jobs' })).toBeTruthy();
  });
});


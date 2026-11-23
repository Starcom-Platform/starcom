/**
 * What a mission works toward (the owner's RS59): the Causes and Initiatives read here are offered, the ones followed
 * first; one picked becomes a `toward` link its package carries; and once its package is locked, it says why and
 * offers nothing.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const roster = vi.hoisted(() => ({ items: [] as unknown[], started: 0 }));
vi.mock('../../../../services/roster/rosterRead', () => ({
  rosterItems: () => roster.items,
  subscribeRoster: () => () => {},
  startRosterRead: () => { roster.started += 1; return () => {}; },
}));
vi.mock('../../../../services/roster/follows', () => ({ followsCause: (address: string) => address.endsWith(':cause-followed') }));

import { MissionToward } from '../MissionToward';

const K = 'a'.repeat(64);
const item = (d: string, kind: string, title: string, createdAt: number) => ({ d, kind, title, limits: [], places: [], toward: [], counts: [], text: '', author: K, createdAt, address: `30084:${K}:${d}` });

beforeEach(() => {
  roster.started = 0;
  roster.items = [
    item('cause-new', 'cause', 'Clean water for Flint', 3),
    item('cause-followed', 'cause', 'Naloxone in every kit', 1),
    item('init-wells', 'initiative', 'Wells for Turkana', 2),
    item('story-x', 'story', 'A story is not offered', 4),
  ];
});

describe('MissionToward', () => {
  it('offers the causes and initiatives read here, followed first, reading the roster only while open, and adds one picked', () => {
    const onChange = vi.fn();
    render(<MissionToward mission={{}} onChange={onChange} />);
    expect(roster.started).toBe(0);
    fireEvent.mouseDown(screen.getByLabelText('Add a cause or initiative'));
    expect(roster.started).toBe(1);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Naloxone in every kit', 'Clean water for Flint', 'Wells for Turkana']);
    fireEvent.click(screen.getByRole('option', { name: 'Wells for Turkana' }));
    expect(onChange).toHaveBeenCalledWith([{ coordinate: `30084:${K}:init-wells`, relay: '' }]);
  });

  it('names each link by its title, takes one off, and offers no cause already linked', () => {
    const onChange = vi.fn();
    render(<MissionToward mission={{ toward: [{ coordinate: `30084:${K}:cause-new`, relay: '' }] }} onChange={onChange} />);
    const chip = screen.getByTestId('mission-toward-link');
    expect(chip).toHaveTextContent('Clean water for Flint');
    fireEvent.mouseDown(screen.getByLabelText('Add a cause or initiative'));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).not.toContain('Clean water for Flint');
    fireEvent.click(within(chip).getByTestId('CancelIcon'));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('once its package is locked, says why, and neither adds nor takes off', () => {
    render(<MissionToward mission={{ toward: [{ coordinate: `30084:${K}:cause-new`, relay: '' }] }} onChange={vi.fn()} lockedBecause="Its package is locked, so move it back to Planning to change it." />);
    expect(screen.getByTestId('mission-toward')).toHaveTextContent('Its package is locked, so move it back to Planning to change it.');
    expect(screen.queryByLabelText('Add a cause or initiative')).toBeNull();
    expect(within(screen.getByTestId('mission-toward-link')).queryByTestId('CancelIcon')).toBeNull();
  });
});

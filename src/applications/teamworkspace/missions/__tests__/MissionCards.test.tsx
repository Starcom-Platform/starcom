/**
 * The received missions as cards (decision D-MF, MF1), as a person reads them: what each asks, why, where,
 * by when, how long, and one action. Fixtures keep the shapes of Mecha Jono's packages on The Record.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { AcceptedPackage } from '../../../../services/intel/MissionPackageIngest';
import MissionCards from '../MissionCards';
import { EnhancedApplicationRouterContext } from '../../../../context/EnhancedApplicationRouterContext';

const SIGNER = 'd'.repeat(64);
const NOW = Date.parse('2026-10-16T12:00:00Z');
const DAY = 86_400_000;

function pkg(d: string, over: {
  name?: string; description?: string; tags?: string[][]; closesAt?: number; state?: string;
  metadata?: Record<string, unknown>; objectives?: Array<{ ask: string; effortMinutes?: number }>; visibility?: string;
} = {}): AcceptedPackage {
  return {
    event: { id: `evt-${d}`, pubkey: SIGNER, created_at: 1_790_000_000, kind: 30079, tags: [['d', d], ...(over.tags ?? [])], content: '', sig: '' },
    check: {
      ok: true,
      manifest: {
        id: d, name: over.name ?? d, version: '1.0.0', description: over.description ?? '', author: 'Mecha Jono',
        createdAt: '2026-10-16T09:00:00Z', license: 'CC-BY-4.0', visibility: over.visibility ?? 'public', reports: [], intel: [], assets: [],
        metadata: over.metadata ?? {},
        objectives: (over.objectives ?? []).map((o, i) => ({ id: `${d}#${i}`, ask: o.ask, effortMinutes: o.effortMinutes, done: false })),
        ...(over.closesAt || over.state ? { profile: { missionState: over.state ?? 'open', ...(over.closesAt ? { fieldWork: { jurisdiction: 'us-nm', validUntil: over.closesAt / 1000 } } : {}) } } : {}),
      },
    } as AcceptedPackage['check'],
    relay: 'wss://record.example',
  };
}

const cards = () => screen.getAllByTestId('received-package-row');
const headlines = () => cards().map((c) => within(c).getByRole('heading', { level: 3 }).textContent);

describe('MissionCards', () => {
  it('counts the open missions, at a desk and in the field, and keeps the closed behind a button', () => {
    render(<MissionCards now={NOW} onOpen={() => {}} accepted={[
      pkg('a', { tags: [['t', 'where:desk']] }),
      pkg('b', { tags: [['t', 'where:field']] }),
      pkg('c', { tags: [['t', 'where:desk']] }),
      pkg('d', { state: 'closed', tags: [['t', 'where:desk']] }),
    ]} />);
    expect(screen.getByTestId('received-packages').textContent).toMatch(/^3 missions open now · 2 at a desk · 1 in the field/);
    expect(cards()).toHaveLength(3);
    fireEvent.click(screen.getByTestId('mission-cards-closed'));
    expect(cards()).toHaveLength(4);
    expect(screen.getByTestId('mission-cards-closed').textContent).toBe('Hide the closed');
  });

  it('leads with what closes soonest', () => {
    render(<MissionCards now={NOW} onOpen={() => {}} accepted={[
      pkg('later', { name: 'Later', closesAt: NOW + 20 * DAY }),
      pkg('undated', { name: 'Undated' }),
      pkg('soon', { name: 'Soon', closesAt: NOW + 2 * DAY }),
    ]} />);
    expect(headlines()).toEqual(['Soon', 'Later', 'Undated']);
  });

  it('says when each ends, and marks the close ones', () => {
    render(<MissionCards now={NOW} onOpen={() => {}} accepted={[
      pkg('today', { name: 'Today', closesAt: NOW + 3 * 3_600_000 }),
      pkg('tomorrow', { name: 'Tomorrow', closesAt: NOW + DAY }),
      pkg('weeks', { name: 'Weeks', closesAt: NOW + 20 * DAY }),
    ]} />);
    const ends = cards().map((c) => within(c).getByTestId('mission-card-ends'));
    expect(ends.map((e) => e.textContent)).toEqual(['Ends today', 'Ends tomorrow', 'Ends in 20 days']);
    expect(ends[0].className).toMatch(/Warning/);
    expect(ends[2].className).not.toMatch(/Warning/);
  });

  it('names the place as people say it: a state, a country, or the areas within it', () => {
    render(<MissionCards now={NOW} onOpen={() => {}} accepted={[
      pkg('nm', { name: 'A', metadata: { mechaJono: { area: { country: 'us-nm', state: 'NM' } } } }),
      pkg('us', { name: 'B', metadata: { mechaJono: { area: { country: 'us' } } } }),
      pkg('la', { name: 'C', metadata: { mechaJono: { area: { country: 'us-ca', state: 'CA', areas: ['Malibu Coast', 'Ventura County Beaches', 'Orange County Coastal'] } } } }),
    ]} />);
    const places = cards().map((c) => within(c).getByTestId('mission-card-place').textContent);
    expect(places).toEqual(['New Mexico', 'United States', 'Malibu Coast and 2 more areas, California']);
  });

  it('says the effort in hours and minutes, the first three steps, and how many more', () => {
    render(<MissionCards now={NOW} onOpen={() => {}} accepted={[pkg('n', {
      objectives: [{ ask: 'One', effortMinutes: 30 }, { ask: 'Two', effortMinutes: 10 }, { ask: 'Three', effortMinutes: 30 }, { ask: 'Four', effortMinutes: 5 }],
    })]} />);
    const card = cards()[0];
    expect(within(card).getByTestId('mission-card-effort').textContent).toBe('About 1 hour 15 minutes');
    expect(within(within(card).getByTestId('mission-card-steps')).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['One', 'Two', 'Three']);
    expect(card.textContent).toContain('+ 1 more step');
  });

  // MF6: Archangel Agency's and Archangel Knights' internal missions do not belong in Starcom.
  it('never shows a package not marked Public, and says how many were not shown', () => {
    render(<MissionCards now={NOW} onOpen={() => {}} accepted={[
      pkg('public', { name: 'Public' }),
      pkg('limited', { name: 'Limited', visibility: 'limited' }),
      pkg('private', { name: 'Private', visibility: 'private' }),
      pkg('unstated', { name: 'Unstated', visibility: '' }),
    ]} />);
    expect(headlines()).toEqual(['Public']);
    expect(screen.getByTestId('received-packages').textContent).toMatch(/^1 mission open now/);
    expect(screen.getByTestId('mission-cards-not-public').textContent).toBe('3 not public, not shown');
  });

  // MF5: grants are not missions; the open ones are counted, with where they now are.
  it('draws no grant notice, and says how many open ones are in the Market Exchange', () => {
    render(<MissionCards now={NOW} onOpen={() => {}} accepted={[
      pkg('naloxone', { name: 'Naloxone' }),
      pkg('grant-a', { name: 'Grant A', tags: [['mission_family', 'grant']] }),
      pkg('grant-b', { name: 'Grant B', tags: [['t', 'category:funding.grant']] }),
      pkg('grant-closed', { name: 'Grant C', state: 'closed', tags: [['mission_family', 'grant']] }),
    ]} />);
    expect(headlines()).toEqual(['Naloxone']);
    expect(screen.getByTestId('received-packages').textContent).toMatch(/^1 mission open now/);
    expect(screen.getByTestId('mission-cards-grants').textContent).toBe('2 grant notices are in the Market Exchange, under Grants');
    expect(screen.queryByTestId('mission-cards-closed')).toBeNull();
  });

  it('opens the Market Exchange on Grants from that line, where the router can', () => {
    const navigateToApp = vi.fn();
    const grantPkg = pkg('grant-a', { name: 'Grant A', tags: [['mission_family', 'grant']] });
    const { unmount } = render(
      <EnhancedApplicationRouterContext.Provider value={{ navigateToApp } as never}>
        <MissionCards now={NOW} onOpen={() => {}} accepted={[grantPkg]} />
      </EnhancedApplicationRouterContext.Provider>,
    );
    fireEvent.click(screen.getByTestId('mission-cards-open-grants'));
    expect(navigateToApp).toHaveBeenCalledWith('marketexchange', undefined, { openTab: 'grants' });
    unmount();
    render(<MissionCards now={NOW} onOpen={() => {}} accepted={[grantPkg]} />);
    expect(screen.queryByTestId('mission-cards-open-grants')).toBeNull();
  });

  it('opens a mission with its one action', () => {
    const onOpen = vi.fn();
    const one = pkg('one', { name: 'One' });
    render(<MissionCards now={NOW} onOpen={onOpen} accepted={[one]} />);
    fireEvent.click(within(cards()[0]).getByTestId('mission-card-open'));
    expect(onOpen).toHaveBeenCalledWith(one);
  });

  it('shows who has taken it up, and what could not be verified when asked', () => {
    render(<MissionCards now={NOW} onOpen={() => {}} accepted={[pkg('a'), pkg('b')]} claimsOf={(p) => (p.event.id === 'evt-a' ? 2 : 0)}
      unverified={{ count: 3, list: <div data-testid="the-refusals" /> }} />);
    const [a, b] = ['a', 'b'].map((h) => cards().find((c) => within(c).getByRole('heading', { level: 3 }).textContent === h)!);
    expect(within(a).getByTestId('mission-card-claims').textContent).toBe('2 public claims');
    expect(within(b).queryByTestId('mission-card-claims')).toBeNull();
    expect(screen.queryByTestId('the-refusals')).toBeNull();
    fireEvent.click(screen.getByTestId('mission-cards-unverified'));
    expect(screen.getByTestId('the-refusals')).toBeTruthy();
  });

  it('says who it is from, as the publisher states the time', () => {
    render(<MissionCards now={NOW} onOpen={() => {}} accepted={[pkg('a')]} />);
    expect(cards()[0].textContent).toMatch(/From .+ · stated 16 Oct 2026 09:00Z/);
  });
});

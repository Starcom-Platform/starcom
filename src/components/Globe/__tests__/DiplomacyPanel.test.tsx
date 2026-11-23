/**
 * Diplomacy's drawer (decision D-DP, DP8, step 5): a docked panel. With a place selected, its events:
 * the two countries, CAMEO's code and its name, Goldstein on its scale (with the codebook's caveat,
 * DP11), when it was reported, how many outlets told its story, the coder's confidence and the lead
 * paragraph where known, and a link to the report. Always the primer: what CAMEO and Goldstein are
 * and what machine coding cannot tell.
 */
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';
import DiplomacyPanel from '../DiplomacyPanel';
import { gatherPlaces } from '../../../geopolitical/utils/diplomaticPlaces';
import type { RealGdeltEvent } from '../../../services/geopolitical/gdeltEventExport';

vi.mock('../../Dock/Docked', () => ({ Docked: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const { navigateToApp, addCase } = vi.hoisted(() => ({ navigateToApp: vi.fn(), addCase: vi.fn() }));
vi.mock('../../../hooks/useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp }) }));
vi.mock('../../../core/intel/adapters/caseManagerAdapter', () => ({ caseManagerAdapter: { addCase } }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({ ...(await importOriginal<typeof import('react-router-dom')>()), useNavigate: () => navigate }));
const brief = vi.hoisted(() => vi.fn((code: string | null) => (code ? { resources: [], displacement: null, sanctions: null, failed: [] } : null)));
vi.mock('../../../geopolitical/hooks/useCountryBrief', () => ({ useCountryBrief: brief }));

const ev = (id: string, over: Partial<RealGdeltEvent> = {}): RealGdeltEvent => ({
  id, actor1ISO3: 'RUS', actor2ISO3: 'UKR', eventCode: '042', eventRootCode: '04', goldsteinScale: 1.9,
  lat: 55.75, lng: 37.62, placeName: 'Moscow, Moskva, Russia', placePrecision: 'city',
  sourceUrl: `https://www.outlet-${id}.example/story`, dateAdded: '20261013090000', ...over,
});
const names = new Map([['RUS', 'Russia'], ['UKR', 'Ukraine'], ['USA', 'United States']]);

describe('Diplomacy\'s drawer', () => {
  it('asks for a place, and keeps the primer, with none selected', () => {
    render(<DiplomacyPanel place={null} countryNames={names} onClose={() => {}} country={null} />);
    expect(screen.getByText('Select a place on the globe to read what happened there.')).toBeInTheDocument();
    expect(screen.getByText('Reading these events')).toBeInTheDocument();
    expect(screen.getByText(/The Goldstein score, −10 to \+10, is fixed for each code\./)).toBeInTheDocument();
  });

  it('lists a place\'s events: who, CAMEO\'s code and name, Goldstein, when, and its report', () => {
    const [place] = gatherPlaces([ev('a', { confidence: 80, lead: true }), ev('b', { eventCode: '0871', eventRootCode: '08', goldsteinScale: 9 })]);
    render(<DiplomacyPanel place={place} countryNames={names} onClose={() => {}} country={null} />);
    expect(screen.getByRole('heading', { name: 'Moscow, Moskva, Russia' })).toBeInTheDocument();
    const rows = screen.getAllByTestId('diplomacy-event');
    expect(rows).toHaveLength(2);
    const visit = rows.find((r) => r.textContent!.includes('042'))!;
    expect(within(visit).getByText('Russia and Ukraine')).toBeInTheDocument();
    expect(visit).toHaveTextContent('CAMEO 042: “Make a visit”');
    expect(visit).toHaveTextContent('Goldstein 1.9 on a scale of −10 to +10');
    expect(visit).toHaveTextContent('Reported 13 Oct 09:00Z');
    expect(visit).toHaveTextContent("Coder's confidence 80%");
    expect(visit).toHaveTextContent('In a lead paragraph');
    expect(within(visit).getByRole('link', { name: /Read the report/ })).toHaveAttribute('href', 'https://www.outlet-a.example/story');
    const truce = rows.find((r) => r.textContent!.includes('0871'))!;
    expect(truce).toHaveTextContent('CAMEO 0871: “Declare truce, ceasefire”, a kind of 087: “De-escalate military engagement”');
    expect(screen.getByText('Goldstein scores the type of event, not the event itself.')).toBeInTheDocument();
  });

  it('puts the most widely told first', () => {
    const [place] = gatherPlaces([
      ev('once', { actor2ISO3: 'USA', dateAdded: '20261013100000' }),
      ev('twice-1'), ev('twice-2'),
    ]);
    render(<DiplomacyPanel place={place} countryNames={names} onClose={() => {}} country={null} />);
    const rows = screen.getAllByTestId('diplomacy-event');
    expect(rows[0]).toHaveTextContent('Its story was told by 2 outlets');
    expect(rows[2]).toHaveTextContent('Russia and United States');
  });

  it('shows the first 25, and says how many more', () => {
    const [place] = gatherPlaces(Array.from({ length: 30 }, (_, i) => ev(`e${i}`)));
    render(<DiplomacyPanel place={place} countryNames={names} onClose={() => {}} country={null} />);
    expect(screen.getAllByTestId('diplomacy-event')).toHaveLength(25);
    expect(screen.getByText('and 5 more events')).toBeInTheDocument();
  });

  it('closes', () => {
    const onClose = vi.fn();
    const [place] = gatherPlaces([ev('a')]);
    render(<DiplomacyPanel place={place} countryNames={names} onClose={onClose} country={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('names a country by its code where no name is known', () => {
    const [place] = gatherPlaces([ev('a', { actor2ISO3: 'XKX' })]);
    render(<DiplomacyPanel place={place} countryNames={names} onClose={() => {}} country={null} />);
    expect(screen.getByText('Russia and XKX')).toBeInTheDocument();
  });
});

/* D-DP, DP5 and DP16: a country selected while Diplomacy is drawn opens here, not as a popup. */
describe('Diplomacy\'s drawer for a selected country', () => {
  const relations = [{ counterpart: 'UKR', cooperation: 4, conflict: 2 }, { counterpart: 'USA', cooperation: 1, conflict: 0 }];
  const events = [ev('a'), ev('b', { actor2ISO3: 'USA', eventCode: '057', eventRootCode: '05' })];
  const country = { code: 'RUS', name: 'Russia', relations, events, onClose: vi.fn() };

  it('names its counterparts, with its cooperation and conflict with each, and lists its events', () => {
    render(<DiplomacyPanel place={null} countryNames={names} onClose={() => {}} country={country} />);
    expect(screen.getByRole('heading', { name: 'Russia' })).toBeInTheDocument();
    expect(screen.getByText('2 counterparts in the time shown')).toBeInTheDocument();
    const rows = screen.getAllByTestId('diplomacy-relation');
    expect(rows.map((r) => r.textContent)).toEqual(['Ukraine: cooperation 4 · conflict 2', 'United States: cooperation 1 · conflict 0']);
    expect(screen.getAllByTestId('diplomacy-event')).toHaveLength(2);
  });

  it('briefs it between its relations and its events (DP6)', () => {
    render(<DiplomacyPanel place={null} countryNames={names} onClose={() => {}} country={country} />);
    expect(brief).toHaveBeenLastCalledWith('RUS');
    const panel = screen.getByTestId('diplomacy-panel');
    const order = [screen.getByText('Relations'), screen.getByTestId('diplomacy-brief'), screen.getByText('Its cooperative events')];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(panel).toHaveTextContent('Displacement');
    expect(panel).toHaveTextContent('Resources');
  });

  it('briefs no country while a place is shown', () => {
    const [place] = gatherPlaces([ev('a')]);
    render(<DiplomacyPanel place={place} countryNames={names} onClose={() => {}} country={country} />);
    expect(screen.queryByTestId('diplomacy-brief')).toBeNull();
  });

  it('shows the place over the country, when both are selected', () => {
    const [place] = gatherPlaces([ev('a')]);
    render(<DiplomacyPanel place={place} countryNames={names} onClose={() => {}} country={country} />);
    expect(screen.getByRole('heading', { name: 'Moscow, Moskva, Russia' })).toBeInTheDocument();
  });

  it('says when the country has no events with another', () => {
    render(<DiplomacyPanel place={null} countryNames={names} onClose={() => {}} country={{ ...country, relations: [], events: [] }} />);
    expect(screen.getByText('No events with another country in the time shown.')).toBeInTheDocument();
  });

  it('lets the country go', () => {
    const onClose = vi.fn();
    render(<DiplomacyPanel place={null} countryNames={names} onClose={() => {}} country={{ ...country, onClose }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });
});

/* D-DP, DP7: "Start a case" from an event seeds one with its story's articles, and opens it in Cases. */
describe('starting a case from the drawer', () => {
  it('starts one on the event\'s story and opens it', async () => {
    addCase.mockReset().mockResolvedValue('case-9');
    navigateToApp.mockReset();
    const [place] = gatherPlaces([ev('a'), ev('b', { actor1ISO3: 'UKR', actor2ISO3: 'RUS' })]);
    render(<DiplomacyPanel place={place} countryNames={names} onClose={() => {}} country={null} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Start a case' })[0]);
    await vi.waitFor(() => expect(navigateToApp).toHaveBeenCalledWith('cases', undefined, { selectCaseId: 'case-9' }));
    const input = addCase.mock.calls[0][0];
    expect(input.title).toBe('Russia and Ukraine: Make a visit');
    expect(input.sources.map((s: { url: string }) => s.url).sort()).toEqual(['https://www.outlet-a.example/story', 'https://www.outlet-b.example/story']);
  });
});

/* D-DP, step 8: the Intel Reports about the same countries, in the time shown, each opening in Intel. */
describe('related intel in the drawer', () => {
  const [place] = gatherPlaces([ev('a')]);
  const reports = [
    { id: 'r1', title: 'Kyiv grid strikes', startDate: '2026-10-13T06:00:00.000Z', createdAt: '2026-10-13T07:00:00.000Z' },
    { id: 'r2', title: 'Moscow talks note', createdAt: '2026-10-13T05:00:00.000Z' },
  ];

  it('lists them, saying which time placed each, and opens one in Intel', () => {
    navigate.mockReset();
    render(<DiplomacyPanel place={place} countryNames={names} onClose={() => {}} country={null} relatedReports={reports as never} />);
    const rows = screen.getAllByTestId('diplomacy-related');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('Kyiv grid strikes'), expect.stringContaining('Moscow talks note'),
    ]);
    expect(rows[0]).toHaveTextContent('Happened');
    expect(rows[1]).toHaveTextContent('Written');
    fireEvent.click(within(rows[0]).getByRole('button', { name: 'Kyiv grid strikes' }));
    expect(navigate).toHaveBeenCalledWith('/intel?reportId=r1');
  });

  it('says when there are none', () => {
    render(<DiplomacyPanel place={place} countryNames={names} onClose={() => {}} country={null} relatedReports={[]} />);
    expect(screen.getByText('No Intel Reports about these countries in the time shown.')).toBeInTheDocument();
  });
});

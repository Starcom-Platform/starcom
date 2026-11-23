import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GeopoliticalLayersPopup from '../GeopoliticalLayersPopup';
import { VisualizationOverlayProvider } from '../../../../context/VisualizationOverlayContext';
import { GeoPoliticalSettingsProvider } from '../../../../hooks/useGeoPoliticalSettings';
import { publishDrawnGlobeLayers } from '../../../Globe/Hooks/drawnGlobeLayers';

const resourceZonesMock = vi.fn();
const diplomaticEventsMock = vi.fn();
const conflictEventsMock = vi.fn();
const displacementMock = vi.fn();

vi.mock('../../../../geopolitical/hooks/useResourceZonePercentiles', () => ({
  useResourceZonePercentiles: (...args: unknown[]) => resourceZonesMock(...args)
}));
vi.mock('../../../../geopolitical/hooks/useRealDiplomaticEvents', () => ({
  useRealDiplomaticEvents: (...args: unknown[]) => diplomaticEventsMock(...args)
}));
vi.mock('../../../../geopolitical/hooks/useRealConflictEvents', () => ({
  useRealConflictEvents: (...args: unknown[]) => conflictEventsMock(...args)
}));
vi.mock('../../../../geopolitical/hooks/useRealDisplacementData', () => ({
  useRealDisplacementData: (...args: unknown[]) => displacementMock(...args)
}));

const idleStatus = { loading: false, error: null, lastUpdated: null, pausedByBudget: false };

function renderPopup() {
  return render(
    <VisualizationOverlayProvider>
      <GeoPoliticalSettingsProvider>
        <GeopoliticalLayersPopup onClose={() => {}} />
      </GeoPoliticalSettingsProvider>
    </VisualizationOverlayProvider>
  );
}

describe('GeopoliticalLayersPopup — real-data status badges', () => {
  beforeEach(() => {
    resourceZonesMock.mockReset().mockReturnValue({ percentilesByCountry: new Map(), ...idleStatus });
    diplomaticEventsMock.mockReset().mockReturnValue({ events: [], ...idleStatus });
    conflictEventsMock.mockReset().mockReturnValue({ events: [], ...idleStatus });
    displacementMock.mockReset().mockReturnValue({ records: [], ...idleStatus });
  });

  it('shows no status badge when a layer has never fetched (not enabled, or genuinely idle)', () => {
    renderPopup();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(screen.queryByText(/Live ·/)).not.toBeInTheDocument();
    expect(screen.queryByText('Paused (budget)')).not.toBeInTheDocument();
  });

  it('shows "Loading…" while a fetch is in flight and nothing has ever resolved yet', () => {
    diplomaticEventsMock.mockReturnValue({ events: [], loading: true, error: null, lastUpdated: null, pausedByBudget: false });
    renderPopup();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows a "Live · Ns ago" badge once a real fetch has completed', () => {
    resourceZonesMock.mockReturnValue({
      percentilesByCountry: new Map(),
      loading: false,
      error: null,
      lastUpdated: Date.now() - 5000,
      pausedByBudget: false
    });
    renderPopup();
    expect(screen.getByText(/Live · 5s ago/)).toBeInTheDocument();
  });

  /**
   * Diplomacy reads a GDELT snapshot built with the deploy. Read five seconds
   * ago, it is not "Live · 5s ago": its data is as old as the snapshot.
   */
  it('shows a GDELT snapshot\'s own age, not the time it was read', () => {
    diplomaticEventsMock.mockReturnValue({
      events: [], loading: false, error: null, pausedByBudget: false,
      lastUpdated: Date.now() - 5000,
      asOf: Date.now() - 3 * 60 * 60 * 1000,
    });
    renderPopup();
    expect(screen.getByText('Snapshot · 3h old')).toBeInTheDocument();
    expect(screen.queryByText(/Live · 5s ago/)).not.toBeInTheDocument();
  });

  it('shows "Paused (budget)" when a layer auto-paused, even if it is also mid-refresh', () => {
    diplomaticEventsMock.mockReturnValue({ events: [], loading: true, error: null, lastUpdated: Date.now(), pausedByBudget: true });
    renderPopup();
    expect(screen.getByText('Paused (budget)')).toBeInTheDocument();
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('Conflict Zones shows Paused when either its war-events or humanitarian-crisis source paused', () => {
    conflictEventsMock.mockReturnValue({ events: [], loading: false, error: null, lastUpdated: Date.now(), pausedByBudget: true });
    displacementMock.mockReturnValue({ records: [], ...idleStatus });
    renderPopup();
    expect(screen.getByText('Paused (budget)')).toBeInTheDocument();
  });

  /*
   * Plan item 8.3b. A read that failed left the badge green and "Live", from the
   * read before it; and the age was worked out once, so an open popup said
   * "5s ago" for as long as it stayed open.
   */
  it('says the last read failed, and when one last worked, rather than "Live"', () => {
    resourceZonesMock.mockReturnValue({ percentilesByCountry: new Map(), loading: false, error: 'HTTP 503', lastUpdated: Date.now() - 5000, pausedByBudget: false });
    renderPopup();
    expect(screen.getByText('Failed · last worked 5s ago')).toBeInTheDocument();
    expect(screen.queryByText(/Live ·/)).not.toBeInTheDocument();
  });

  it('says a read failed when none has worked yet', () => {
    diplomaticEventsMock.mockReturnValue({ events: [], loading: false, error: 'HTTP 404', lastUpdated: null, pausedByBudget: false });
    renderPopup();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('Conflict Zones says failed when either of its sources failed', () => {
    conflictEventsMock.mockReturnValue({ events: [], loading: false, error: null, lastUpdated: Date.now() - 5000, pausedByBudget: false });
    displacementMock.mockReturnValue({ records: [], loading: false, error: 'timeout', lastUpdated: null, pausedByBudget: false });
    renderPopup();
    expect(screen.getByText('Failed · last worked 5s ago')).toBeInTheDocument();
  });

  it('colours each badge by what it means, from the shared status (plan item 8.3c)', () => {
    // Paused was drawn red and loading amber: amber is caution, never loading.
    resourceZonesMock.mockReturnValue({ percentilesByCountry: new Map(), loading: false, error: 'HTTP 503', lastUpdated: null, pausedByBudget: false });
    diplomaticEventsMock.mockReturnValue({ events: [], loading: false, error: null, lastUpdated: Date.now(), pausedByBudget: true });
    conflictEventsMock.mockReturnValue({ events: [], loading: true, error: null, lastUpdated: null, pausedByBudget: false });
    renderPopup();
    expect(screen.getByText('Failed').closest('[data-state]')?.getAttribute('data-state')).toBe('failed');
    expect(screen.getByText('Paused (budget)').closest('[data-state]')?.getAttribute('data-state')).toBe('paused');
    expect(screen.getByText('Loading…').closest('[data-state]')?.getAttribute('data-state')).toBe('loading');
  });

  it('keeps the age counting while it is open', () => {
    vi.useFakeTimers();
    try {
      resourceZonesMock.mockReturnValue({ percentilesByCountry: new Map(), loading: false, error: null, lastUpdated: Date.now() - 5000, pausedByBudget: false });
      renderPopup();
      expect(screen.getByText('Live · 5s ago')).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(10_000); });
      expect(screen.getByText('Live · 15s ago')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('GeopoliticalLayersPopup — national territory appearance', () => {
  beforeEach(() => {
    resourceZonesMock.mockReset().mockReturnValue({ percentilesByCountry: new Map(), ...idleStatus });
    diplomaticEventsMock.mockReset().mockReturnValue({ events: [], ...idleStatus });
    conflictEventsMock.mockReset().mockReturnValue({ events: [], ...idleStatus });
    displacementMock.mockReset().mockReturnValue({ records: [], ...idleStatus });
  });

  it('exposes every part of the territory appearance the config supports', () => {
    // The config carried border thickness, colour scheme, maritime borders,
    // label visibility and reduced motion long before anything let anyone reach
    // them. The only UI that did was mounted nowhere and styled by classes that
    // did not exist.
    renderPopup();
    for (const label of [
      'Territory fill opacity, percent',
      'Border visibility, percent',
      'Border thickness',
      'Country names, how many',
    ]) expect(screen.getByLabelText(label), label).toBeInTheDocument();

    expect(screen.getByLabelText(/Maritime borders/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Reduced motion/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Highlight on hover/i)).toBeInTheDocument();
  });

  it('remembers the chosen opacity when Fills is switched off and back on', () => {
    // "Fills" and the opacity slider both write territoryColors.opacity. The
    // checkbox used to write a hardcoded 50 on re-enable, throwing away whatever
    // the operator had set.
    renderPopup();

    const slider = screen.getByLabelText('Territory fill opacity, percent') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '73' } });
    expect(slider.value).toBe('73');

    const fills = screen.getByLabelText(/^Fills$/i);
    fireEvent.click(fills);                       // off
    expect(slider.value).toBe('0');

    fireEvent.click(screen.getByLabelText(/^Fills$/i));   // back on
    expect(slider.value).toBe('73');
  });

  it('keeps the rendering controls collapsed until asked for', () => {
    // Someone adjusting a colour should not scroll past polygon offset to
    // reach opacity.
    renderPopup();
    const details = document.querySelector('details');
    expect(details).toBeInTheDocument();
    expect((details as HTMLDetailsElement).open).toBe(false);
  });
});

describe('GeopoliticalLayersPopup — the territories\' style (decision K5)', () => {
  beforeEach(() => {
    localStorage.clear();
    resourceZonesMock.mockReset().mockReturnValue({ percentilesByCountry: new Map(), ...idleStatus });
    diplomaticEventsMock.mockReset().mockReturnValue({ events: [], ...idleStatus });
    conflictEventsMock.mockReset().mockReturnValue({ events: [], ...idleStatus });
    displacementMock.mockReset().mockReturnValue({ records: [], ...idleStatus });
  });

  const opacity = () => (screen.getByLabelText('Territory fill opacity, percent') as HTMLInputElement).value;

  it('offers Classic and Quiet, Classic chosen on a first visit, and says cards draw Quiet', () => {
    renderPopup();
    const group = screen.getByRole('radiogroup', { name: 'Territories style' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Classic' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Quiet' })).not.toBeChecked();
    expect(screen.getByText(/Four colours, no two neighbours alike/)).toBeInTheDocument();
    expect(screen.getByText(/Cards draw Quiet, without names/)).toBeInTheDocument();
  });

  it('shows the chosen style\'s own settings, so a change in one is not a change in the other', () => {
    renderPopup();
    fireEvent.change(screen.getByLabelText('Territory fill opacity, percent'), { target: { value: '20' } });
    expect(opacity()).toBe('20');
    fireEvent.click(screen.getByRole('radio', { name: 'Quiet' }));
    expect(screen.getByRole('radio', { name: 'Quiet' })).toBeChecked();
    expect(opacity()).toBe('50');
    expect(screen.getByText(/One dark tone, pale borders/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Classic' }));
    expect(opacity()).toBe('20');
  });

  it('resets the chosen style, by name, to its defaults', () => {
    renderPopup();
    fireEvent.change(screen.getByLabelText('Territory fill opacity, percent'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Classic' }));
    // Classic's own default, 35% (TS9).
    expect(opacity()).toBe('35');
  });

  it('resets rendering to a first visit\'s values: the style\'s own height, the far side drawn', () => {
    renderPopup();
    const lift = screen.getByLabelText('Fill elevation above the globe surface') as HTMLInputElement;
    fireEvent.change(lift, { target: { value: '1.2' } });
    const farSide = screen.getByLabelText('Hide far-side geometry') as HTMLInputElement;
    fireEvent.click(farSide);
    expect(farSide.checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reset rendering' }));
    // Classic's own height: the raised shell (decision K5, TS1).
    expect(lift.value).toBe('3.5');
    expect(farSide.checked).toBe(false);
  });
});

describe('GeopoliticalLayersPopup — the rest of the fine settings (decision K5, step 5)', () => {
  beforeEach(() => {
    localStorage.clear();
    resourceZonesMock.mockReset().mockReturnValue({ percentilesByCountry: new Map(), ...idleStatus });
    diplomaticEventsMock.mockReset().mockReturnValue({ events: [], ...idleStatus });
    conflictEventsMock.mockReset().mockReturnValue({ events: [], ...idleStatus });
    displacementMock.mockReset().mockReturnValue({ records: [], ...idleStatus });
  });

  const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;

  it('sets the chosen style\'s shading and dash length, today\'s at 100, each style its own', () => {
    renderPopup();
    expect(value('Fill shading, percent')).toBe('100');
    expect(value('Dash length of unsettled borders, percent')).toBe('100');
    fireEvent.change(screen.getByLabelText('Fill shading, percent'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Dash length of unsettled borders, percent'), { target: { value: '200' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Quiet' }));
    expect(value('Fill shading, percent')).toBe('100');
    expect(value('Dash length of unsettled borders, percent')).toBe('100');
    fireEvent.click(screen.getByRole('radio', { name: 'Classic' }));
    expect(value('Fill shading, percent')).toBe('40');
    expect(value('Dash length of unsettled borders, percent')).toBe('200');
  });

  it('offers each kind of border the palette, red only to a disputed one and amber only to a line of control, a choice per style', () => {
    renderPopup();
    const settled = () => screen.getByRole('radiogroup', { name: 'International border colour' });
    const disputed = screen.getByRole('radiogroup', { name: 'Disputed border colour' });
    const control = screen.getByRole('radiogroup', { name: 'Line of control border colour' });
    expect(within(settled()).getByRole('radio', { name: 'Green' })).toBeChecked();
    expect(within(settled()).queryByRole('radio', { name: 'Red' })).toBeNull();
    expect(within(settled()).queryByRole('radio', { name: 'Amber' })).toBeNull();
    expect(within(disputed).getByRole('radio', { name: 'Red' })).toBeChecked();
    expect(within(disputed).queryByRole('radio', { name: 'Amber' })).toBeNull();
    expect(within(control).getByRole('radio', { name: 'Amber' })).toBeChecked();
    expect(within(control).queryByRole('radio', { name: 'Red' })).toBeNull();
    fireEvent.click(within(settled()).getByRole('radio', { name: 'Cyan' }));
    expect(within(settled()).getByRole('radio', { name: 'Cyan' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Quiet' }));
    expect(within(settled()).getByRole('radio', { name: 'Pale' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Classic' }));
    expect(within(settled()).getByRole('radio', { name: 'Cyan' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Reset Classic' }));
    expect(within(settled()).getByRole('radio', { name: 'Green' })).toBeChecked();
  });

  it('sets how long a change of detail cross-fades: one setting, whichever style', () => {
    renderPopup();
    expect(value('Cross-fade length, milliseconds')).toBe('500');
    expect(screen.getByText('0.5s')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cross-fade length, milliseconds'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Quiet' }));
    expect(value('Cross-fade length, milliseconds')).toBe('1200');
  });
});

describe('GeopoliticalLayersPopup — the country names slider (decision K5, step 4)', () => {
  beforeEach(() => {
    localStorage.clear();
    resourceZonesMock.mockReset().mockReturnValue({ percentilesByCountry: new Map(), ...idleStatus });
    diplomaticEventsMock.mockReset().mockReturnValue({ events: [], ...idleStatus });
    conflictEventsMock.mockReset().mockReturnValue({ events: [], ...idleStatus });
    displacementMock.mockReset().mockReturnValue({ records: [], ...idleStatus });
  });

  it('says what it moves, what 0 and 60 mean, and that cards show names only when asked', () => {
    renderPopup();
    expect(screen.getByText('Country names')).toBeInTheDocument();
    expect(screen.getByText(/0 hides them; 60 is Natural Earth's own choice\. Cards show names only when a shot asks\./)).toBeInTheDocument();
  });

  it('tells a screen reader where it stands, in words', () => {
    renderPopup();
    const slider = screen.getByLabelText('Country names, how many');
    expect(slider).toHaveAttribute('aria-valuetext', "60: Natural Earth's own");
    fireEvent.change(slider, { target: { value: '0' } });
    expect(slider).toHaveAttribute('aria-valuetext', '0: no country names');
    fireEvent.change(slider, { target: { value: '30' } });
    expect(slider).toHaveAttribute('aria-valuetext', '30: fewer names');
    fireEvent.change(slider, { target: { value: '90' } });
    expect(slider).toHaveAttribute('aria-valuetext', '90: more names');
  });
});

/*
 * D-DP, DP4: the settings list every cooperative root, in CAMEO's order and words, each with its glyph
 * and colour, the same as the globe and the country popup draw it.
 */
describe('GeopoliticalLayersPopup — the diplomatic categories', () => {
  beforeEach(() => {
    localStorage.clear();
    resourceZonesMock.mockReset().mockReturnValue({ percentilesByCountry: new Map(), ...idleStatus });
    diplomaticEventsMock.mockReset().mockReturnValue({ events: [], ...idleStatus });
    conflictEventsMock.mockReset().mockReturnValue({ events: [], ...idleStatus });
    displacementMock.mockReset().mockReturnValue({ records: [], ...idleStatus });
  });

  it('lists all seven, in CAMEO\'s order, each on and with its own glyph', () => {
    renderPopup();
    const rows = screen.getAllByTestId(/^diplomatic-category-/);
    expect(rows.map((row) => within(row).getByTestId('diplomatic-name').textContent)).toEqual([
      'Intent to cooperate: said, not yet done',
      'Consultations: calls, visits, meetings',
      'Diplomatic cooperation: praise, recognition, apology',
      'Formal agreements signed',
      'Material cooperation: economic, military, intelligence',
      'Aid: economic, military, humanitarian',
      'Yielding: easing, releasing, de-escalating',
    ]);
    for (const row of rows) expect(within(row).getByRole('checkbox')).toBeChecked();
    const glyphs = rows.map((row) => row.querySelector('svg[data-symbol]')!.getAttribute('data-symbol'));
    expect(new Set(glyphs).size).toBe(7);
  });

  /*
   * D-DP, DP10: corroboration by outlets per story, and GDELT's said-or-done split, each choice
   * saying how many events it keeps with the others as they are.
   */
  it('offers outlets per story and said or done, each saying how many events it keeps', () => {
    const at = '20261013070000';
    const ev = (id: string, root: string, code: string, url: string) => ({
      id, actor1ISO3: 'RUS', actor2ISO3: 'UKR', eventCode: code, eventRootCode: root, goldsteinScale: 1,
      lat: 55.75, lng: 37.62, sourceUrl: url, dateAdded: at,
    });
    diplomaticEventsMock.mockReturnValue({
      events: [ev('a', '04', '042', 'https://a.example/1'), ev('b', '04', '042', 'https://b.example/2'), ev('c', '07', '073', 'https://a.example/3')],
      asOf: Date.UTC(2026, 9, 13, 8), ...idleStatus,
    });
    renderPopup();
    const count = (id: string) => within(screen.getByTestId(id)).getByTestId('diplomatic-count').textContent;
    expect([count('diplomatic-outlets-1'), count('diplomatic-outlets-2'), count('diplomatic-outlets-5')]).toEqual(['3', '2', '0']);
    expect([count('diplomatic-said-both'), count('diplomatic-said-said'), count('diplomatic-said-done')]).toEqual(['3', '2', '1']);
    expect(count('diplomatic-category-consult')).toBe('2');

    fireEvent.click(within(screen.getByTestId('diplomatic-outlets-2')).getByRole('radio'));
    expect(within(screen.getByTestId('diplomatic-outlets-2')).getByRole('radio')).toBeChecked();
    expect(count('diplomatic-said-done')).toBe('0');
    expect(count('diplomatic-category-aid')).toBe('0');
  });

  // D-DP, DP10, from snapshot version 3: the coder's confidence and the lead paragraph.
  it('offers the coder\'s confidence and the lead paragraph where the snapshot carries them', () => {
    const ev = (id: string, confidence: number, lead: boolean) => ({
      id, actor1ISO3: 'RUS', actor2ISO3: 'UKR', eventCode: '042', eventRootCode: '04', goldsteinScale: 1,
      lat: 55.75, lng: 37.62, sourceUrl: `https://${id}.example/1`, dateAdded: '20261013070000', confidence, lead,
    });
    diplomaticEventsMock.mockReturnValue({
      events: [ev('a', 100, true), ev('b', 50, false), ev('c', 20, true)], asOf: Date.UTC(2026, 9, 13, 8), ...idleStatus,
    });
    renderPopup();
    const count = (id: string) => within(screen.getByTestId(id)).getByTestId('diplomatic-count').textContent;
    expect([count('diplomatic-confidence-0'), count('diplomatic-confidence-50'), count('diplomatic-confidence-80')]).toEqual(['3', '2', '1']);
    expect(count('diplomatic-lead')).toBe('2');
    // Its heading as the catalogue words it: a second key of the same name once replaced it.
    expect(screen.getByText("Coder's confidence")).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('diplomatic-lead')).getByRole('checkbox'));
    expect(count('diplomatic-confidence-50')).toBe('1');
  });

  it('offers neither where the snapshot does not carry them', () => {
    diplomaticEventsMock.mockReturnValue({
      events: [{ id: 'a', actor1ISO3: 'RUS', actor2ISO3: 'UKR', eventCode: '042', eventRootCode: '04', goldsteinScale: 1,
        lat: 55.75, lng: 37.62, sourceUrl: 'https://a.example/1', dateAdded: '20261013070000' }],
      asOf: Date.UTC(2026, 9, 13, 8), ...idleStatus,
    });
    renderPopup();
    expect(screen.queryByTestId('diplomatic-confidence-0')).toBeNull();
    expect(screen.queryByTestId('diplomatic-lead')).toBeNull();
  });

  // A 0 would say the filter keeps nothing; with nothing read, it says nothing.
  it('shows no counts until the day\'s events are read', () => {
    renderPopup();
    expect(screen.queryAllByTestId('diplomatic-count')).toEqual([]);
  });

  // Drawn from its layer rather than its overlay, as the globe draws it: the popup reads the same data.
  it('reads the events whenever the globe draws the layer, not only when its overlay is on', () => {
    renderPopup();
    expect(diplomaticEventsMock).toHaveBeenLastCalledWith(false);
    act(() => publishDrawnGlobeLayers(new Set(['DiplomaticEvents'])));
    expect(diplomaticEventsMock).toHaveBeenLastCalledWith(true);
    act(() => publishDrawnGlobeLayers(new Set()));
  });

  // D-DP, DP2.
  it('offers where the marks stand: where it happened, or who was involved', () => {
    renderPopup();
    const where = within(screen.getByTestId('diplomatic-place-event')).getByRole('radio');
    const who = within(screen.getByTestId('diplomatic-place-actors')).getByRole('radio');
    expect(where).toBeChecked();
    fireEvent.click(who);
    expect(who).toBeChecked();
    expect(where).not.toBeChecked();
  });

  // D-DP, DP15: one shared time; the GDELT layers' own time sliders are gone.
  it('offers no time range of Diplomacy\'s or Conflict Zones\' own', () => {
    renderPopup();
    expect(screen.queryByText('Time Range')).toBeNull();
  });

  it('turns one off without touching the others', () => {
    renderPopup();
    fireEvent.click(within(screen.getByTestId('diplomatic-category-aid')).getByRole('checkbox'));
    expect(within(screen.getByTestId('diplomatic-category-aid')).getByRole('checkbox')).not.toBeChecked();
    expect(within(screen.getByTestId('diplomatic-category-yield')).getByRole('checkbox')).toBeChecked();
  });
});

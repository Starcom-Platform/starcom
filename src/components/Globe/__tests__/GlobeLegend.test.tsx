/**
 * The key to what is on the globe, on the globe (decision D-F).
 *
 * ─── WHY THIS COMPONENT EXISTS AT ALL ──────────────────────────────────────
 *
 * globeLegendStore has had `subscribeLegends` since it was written, and until
 * now nothing subscribed. Fourteen legend sources published what their marks
 * encode and exactly one thing read them: composeShareCard. So the app computed
 * a careful explanation of its own picture and showed it only in an exported
 * image — a person looking at the live globe had no key at all.
 *
 * ─── WHY THE SWATCHES ARE DRAWN AS SHAPES ──────────────────────────────────
 *
 * The share card draws every swatch as a filled dot. That was true enough when
 * every layer drew discs. Since step 6.3 a person can put a layer on rings, and
 * a round dot beside a globe full of rings is a key that does not match its
 * picture. Here a swatch is drawn in the shape its layer actually drew, which
 * is also what makes a shape collision visible rather than needing to be
 * announced.
 */
import React from 'react';
import { render, screen, act, within } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GlobeLegend } from '../GlobeLegend';
import { CREDITS } from '../../../features/globe/capture/sourceCredits';
import { publishLegend, resetLegendsForTest } from '../../../services/globe/globeLegendStore';
import { TemporalProvider, useTemporalState } from '../../../context/TemporalContext';

const onPhone = (matches: boolean) => vi.stubGlobal('matchMedia', vi.fn(() => ({
  matches, media: '', addEventListener: () => {}, removeEventListener: () => {},
})));

const cyber = {
  layerId: 'CyberThreats',
  layer: 'Cyber Threats',
  sizeMeans: 'listed addresses in that country',
  colorMeans: 'worst severity',
  swatches: [{ color: '#ff0000', label: 'severity 5 of 5' }],
};

describe('GlobeLegend', () => {
  beforeEach(() => resetLegendsForTest());

  /*
   * Nothing drawn, nothing to explain. An empty key sitting in the corner of a
   * globe with no layers on is chrome that says nothing.
   */
  it('renders nothing when no layer is drawing', () => {
    const { container } = render(<GlobeLegend />);

    expect(container).toBeEmptyDOMElement();
  });

  it('names each drawing layer and what its channels mean', () => {
    render(<GlobeLegend />);
    act(() => publishLegend('CyberThreats', cyber));

    expect(screen.getByText('Cyber Threats')).toBeInTheDocument();
    expect(screen.getByText(/listed addresses in that country/)).toBeInTheDocument();
    expect(screen.getByText(/worst severity/)).toBeInTheDocument();
    expect(screen.getByText('severity 5 of 5')).toBeInTheDocument();
  });

  /*
   * The store is module-level and outlives any component — it is written from
   * the layer hooks, which are in a different React tree. A legend that only
   * read it once would go stale the moment a layer finished loading.
   */
  it('says what an emblem inside a mark means, and shows each drawn with its meaning (BA14)', () => {
    render(<GlobeLegend />);
    act(() => publishLegend('IntelReports:marks', {
      layerId: 'IntelReports:marks', layer: 'Intel Reports', shapeMeans: 'document', colorMeans: 'how the report was assessed',
      emblemMeans: 'what it is about',
      emblems: [{ id: 'intel-category:conflict', meaning: 'conflict and war', icon: 'swords' }, { id: 'intel-category:other', meaning: 'another category', icon: 'tag' }],
      swatches: [{ color: '#8fa3b0', label: 'not assessed' }],
    }));
    expect(screen.getByText(/emblem: what it is about/)).toBeInTheDocument();
    const conflict = screen.getByText('conflict and war');
    expect(conflict.parentElement!.querySelector('svg[data-symbol="intel-category:conflict"]')).not.toBeNull();
    expect(screen.getByText('another category')).toBeInTheDocument();
  });

  it('names the moment a weather row holds for, and keeps rows that share a layer apart (D-W, step 5a)', () => {
    render(<GlobeLegend />);
    act(() => {
      publishLegend('EarthWeather:temperature', { layerId: 'EarthWeather', layer: 'Temperature', when: 'forecast for 7 Oct 06:00Z', swatches: [] });
      publishLegend('EarthWeather:wind', { layerId: 'EarthWeather', layer: 'Wind', when: 'forecast for 7 Oct 06:00Z', swatches: [] });
    });
    expect(screen.getByText('Temperature').textContent).toBe('Temperature, forecast for 7 Oct 06:00Z');
    expect(screen.getByText('Wind').textContent).toBe('Wind, forecast for 7 Oct 06:00Z');
  });

  it("gives Earth Weather's forecast hours once, after its last row, and no other layer any (D-W, WX12)", () => {
    render(<TemporalProvider><GlobeLegend /></TemporalProvider>);
    act(() => publishLegend('CyberThreats', cyber));
    expect(screen.queryByTestId('forecast-strip')).toBeNull();
    act(() => {
      publishLegend('EarthWeather:temperature', { layerId: 'EarthWeather', layer: 'Temperature', when: 'forecast for 7 Oct 06:00Z', swatches: [] });
      publishLegend('EarthWeather:wind', { layerId: 'EarthWeather', layer: 'Wind', when: 'forecast for 7 Oct 06:00Z', swatches: [] });
    });
    expect(screen.getAllByTestId('forecast-strip')).toHaveLength(1);
    expect(screen.getByText('Wind').parentElement!.contains(screen.getByTestId('forecast-strip'))).toBe(true);
  });

  it('follows the store as layers come and go', () => {
    render(<GlobeLegend />);
    act(() => publishLegend('CyberThreats', cyber));
    expect(screen.getByText('Cyber Threats')).toBeInTheDocument();

    act(() => publishLegend('CyberThreats', null));

    expect(screen.queryByText('Cyber Threats')).not.toBeInTheDocument();
  });

  it('draws a swatch in the shape its layer drew, not always a dot', () => {
    render(<GlobeLegend />);
    act(() => {
      publishLegend('CyberThreats', { ...cyber, shapeMeans: 'ring' });
      publishLegend('SpaceWeather', {
        layerId: 'SpaceWeather', layer: 'Space Weather', shapeMeans: 'disc',
        swatches: [{ color: '#00ff00', label: 'top decile' }],
      });
    });

    expect(screen.getByTestId('legend-swatch-CyberThreats-0')).toHaveAttribute('data-shape', 'ring');
    expect(screen.getByTestId('legend-swatch-SpaceWeather-0')).toHaveAttribute('data-shape', 'disc');
  });

  /*
   * Borders are lines, and within ONE entry a settled boundary is solid and a
   * provisional one dashed (decision D-F, 2026-09-19). So a swatch's own shape
   * wins over its entry's — the entry-level shape cannot say both.
   */
  it('draws a swatch in its own shape when it has one, over its entry\'s', () => {
    render(<GlobeLegend />);
    act(() => publishLegend('NationalTerritories:borders', {
      layerId: 'NationalTerritories:borders', layer: 'Borders',
      colorMeans: 'what kind of boundary it is — dashed where it is not settled',
      swatches: [
        { color: '#c9d4e3', label: 'international boundary', shape: 'line' },
        { color: '#ff5555', label: 'disputed', shape: 'dashed' },
      ],
    }));

    expect(screen.getByTestId('legend-swatch-NationalTerritories:borders-0')).toHaveAttribute('data-shape', 'line');
    expect(screen.getByTestId('legend-swatch-NationalTerritories:borders-1')).toHaveAttribute('data-shape', 'dashed');
  });

  // Diplomacy up close (D-DP, DP12): each kind's glyph in its colour, one line for both.
  it('draws a swatch that names a symbol as that symbol, in the swatch\'s colour', () => {
    render(<GlobeLegend />);
    act(() => publishLegend('DiplomaticEvents', {
      layerId: 'DiplomaticEvents', layer: 'Diplomacy',
      swatches: [{ color: '#00d4ff', label: 'consultations', symbol: 'diplomacy:consult' }],
    }));
    const swatch = screen.getByTestId('legend-swatch-DiplomaticEvents-0');
    expect(swatch).toHaveAttribute('data-shape', 'symbol');
    const icon = swatch.querySelector('svg[data-symbol="diplomacy:consult"]')!;
    expect(icon.getAttribute('stroke')).toBe('#00d4ff');
  });

  // Diplomacy's place GDELT put only at a country, under the Ring style (D-DP, DP13).
  it('draws a dashed ring as a ring with a dashed edge', () => {
    render(<GlobeLegend />);
    act(() => publishLegend('DiplomaticEvents', {
      layerId: 'DiplomaticEvents', layer: 'Diplomacy', shapeMeans: 'ring',
      swatches: [{ color: '#a1adb2', label: 'placed only at a country, not a city', shape: 'dashedRing' }],
    }));
    const swatch = screen.getByTestId('legend-swatch-DiplomaticEvents-0');
    expect(swatch).toHaveAttribute('data-shape', 'dashedRing');
    expect(swatch.style.borderStyle).toBe('dashed');
    expect(swatch.style.borderRadius).toBe('50%');
  });

  /*
   * The key shrinks to the room its dock has and scrolls inside: long, with War &
   * Conflict's sources, it ran down past its dock over the timeline and the LIVE
   * button at 1400×900 (found by the brief calendar's check, theatre-lens.md, TL8).
   */
  it('can shrink to its dock and scroll inside, its header staying in view', () => {
    render(<GlobeLegend />);
    act(() => publishLegend('WarConflict', { layerId: 'WarConflict', layer: 'War & Conflict', swatches: [{ color: '#ff5555', label: 'a report' }] }));
    const box = screen.getByTestId('globe-legend');
    expect(box.style.minHeight).toBe('0');
    expect(box.style.overflowY).toBe('auto');
    const header = screen.getByRole('button', { name: /KEY/ });
    expect(header.style.position).toBe('sticky');
    expect(header.style.top).toBe('0px');
  });

  // War & Conflict's outer countries are hatched where the screen draws hatching (theatre-lens.md, TL5).
  it('draws a hatched swatch as hatching', () => {
    render(<GlobeLegend />);
    act(() => publishLegend('WarConflict', {
      layerId: 'WarConflict', layer: 'War & Conflict',
      swatches: [{ color: '#ff5555', label: 'hatched: on a war\'s list, not where it is fought', shape: 'hatch' }],
    }));
    const swatch = screen.getByTestId('legend-swatch-WarConflict-0');
    expect(swatch).toHaveAttribute('data-shape', 'hatch');
    expect(swatch.style.backgroundImage).toMatch(/repeating-linear-gradient/);
  });

  // A state force's arc (theatre-lens.md, TL6): a stroke bowed upward.
  it('draws an arc swatch as a bowed line', () => {
    render(<GlobeLegend />);
    act(() => publishLegend('WarConflict', {
      layerId: 'WarConflict', layer: 'War & Conflict',
      swatches: [{ color: '#ff5555', label: 'an arc', shape: 'arc' }],
    }));
    const swatch = screen.getByTestId('legend-swatch-WarConflict-0');
    expect(swatch).toHaveAttribute('data-shape', 'arc');
    expect(swatch.style.borderTop).toMatch(/solid/);
    expect(swatch.style.borderRadius).not.toBe('');
  });

  // War & Conflict's war map keys a country's fill, which is neither a mark nor a line.
  it('draws a run of unlabelled swatches together, named once by the label after them', () => {
    render(<GlobeLegend />);
    act(() => publishLegend('NationalTerritories:countries', {
      layerId: 'NationalTerritories:countries', layer: 'Countries',
      swatches: ['#00ff41', '#00b37a', '#0094ff', '#8a6cff'].map((color, i) => ({ color, label: i < 3 ? '' : 'one colour each; neighbours never share one', shape: 'area' })),
    }));
    // The label's own element holds the run: all four swatches, before the words.
    const run = screen.getByText('one colour each; neighbours never share one');
    for (const i of [0, 1, 2, 3]) {
      expect(run.contains(screen.getByTestId(`legend-swatch-NationalTerritories:countries-${i}`))).toBe(true);
    }
  });

  it('draws an area swatch as a filled square', () => {
    render(<GlobeLegend />);
    act(() => publishLegend('WarConflict', {
      layerId: 'WarConflict', layer: 'War & Conflict',
      swatches: [{ color: '#FB594D', label: 'Major war: 8', shape: 'area' }],
    }));
    const swatch = screen.getByTestId('legend-swatch-WarConflict-0');
    expect(swatch).toHaveAttribute('data-shape', 'area');
    expect(swatch.style.borderRadius).not.toBe('50%');
  });

  /*
   * A dashed swatch that rendered solid would show the one distinction the
   * border key exists to show as no distinction at all.
   */
  it('renders a dashed swatch with a dashed stroke and a line with a solid one', () => {
    render(<GlobeLegend />);
    act(() => publishLegend('NationalTerritories:borders', {
      layerId: 'NationalTerritories:borders', layer: 'Borders',
      swatches: [
        { color: '#c9d4e3', label: 'international boundary', shape: 'line' },
        { color: '#ff5555', label: 'disputed', shape: 'dashed' },
      ],
    }));

    expect(screen.getByTestId('legend-swatch-NationalTerritories:borders-0').style.borderTopStyle).toBe('solid');
    expect(screen.getByTestId('legend-swatch-NationalTerritories:borders-1').style.borderTopStyle).toBe('dashed');
  });

  /*
   * The collision the shape switcher can create (decision D-F, step 6.3): two
   * layers on screen at once, both drawing rings, each meaning something else.
   * The person chose it and it is recorded rather than prevented — so the key
   * has to say so, or it shows two identical swatches and explains nothing.
   */
  it('says when another drawing layer uses the same shape', () => {
    render(<GlobeLegend />);
    act(() => {
      publishLegend('CyberThreats', { ...cyber, shapeMeans: 'ring' });
      publishLegend('ConflictZones:displaced', {
        layerId: 'ConflictZones:displaced', layer: 'Displacement', shapeMeans: 'ring',
        sizeMeans: 'people displaced (UNHCR)', swatches: [],
      });
    });

    expect(screen.getByTestId('legend-shape-shared-CyberThreats')).toHaveTextContent(/Displacement/);
    expect(screen.getByTestId('legend-shape-shared-ConflictZones:displaced')).toHaveTextContent(/Cyber Threats/);
  });

  it('says nothing about sharing when the shapes differ', () => {
    render(<GlobeLegend />);
    act(() => {
      publishLegend('CyberThreats', { ...cyber, shapeMeans: 'ring' });
      publishLegend('SpaceWeather', {
        layerId: 'SpaceWeather', layer: 'Space Weather', shapeMeans: 'disc', swatches: [],
      });
    });

    expect(screen.queryByTestId('legend-shape-shared-CyberThreats')).not.toBeInTheDocument();
  });

  /*
   * A layer that draws one shape publishes no shapeMeans, which is most of them.
   * Two such layers are not "sharing a shape" in any sense a reader cares about
   * — they simply never said. Announcing it would put a warning on almost every
   * pair on the globe.
   */
  it('does not call two layers a collision when neither declared a shape', () => {
    render(<GlobeLegend />);
    act(() => {
      publishLegend('CyberThreats', cyber);
      publishLegend('SpaceWeather', {
        layerId: 'SpaceWeather', layer: 'Space Weather', swatches: [],
      });
    });

    expect(screen.queryByTestId('legend-shape-shared-CyberThreats')).not.toBeInTheDocument();
  });

  /*
   * Withdrawing one half of a collision has to clear the other half's note, or
   * the key goes on warning about a layer that is no longer drawn.
   */
  it('drops the shared-shape note when the other layer stops drawing', () => {
    render(<GlobeLegend />);
    act(() => {
      publishLegend('CyberThreats', { ...cyber, shapeMeans: 'ring' });
      publishLegend('ConflictZones:displaced', {
        layerId: 'ConflictZones:displaced', layer: 'Displacement', shapeMeans: 'ring', swatches: [],
      });
    });
    expect(screen.getByTestId('legend-shape-shared-CyberThreats')).toBeInTheDocument();

    act(() => publishLegend('ConflictZones:displaced', null));

    expect(screen.queryByTestId('legend-shape-shared-CyberThreats')).not.toBeInTheDocument();
  });
});

/**
 * Where each layer's data came from, and how old it is (decision D-F, step 11).
 *
 * Globe.tsx has built a feed for every active layer for a long time — its
 * source, when it last loaded, whether it failed and why — and handed it to the
 * share card and nothing else. So an exported image said "CelesTrak did not
 * load" while the live globe beside it said nothing, and a mark from a two-hour-
 * old catalogue looked exactly like one read thirty seconds ago. These are the
 * same feeds, classified by the same feedState the card uses.
 */
describe('GlobeLegend — sources', () => {
  const NOW = Date.parse('2026-09-19T17:00:00Z');
  beforeEach(() => {
    resetLegendsForTest();
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

  it('credits each source as its terms ask, linking it and its licence (record D-L, L5)', () => {
    render(<GlobeLegend feeds={[
      { name: 'Open-Meteo weather', lastUpdated: minutesAgo(8), credits: [CREDITS.openMeteo] },
      { name: 'Submarine cable map', lastUpdated: null, timestamped: false, credits: [CREDITS.cables] },
    ]} />);
    const meteo = screen.getByTestId('legend-source-credit-Open-Meteo weather');
    const link = within(meteo).getByRole('link', { name: 'Weather data by Open-Meteo.com' });
    expect(link).toHaveAttribute('href', 'https://open-meteo.com/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(within(meteo).getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/');
    const cables = screen.getByTestId('legend-source-credit-Submarine cable map');
    expect(within(cables).getByRole('link', { name: /TeleGeography's Submarine Cable Map, 2022/ })).toHaveAttribute('href', 'https://github.com/stevesong/open_undersea_cable_map');
    expect(within(cables).getByRole('link', { name: 'CC BY-NC-SA 3.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-nc-sa/3.0/');
  });

  it('does not call a source answered moments ago "ahead": the key\'s clock is up to a tick behind (D-LS probe)', () => {
    // Read 10 s after the key last looked at the clock: its time is past the key's now, and it is not a forecast.
    render(<GlobeLegend feeds={[{ name: 'Intel Reports from the relays', lastUpdated: new Date(NOW + 10_000).toISOString() }]} />);
    const line = screen.getByTestId('legend-source-Intel Reports from the relays');
    expect(line.textContent).not.toMatch(/ahead/);
    expect(line).toHaveTextContent('as of 17:00Z · 0m ago');
  });

  it('says a forecast\'s hour still to come as ahead, never as a negative age ago (D-W)', () => {
    render(<GlobeLegend feeds={[{ name: 'NOAA GFS temperature', lastUpdated: new Date(NOW + 23 * 60_000).toISOString() }]} />);
    const line = screen.getByTestId('legend-source-NOAA GFS temperature');
    expect(line).toHaveTextContent('for 17:23Z · 23m ahead');
    expect(line.textContent).not.toMatch(/-\d/);
  });

  /*
   * The weather record's Open list (D-W): while the timeline is paused, a card says each
   * source's age from the moment shown, and the key said it only from now. Both are true;
   * the key says both.
   */
  describe('while the timeline is paused', () => {
    const PausedAt: React.FC<{ at: number | null }> = ({ at }) => {
      const temporal = useTemporalState();
      React.useEffect(() => {
        // Choosing a moment pauses there, as the timeline does.
        if (at !== null) temporal.setCurrentTime(at);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [at]);
      return null;
    };
    const keyAt = (at: number | null, lastUpdated: string) => render(
      <TemporalProvider><PausedAt at={at} /><GlobeLegend feeds={[{ name: 'NOAA', lastUpdated }]} /></TemporalProvider>,
    );

    it('says how long after the moment shown a source was read, as well as how long ago', () => {
      keyAt(Date.parse('2026-09-19T14:00:00Z'), minutesAgo(8));
      expect(screen.getByTestId('legend-source-NOAA')).toHaveTextContent('as of 16:52Z · 8m ago · 2h 52m after the moment shown');
    });

    it('and how long before it, where the source is older than the moment', () => {
      keyAt(Date.parse('2026-09-19T16:58:00Z'), minutesAgo(8));
      expect(screen.getByTestId('legend-source-NOAA')).toHaveTextContent('as of 16:52Z · 8m ago · 6m before the moment shown');
    });

    it('says nothing of a moment while live: now is the moment shown', () => {
      keyAt(null, minutesAgo(8));
      expect(screen.getByTestId('legend-source-NOAA').textContent).not.toMatch(/moment shown/);
    });
  });

  it('says when each source last loaded, in UTC marked Z, and how long ago', () => {
    render(<GlobeLegend feeds={[{ name: 'NOAA space weather', lastUpdated: minutesAgo(8) }]} />);

    expect(screen.getByTestId('legend-source-NOAA space weather')).toHaveTextContent('NOAA space weather');
    expect(screen.getByTestId('legend-source-NOAA space weather')).toHaveTextContent(/16:52Z/);
    expect(screen.getByTestId('legend-source-NOAA space weather')).toHaveTextContent(/8m ago/);
  });

  /*
   * The card's threshold, not a new one: an hour. Past it the key marks the
   * source as out of date, so an old layer does not pass for a current one.
   */
  it('marks a source past the card\'s staleness threshold', () => {
    render(<GlobeLegend feeds={[
      { name: 'Fresh', lastUpdated: minutesAgo(5) },
      { name: 'Old', lastUpdated: minutesAgo(170) },
    ]} />);

    expect(screen.getByTestId('legend-source-Fresh')).toHaveAttribute('data-state', 'loaded');
    expect(screen.getByTestId('legend-source-Old')).toHaveAttribute('data-state', 'stale');
    expect(screen.getByTestId('legend-source-Old')).toHaveTextContent(/2h 50m ago/);
  });

  it('gives the date as well once a source is more than a day old', () => {
    render(<GlobeLegend feeds={[{ name: 'Old', lastUpdated: '2026-09-17T09:30:00Z' }]} />);

    expect(screen.getByTestId('legend-source-Old')).toHaveTextContent(/17 Sep/);
  });

  it('says why a source did not load', () => {
    render(<GlobeLegend feeds={[{ name: 'CelesTrak satellite catalogue', lastUpdated: null, error: 'HTTP 403' }]} />);

    const line = screen.getByTestId('legend-source-CelesTrak satellite catalogue');
    expect(line).toHaveAttribute('data-state', 'failed');
    expect(line).toHaveTextContent(/did not load/);
    expect(line).toHaveTextContent(/HTTP 403/);
  });

  /*
   * The case the whole feed model exists for. A layer whose source failed draws
   * nothing and publishes no legend, so a key that rendered only when something
   * was drawn would stay silent exactly when it has the most to say — the same
   * silence that hid Satellites' failure for five months.
   */
  it('appears when a source failed even though nothing is drawn', () => {
    const { container } = render(
      <GlobeLegend feeds={[{ name: 'CelesTrak satellite catalogue', lastUpdated: null, error: 'HTTP 403' }]} />,
    );

    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByText(/did not load/)).toBeInTheDocument();
  });

  it('says what it cannot know rather than implying all is well', () => {
    render(<GlobeLegend feeds={[
      { name: 'Loading one', lastUpdated: null, loading: true },
      { name: 'Silent one', lastUpdated: null, unreported: true },
      { name: 'Untimed one', lastUpdated: null, timestamped: false },
    ]} />);

    expect(screen.getByTestId('legend-source-Loading one')).toHaveTextContent(/loading/i);
    expect(screen.getByTestId('legend-source-Silent one')).toHaveTextContent(/does not report/i);
    expect(screen.getByTestId('legend-source-Untimed one')).toHaveTextContent(/does not say when/i);
  });

  /*
   * "8m ago" frozen on screen becomes a lie within minutes. The age has to move
   * with the clock while the key is open.
   */
  it('keeps the age current as time passes', () => {
    render(<GlobeLegend feeds={[{ name: 'NOAA', lastUpdated: minutesAgo(8) }]} />);
    expect(screen.getByTestId('legend-source-NOAA')).toHaveTextContent(/8m ago/);

    act(() => { vi.advanceTimersByTime(5 * 60_000); });

    expect(screen.getByTestId('legend-source-NOAA')).toHaveTextContent(/13m ago/);
  });

  it('renders nothing with no layer drawing and no source to report', () => {
    const { container } = render(<GlobeLegend feeds={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * A source's standing note, in the key as on the card (decision D-F, step 13).
 *
 * The card has always printed a source's note — GDELT's "machine-coded from news
 * reports" — and the key showed only the source's state. Satellites is why this
 * matters now: its positions are PREDICTED from orbital elements, not observed,
 * and "as of 19:47Z · 0m ago" alone reads as though they were seen just now.
 */
describe('GlobeLegend — a source\'s note', () => {
  const NOW = Date.parse('2026-09-19T20:00:00Z');
  beforeEach(() => {
    resetLegendsForTest();
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const NOTE = 'Satellite positions are predicted from published orbital elements, not observed.';

  it('shows it beneath a source that loaded', () => {
    render(<GlobeLegend feeds={[{
      name: 'CelesTrak satellite catalogue', lastUpdated: new Date(NOW - 60_000).toISOString(), note: NOTE,
    }]} />);

    expect(screen.getByTestId('legend-source-note-CelesTrak satellite catalogue')).toHaveTextContent(NOTE);
  });

  /*
   * The card's rule, shared: a note describes data in the picture, so a source
   * that failed — nothing from it drawn — does not get one.
   */
  it('leaves it out when the source failed, as the card does', () => {
    render(<GlobeLegend feeds={[{
      name: 'CelesTrak satellite catalogue', lastUpdated: null, error: 'HTTP 403', note: NOTE,
    }]} />);

    expect(screen.queryByTestId('legend-source-note-CelesTrak satellite catalogue')).not.toBeInTheDocument();
  });
});

describe('GlobeLegend on a phone (BD6)', () => {
  beforeEach(() => resetLegendsForTest());

  // On a phone the key sat over the left column's notes and buttons.
  it('starts folded to its one line on a phone, and open on a wider window', () => {
    onPhone(true);
    const { unmount } = render(<GlobeLegend />);
    act(() => publishLegend('CyberThreats', cyber));
    expect(screen.getByRole('button', { name: /KEY/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Cyber Threats')).not.toBeInTheDocument();
    unmount();
    onPhone(false);
    render(<GlobeLegend />);
    expect(screen.getByRole('button', { name: /KEY/ })).toHaveAttribute('aria-expanded', 'true');
    vi.unstubAllGlobals();
  });
});


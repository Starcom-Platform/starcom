/**
 * Raver Watch's panel on the globe (the owner's decisions of 2026-10-01).
 *
 * The timeline reaches forward from here: Tonight, This weekend and the next
 * seven days each set the shared window, and Live returns to now. What cannot
 * be drawn is listed: what names no place or a region not outlined here, and
 * a warning for all of Europe, newest first; policy news apart. Each line says
 * its source and date and links to the source, never anything Raver Watch
 * does not publish: a scene-news line names the festival and the artists its
 * tags name (RN13).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { RaverWatchItem } from '../../../services/raverWatch/raverWatch';

vi.mock('../../Dock/Docked', () => ({ Docked: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
import { RaverWatchPanel } from '../RaverWatchPanel';

const NOW = Date.UTC(2026, 8, 30, 12);
const item = (over: Partial<RaverWatchItem>): RaverWatchItem => ({
  id: '30023:pk:raver-x', pubkey: 'pk', d: 'raver-x', eventId: 'e', createdAt: 1, layer: 'DrugCheckAlerts',
  title: 'A warning', source: 'A lab', validFrom: Date.UTC(2026, 8, 28) / 1000, validUntil: Date.UTC(2026, 10, 1) / 1000,
  content: 'words', level: 'amber', ...over,
});

const mount = (over: Partial<React.ComponentProps<typeof RaverWatchPanel>> = {}) => {
  const props = {
    unplaced: [] as RaverWatchItem[], news: [] as RaverWatchItem[], isLive: true,
    onWindow: vi.fn(), onLive: vi.fn(), now: () => NOW, ...over,
  };
  render(<RaverWatchPanel {...props} />);
  return props;
};

describe('RaverWatchPanel', () => {
  it('sets the shared window to tonight: the next twelve hours', () => {
    const { onWindow } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Tonight' }));
    expect(onWindow).toHaveBeenCalledWith({ start: NOW, end: NOW + 12 * 3_600_000 });
  });

  it('sets it to this weekend and to the next seven days', () => {
    const { onWindow } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'This weekend' }));
    // Every zone's Friday 00:00 to Monday 06:00 (RN11a): Thursday 10:00Z to Monday 18:00Z, the same wherever the viewer is.
    expect(onWindow).toHaveBeenLastCalledWith({ start: Date.UTC(2026, 9, 1, 10), end: Date.UTC(2026, 9, 5, 18) });
    fireEvent.click(screen.getByRole('button', { name: 'Next 7 days' }));
    expect(onWindow).toHaveBeenLastCalledWith({ start: NOW, end: NOW + 7 * 86_400_000 });
  });

  it('returns to live, and says which is chosen', () => {
    const { onLive } = mount({ isLive: false });
    expect(screen.getByRole('button', { name: 'Live' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Live' }));
    expect(onLive).toHaveBeenCalled();
  });

  it('marks Live as chosen while live', () => {
    mount({ isLive: true });
    expect(screen.getByRole('button', { name: 'Live' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tonight' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks the window chosen here while it is the one the timeline holds', () => {
    mount({ isLive: false, windowMs: { start: NOW, end: NOW + 12 * 3_600_000 } });
    expect(screen.getByRole('button', { name: 'Tonight' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('lists what is not drawn, newest first as given, with source, date and a link', () => {
    mount({
      unplaced: [
        item({ id: 'a', title: 'Alerta: pastillas con dosis excesivas de MDMA', source: 'Energy Control', region: 'europe', url: 'https://energycontrol.example/a' }),
        item({ id: 'b', title: 'A heat story', source: 'Mixmag', layer: 'SceneIncidents', category: 'heat' }),
      ],
    });
    expect(screen.getByText(/Elsewhere or unplaced \(2\)/)).toBeInTheDocument();
    const lines = screen.getAllByTestId('raver-watch-listed');
    expect(lines[0]).toHaveTextContent('Alerta: pastillas con dosis excesivas de MDMA');
    expect(lines[0]).toHaveTextContent('Energy Control');
    expect(lines[0]).toHaveTextContent('Europe');
    expect(lines[0]).toHaveTextContent('28 Sep 2026');
    expect(screen.getByRole('link', { name: /Alerta/ })).toHaveAttribute('href', 'https://energycontrol.example/a');
    expect(lines[1]).toHaveTextContent('Mixmag');
  });

  it('lists policy news apart', () => {
    mount({ news: [item({ id: 'p', title: 'Parliament votes to ban nitrous oxide at festivals', layer: 'SceneIncidents', category: 'policy' })] });
    expect(screen.getByText(/Policy and law \(1\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Elsewhere or unplaced/)).not.toBeInTheDocument();
  });

  it('lists scene news apart from policy news (RW17)', () => {
    mount({
      news: [item({ id: 'p', title: 'Parliament votes to ban nitrous oxide at festivals', layer: 'SceneIncidents', category: 'policy' })],
      sceneNews: [item({ id: 'n', title: 'Tokyo: MUTEK.JP Edition 11', layer: 'SceneEvents', sceneNews: true, level: undefined })],
    });
    expect(screen.getByText(/Policy and law \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Scene news \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/MUTEK\.JP Edition 11/)).toBeInTheDocument();
  });

  it('says the festival and the artists a scene-news line names, and only those (RN13)', () => {
    mount({
      sceneNews: [item({
        id: 'n', title: 'Tomorrowland 2027 line-up announced', layer: 'SceneEvents', sceneNews: true, level: undefined,
        festivals: [{ name: 'Tomorrowland', wikidata: 'Q1059487', country: 'be' }],
        lineup: [{ name: 'Eric Prydz', musicbrainz: '35dac7d2-0b1f-470f-9a5a-c53c8821f6d6' }, { name: 'Carl Cox' }],
      })],
    });
    const line = screen.getByTestId('raver-watch-listed');
    expect(line).toHaveTextContent('Festival: Tomorrowland (BE)');
    expect(line).toHaveTextContent('Artists: Eric Prydz, Carl Cox');
  });

  it('links only to web pages', () => {
    // The reader keeps only web links; the panel checks again, since it is what renders the href.
    mount({ unplaced: [item({ id: 'x', title: 'No link here', url: undefined }), item({ id: 'y', title: 'Not a page', url: 'javascript:alert(1)' })] });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('No link here')).toBeInTheDocument();
  });
});

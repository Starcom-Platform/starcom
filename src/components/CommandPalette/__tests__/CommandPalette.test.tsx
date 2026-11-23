/**
 * The command palette (D-CP): Ctrl/Cmd-K or / opens it (CP1); plain words find commands, places and items in their
 * sections (CP2); arrows and Enter run one, Esc closes; the last picks show first with the box empty (CP4); a source
 * that answers later (the records) joins as it answers.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import CommandPalette from '../CommandPalette';
import { openPalette, paletteOpen, registerPaletteSource, resetPaletteForTests, type PaletteResult } from '../../../features/palette/palette';

const ran: string[] = [];
const result = (id: string, section: PaletteResult['section'], title: string, extra: Partial<PaletteResult> = {}): PaletteResult => ({
  id, section, title, description: `${title} says`, run: () => { ran.push(id); }, ...extra,
});
const OFFER = [
  result('cmd:range:7d', 'commands', 'Last 7 days'),
  result('cmd:live', 'commands', 'Live'),
  result('rail:EarthWeather:weather:colour:rain', 'commands', 'Ground colour: Rain', { quiet: true, keywords: 'rain' }),
  result('country-JP', 'places', 'Japan'),
  result('item:quake', 'globe', 'M 6.4 - 120 km E of Miyako, Japan'),
  result('layer:EcologicalDisasters', 'layers', 'Ecological Disasters'),
];
const matching = (query: string) => (query
  ? OFFER.filter((r) => `${r.title} ${r.keywords ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  : OFFER);

beforeEach(() => {
  localStorage.clear();
  resetPaletteForTests();
  ran.length = 0;
  registerPaletteSource({ id: 'test', results: matching });
});
afterEach(() => { act(() => { resetPaletteForTests(); }); });

const typeIn = (words: string) => fireEvent.change(screen.getByTestId('command-palette-input'), { target: { value: words } });

describe('the command palette', () => {
  it('opens with Ctrl-K or Cmd-K, and with / where nothing is being typed', () => {
    render(<CommandPalette />);
    expect(screen.queryByTestId('command-palette')).toBeNull();
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(screen.getByTestId('command-palette')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId('command-palette-input'), { key: 'Escape' });
    expect(screen.queryByTestId('command-palette')).toBeNull();
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(paletteOpen()).not.toBeNull();
    act(() => { fireEvent.keyDown(document, { key: 'k', metaKey: true }); });
    expect(paletteOpen()).toBeNull();
    fireEvent.keyDown(document, { key: '/' });
    expect(paletteOpen()).not.toBeNull();
  });

  it('shows the commands with the box empty, the quiet ones found only by their words', () => {
    render(<CommandPalette />);
    act(() => openPalette());
    expect(screen.getByText('Last 7 days')).toBeInTheDocument();
    expect(screen.queryByText('Ground colour: Rain')).toBeNull();
    expect(screen.queryByText('Japan')).toBeNull();
    typeIn('rain');
    expect(screen.getByText('Ground colour: Rain')).toBeInTheDocument();
  });

  it('finds by the words typed, in its sections, and runs the one chosen with the arrows and Enter', () => {
    render(<CommandPalette />);
    act(() => openPalette());
    typeIn('japan');
    expect(screen.getByText('Places')).toBeInTheDocument();
    expect(screen.getByText('On the globe')).toBeInTheDocument();
    const input = screen.getByTestId('command-palette-input');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByTestId('command-palette-option-item:quake')).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(ran).toEqual(['item:quake']);
    expect(paletteOpen()).toBeNull();
  });

  // The browser's own timing (an Enter before effects run) is checked in the app (.local/scripts/palette-enter-probe.mjs):
  // the results answering at once are computed with the typing, not after it.
  it('runs what the words typed find, not what the empty box showed', () => {
    render(<CommandPalette />);
    act(() => openPalette());
    const input = screen.getByTestId('command-palette-input');
    fireEvent.change(input, { target: { value: 'live' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(ran).toEqual(['cmd:live']);
    expect(paletteOpen()).toBeNull();
  });

  it('says when nothing answers', () => {
    render(<CommandPalette />);
    act(() => openPalette());
    typeIn('snowfall');
    expect(screen.getByText('Nothing answers “snowfall”.')).toBeInTheDocument();
  });

  it('shows the last picks first with the box empty, and clears them', () => {
    render(<CommandPalette />);
    act(() => openPalette());
    typeIn('rain');
    fireEvent.click(screen.getByText('Ground colour: Rain'));
    act(() => openPalette());
    expect(screen.getByText('Recent')).toBeInTheDocument();
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent('Ground colour: Rain');
    fireEvent.click(screen.getByTestId('command-palette-clear-recent'));
    expect(screen.queryByText('Recent')).toBeNull();
  });

  it('adds a source\'s later answers as they come, for the words still typed', async () => {
    let answer: (r: PaletteResult[]) => void = () => {};
    registerPaletteSource({ id: 'records', results: (q) => (q ? new Promise((resolve) => { answer = resolve; }) : []) });
    render(<CommandPalette />);
    act(() => openPalette());
    typeIn('japan');
    await act(async () => { answer([result('record-case-1', 'records', 'Japan relief case')]); });
    expect(screen.getByText('Records')).toBeInTheDocument();
    expect(screen.getByText('Japan relief case')).toBeInTheDocument();
  });

  it('opens on one section whole, as the globe\'s layers button asks (CP5)', () => {
    render(<CommandPalette />);
    act(() => openPalette('', 'layers'));
    expect(screen.getByText('Ecological Disasters')).toBeInTheDocument();
    expect(screen.queryByText('Last 7 days')).toBeNull();
    // Typing finds as ever.
    typeIn('last');
    expect(screen.getByText('Last 7 days')).toBeInTheDocument();
  });

  it('closes on a click outside its panel', () => {
    render(<CommandPalette />);
    act(() => openPalette());
    fireEvent.click(screen.getByRole('dialog'));
    expect(paletteOpen()).toBeNull();
    vi.restoreAllMocks();
  });
});

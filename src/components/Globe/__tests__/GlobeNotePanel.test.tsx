/**
 * A note opened by a click on its mark (D-CT, CT3): its title, time, text and sources, the first
 * marked as the original; a field mission's safety limits first; several notes at one mark, each
 * to pick. Notes come from public relays: their text is text, their links http and https only.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { GlobeNotePanel } from '../GlobeNotePanel';
import { closeGlobeNotes, getGlobeNoteState, openGlobeNotes, type GlobeNote } from '../../../features/globe/noteDetail/globeNoteStore';
import { heroWatchGlobeNote, noteSet } from '../../../features/globe/noteDetail/globeNotesOf';
import type { FieldMission } from '../../../services/heroWatch/heroWatch';
import { MECHA_JONO_KEYS } from '../../../config/publicInfrastructure';
import { resetPsiLinesForTests, setPsiLinesDrawn } from '../../../services/psiWatch/psiLinesStore';
import { meridianLines } from '../../../services/psiWatch/astro/lines';
import { eventChart, resetEventChartForTests } from '../../../features/psi/eventChartPanel';

const note = (over: Partial<GlobeNote> = {}): GlobeNote => ({
  id: 'n1', kind: 'AI Watch note', title: 'Drone swarm trial reported', text: 'Line one.\nLine two.',
  timeMs: Date.UTC(2026, 9, 16, 9, 30), sources: ['https://www.example-outlet.org/story', 'https://archangel.agency/n1'],
  ...over,
});

describe('GlobeNotePanel', () => {
  afterEach(() => act(() => closeGlobeNotes()));

  // Who posted it, named at first sight, and labelled when its key is an AI agent's (the legal review; Art. 50).
  it('names who posted a note, labelled an AI agent when its key says so', () => {
    act(() => openGlobeNotes({ heading: 'AI Watch', notes: [note({ author: MECHA_JONO_KEYS[0] })] }));
    render(<GlobeNotePanel />);
    const by = screen.getByTestId('globe-note-author');
    expect(by.textContent).toMatch(/^Posted by /);
    expect(within(by).getByTestId('key-name-agent').textContent).toBe(' · AI agent');
  });

  it('names no one for a note with no author', () => {
    act(() => openGlobeNotes({ heading: 'AI Watch', notes: [note()] }));
    render(<GlobeNotePanel />);
    expect(screen.queryByTestId('globe-note-author')).toBeNull();
  });

  it('shows nothing until a mark is clicked', () => {
    const { container } = render(<GlobeNotePanel />);
    expect(container.textContent).toBe('');
  });

  it("shows the note's title, time and text, and its sources in tag order with the first the original", () => {
    act(() => openGlobeNotes({ heading: 'AI Watch', notes: [note()] }));
    render(<GlobeNotePanel />);
    expect(screen.getByRole('heading', { name: 'Drone swarm trial reported' })).toBeTruthy();
    expect(screen.getByText('AI Watch note · 16 Oct 2026 09:30Z')).toBeTruthy();
    expect(screen.getByTestId('globe-note-text').textContent).toBe('Line one.\nLine two.');
    const links = within(screen.getByTestId('globe-note-sources')).getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['example-outlet.org', 'archangel.agency']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://www.example-outlet.org/story', 'https://archangel.agency/n1']);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
    expect(within(links[0].closest('li')!).getByText('Original source')).toBeTruthy();
    expect(within(links[1].closest('li')!).queryByText('Original source')).toBeNull();
  });

  it('renders markup in a note as text, and drops links that are not http or https', () => {
    act(() => openGlobeNotes({ heading: 'AI Watch', notes: [note({
      title: '<img src=x onerror=alert(1)>',
      text: '<script>alert(1)</script><b>bold</b>',
      sources: ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'https://ok.example/a'],
    })] }));
    const { container } = render(<GlobeNotePanel />);
    expect(container.querySelector('script, img, b')).toBeNull();
    expect(screen.getByTestId('globe-note-text').textContent).toBe('<script>alert(1)</script><b>bold</b>');
    const links = within(screen.getByTestId('globe-note-sources')).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://ok.example/a']);
    expect(within(links[0].closest('li')!).getByText('Original source')).toBeTruthy();
  });

  it('caps the sources at 20', () => {
    act(() => openGlobeNotes({ heading: 'War & Conflict', notes: [note({ sources: Array.from({ length: 25 }, (_, i) => `https://s${i}.example/`) })] }));
    render(<GlobeNotePanel />);
    expect(within(screen.getByTestId('globe-note-sources')).getAllByRole('link')).toHaveLength(20);
  });

  it('says when a note names no source', () => {
    act(() => openGlobeNotes({ heading: 'Lifeboats', notes: [note({ sources: [] })] }));
    render(<GlobeNotePanel />);
    expect(screen.getByText('No source link was given.')).toBeTruthy();
  });

  it("shows a field mission's safety limits before what it asks, and its manifest's source when its event names none", () => {
    const mission = {
      id: '30079:k:fm-1', pubkey: 'k', d: 'fm-1', eventId: 'e', createdAt: 1_790_000_000, kind: 'field_mission',
      section: 'FieldMissions', title: 'Check the recalled heaters at your library', family: 'safety_recall', state: 'open',
      description: 'A recall names a heater sold at libraries.', objectives: [{ id: 'o1', ask: 'Ask the desk whether they have one.', effortMinutes: 15 }],
      limits: 'Work in pairs. Never confront anyone.', harmReduction: false, validFrom: 1_790_000_000, validUntil: 1_790_600_000,
      content: '{}', sources: ['https://www.cpsc.gov/Recalls/2026/x'],
    } as FieldMission;
    act(() => openGlobeNotes(noteSet('Field missions · New Mexico', [mission], heroWatchGlobeNote)!));
    render(<GlobeNotePanel />);
    const limits = screen.getByTestId('globe-note-limits');
    expect(limits.textContent).toContain('Work in pairs. Never confront anyone.');
    const text = screen.getByTestId('globe-note-text');
    expect(limits.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(text.textContent).toContain('Ask the desk whether they have one.');
    expect(within(screen.getByTestId('globe-note-sources')).getByRole('link').getAttribute('href')).toBe('https://www.cpsc.gov/Recalls/2026/x');
  });

  it('opens every note at a mark, the first shown, each to pick', () => {
    act(() => openGlobeNotes({ heading: 'Relief · Sudan', notes: [note({ id: 'a', title: 'First' }), note({ id: 'b', title: 'Second', text: 'Second text.' })] }));
    render(<GlobeNotePanel />);
    expect(screen.getByRole('heading', { name: 'First' })).toBeTruthy();
    expect(screen.getByText('2 notes here')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Second' }));
    expect(screen.getByRole('heading', { name: 'Second' })).toBeTruthy();
    expect(screen.getByTestId('globe-note-text').textContent).toBe('Second text.');
  });

  it('shows the big-three lenses a note carries', () => {
    act(() => openGlobeNotes({ heading: 'War & Conflict', notes: [note({ lenses: ['idc'] })] }));
    render(<GlobeNotePanel />);
    expect(screen.getByLabelText('Lens: International Death Cults').textContent).toBe('IDC');
  });

  it('closes with its button and with Escape', () => {
    act(() => openGlobeNotes({ heading: 'AI Watch', notes: [note()] }));
    render(<GlobeNotePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(getGlobeNoteState().open).toBeNull();
    act(() => openGlobeNotes({ heading: 'AI Watch', notes: [note()] }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(getGlobeNoteState().open).toBeNull();
  });

  // An item on a Planet line's band says so while the lines and their bands are drawn (D-PW, PW83); never otherwise.
  it("says which Planet line bands an item falls in, and how far from the line", () => {
    const at = Date.UTC(2026, 10, 10, 18, 30);
    const { mc } = meridianLines('Mars', new Date(at));
    act(() => setPsiLinesDrawn({ at, bodies: ['Mars'], bands: true }));
    act(() => openGlobeNotes({ heading: 'AI Watch', notes: [note()] }, { at: { lat: 0, lng: mc } }));
    render(<GlobeNotePanel />);
    const section = screen.getByTestId('globe-inspector-psi-bands');
    expect(within(section).getByText('Planet lines')).toBeInTheDocument();
    expect(section).toHaveTextContent('Mars MC band: 0 km from the line, its orb 111 km, at 10 Nov 18:30Z');
    act(() => setPsiLinesDrawn({ at, bodies: ['Mars'], bands: false }));
    expect(screen.queryByTestId('globe-inspector-psi-bands')).toBeNull();
    act(() => resetPsiLinesForTests());
  });

  // Its chart, then and now (D-PW, PW85): for an item with a time and a place.
  it('opens the chart of an item with a time and a place, and offers none without a place', () => {
    resetEventChartForTests();
    act(() => openGlobeNotes({ heading: 'AI Watch', notes: [note()] }, { at: { lat: 36.2, lng: 37.1 } }));
    const { unmount } = render(<GlobeNotePanel />);
    fireEvent.click(screen.getByTestId('globe-inspector-chart'));
    expect(eventChart()).toMatchObject({ open: true, subject: { title: 'Drone swarm trial reported', timeMs: Date.UTC(2026, 9, 16, 9, 30), place: { lat: 36.2, lng: 37.1 } } });
    unmount();
    act(() => openGlobeNotes({ heading: 'AI Watch', notes: [note()] }));
    render(<GlobeNotePanel />);
    expect(screen.queryByTestId('globe-inspector-chart')).toBeNull();
    resetEventChartForTests();
  });
});

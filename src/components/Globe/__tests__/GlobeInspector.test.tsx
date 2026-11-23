/**
 * The inspector (critique-2026-11-01, OR16, OR20–OR23; plan A5): the note panel grown into one panel for every
 * click: where the item is and on which layer, four actions the globe lends, and what else is drawn near it.
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import { GlobeNotePanel } from '../GlobeNotePanel';
import { closeGlobeNotes, getGlobeNoteState, openGlobeNotes, type GlobeNote } from '../../../features/globe/noteDetail/globeNoteStore';
import { setInspectorActions } from '../../../features/globe/inspector/inspectorActions';
import { clearTooltipRegistryForTests, registerTooltipGroup } from '../pointTooltipRegistry';
import { latLngToGlobeWorld } from '../../../utils/globeCoordinates';

const note = (over: Partial<GlobeNote> = {}): GlobeNote => ({
  id: 'gdelt:1', kind: 'War & Conflict event', title: 'Shelling reported', text: 'Words.',
  timeMs: Date.UTC(2026, 10, 1, 6), sources: ['https://www.example-outlet.org/story'], ...over,
});

function drawnNear(): THREE.Group {
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  const position = latLngToGlobeWorld(48.6, 37.9, 101);
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(position.toArray()), 3));
  const points = new THREE.Points(geometry);
  points.userData = { layer: 'Conflict Zones', tooltips: ['Fighting reported\nmore'], opens: [{ heading: 'Conflict Zones', notes: [note({ id: 'gdelt:2', title: 'Fighting reported' })] }] };
  group.add(points);
  new THREE.Scene().add(group);
  return group;
}

describe('the inspector', () => {
  afterEach(() => {
    act(() => { closeGlobeNotes(); setInspectorActions(null); });
    clearTooltipRegistryForTests();
  });

  it('says where the item is, to a tenth of a degree, and on which layer', () => {
    act(() => openGlobeNotes({ heading: 'War & Conflict', notes: [note()] }, { at: { lat: 48.5678, lng: -37.91 }, layer: 'War & Conflict' }));
    render(<GlobeNotePanel />);
    expect(screen.getByTestId('globe-inspector-place').textContent).toBe('48.6° N, 37.9° W · War & Conflict');
  });

  it('shows the period a figure states in place of "no stated time"', () => {
    act(() => openGlobeNotes({ heading: 'Turkey · Resource Zones', notes: [note({ timeMs: null, when: '2025', kind: 'Resource figure' })] }));
    render(<GlobeNotePanel />);
    expect(screen.getByTestId('globe-inspector-meta').textContent).toBe('Resource figure · 2025');
  });

  it('shows only the actions the globe lends, and only those the item can take', () => {
    act(() => openGlobeNotes({ heading: 'x', notes: [note({ timeMs: null })] }));
    render(<GlobeNotePanel />);
    expect(screen.queryByTestId('globe-inspector-card')).toBeNull();
    act(() => setInspectorActions({ makeCard: async () => {}, flyTo: () => {}, linkTo: () => 'l', showAround: () => {} }));
    expect(screen.getByTestId('globe-inspector-card')).toBeTruthy();
    // No place: no link and no flight; no time: nothing to show around.
    expect(screen.queryByTestId('globe-inspector-link')).toBeNull();
    expect(screen.queryByTestId('globe-inspector-fly')).toBeNull();
    expect(screen.queryByTestId('globe-inspector-time')).toBeNull();
  });

  it('flies to the item, shows around its time, and makes a card', () => {
    const flyTo = vi.fn();
    const showAround = vi.fn();
    const makeCard = vi.fn(async () => {});
    act(() => setInspectorActions({ makeCard, flyTo, showAround }));
    act(() => openGlobeNotes({ heading: 'x', notes: [note()] }, { at: { lat: 10, lng: 20 } }));
    render(<GlobeNotePanel />);
    fireEvent.click(screen.getByTestId('globe-inspector-fly'));
    expect(flyTo).toHaveBeenCalledWith({ lat: 10, lng: 20 });
    fireEvent.click(screen.getByTestId('globe-inspector-time'));
    expect(showAround).toHaveBeenCalledWith(Date.UTC(2026, 10, 1, 6));
    fireEvent.click(screen.getByTestId('globe-inspector-card'));
    expect(makeCard).toHaveBeenCalled();
  });

  it("copies the item's link, or shows it to select where the clipboard is refused", async () => {
    const linkTo = vi.fn(() => 'https://starcom.app/?v=1&at=10,20,0.8&open=gdelt%3A1');
    act(() => setInspectorActions({ linkTo }));
    act(() => openGlobeNotes({ heading: 'x', notes: [note()] }, { at: { lat: 10, lng: 20 } }));
    const writeText = vi.fn(() => Promise.reject(new Error('refused')));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<GlobeNotePanel />);
    fireEvent.click(screen.getByTestId('globe-inspector-link'));
    expect(linkTo).toHaveBeenCalledWith({ lat: 10, lng: 20 }, 'gdelt:1');
    await waitFor(() => expect((screen.getByTestId('globe-inspector-link-shown') as HTMLInputElement).value).toMatch(/open=gdelt%3A1$/));
  });

  it('lists what else is drawn near it, and opens one with a click', () => {
    registerTooltipGroup(drawnNear());
    act(() => setInspectorActions({ altitude: () => 0.3, window: () => null }));
    act(() => openGlobeNotes({ heading: 'War & Conflict', notes: [note()] }, { at: { lat: 48.5, lng: 37.8 }, layer: 'War & Conflict' }));
    render(<GlobeNotePanel />);
    const related = screen.getByTestId('globe-inspector-related');
    expect(related.textContent).toMatch(/Fighting reported/);
    expect(related.textContent).toMatch(/Conflict Zones · 1\d km/);
    fireEvent.click(screen.getByText('Fighting reported'));
    expect(getGlobeNoteState().open?.notes[0].id).toBe('gdelt:2');
    expect(getGlobeNoteState().open?.at?.lat).toBeCloseTo(48.6, 3);
  });
});

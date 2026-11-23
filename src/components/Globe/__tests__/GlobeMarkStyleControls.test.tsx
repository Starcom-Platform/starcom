/**
 * The switcher: three icon buttons that restyle the layer in front
 * (decision D-F, step 6, part 2).
 *
 * ─── WHY IT CAN BE ABSENT ──────────────────────────────────────────────────
 *
 * The hardest property here is the one about NOT rendering. A style is only a
 * feature on a layer that reads it, and two kinds of layer do not: ResourceZones
 * draws a mesh and line batches and never will, and the layers still awaiting
 * their wiring would store a choice nothing draws. On both, three buttons whose
 * clicks change nothing on screen read as a broken control — which is the exact
 * failure this step warned about when it said "a style nothing reads is a
 * setting, not a feature". So the slot renders nothing and the arrangement
 * closes over it.
 *
 * It names the layer it is acting on, because it acts on whichever layer is in
 * front and a person switching modes must never have to guess what a click will
 * restyle.
 */
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import { GlobeMarkStyleControls } from '../GlobeMarkStyleControls';
import { DEFAULT_MARKER_STYLES, MARKER_STYLE_SUPPORT, type MarkerStyleChoices } from '../markerStyles';
import type { GlobeLayerId } from '../Hooks/useGlobeLayerControl';

/** A layer this commit wired, whatever the wired set grows to later. */
const honoured = (Object.keys(MARKER_STYLE_SUPPORT) as GlobeLayerId[])
  .find((id) => MARKER_STYLE_SUPPORT[id] === 'honoured') as GlobeLayerId;

const notYet = (Object.keys(MARKER_STYLE_SUPPORT) as GlobeLayerId[])
  .find((id) => MARKER_STYLE_SUPPORT[id] === 'not-yet');

const renderFor = (layerId: GlobeLayerId, styles: MarkerStyleChoices = {}, onPick = vi.fn()) => {
  render(<GlobeMarkStyleControls layerId={layerId} styles={styles} onPick={onPick} />);
  return onPick;
};

describe('GlobeMarkStyleControls', () => {
  it('offers one button per style', () => {
    renderFor(honoured);

    expect(screen.getByRole('button', { name: /disc/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /glow/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ring/i })).toBeInTheDocument();
  });

  /*
   * It acts on whichever layer is in front, so the label is what stops a click
   * restyling something the person was not looking at.
   */
  it('names the layer it is acting on', () => {
    renderFor('IntelReports');

    expect(screen.getByTestId('globe-mark-style')).toHaveTextContent(/intel reports/i);
  });

  it('shows which style is in use', () => {
    renderFor(honoured, { [honoured]: 'glow' });

    expect(screen.getByRole('button', { name: /glow/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /disc/i })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: /ring/i })).toHaveAttribute('aria-pressed', 'false');
  });

  /*
   * A person who has never chosen still sees the truth about what is drawn, and
   * for every layer today that is a disc.
   */
  it('shows the default as in use when nobody has chosen', () => {
    renderFor(honoured, {});

    // Intel Reports' default is a halo disc, Glow (plan H4); any other honoured layer's a disc.
    expect(screen.getByRole('button', { name: new RegExp(DEFAULT_MARKER_STYLES[honoured], 'i') })).toHaveAttribute('aria-pressed', 'true');
  });

  it('reports the layer and the style when a button is pressed', () => {
    const onPick = renderFor(honoured, {});

    fireEvent.click(screen.getByRole('button', { name: /ring/i }));

    expect(onPick).toHaveBeenCalledWith(honoured, 'ring');
  });

  it('does not report anything until a button is pressed', () => {
    const onPick = renderFor(honoured, {});

    expect(onPick).not.toHaveBeenCalled();
  });

  /*
   * ResourceZones draws a THREE.Mesh, border line batches and trade-route
   * connection lines, and calls buildScreenPoints nowhere. There is nothing for
   * a style to govern, so there is nothing to offer.
   */
  it('renders nothing for a layer that has no marks to style', () => {
    renderFor('ResourceZones');

    expect(screen.queryByTestId('globe-mark-style')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  /*
   * And nothing for a layer whose wiring is still remaining work — otherwise
   * this step would ship the inert control it exists to avoid.
   */
  it('renders nothing for a layer that does not read the style yet', () => {
    if (!notYet) return; // every layer wired: nothing left to prove here
    renderFor(notYet);

    expect(screen.queryByTestId('globe-mark-style')).not.toBeInTheDocument();
  });
});

/*
 * The switcher offers the same three styles on every layer (decision D-F, 6.3).
 *
 * It did not until 2026-09-18. A glow was additive light drawn BEHIND a disc as
 * two objects inside useScreenMarkLayer, so a layer calling buildScreenPoints
 * directly would have drawn the light alone — and a button that makes a layer
 * disappear is the same defect as a button that does nothing. The switcher
 * withheld glow from those layers for that reason.
 *
 * GLOW_QUAD_SCALE put the core and the halo in one object, so the reason is
 * gone. These tests pin that the exception did not survive it, on the two layers
 * that had it: Diplomacy and Eco Disasters. (Satellites was the third, but it is
 * not honoured yet, so it renders no switcher — asserting there would pass for
 * the wrong reason.)
 */
describe('GlobeMarkStyleControls: the styles it offers', () => {
  it('offers the glow on a layer that once had it withheld', () => {
    for (const layerId of ['DiplomaticEvents', 'EcologicalDisasters'] as const) {
      renderFor(layerId);

      expect(screen.getByRole('button', { name: /disc/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /ring/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /glow/i })).toBeInTheDocument();
      cleanup();
    }
  });

  it('describes the glow as a halo around a mark, not as brightening a crowd', () => {
    // The copy promised what the additive bloom did. A control that describes
    // the wrong behaviour is a control nobody can predict.
    renderFor('IntelReports');

    expect(screen.getByRole('button', { name: /glow/i }))
      .toHaveAttribute('title', expect.stringMatching(/halo/i));
  });

  /*
   * One row, the layer's name beside its buttons (BD4). Stacked, it took 55px of
   * a left column that already ran over the clock at 1280×720. jsdom lays nothing
   * out, so this reads the direction; the layout audit measures the rest.
   */
  it('sits in one row, the name beside the buttons', () => {
    renderFor(honoured);

    expect(screen.getByTestId('globe-mark-style').style.flexDirection).toBe('row');
  });
});


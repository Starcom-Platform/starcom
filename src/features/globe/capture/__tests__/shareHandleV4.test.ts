/**
 * The contract gains the controls an agent needs to reach more than one view.
 *
 * ─── WHAT WAS WRONG ────────────────────────────────────────────────────────
 *
 * v3 could move the camera and capture, and could not change WHAT was drawn.
 * Which layer renders comes from `visualizationMode.subMode`, which defaults to
 * CyberCommand/IntelReports, persists to localStorage and is not addressable by
 * URL. A fresh headless browser — which is what an autonomous agent is — got
 * Intel Reports and nothing else, so ten of eleven visualizations were
 * unreachable without a person clicking the HUD.
 *
 * Confirmed rather than assumed: a card composed headlessly came back with
 * `layersShown: ["Intel Reports"]`.
 *
 * ─── WHY THESE FIVE ────────────────────────────────────────────────────────
 *
 * `listLayers`     discovery. Without it an agent hardcodes ids and silently
 *                  drifts from the catalogue the app actually has.
 * `setLayer`       the blocker itself.
 * `pinLayers`      several layers at once. The pin machinery already existed
 *                  and nothing outside the HUD could reach it.
 * `setMarkerStyle` the per-layer look, so a run of posts reads as one system.
 * `whenReady`      the optimisation. An agent that cannot ask "is it drawable
 *                  yet" must guess a settle time: guess low and it captures a
 *                  half-loaded globe, guess high and it burns wall clock. Both
 *                  failures end in a reload, and a reload is the only thing in
 *                  this system that actually costs bandwidth.
 *
 * All five are ADDITIVE. Every v3 call keeps working, which matters because
 * the agent ships on its own schedule and cannot be recompiled with this.
 */
import { describe, it, expect } from 'vitest';
import {
  SHARE_HANDLE_CONTRACT,
  SHARE_HANDLE_VERSION,
  SHARE_HANDLE_FINGERPRINT,
  stableContractString,
  expectedHandleKeys,
} from '../shareHandleContract';

describe('the contract declares the new controls', () => {
  it('is at version 4 or later: v5 added to it and moved nothing', () => {
    expect(SHARE_HANDLE_VERSION).toBeGreaterThanOrEqual(4);
  });

  it('still declares every v3 method, unchanged', () => {
    // The whole point of additive: an agent written against v3 keeps working.
    for (const method of ['compose', 'captureFrame', 'getView', 'setView', 'recordClip']) {
      expect(SHARE_HANDLE_CONTRACT.methods).toHaveProperty(method);
    }
    // v13 added `fit` after them; additive, so these stay first and in order.
    expect(SHARE_HANDLE_CONTRACT.methods.compose.options.slice(0, 2)).toEqual(['scale', 'preset']);
    expect(SHARE_HANDLE_CONTRACT.methods.getView.args).toBe(0);
  });

  it('declares the five new ones', () => {
    for (const method of ['listLayers', 'setLayer', 'pinLayers', 'setMarkerStyle', 'whenReady']) {
      expect(SHARE_HANDLE_CONTRACT.methods).toHaveProperty(method);
    }
  });

  it('says what listLayers returns, so an agent need not probe for it', () => {
    expect(SHARE_HANDLE_CONTRACT.returns.listLayers)
      .toEqual(['id', 'label', 'category', 'implemented', 'active', 'primary', 'pinned']);
  });

  it('names the marker styles it accepts', () => {
    expect(SHARE_HANDLE_CONTRACT.markerStyles).toEqual(['disc', 'glow', 'ring']);
  });

  it('lists every layer, so an agent can plan a run without loading the app', () => {
    // A roster in the contract is what lets a caller decide what to capture
    // before it has spent a page load finding out.
    // Eleven at v4; Raver Watch's six joined at v8 (shareHandleV8.test.ts).
    expect(SHARE_HANDLE_CONTRACT.layers.length).toBeGreaterThanOrEqual(11);
    expect(SHARE_HANDLE_CONTRACT.layers).toEqual(expect.arrayContaining([
      'IntelReports', 'CyberThreats', 'Satellites', 'CommHubs', 'RLSH',
      'DiplomaticEvents', 'ResourceZones', 'ConflictZones',
      'SpaceWeather', 'EcologicalDisasters', 'EarthWeather',
    ]));
  });
});

describe('the fingerprint holds the shape still', () => {
  it('matches the contract as recorded', () => {
    // This is the check that makes the version honest: editing the shape
    // without editing the version fails here, with the diff printed.
    expect(stableContractString(SHARE_HANDLE_CONTRACT)).toBe(SHARE_HANDLE_FINGERPRINT);
  });

  it('still exposes every v4 key', () => {
    // v5 added three; the v4 surface an agent relies on is all still there.
    expect(expectedHandleKeys()).toEqual(expect.arrayContaining([
      'captureFrame', 'compose', 'getView', 'listLayers', 'pinLayers',
      'recordClip', 'setLayer', 'setMarkerStyle', 'setView', 'version', 'whenReady',
    ]));
  });
});

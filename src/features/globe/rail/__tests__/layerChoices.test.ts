/**
 * A layer's choices on the rail (critique-2026-11-01, OR12; plan A2): its default until made; the default given
 * again unmakes it, so a link carries only what differs; a link's `lc` opens the layers as they were seen, and
 * anything malformed in one is ignored.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyLayerChoicesFromLink, encodeLayerChoices, layerChoice, layerChoicesOf, resetLayerChoicesForTests, setLayerChoice, setLayerChoices,
} from '../layerChoices';

describe('layerChoices', () => {
  beforeEach(() => { localStorage.clear(); resetLayerChoicesForTests(); });

  it('gives the default until a choice is made, and forgets the choice when the default is chosen again', () => {
    expect(layerChoice('WarConflict', 'war:arcs', true)).toBe(true);
    setLayerChoice('WarConflict', 'war:arcs', false, true);
    expect(layerChoice('WarConflict', 'war:arcs', true)).toBe(false);
    resetLayerChoicesForTests();
    expect(layerChoice('WarConflict', 'war:arcs', true)).toBe(false);
    setLayerChoice('WarConflict', 'war:arcs', true, true);
    expect(layerChoicesOf('WarConflict')).toEqual({});
  });

  it('keeps a choice of the wrong type from standing in for the default', () => {
    setLayerChoices('ConflictZones', { 'conflict:size': true });
    expect(layerChoice('ConflictZones', 'conflict:size', '1.25')).toBe('1.25');
  });

  it("writes a link's lc for the layers named, and reads it back over this browser's choices", () => {
    setLayerChoice('WarConflict', 'war:map', false, true);
    setLayerChoice('ResourceZones', 'resources:types', ['oil', 'gas']);
    const lc = encodeLayerChoices(['WarConflict', 'ResourceZones', 'Satellites']);
    expect(lc).toMatch(/^[A-Za-z0-9_-]+$/);
    localStorage.clear();
    resetLayerChoicesForTests();
    expect(applyLayerChoicesFromLink(`?mode=GeoPolitical&lc=${lc}`)).toBe(true);
    expect(layerChoice('WarConflict', 'war:map', true)).toBe(false);
    expect(layerChoice<readonly string[]>('ResourceZones', 'resources:types', [])).toEqual(['oil', 'gas']);
    expect(encodeLayerChoices(['Satellites'])).toBe('');
  });

  it('ignores a malformed link, and anything in one that is not a layer, a key and a plain value', () => {
    expect(applyLayerChoicesFromLink('?lc=%%%')).toBe(false);
    const evil = btoa(JSON.stringify({ '<script>': { a: 1 }, WarConflict: { 'war:arcs': false, 'bad key!': true, deep: { x: 1 } } }));
    expect(applyLayerChoicesFromLink(`?lc=${evil}`)).toBe(true);
    expect(layerChoicesOf('WarConflict')).toEqual({ 'war:arcs': false });
  });
});

describe("the share handle's choices (contract v68)", () => {
  beforeEach(() => { localStorage.clear(); resetLayerChoicesForTests(); });

  it("sets a layer's choices for this page only, over the person's, never saving them; null returns to the person's", async () => {
    const { setPageLayerChoices, pageSetLayerChoices } = await import('../layerChoices');
    setLayerChoice('WarConflict', 'war:map', false, true);
    setPageLayerChoices('WarConflict', { 'war:map': true, 'war:arcs': false });
    expect(layerChoice('WarConflict', 'war:map', true)).toBe(true);
    expect(layerChoice('WarConflict', 'war:arcs', true)).toBe(false);
    expect(pageSetLayerChoices('WarConflict')).toBe(true);
    expect(JSON.parse(localStorage.getItem('starcom:layer-choices')!)).toEqual({ WarConflict: { 'war:map': false } });
    setPageLayerChoices('WarConflict', null);
    expect(layerChoice('WarConflict', 'war:map', true)).toBe(false);
    expect(pageSetLayerChoices('WarConflict')).toBe(false);
  });

  it("opens a link's choices on the first read", () => {
    const lc = btoa(JSON.stringify({ WarConflict: { 'war:deaths': false } })).replace(/=+$/, '');
    window.history.replaceState(null, '', `/?lc=${lc}`);
    expect(layerChoice('WarConflict', 'war:deaths', true)).toBe(false);
    window.history.replaceState(null, '', '/');
  });
});

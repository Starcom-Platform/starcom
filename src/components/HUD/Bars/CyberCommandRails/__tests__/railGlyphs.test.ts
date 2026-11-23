/**
 * The rails draw glyphs from the registry (K3): each globe mode and each layer
 * its own, the same one quick access draws. They were emoji, and quick access
 * had different ones for six of the same layers.
 */
import { describe, it, expect } from 'vitest';
import { PRIMARY_RAIL_MODES, SECONDARY_RAIL_MODES } from '../railModeConfig';
import { GLYPHS } from '../../../../../symbols/uiSymbols';

describe('the rails', () => {
  it('give each globe mode its own glyph', () => {
    for (const m of PRIMARY_RAIL_MODES) {
      expect(m.glyph).toBe(`mode:${m.mode}`);
      expect(GLYPHS[m.glyph]).toBeDefined();
    }
  });

  it('give each layer its own glyph', () => {
    const layers = Object.values(SECONDARY_RAIL_MODES).flat();
    expect(layers.length).toBeGreaterThan(10);
    for (const l of layers) {
      expect(l.glyph).toBe(`layer:${l.subMode}`);
      expect(GLYPHS[l.glyph], l.subMode).toBeDefined();
    }
  });
});

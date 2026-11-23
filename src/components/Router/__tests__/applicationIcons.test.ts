/**
 * Every application is drawn by its glyph (K3, plan block D, step 4).
 *
 * The registry carried an emoji each. IntelWeb's was once U+FFFD, a decoder's
 * replacement character, drawn as the "unknown" box wherever its icon showed
 * (decision D-F, step 3.5). A glyph is a name in the registry, so it is drawn
 * from vector data or not at all.
 */
import { describe, it, expect } from 'vitest';
import { APPLICATIONS } from '../EnhancedApplicationRouter';
import { GLYPHS } from '../../../symbols/uiSymbols';

describe('the application registry', () => {
  it('names a registry glyph for every application, its own', () => {
    for (const app of Object.values(APPLICATIONS)) {
      expect(app.glyph, app.id).toBe(`app:${app.id}`);
      expect(GLYPHS[app.glyph], app.id).toBeDefined();
    }
  });

  it('carries no emoji where an icon should be', () => {
    for (const app of Object.values(APPLICATIONS)) {
      expect(JSON.stringify(app), app.id).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

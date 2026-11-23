/**
 * A meaning drawn as its glyph (K3): `<Glyph name="app:cases" />`.
 *
 * The name picks the icon and its hue as one choice, so no call site picks a
 * colour (interface-upgrade.md, "Glyphs"). Both hues draw in the colour of what
 * they sit in for now; the sections' tints come with the swatch sheet (BD2).
 */
import React from 'react';
import { SymbolIcon } from './SymbolIcon';
import { GLYPHS, type GlyphHue, type GlyphName } from './uiSymbols';

const HUE: Record<GlyphHue, string> = { control: 'currentColor', note: 'currentColor' };

export interface GlyphProps {
  name: GlyphName;
  /** Its width and height, in CSS pixels. */
  size?: number;
  className?: string;
  /** Said to a screen reader; leave it out when a label beside it says the same. */
  title?: string;
}

export const Glyph: React.FC<GlyphProps> = ({ name, size = 18, className, title }) => {
  const entry = GLYPHS[name];
  return <SymbolIcon symbol={entry} size={size} color={HUE[entry.hue]} className={className} title={title} />;
};

export default Glyph;

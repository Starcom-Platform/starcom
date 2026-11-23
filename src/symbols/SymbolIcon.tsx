/**
 * A registry symbol drawn as an inline SVG (K3): the same icon data the globe's
 * glyphs bake, so a symbol reads the same in a menu, a key and on the globe.
 */
import React from 'react';
import type { SymbolEntry } from './symbolRegistry';

export interface SymbolIconProps {
  symbol: SymbolEntry;
  /** Its width and height, in CSS pixels. */
  size?: number;
  /** Its stroke colour; the surrounding text's by default. */
  color?: string;
  strokeWidth?: number;
  className?: string;
  /** Said to a screen reader; decorative when absent. */
  title?: string;
}

export const SymbolIcon: React.FC<SymbolIconProps> = ({ symbol, size = 16, color = 'currentColor', strokeWidth = 2, className, title }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    role={title ? 'img' : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    data-symbol={symbol.id}
  >
    {symbol.icon.map(([tag, attrs], i) => React.createElement(tag, {
      key: i,
      ...Object.fromEntries(Object.entries(attrs).map(([name, value]) => [name, value === 'currentColor' ? color : value])),
    }))}
  </svg>
);

/**
 * What IntelWeb's colours mean (decision D-IW, IW12): each colour the notes are in, by the way chosen,
 * and that hubs, stubs and packages keep their own. In the graph pane's corner, over nothing it needs.
 */
import React from 'react';
import { fill, useMessages } from '../../../../i18n/app/i18n';
import { utcDateIn } from '../../../../i18n/app/dates';
import { INTEL_CATEGORY_SYMBOLS } from '../../../../symbols/symbolRegistry';
import type { ColourKeyEntry, Colouring } from './noteColours';

const box: React.CSSProperties = {
  position: 'absolute', left: 8, bottom: 8, zIndex: 2, maxWidth: 260, maxHeight: '40%', overflowY: 'auto',
  padding: '6px 8px', borderRadius: 4, fontSize: 11, lineHeight: 1.4,
  background: 'var(--intel-bg-primary)', border: '1px solid var(--intel-border)', color: 'var(--intel-text)',
};
const swatch: React.CSSProperties = { display: 'inline-block', width: 10, height: 10, borderRadius: '50%', marginRight: 6, verticalAlign: 'middle' };

export const ColourKey: React.FC<{ by: Colouring; entries: readonly ColourKeyEntry[] }> = ({ by, entries }) => {
  const { lang, m } = useMessages();
  let regions: Intl.DisplayNames | null = null;
  try { regions = new Intl.DisplayNames([lang], { type: 'region' }); } catch { /* the code stands */ }
  const label = (value: string, i: number): string => {
    if (value === '') return by === 'assessment' ? '' : m.intelWeb.colourNone[by];
    if (value === '*') return m.intelWeb.colourOthers;
    switch (by) {
      case 'assessment': return m.intelWeb.assessments[value as keyof typeof m.intelWeb.assessments] ?? value;
      case 'category': return Object.prototype.hasOwnProperty.call(INTEL_CATEGORY_SYMBOLS, value)
        ? INTEL_CATEGORY_SYMBOLS[value as keyof typeof INTEL_CATEGORY_SYMBOLS].meaning : value;
      case 'country': return regions?.of(value.toUpperCase()) ?? value.toUpperCase();
      case 'publisher': return value.length > 12 ? `${value.slice(0, 8)}…` : value;
      case 'age': return fill(i === 0 ? m.intelWeb.oldest : m.intelWeb.newest, { when: utcDateIn(lang, Date.parse(value), true) });
    }
  };
  return (
    <div style={box} data-testid="intelweb-colour-key">
      {entries.map((entry, i) => (
        <div key={`${entry.value}-${i}`}>
          <span style={{ ...swatch, background: entry.colour }} aria-hidden="true" />
          {label(entry.value, i)}
        </div>
      ))}
      <div style={{ color: 'var(--intel-text-dim)', marginTop: 4 }}>{m.intelWeb.keepOwnColours}</div>
      <div style={{ color: 'var(--intel-text-dim)' }}>{m.intelWeb.dashedNotHeld}</div>
    </div>
  );
};

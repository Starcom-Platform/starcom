/**
 * Two layers side by side, said on screen (D-CM, CM2): a line down the globe's middle, where the halves meet, and a
 * bar naming each half's layer, with one click to end it, docked under the loading status (dockOrder.ts). The line is
 * drawn in the globe's own box, so it stands where the halves are cut. A card or a clip names the halves itself.
 */
import React from 'react';
import { Glyph } from '../../symbols/Glyph';
import type { GlyphName } from '../../symbols/uiSymbols';
import { GLYPHS } from '../../symbols/uiSymbols';
import { useMessages } from '../../i18n/app/i18n';
import { endComparison, useComparison } from '../../globe-engine/compareLayers';
import { useGlobeLayerControlOptional } from '../Globe/Hooks/useGlobeLayerControl';
import { comparePins } from './comparePins';
import { Docked } from '../Dock/Docked';
import styles from './CompareBar.module.css';

const glyphOf = (layer: string): GlyphName => (`layer:${layer}` in GLYPHS ? `layer:${layer}` as GlyphName : 'layer:other');

export const CompareBar: React.FC = () => {
  const comparison = useComparison();
  const control = useGlobeLayerControlOptional();
  const { m: { compare: words } } = useMessages();
  if (!comparison) return null;
  // A moment comparison names its windows (labels); else each half is its layer's name.
  const label = (layer: string) => control?.layers.find((l) => l.id === layer.replace(/@then$/, ''))?.label ?? layer;
  const leftLabel = comparison.labels?.left ?? label(comparison.left);
  const rightLabel = comparison.labels?.right ?? label(comparison.right);
  return (
    <>
      <div className={styles.divider} aria-hidden="true" data-testid="compare-divider" />
      <Docked slot="globeCompare">
      <div className={styles.bar} role="region" aria-label={words.label} data-testid="compare-bar">
        <span className={styles.half} data-testid="compare-left"><Glyph name={glyphOf(comparison.left.replace(/@then$/, ''))} size={16} />{leftLabel}</span>
        <span className={styles.title}>{words.label}</span>
        <span className={styles.half} data-testid="compare-right">{rightLabel}<Glyph name={glyphOf(comparison.right.replace(/@then$/, ''))} size={16} /></span>
        <button type="button" className={styles.end} onClick={() => endComparison(control ? comparePins(control) : null)}
          title={words.ends} data-testid="compare-end">{words.end}</button>
      </div>
      </Docked>
    </>
  );
};

export default CompareBar;

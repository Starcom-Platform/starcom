import React, { useMemo, useSyncExternalStore } from 'react';
import type { IntelReportOverlayMarker } from '../../../interfaces/IntelReportOverlay';
import { markerKind } from '../../../interfaces/IntelReportOverlay';
import { intelVariantOf } from '../../Globe/intelVariant';
import { resolveMarkerStyle } from '../../Globe/markerStyles';
import { reportGlyphSvg, spriteGlyphMotion, type SpriteGlyph } from '../../Globe/intelReportSprites';
import { categorySymbolOf, reportCategoryOf } from '../../../services/intel/reportCategory';
import { effectiveReportLook, emblemsChosen, getReportLookOverride, subscribeReportLook } from '../../../services/intel/reportLook';
import { useCyberCommandSettings } from '../../../hooks/useCyberCommandSettings';
import styles from './IntelReportGlyph.module.css';

/**
 * A report's mark as the globe draws it, for its popup and its hover tooltip (decision of
 * 2026-10-08: SVG glyphs everywhere). Its glyph is its assessment's, or a person for an
 * RLSH entity; in the person's marker style; with its category's emblem where they show
 * emblems: the same choices useGlobeIntelSprites makes for the mark on the globe.
 *
 * Both drew a spinning 3D model before, the same one for every report and every RLSH
 * person, each in a WebGL context of its own, opened again for every report hovered.
 *
 * Drawn as an image of the SVG, the way the globe's atlas bakes it: the content security
 * policy allows images from data, and each image keeps its own gradient ids.
 */
export const IntelReportGlyph: React.FC<{ report: IntelReportOverlayMarker; size: number; className?: string }> = ({ report, size, className }) => {
  const { config } = useCyberCommandSettings();
  useSyncExternalStore(subscribeReportLook, getReportLookOverride, getReportLookOverride);
  const rlsh = markerKind(report) === 'rlsh';
  const glyph: SpriteGlyph = rlsh ? 'rlsh' : intelVariantOf(report);
  const style = resolveMarkerStyle(config.markerStyles, rlsh ? 'RLSH' : 'IntelReports');
  const emblems = effectiveReportLook({ emblems: emblemsChosen(config.intelReports) }).emblems;
  const emblem = !rlsh && emblems ? categorySymbolOf(reportCategoryOf(report.tags)) : null;
  const src = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(reportGlyphSvg(glyph, style, emblem))}`,
    [glyph, style, emblem],
  );
  const motion = spriteGlyphMotion(glyph);
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className={[styles.glyph, motion > 0 ? styles.moving : null, className].filter(Boolean).join(' ')}
      style={motion > 0 ? ({ '--glyph-motion': motion } as React.CSSProperties) : undefined}
      data-testid="intel-report-glyph"
      data-glyph={glyph}
      data-style={style}
      data-emblem={emblem?.id ?? ''}
    />
  );
};

export default IntelReportGlyph;

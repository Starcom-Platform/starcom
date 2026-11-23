/**
 * A report's glyph off the globe (decision of 2026-10-08: SVG glyphs everywhere): the
 * mark the globe draws for it, in the person's marker style, with its category's emblem
 * where they show emblems, moving as it moves on the globe.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, renderHook, act } from '@testing-library/react';
import { IntelReportGlyph } from '../IntelReportGlyph';
import { reportGlyphSvg } from '../../../Globe/intelReportSprites';
import { INTEL_CATEGORY_SYMBOLS } from '../../../../symbols/symbolRegistry';
import { useCyberCommandSettings } from '../../../../hooks/useCyberCommandSettings';
import { setReportLookOverride } from '../../../../services/intel/reportLook';
import type { IntelReportOverlayMarker } from '../../../../interfaces/IntelReportOverlay';

const report = (over: Partial<IntelReportOverlayMarker> = {}): IntelReportOverlayMarker => ({
  pubkey: 'p', title: 'A report', content: '', tags: [], latitude: 1, longitude: 2, timestamp: 0, author: 'a', ...over,
});
const glyph = () => screen.getByTestId('intel-report-glyph') as HTMLImageElement;
const svgOf = (img: HTMLImageElement) => decodeURIComponent(img.src.replace('data:image/svg+xml;charset=utf-8,', ''));

const settings = () => renderHook(() => useCyberCommandSettings()).result;

afterEach(() => {
  const s = settings();
  act(() => {
    // Back to each layer's default: Intel Reports a halo disc (plan H4), RLSH a disc.
    s.current.updateMarkerStyle('IntelReports', 'glow');
    s.current.updateMarkerStyle('RLSH', 'disc');
    s.current.updateIntelReports({ categoryEmblems: true });
  });
  setReportLookOverride(undefined);
});

describe('IntelReportGlyph', () => {
  it("draws the report's glyph as the globe does: its assessment, its emblem, in the person's style", () => {
    render(<IntelReportGlyph report={report({ tags: ['critical', 'category:conflict'] })} size={48} />);
    const img = glyph();
    expect(img.dataset.glyph).toBe('critical');
    expect(img.dataset.style).toBe('glow');
    expect(img.dataset.emblem).toBe(INTEL_CATEGORY_SYMBOLS.conflict.id);
    expect(svgOf(img)).toBe(reportGlyphSvg('critical', 'glow', INTEL_CATEGORY_SYMBOLS.conflict));
    expect([img.width, img.height]).toEqual([48, 48]);
  });

  it('draws a person for an RLSH entity, never a document, and never an emblem', () => {
    render(<IntelReportGlyph report={report({ kind: 'rlsh', tags: ['category:conflict'] })} size={48} />);
    expect(glyph().dataset.glyph).toBe('rlsh');
    expect(glyph().dataset.emblem).toBe('');
  });

  it("follows the person's marker style, and leaves the emblem off when they or the page's handle turn emblems off", () => {
    const s = settings();
    act(() => s.current.updateMarkerStyle('IntelReports', 'ring'));
    const { unmount } = render(<IntelReportGlyph report={report({ tags: ['category:conflict'] })} size={48} />);
    expect(glyph().dataset.style).toBe('ring');
    expect(glyph().dataset.emblem).toBe(INTEL_CATEGORY_SYMBOLS.conflict.id);
    unmount();

    act(() => s.current.updateIntelReports({ categoryEmblems: false }));
    const off = render(<IntelReportGlyph report={report({ tags: ['category:conflict'] })} size={48} />);
    expect(glyph().dataset.emblem).toBe('');
    off.unmount();

    act(() => s.current.updateIntelReports({ categoryEmblems: true }));
    act(() => setReportLookOverride({ emblems: false }));
    render(<IntelReportGlyph report={report({ tags: ['category:conflict'] })} size={48} />);
    expect(glyph().dataset.emblem).toBe('');
  });

  it('moves the glyphs the globe moves, critical the most, and leaves the still ones still', () => {
    const { unmount } = render(<IntelReportGlyph report={report({ tags: ['critical'] })} size={48} />);
    expect(glyph().className).toMatch(/moving/);
    expect(glyph().style.getPropertyValue('--glyph-motion')).toBe('1');
    unmount();
    const actionable = render(<IntelReportGlyph report={report({ tags: ['actionable'] })} size={48} />);
    expect(glyph().style.getPropertyValue('--glyph-motion')).toBe('0.45');
    actionable.unmount();
    render(<IntelReportGlyph report={report({ tags: [] })} size={48} />);
    expect(glyph().dataset.glyph).toBe('raw');
    expect(glyph().className).not.toMatch(/moving/);
  });
});

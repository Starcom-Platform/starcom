/**
 * The glyphs of the bar, the rails, quick access and the Globe's notes (K3).
 * One meaning, one icon, wherever it is drawn: the rail drew one emoji for a
 * layer and quick access another.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Glyph } from '../Glyph';
import { GLYPHS, type GlyphName } from '../uiSymbols';

describe('GLYPHS', () => {
  it("addresses each glyph by its own id, drawn from Lucide, or drawn for Starcom where Lucide has none", () => {
    for (const [name, entry] of Object.entries(GLYPHS)) {
      expect(entry.id).toBe(name);
      expect(entry.icon.length, name).toBeGreaterThan(0);
      expect([{ set: 'Lucide', licence: 'ISC' }, { set: 'Starcom', licence: 'own' }]).toContainEqual(entry.source);
      expect(entry.meaning.trim(), name).not.toBe('');
    }
  });

  // BD9: the owner chose eight marks drawn on Lucide's grid where it had nothing fitting.
  it("draws Starcom's own marks for the meanings Lucide lacks", () => {
    const own = Object.values(GLYPHS).filter((e) => e.source.set === 'Starcom').map((e) => `${e.id}=${e.name}`);
    expect(own.sort()).toEqual([
      // Round 5 (2026-10-11): the trail's dots from the pointer's side, a bound bundle, and a queued outbox.
      'action:cursorTrail=pointer-side-dots',
      // The rail's kits (plan A1, 1 Nov): hatching and the radiation belts, which Lucide has none of.
      'control:fill:hatch=hatch-lines', 'control:space:belts=belts-crescents',
      'job:bundle-import=bundle-stack-bound', 'job:findings-publish=outbox-queued',
      'layer:CyberThreats=chip-warning', 'layer:EcologicalDisasters=volcano',
      // Psi Watch's ψ field (D-PW, PW18, 2026-10-26): a ψ, which Lucide has none of.
      'layer:PsiModel=psi',
      // Round 6 (2026-10-11): space as a ringed planet, and scene events as an admission ticket.
      'layer:SceneEvents=ticket-admit-star', 'layer:SpaceWeather=ringed-planet', 'layer:WarConflict=tank', 'mode:RaverWatch=raver-headphones',
      // The aurora: curtains rising from the polar oval, the owner's pick in round 5 (2026-10-11).
      'sw:aurora=aurora-polar-curtains', 'sw:bowShock=bow-shock',
    ]);
  });

  it('gives no two meanings the same icon', () => {
    const byIcon = new Map<string, string[]>();
    for (const [name, entry] of Object.entries(GLYPHS)) {
      byIcon.set(entry.name, [...(byIcon.get(entry.name) ?? []), name]);
    }
    const shared = [...byIcon.entries()].filter(([, names]) => names.length > 1);
    expect(shared).toEqual([]);
  });
});

describe('Glyph', () => {
  it('draws the meaning it is named for', () => {
    for (const name of ['app:cases', 'layer:HeatRisk'] as const) {
      const { container, unmount } = render(<Glyph name={name} />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('data-symbol')).toBe(name);
      expect(svg.children.length).toBe(GLYPHS[name].icon.length);
      unmount();
    }
  });

  it('takes its colour from the registry, which draws in the colour of what it sits in', () => {
    const { container } = render(<Glyph name={'note:untimed' as GlyphName} />);
    expect(container.querySelector('svg')!.getAttribute('stroke')).toBe('currentColor');
  });

  it('is hidden from a screen reader unless it is the only name a control has', () => {
    const { container, rerender } = render(<Glyph name="nav:more" />);
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    rerender(<Glyph name="nav:more" title="More" />);
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toBe('More');
  });
});

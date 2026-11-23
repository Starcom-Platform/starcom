/**
 * The point tooltip shows its whole text: it wraps, and keeps the text's line breaks, rather than
 * cutting it at one line. Relief's hover lost the operation's sum and end after 45 characters, and a
 * field mission's limits, which are never left out, would have been cut the same way.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SimplePointTooltip } from '../SimplePointTooltip';
import { TOOLTIP_MAX_WIDTH } from '../tooltipPlacement';
import fs from 'node:fs';

const zIndexCss = fs.readFileSync('src/styles/z-index.css', 'utf8');

describe('SimplePointTooltip', () => {
  it('wraps a long text and keeps its line breaks, never cutting it with an ellipsis', () => {
    const text = 'New Mexico: 1 open field mission.\nIts limits: Work in pairs. Never confront anyone.';
    render(<SimplePointTooltip tooltip={{ text, screenX: 640, screenY: 400 }} />);
    const tip = screen.getByTestId('point-tooltip');
    expect(tip.textContent).toBe(text);
    expect(tip.style.whiteSpace).toBe('pre-line');
    expect(tip.style.textOverflow).not.toBe('ellipsis');
    expect(tip.style.overflow).not.toBe('hidden');
    expect(tip.style.maxWidth).toBe(`${TOOLTIP_MAX_WIDTH}px`);
    // The tooltip tier, which stands over the HUD's bars and rails (3100-3200) and under the preloader.
    expect(tip.style.zIndex).toBe('var(--z-tooltip)');
    const tier = (name: string) => Number(new RegExp(`--z-${name}:\\s*(\\d+)`).exec(zIndexCss)?.[1]);
    expect(tier('tooltip')).toBeGreaterThan(3200);
    expect(tier('tooltip')).toBeLessThan(tier('preloader'));
  });

  it('is placed by its own size: a long one near the top of the screen goes below the cursor', () => {
    render(<SimplePointTooltip tooltip={{ text: 'x'.repeat(300), screenX: 640, screenY: 120 }} />);
    expect(screen.getByTestId('point-tooltip').style.transform).not.toContain('calc(-100%');
  });

  it('is drawn in the page\'s body, so its place is the window\'s, whatever transform the globe\'s frame has', () => {
    // Inside a transformed frame, a fixed box is placed from the frame, not the window: 100 px too low under the header.
    const frame = document.createElement('div');
    frame.style.transform = 'translateZ(0)';
    document.body.appendChild(frame);
    render(<SimplePointTooltip tooltip={{ text: 'Dover', screenX: 640, screenY: 400 }} />, { container: frame });
    const tip = screen.getByTestId('point-tooltip');
    expect(tip.parentElement).toBe(document.body);
    expect(frame.contains(tip)).toBe(false);
  });
});

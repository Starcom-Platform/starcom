/**
 * The menu at the click (K8; plan block J, item 4, decisions BA8–BA10).
 *
 * Reports at one place were drawn as one glyph with a count, and a click
 * opened the most severe in a popup whose Previous/Next ran on past the place
 * into every report on the globe: there was no list of what was there and no
 * way to go straight to one. This lists what is at the click, in sections when
 * the click is inside more than one territory, to pick one.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobeGroupMenu, TerritoryHoverLabel, type GroupMenuSection } from '../GlobeGroupMenu';
import { groupMenuPosition } from '../groupMenuPosition';
import { spriteGlyphFill } from '../../../Globe/intelReportSprites';
import { INTEL_CATEGORY_SYMBOLS } from '../../../../symbols/symbolRegistry';

const AT = Date.UTC(2026, 9, 3, 12, 44);
const sections: GroupMenuSection[] = [
  {
    key: 'place:40.0000,-83.0000',
    title: '3 reports here',
    items: [
      { id: 'a', title: 'FEMA major disaster declaration 4945', variant: 'critical', timeMs: AT },
      { id: 'b', title: 'Storm damage in Columbus', variant: 'standard', timeMs: AT - 86_400_000 },
      { id: 'c', title: 'Power out in Franklin County', variant: 'raw', timeMs: null },
    ],
  },
  { key: 'territory:us', title: 'United States · 1 report', items: [{ id: 'd', title: 'Charities lose exemption', variant: 'raw', timeMs: AT }] },
];
const open = (props: Partial<React.ComponentProps<typeof GlobeGroupMenu>> = {}) => {
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(<GlobeGroupMenu at={{ x: 200, y: 150 }} sections={sections} onPick={onPick} onClose={onClose} {...props} />);
  return { onPick, onClose, items: () => screen.getAllByRole('menuitem') };
};

describe('what the menu lists', () => {
  it('each section under its heading, each report by title, what it is in words, and when, in UTC', () => {
    open();
    expect(screen.getByRole('menu', { name: 'Reports at this place' })).toBeTruthy();
    expect(screen.getByRole('group', { name: '3 reports here' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'United States · 1 report' })).toBeTruthy();
    const [first, , third] = screen.getAllByRole('menuitem');
    expect(first.textContent).toContain('FEMA major disaster declaration 4945');
    expect(first.textContent).toContain('critical');
    expect(first.textContent).toContain('3 Oct 12:44Z');
    // Colour is never the only signal, and a report with no time says so.
    expect(third.textContent).toContain('not assessed');
    expect(third.textContent).toContain('time not stated');
  });

  it('marks each in its glyph\'s colour, as the globe and the key do', () => {
    open();
    const dot = screen.getAllByRole('menuitem')[0].querySelector('[data-variant]') as HTMLElement;
    expect(dot.dataset.variant).toBe('critical');
    expect(dot.style.background).toBe(hexToRgb(spriteGlyphFill('critical')));
  });

  it('holds the list in a scrolling area, so a long one scrolls inside the menu', () => {
    open();
    const scroller = screen.getAllByRole('menuitem')[0].closest('[data-scroll]');
    expect(scroller).not.toBeNull();
  });
});

describe('what each report is about (BA13, BA14)', () => {
  it('its category\'s icon in its assessment\'s colour, and the word, in place of the plain mark', () => {
    render(<GlobeGroupMenu at={{ x: 200, y: 150 }} onPick={vi.fn()} onClose={vi.fn()} sections={[{ key: 'k', title: '2 reports here', items: [
      { id: 'w', title: 'Airstrike', variant: 'critical', timeMs: AT, category: 'conflict', symbol: INTEL_CATEGORY_SYMBOLS.conflict },
      { id: 'n', title: 'Unfiled', variant: 'raw', timeMs: AT, category: null, symbol: null },
    ] }]} />);
    const [war, unfiled] = screen.getAllByRole('menuitem');
    const icon = war.querySelector('svg[data-symbol="intel-category:conflict"]') as SVGElement;
    expect(icon).not.toBeNull();
    expect(icon.getAttribute('stroke')).toBe(spriteGlyphFill('critical'));
    expect(war.textContent).toContain('conflict · critical · 3 Oct 12:44Z');
    // No category: the plain mark, and no word for one.
    expect(unfiled.querySelector('svg[data-symbol]')).toBeNull();
    expect(unfiled.querySelector('[data-variant="raw"]')).not.toBeNull();
    expect(unfiled.textContent).toContain('not assessed · 3 Oct 12:44Z');
  });
});

describe('picking one', () => {
  it('by a click or by Enter, naming its section', () => {
    const { onPick, items } = open();
    fireEvent.click(items()[1]);
    expect(onPick).toHaveBeenLastCalledWith('place:40.0000,-83.0000', 'b');
    fireEvent.keyDown(items()[3], { key: 'Enter' });
    expect(onPick).toHaveBeenLastCalledWith('territory:us', 'd');
  });

  it('from the keyboard: it opens on the first, the arrows move through every section and wrap, Home and End', () => {
    const { items } = open();
    expect(document.activeElement).toBe(items()[0]);
    fireEvent.keyDown(items()[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items()[3]);
    fireEvent.keyDown(items()[3], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items()[0]);
    fireEvent.keyDown(items()[0], { key: 'ArrowDown' });
    fireEvent.keyDown(items()[1], { key: 'ArrowDown' });
    fireEvent.keyDown(items()[2], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items()[3]);
    fireEvent.keyDown(items()[3], { key: 'Home' });
    expect(document.activeElement).toBe(items()[0]);
    fireEvent.keyDown(items()[0], { key: 'End' });
    expect(document.activeElement).toBe(items()[3]);
  });
});

/*
 * The country under the click (BA20): a territory or area outlined for its
 * reports takes the click inside it, and its menu offers the country there
 * last, so the country's own panel is still one pick away.
 */
describe('the country under the click (BA20)', () => {
  it('last, after every report, named, and picked it opens the country\'s panel, not a report', () => {
    const onCountry = vi.fn();
    const { onPick, items } = open({ country: { name: 'Mali' }, onCountry });
    expect(screen.getByRole('group', { name: 'The country here' })).toBeTruthy();
    const all = items();
    const last = all[all.length - 1];
    expect(last.textContent).toContain('Mali');
    expect(last.textContent).toContain('Open its country panel');
    fireEvent.click(last);
    expect(onCountry).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('reached from the keyboard as every item is', () => {
    const onCountry = vi.fn();
    open({ country: { name: 'Mali' }, onCountry });
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement?.textContent).toContain('Mali');
    fireEvent.keyDown(document.activeElement as Element, { key: 'Enter' });
    expect(onCountry).toHaveBeenCalledTimes(1);
  });

  it('none when no country is offered', () => {
    open();
    expect(screen.queryByRole('group', { name: 'The country here' })).toBeNull();
  });
});

describe('closing', () => {
  it('on Escape, on its close button, and on a press outside it, never one inside', () => {
    const { onClose, items } = open();
    fireEvent.mouseDown(items()[0]);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(items()[0], { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe('where it opens', () => {
  const size = { width: 300, height: 200 };
  const viewport = { width: 1000, height: 700 };

  it('beside the click', () => {
    expect(groupMenuPosition({ x: 100, y: 100 }, size, viewport)).toEqual({ left: 108, top: 108 });
  });

  it('to the click\'s left where the right edge would cut it, and up where the bottom would', () => {
    expect(groupMenuPosition({ x: 900, y: 100 }, size, viewport)).toEqual({ left: 592, top: 108 });
    expect(groupMenuPosition({ x: 100, y: 650 }, size, viewport)).toEqual({ left: 108, top: 492 });
  });

  it('inside the viewport however small, never past its top or left edge', () => {
    expect(groupMenuPosition({ x: 150, y: 50 }, size, { width: 320, height: 180 })).toEqual({ left: 8, top: 8 });
  });
});

describe('beside the pointer inside a territory (BA9)', () => {
  it('names each territory there and how many it holds, and says a click opens them', () => {
    render(<TerritoryHoverLabel at={{ x: 300, y: 200 }} lines={['Ohio · 1 report', 'United States of America · 12 reports']} />);
    const label = screen.getByRole('tooltip');
    expect(label.textContent).toContain('Ohio · 1 report');
    expect(label.textContent).toContain('United States of America · 12 reports');
    expect(label.textContent).toContain('Click to open');
    expect(label.style.left).toBe('314px');
  });
});

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

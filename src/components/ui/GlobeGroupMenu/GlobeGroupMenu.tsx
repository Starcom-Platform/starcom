/**
 * The menu at the click (K8; plan block J, item 4, decisions BA8–BA10).
 *
 * Reports at one place are drawn as one glyph with a count, and a click opened
 * the most severe in a popup whose Previous/Next ran on past the place into
 * every report on the globe: there was no list of what was there and no way to
 * go straight to one. A territory's reports could not be opened at all. This
 * lists what is at the click — a place's reports, and those about each outlined
 * territory the click is inside, a section each — to pick one.
 *
 * Shared by every layer that groups (K8): it knows sections of items, not where
 * they came from. Each item says what it is in words as well as in its glyph's
 * colour, because colour is never the only signal (tokens.ts).
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Flag, X } from 'lucide-react';
import { SPRITE_GLYPH_MEANING, spriteGlyphFill } from '../../Globe/intelReportSprites';
import type { IntelVariant } from '../../Globe/intelVariant';
import { formatUtcDateTime, localTimeTitle } from '../../../utils/utcTime';
import { SymbolIcon } from '../../../symbols/SymbolIcon';
import type { SymbolEntry } from '../../../symbols/symbolRegistry';
import styles from './GlobeGroupMenu.module.css';
import { GAP_PX, groupMenuPosition } from './groupMenuPosition';

export interface GroupMenuItem {
  id: string;
  title: string;
  variant: IntelVariant;
  /** When it happened, or was written, as the report states it; null when it states neither. */
  timeMs: number | null;
  /** Its stated category's word (BA13), said in words; null or absent when it states none. */
  category?: string | null;
  /** Its category's icon, drawn in place of the plain mark while emblems are on (BA14). */
  symbol?: SymbolEntry | null;
}

export interface GroupMenuSection {
  /** Handed back with a pick, so the caller knows which group the item came from. */
  key: string;
  title: string;
  items: GroupMenuItem[];
}

export interface GlobeGroupMenuProps {
  /** The click, in the viewport's pixels. */
  at: { x: number; y: number };
  sections: GroupMenuSection[];
  onPick: (section: string, id: string) => void;
  onClose: () => void;
  /** The country under the click, offered last, when its panel can be opened from here (BA20). */
  country?: { name: string };
  onCountry?: () => void;
}

export const GlobeGroupMenu: React.FC<GlobeGroupMenuProps> = ({ at, sections, onPick, onClose, country, onCountry }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => ({ left: at.x + GAP_PX, top: at.y + GAP_PX }));

  // Measured once drawn, then kept inside the viewport.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition(groupMenuPosition(at, { width, height }, { width: window.innerWidth, height: window.innerHeight }));
  }, [at, sections]);

  const items = useCallback(
    () => Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []),
    [],
  );

  // Opens on the first report, so the keyboard can pick straight away.
  useEffect(() => { items()[0]?.focus(); }, [items]);

  // A press anywhere else closes it; one inside does not.
  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [onClose]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const all = items();
    const index = all.indexOf(document.activeElement as HTMLButtonElement);
    const focus = (i: number) => { event.preventDefault(); all[(i + all.length) % all.length]?.focus(); };
    switch (event.key) {
      case 'Escape': event.preventDefault(); onClose(); break;
      case 'ArrowDown': focus(index + 1); break;
      case 'ArrowUp': focus(index < 0 ? all.length - 1 : index - 1); break;
      case 'Home': focus(0); break;
      case 'End': focus(all.length - 1); break;
      default: break;
    }
  };

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      role="menu"
      aria-label="Reports at this place"
      style={{ left: position.left, top: position.top }}
      onKeyDown={onKeyDown}
    >
      <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
        <X size={14} aria-hidden="true" />
      </button>
      <div className={styles.scroll} data-scroll="">
        {sections.map((section) => (
          <div key={section.key} role="group" aria-label={section.title} className={styles.section}>
            <div className={styles.heading} aria-hidden="true">{section.title}</div>
            {section.items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                className={styles.item}
                title={item.timeMs === null ? undefined : localTimeTitle(item.timeMs)}
                onClick={() => onPick(section.key, item.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onPick(section.key, item.id);
                  }
                }}
              >
                {item.symbol
                  ? <SymbolIcon symbol={item.symbol} size={14} strokeWidth={2.25} color={spriteGlyphFill(item.variant)} className={styles.symbol} />
                  : <span className={styles.dot} data-variant={item.variant} style={{ background: spriteGlyphFill(item.variant) }} aria-hidden="true" />}
                <span className={styles.text}>
                  <span className={styles.title}>{item.title}</span>
                  <span className={styles.meta}>
                    {item.category ? `${item.category} · ` : ''}{SPRITE_GLYPH_MEANING[item.variant]} · {item.timeMs === null ? 'time not stated' : formatUtcDateTime(item.timeMs)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ))}
        {country && onCountry && (
          <div role="group" aria-label="The country here" className={styles.section}>
            <div className={styles.heading} aria-hidden="true">The country here</div>
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={onCountry}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onCountry();
                }
              }}
            >
              <Flag size={14} strokeWidth={2.25} aria-hidden="true" className={`${styles.symbol} ${styles.country}`} />
              <span className={styles.text}>
                <span className={styles.title}>{country.name}</span>
                <span className={styles.meta}>Open its country panel</span>
              </span>
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

/**
 * Which outlined territories the pointer is inside, and how many reports each
 * holds (BA9): said beside the pointer, since an outline gives no other sign
 * that it opens anything.
 */
export const TerritoryHoverLabel: React.FC<{ at: { x: number; y: number }; lines: string[] }> = ({ at, lines }) =>
  createPortal(
    <div className={styles.hover} role="tooltip" style={{ left: at.x + 14, top: at.y + 14 }}>
      {lines.map((line) => <span key={line} className={styles.hoverLine}>{line}</span>)}
      <span className={styles.hoverHint}>Click to open</span>
    </div>,
    document.body,
  );

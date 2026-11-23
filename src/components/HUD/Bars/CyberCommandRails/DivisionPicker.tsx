/**
 * What the globe is divided by, from one rail button (decision D-ZR, ZR12; the owner chose one button with a picker
 * in place of the three it replaces: National territories, Zones and Spheres). The button's glyph is the division
 * shown; a click opens the picker beside it, and a pick leaves that one layer on and the others off.
 *
 * Organisations show one body at a time (the owner, 2026-10-18): picking them turns the picker to the list of
 * bodies, and picking one shows it.
 *
 * The division is read from the layers' own switches (divisions.ts), so the picker always says what the globe shows.
 *
 * The menu is drawn at the top of the page, beside its button, on the dropdown layer: inside the rail it sat under
 * the globe's key, which covered half of it and took its clicks.
 */
import React from 'react';
import { createPortal } from 'react-dom';
import { Glyph } from '../../../../symbols/Glyph';
import type { GlyphName } from '../../../../symbols/uiSymbols';
import { useVisualizationOverlay } from '../../../../hooks/useVisualizationOverlay';
import { setZonesOn, useZonesValue } from '../../../../features/globe/zones/zonesStore';
import { setSpheresOn, useSpheresValue } from '../../../../features/globe/spheres/spheresStore';
import {
  organisationAreas, setOrganisationsOn, showOrganisation, useOrganisationsValue,
} from '../../../../features/globe/organisations/organisationsStore';
import { DIVISIONS, divisionOf, switchesFor, type Division } from '../../../../features/globe/divisions/divisions';
import { fill, useMessages } from '../../../../i18n/app/i18n';
import styles from './CyberCommandRightSideRail.module.css';

/** Organisations borrow Diplomatic Events' glyph until a glyph round gives them their own. */
const GLYPH: Record<Division, GlyphName> = {
  nations: 'layer:NationalTerritories',
  zones: 'layer:Zones',
  spheres: 'layer:Spheres',
  organisations: 'layer:DiplomaticEvents',
  none: 'layer:NationalTerritories',
};

/** The menu's gap from the top of the page when it is as tall as the room allows. */
const MENU_MARGIN = 8;

export const DivisionPicker: React.FC = () => {
  const { nationalTerritoriesOverlayEnabled, setNationalTerritoriesOverlayEnabled } = useVisualizationOverlay();
  const zonesOn = useZonesValue((s) => s.on);
  const spheresOn = useSpheresValue((s) => s.on);
  const organisationsOn = useOrganisationsValue((s) => s.on);
  const shown = useOrganisationsValue((s) => s.shown);
  const { m: { divisions: words, organisations: orgWords } } = useMessages();
  const division = divisionOf({ nations: nationalTerritoriesOverlayEnabled, zones: zonesOn, spheres: spheresOn, organisations: organisationsOn });
  const bodies = organisationAreas();
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<'divisions' | 'bodies'>('divisions');
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [at, setAt] = React.useState<{ right: number; bottom: number; maxHeight: number } | null>(null);

  // Beside its button, to the left of the rail, its foot level with the button's; no taller than the room above it,
  // scrolling within, so a long list of bodies never runs off the top of the page with its Back button.
  React.useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (rect) setAt({ right: window.innerWidth - rect.left + 8, bottom: window.innerHeight - rect.bottom, maxHeight: Math.max(0, rect.bottom - MENU_MARGIN) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  const leave = (next: Division) => {
    const s = switchesFor(next);
    setNationalTerritoriesOverlayEnabled(s.nations);
    setZonesOn(s.zones);
    setSpheresOn(s.spheres);
    setOrganisationsOn(s.organisations);
  };

  const pick = (next: Division) => {
    if (next === 'organisations' && bodies.length > 0) { setView('bodies'); return; }
    leave(next);
    close();
  };

  const pickBody = (code: string) => {
    leave('organisations');
    showOrganisation(code);
    close();
  };

  const close = () => { setOpen(false); setView('divisions'); setAt(null); };

  // Open, the chosen one has the focus; a click outside, or Escape, closes it.
  const placed = at !== null;
  React.useEffect(() => {
    if (!open || !placed) return;
    const at = view === 'divisions' ? DIVISIONS.indexOf(division) : Math.max(0, bodies.findIndex((b) => b.code === shown)) + 1;
    itemRefs.current[at]?.focus();
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!wrapRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
    // The focus moves on opening and on turning to the bodies only, not with each pick made elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view, placed]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = itemRefs.current.filter((el): el is HTMLButtonElement => el !== null);
    const at = items.findIndex((el) => el === document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); if (view === 'bodies') setView('divisions'); else close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      items[(at + step + items.length) % items.length]?.focus();
    }
  };

  itemRefs.current = [];
  const name = division === 'organisations' && shown
    ? `${words.organisations}: ${bodies.find((b) => b.code === shown)?.name ?? shown}`
    : words[division];
  return (
    <div className={styles.divisionWrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.quickActionButton} ${styles.overlayToggleButton} ${division !== 'none' ? styles.quickActionButtonActive : ''}`}
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={fill(words.label, { division: name })}
        title={fill(words.label, { division: name })}
        data-testid="cyber-right-rail-divisions"
      >
        <Glyph name={GLYPH[division]} />
      </button>
      {open && at && createPortal(view === 'divisions' ? (
        <div ref={menuRef} className={styles.divisionMenu} style={at} role="menu" aria-label={words.heading} onKeyDown={onMenuKey} data-testid="cyber-right-rail-divisions-menu">
          <div className={styles.divisionHeading} aria-hidden="true">{words.heading}</div>
          {DIVISIONS.map((d, i) => (
            <button
              key={d}
              type="button"
              role="menuitemradio"
              aria-checked={d === division}
              ref={(el) => { itemRefs.current[i] = el; }}
              className={`${styles.divisionItem} ${d === division ? styles.divisionItemChosen : ''}`}
              onClick={() => pick(d)}
              data-testid={`cyber-right-rail-division-${d}`}
            >
              {d !== 'none' && <Glyph name={GLYPH[d]} />}
              <span>{words[d]}</span>
              {d === 'organisations' && <span className={styles.divisionMore} aria-hidden="true">›</span>}
            </button>
          ))}
        </div>
      ) : (
        <div ref={menuRef} className={styles.divisionMenu} style={at} role="menu" aria-label={orgWords.choose} onKeyDown={onMenuKey} data-testid="cyber-right-rail-organisations-menu">
          <button
            type="button"
            role="menuitem"
            ref={(el) => { itemRefs.current[0] = el; }}
            className={styles.divisionItem}
            onClick={() => setView('divisions')}
            data-testid="cyber-right-rail-organisations-back"
          >
            <span aria-hidden="true">‹</span>
            <span>{words.back}</span>
          </button>
          <div className={styles.divisionHeading} aria-hidden="true">{orgWords.choose}</div>
          {bodies.map((b, i) => {
            const chosen = division === 'organisations' && b.code === shown;
            return (
              <button
                key={b.code}
                type="button"
                role="menuitemradio"
                aria-checked={chosen}
                ref={(el) => { itemRefs.current[i + 1] = el; }}
                className={`${styles.divisionItem} ${chosen ? styles.divisionItemChosen : ''}`}
                onClick={() => pickBody(b.code)}
                data-testid={`cyber-right-rail-organisation-${b.code.split(':')[1]}`}
              >
                <span>{b.name}</span>
              </button>
            );
          })}
        </div>
      ), document.body)}
    </div>
  );
};

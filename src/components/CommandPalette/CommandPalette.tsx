/**
 * The command palette (D-CP; UX plan E1): Ctrl/Cmd-K, `/`, or the header's box opens one panel over the globe (CP1).
 * One input; results in sections: Recent, Commands, Places, On the globe, Layers and modes, Records, Applications;
 * arrows and Enter throughout, Esc or a click outside closes. Commands are found by their plain words (CP2), each saying
 * what it does; an item picked from the globe is flown to and opened (CP3); the last 8 picks show first with the box
 * empty (CP4).
 *
 * Its results come from the sources registered where what they offer lives (features/palette/palette.ts).
 */
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Modal from '../Shared/Modal';
import { Glyph } from '../../symbols/Glyph';
import { fill, useMessages } from '../../i18n/app/i18n';
import {
  clearPaletteRecent, closePalette, openPalette, PALETTE_SECTIONS, paletteOpen, paletteSources, rememberPick, SECTION_LIMIT,
  usePaletteOpen, usePaletteRecent, usePaletteSourcesVersion, type PaletteResult, type PaletteSection,
} from '../../features/palette/palette';
import styles from './CommandPalette.module.css';

interface Shown { section: PaletteSection; result: PaletteResult }

/** Opens and closes the palette from anywhere: Ctrl/Cmd-K, or `/` where nothing is being typed. Always mounted. */
export const CommandPalette: React.FC = () => {
  const open = usePaletteOpen();
  const { m: { palette: words } } = useMessages();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        if (paletteOpen()) closePalette();
        else openPalette();
        return;
      }
      if (e.key === '/' && !typing && !paletteOpen()) {
        e.preventDefault();
        openPalette();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  if (!open) return null;
  // The app's one modal (Shared/Modal): announced, Tab kept inside, the page behind locked, focus given back on close.
  return (
    <Modal isOpen onClose={closePalette} ariaLabel={words.label} className={styles.backdrop} dismissOnBackdrop>
      <PaletteDialog initialQuery={open.query} section={open.section} />
    </Modal>
  );
};

/** A section opened whole shows this many at most. */
const WHOLE_SECTION_LIMIT = 60;

const PaletteDialog: React.FC<{ initialQuery: string; section?: PaletteSection }> = ({ initialQuery, section: opened }) => {
  const { m: { palette: words } } = useMessages();
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const version = usePaletteSourcesVersion();
  const recentIds = usePaletteRecent();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Everything the sources offer with the box empty, once an open: recent picks are found again among it.
  const everything = useMemo(() => {
    const all = new Map<string, PaletteResult>();
    for (const source of paletteSources()) {
      const got = source.results('');
      if (Array.isArray(got)) for (const r of got as readonly PaletteResult[]) if (!all.has(r.id)) all.set(r.id, r);
    }
    return all;
    // A source joining while open is read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // What the words typed find: the sources that answer at once with the typing itself, so an Enter right after the
  // words always has them; those that answer later (the records) as they come.
  const asked = useMemo(() => {
    const typed = query.trim();
    const now: PaletteResult[] = [];
    const later: Promise<readonly PaletteResult[]>[] = [];
    if (typed) {
      for (const source of paletteSources()) {
        const got = source.results(typed);
        if (Array.isArray(got)) now.push(...(got as readonly PaletteResult[]));
        else later.push(got as Promise<readonly PaletteResult[]>);
      }
    }
    return { typed, now, later };
    // A source joining while open is asked too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, version]);
  const [arrived, setArrived] = useState<{ typed: string; results: PaletteResult[] }>({ typed: '', results: [] });
  useEffect(() => {
    let live = true;
    setArrived({ typed: asked.typed, results: [] });
    for (const pending of asked.later) {
      void pending.then((more) => {
        if (live && more.length) setArrived((was) => (was.typed === asked.typed ? { typed: was.typed, results: [...was.results, ...more] } : was));
      }, () => { /* a source that cannot answer adds nothing */ });
    }
    return () => { live = false; };
  }, [asked]);
  const answered = useMemo(
    () => ({ results: [...asked.now, ...(arrived.typed === asked.typed ? arrived.results : [])] }),
    [asked, arrived],
  );

  const shown: Shown[] = useMemo(() => {
    const typed = query.trim();
    const bySection = new Map<PaletteSection, PaletteResult[]>();
    const add = (section: PaletteSection, result: PaletteResult, limit = SECTION_LIMIT[section]) => {
      const list = bySection.get(section) ?? [];
      if (list.length < limit && !list.some((r) => r.id === result.id)) list.push(result);
      bySection.set(section, list);
    };
    if (!typed && opened) {
      // One section whole, as the globe's layers button asks (CP5).
      for (const r of everything.values()) if (r.section === opened) add(opened, r, WHOLE_SECTION_LIMIT);
    } else if (!typed) {
      for (const id of recentIds) { const r = everything.get(id); if (r) add('recent', r); }
      for (const r of everything.values()) if (r.section === 'commands' && !r.quiet) add('commands', r);
    } else {
      for (const r of answered.results) add(r.section, r);
    }
    return PALETTE_SECTIONS.flatMap((section) => (bySection.get(section) ?? []).map((result) => ({ section, result })));
  }, [query, recentIds, everything, answered, opened]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const run = useCallback((result: PaletteResult) => {
    rememberPick(result.id);
    closePalette();
    result.run();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (shown.length ? (i + 1) % shown.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (shown.length ? (i - 1 + shown.length) % shown.length : 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); const pick = shown[active]; if (pick) run(pick.result); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  };

  const optionId = (i: number) => `${listId}-option-${i}`;
  let lastSection: PaletteSection | null = null;
  return (
      <div className={styles.panel} data-testid="command-palette">
        <div className={styles.inputRow}>
          <Glyph name="control:list" className={styles.inputGlyph} />
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={words.placeholder}
            aria-label={words.label}
            role="combobox"
            aria-expanded={shown.length > 0}
            aria-controls={listId}
            aria-activedescendant={shown.length ? optionId(active) : undefined}
            aria-autocomplete="list"
            spellCheck={false}
            data-testid="command-palette-input"
          />
        </div>
        <div className={styles.list} id={listId} role="listbox" ref={listRef} aria-label={words.label}>
          {shown.map(({ section, result }, i) => {
            const heading = section !== lastSection ? (
              <div className={styles.section} role="presentation" key={`${section}-heading`}>{words.sections[section]}</div>
            ) : null;
            lastSection = section;
            return (
              <React.Fragment key={`${section}:${result.id}`}>
                {heading}
                <div
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === active}
                  className={`${styles.option} ${i === active ? styles.optionActive : ''}`}
                  onMouseMove={() => { if (i !== active) setActive(i); }}
                  onClick={() => run(result)}
                  data-testid={`command-palette-option-${result.id}`}
                >
                  <Glyph name={result.glyph ?? 'control:list'} className={styles.optionGlyph} />
                  <span className={styles.optionText}>
                    <span className={styles.optionTitle}>{result.title}</span>
                    <span className={styles.optionSays}>{result.description}</span>
                  </span>
                </div>
              </React.Fragment>
            );
          })}
          {query.trim() && !shown.length ? <div className={styles.none}>{fill(words.none, { query: query.trim() })}</div> : null}
        </div>
        <div className={styles.foot}>
          <span>{words.keys}</span>
          {!query.trim() && recentIds.length ? (
            <button type="button" className={styles.clear} onClick={() => clearPaletteRecent()} data-testid="command-palette-clear-recent">{words.clearRecent}</button>
          ) : null}
        </div>
      </div>
  );
};

export default CommandPalette;

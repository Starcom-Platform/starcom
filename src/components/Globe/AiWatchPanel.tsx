/**
 * AI Watch's panel (decision D-AW, AW3): every Terminator Watch note standing in the sections on, by
 * section, the ones that name no place among them. Each says its stance as a shape and a word (AW4), its
 * headline linked to its source, who reported it and when, and where it is drawn, or that it names no
 * place. Translate sits beneath a headline in another language, on this device only: a note is Mecha
 * Jono's, not Public content of ours (ML6), and one whose source's terms allow no adaptation is read
 * translated here and never published so (ML14).
 */
import React from 'react';
import { Docked } from '../Dock/Docked';
import Translatable from '../Translation/Translatable';
import { AI_WATCH_SECTIONS, type AiWatchItem, type AiWatchSection } from '../../services/aiWatch/aiWatch';
import { SECTION_LABEL, sourceNameOf, stanceWords } from '../../services/aiWatch/aiWatchPlaces';
import { formatUtcDate } from '../../utils/utcTime';

export interface AiWatchPanelProps {
  /** Every note standing in the sections on, newest first. */
  notes: readonly AiWatchItem[];
  /** Which sections are on (AW2). */
  active: Readonly<Record<AiWatchSection, boolean>>;
  /** Where each note is drawn, by its id: a place's name, "its point", or absent for none. */
  drawnAt: ReadonlyMap<string, string>;
  status: { loaded: boolean; error: string | null };
}

// Shrinks to the room the corner has and scrolls inside (a `fitsDock` slot), as Hero Watch's panel.
const wrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0, overflowY: 'auto', pointerEvents: 'auto', maxWidth: 360,
  fontFamily: 'var(--sc-font-data)', fontSize: 11, lineHeight: 1.4, padding: '4px 8px', borderRadius: 3,
  background: 'var(--sc-surface-panel)', border: '1px solid var(--sc-divider)', color: 'var(--sc-text-body)',
};
const heading: React.CSSProperties = { color: 'var(--sc-protected)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' };
const list: React.CSSProperties = { margin: '2px 0 0', padding: 0, listStyle: 'none', maxHeight: 220, overflowY: 'auto' };
const muted: React.CSSProperties = { color: 'var(--sc-text-muted)' };
const link: React.CSSProperties = { color: 'var(--sc-accent)' };

const countryName = (code: string | undefined) => {
  if (!code) return null;
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) ?? code.toUpperCase(); } catch { return code.toUpperCase(); }
};

const NoteRow: React.FC<{ note: AiWatchItem; drawnAt: string | undefined }> = ({ note, drawnAt }) => {
  const outlet = countryName(note.outletCountry);
  return (
    <li data-testid="ai-watch-note" style={{ margin: '4px 0' }}>
      <div><span data-testid="ai-watch-stance">{stanceWords(note.stance)}</span>{' · '}
        <a href={note.url} target="_blank" rel="noopener noreferrer" style={link}>{note.title}</a>
      </div>
      <div style={muted}>
        {[`${sourceNameOf(note)}${outlet ? ` (${outlet})` : ''}`, formatUtcDate(note.publishedAt * 1000, { year: true })].join(' · ')}
      </div>
      <div style={muted} data-testid="ai-watch-drawn-at">{drawnAt ? `On the globe: ${drawnAt}` : 'Names no place: listed here only'}</div>
      {/* Mecha Jono writes every title in English, a foreign source's as a description of it. */}
      <Translatable text={note.title} sourceLanguage="en" testId={`ai-watch-translate-${note.d}`} />
    </li>
  );
};

export const AiWatchPanel: React.FC<AiWatchPanelProps> = ({ notes, active, drawnAt, status }) => (
  <Docked slot="aiWatch">
    <div style={wrap} data-testid="ai-watch-panel">
      <div style={heading}>AI Watch</div>
      <div style={muted}>Sources&apos; headlines and links on AI, posted on The Record, sorted into areas, with a stance that is their reading.</div>
      {status.error && <div role="status">{status.error}</div>}
      {!status.error && !status.loaded && notes.length === 0 && <div style={muted}>Reading The Record…</div>}
      {status.loaded && notes.length === 0 && <div style={muted}>No note stands in the areas on at the moment shown.</div>}
      {AI_WATCH_SECTIONS.filter((section) => active[section]).map((section) => {
        const inSection = notes.filter((note) => note.sections.includes(section));
        if (!inSection.length) return null;
        return (
          <details key={section} open data-testid={`ai-watch-section-${section}`}>
            <summary style={{ cursor: 'pointer' }}>{`${SECTION_LABEL[section]} (${inSection.length})`}</summary>
            <ul style={list}>
              {inSection.map((note) => <NoteRow key={note.id} note={note} drawnAt={drawnAt.get(note.id)} />)}
            </ul>
          </details>
        );
      })}
    </div>
  </Docked>
);

export default AiWatchPanel;

/**
 * The inspector (critique-2026-11-01, OR16, OR20–OR23; plan A5): what a click on the globe opened, one panel for every
 * layer. Its title, kind, time and place, its text and where it was published, what else is drawn near it and around
 * its time, and four actions: make a card, copy a link to it, fly to it, show around its time. Docked at the top right
 * on a wide screen, a sheet from the bottom on a phone (OR20). It replaces the note panel only: Diplomacy, Hero Watch,
 * Missions and Operations keep their own (OR21).
 *
 * Notes come from public relays. Their text is shown as text, never as markup, and their links
 * pass through SourceLinks, which keeps http and https only.
 *
 * A mark standing for several notes (a town's events, a country's relief) opens them all: the
 * first is shown, the rest listed above it to pick from.
 */
import React, { useEffect, useMemo, useState } from 'react';
import KeyName from '../Identity/KeyName';
import { X, Image as ImageIcon, Link2, Crosshair, Clock, Orbit } from 'lucide-react';
import { Docked } from '../Dock/Docked';
import SourceLinks from '../Intel/SourceLinks';
import { LensBadges } from '../Intel/BigThreeLens';
import { NamesPeopleLabel } from '../Intel/NamesPeopleLabel';
import { closeGlobeNotes, openGlobeNotes, showGlobeNote, useGlobeNotes } from '../../features/globe/noteDetail/globeNoteStore';
import { useInspectorActions } from '../../features/globe/inspector/inspectorActions';
import { relatedMarks, relatedRadiusKm, type RelatedMark } from '../../features/globe/inspector/relatedMarks';
import { getRegisteredTooltipGroups } from './pointTooltipRegistry';
import { fill, numbered, useMessages } from '../../i18n/app/i18n';
import { usePsiLines } from '../../services/psiWatch/psiLinesStore';
import { bandsHolding, type OnBand } from '../../services/psiWatch/astro/lineBands';
import { openEventChart } from '../../features/psi/eventChartPanel';
import { psiKitOn } from '../../services/psiWatch/psiKitSwitch';
import { formatUtcDateTime } from '../../utils/utcTime';
import styles from './GlobeNotePanel.module.css';

/** A place to a tenth of a degree, about 11 km: never finer than a mark is drawn, and a click on an area means "about here". */
const placeText = (lat: number, lng: number) =>
  `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(1)}° ${lng >= 0 ? 'E' : 'W'}`;

export const GlobeNotePanel: React.FC = () => {
  const { open, index } = useGlobeNotes();
  const { m } = useMessages();
  const actions = useInspectorActions();
  const [copied, setCopied] = useState(false);
  // Where the clipboard is refused, the link is shown to select instead.
  const [linkShown, setLinkShown] = useState<string | null>(null);

  // Escape closes it, as it closes a Zone's panel.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeGlobeNotes(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => { setCopied(false); setLinkShown(null); }, [open, index]);

  // What else is drawn near it, read once when it opens: the marks do not wait on the panel.
  const related = useMemo<RelatedMark[]>(() => {
    if (!open?.at) return [];
    const radiusKm = relatedRadiusKm(actions.altitude?.() ?? 1.5);
    return relatedMarks(getRegisteredTooltipGroups().filter((g) => g.parent !== null), {
      at: open.at, radiusKm, window: actions.window?.() ?? null, self: open,
    });
  }, [open, actions]);

  // Which Planet line bands it falls in, while the lines and their bands are drawn (D-PW, PW83): said, never scored.
  const { drawn: linesDrawn } = usePsiLines();
  const onBands = useMemo<OnBand[]>(() => (
    open?.at && linesDrawn?.bands ? bandsHolding(open.at, new Date(linesDrawn.at), linesDrawn.bodies) : []
  ), [open, linesDrawn]);

  const note = open?.notes[index];
  // A set another panel shows (Missions' places, D-MF MF17) is not shown here too.
  if (!open || !note || open.panel) return null;
  const words = m.inspector;
  const close = m.settings.close;
  const at = open.at ?? null;

  const copyLink = async () => {
    if (!at || !actions.linkTo) return;
    const link = actions.linkTo(at, note.id);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setLinkShown(link);
    }
  };

  const when = note.timeMs !== null ? formatUtcDateTime(note.timeMs, { year: true }) : note.when ?? null;

  return (
    <Docked slot="globeNote">
      <article className={styles.panel} aria-label={note.title} data-testid="globe-note-panel">
        <header className={styles.header}>
          <div className={styles.titles}>
            <span className={styles.eyebrow}>{open.heading}</span>
            <h2 className={styles.name}>{note.title}</h2>
            <span className={styles.meta} data-testid="globe-inspector-meta">
              {note.kind}
              {when ? ` · ${when}` : ` · ${words.noTime}`}
            </span>
            {at && (
              <span className={styles.meta} data-testid="globe-inspector-place">
                {placeText(at.lat, at.lng)}{open.layer ? ` · ${open.layer}` : ''}
              </span>
            )}
            {/* Who posted it, at first sight; an AI agent's key is labelled so (the legal review; Art. 50). */}
            {note.author && <span className={styles.meta} data-testid="globe-note-author">Posted by <KeyName pubkey={note.author} /></span>}
            <LensBadges lenses={note.lenses} />
            <NamesPeopleLabel namesPeople={note.namesPeople} sources={note.sources} />
          </div>
          <button type="button" className={styles.close} aria-label={close} title={close} onClick={closeGlobeNotes}>
            <X size={14} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.actions} role="toolbar" aria-label={words.actions} data-testid="globe-inspector-actions">
          {actions.makeCard && (
            <button type="button" className={styles.action} onClick={() => { void actions.makeCard?.(); }} data-testid="globe-inspector-card">
              <ImageIcon size={13} aria-hidden="true" />{words.card}
            </button>
          )}
          {at && actions.linkTo && (
            <button type="button" className={styles.action} onClick={() => { void copyLink(); }} data-testid="globe-inspector-link">
              <Link2 size={13} aria-hidden="true" />{copied ? words.linkCopied : words.link}
            </button>
          )}
          {at && actions.flyTo && (
            <button type="button" className={styles.action} onClick={() => actions.flyTo?.(at)} data-testid="globe-inspector-fly">
              <Crosshair size={13} aria-hidden="true" />{words.flyTo}
            </button>
          )}
          {note.timeMs !== null && actions.showAround && (
            <button type="button" className={styles.action} onClick={() => actions.showAround?.(note.timeMs as number)} data-testid="globe-inspector-time">
              <Clock size={13} aria-hidden="true" />{words.itsTime}
            </button>
          )}
          {/* Its chart, then and now (D-PW, PW85): for anything with a time and a place, while Psi Watch is shown. */}
          {note.timeMs !== null && at && psiKitOn() && (
            <button type="button" className={styles.action} title={m.psiWatch.chart.actionTitle} data-testid="globe-inspector-chart"
              onClick={() => openEventChart({ title: note.title, timeMs: note.timeMs as number, place: at, layer: open.layer ?? null })}>
              <Orbit size={13} aria-hidden="true" />{m.psiWatch.chart.action}
            </button>
          )}
        </div>
        {linkShown && (
          <input className={styles.linkShown} readOnly value={linkShown} aria-label={words.copyThis} data-testid="globe-inspector-link-shown"
            onFocus={(e) => e.currentTarget.select()} autoFocus />
        )}

        {open.notes.length > 1 && (
          <nav className={styles.section} aria-label="Notes at this mark">
            <h3 className={styles.heading}>{open.notes.length} notes here</h3>
            <ol className={styles.others}>
              {open.notes.map((other, i) => (
                <li key={other.id}>
                  <button type="button" className={styles.other} aria-current={i === index} onClick={() => showGlobeNote(i)}>
                    {other.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        )}

        {/* A field mission's safety limits come before anything else it says (D-HW). */}
        {note.limits && (
          <section className={styles.section} aria-label="Safety limits" data-testid="globe-note-limits">
            <h3 className={styles.heading}>Safety limits</h3>
            <p className={styles.text}>{note.limits}</p>
          </section>
        )}

        <section className={styles.section} aria-label="What it says">
          {note.text.trim()
            ? <p className={styles.text} data-testid="globe-note-text">{note.text}</p>
            : <p className={styles.quiet}>It says nothing beyond its title.</p>}
        </section>

        <SourceLinks links={note.sources} sayNone className={styles.section} testId="globe-note-sources" />

        {onBands.length > 0 && linesDrawn && (
          <section className={styles.section} aria-label={m.psiWatch.lines.onBandHeading} data-testid="globe-inspector-psi-bands">
            <h3 className={styles.heading}>{m.psiWatch.lines.onBandHeading}</h3>
            <ul className={styles.others}>
              {onBands.map((b) => (
                <li key={`${b.body}:${b.angle}`} className={styles.plain}>
                  {fill(m.psiWatch.lines.onBand, {
                    body: (m.psiWatch.lines.bodies as Record<string, string>)[b.body] ?? b.body,
                    angle: b.angle,
                    km: numbered(Math.round(b.km)),
                    orb: numbered(Math.round(b.orbKm)),
                    time: formatUtcDateTime(linesDrawn.at),
                  })}
                </li>
              ))}
            </ul>
          </section>
        )}

        {at && (
          <section className={styles.section} aria-label={words.near} data-testid="globe-inspector-related">
            <h3 className={styles.heading}>{words.near}</h3>
            {related.length === 0 ? <p className={styles.quiet}>{words.nearNone}</p> : (
              <ol className={styles.others}>
                {related.map((r, i) => (
                  <li key={`${r.title}:${i}`}>
                    {r.opens ? (
                      <button type="button" className={styles.other} onClick={() => openGlobeNotes(r.opens!, { at: r.at, layer: r.layer })}>
                        {r.title}
                      </button>
                    ) : <span className={styles.plain}>{r.title}</span>}
                    <span className={styles.relatedMeta}>
                      {[r.layer, fill(words.km, { km: numbered(Math.round(r.distanceKm)) }), r.timeMs !== null ? formatUtcDateTime(r.timeMs) : null].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </article>
    </Docked>
  );
};

/**
 * The War & Conflict Brief on the globe (WC3; the owner's decisions of
 * 2026-10-02): one UTC day of Mecha Jono's war news, its items under each
 * theatre, worst war first as the brief orders them, each led by what
 * happened, where, and the casualties as reported, each claim apart. Picking
 * a theatre keeps its lines and lights up its war and its events on the globe;
 * All clears it. The day steps back through the days read.
 *
 * Folded to one line until opened, like coverage: the left column has room for
 * one line, not a list (BD4). Opened, it scrolls inside its corner.
 */
import React, { useId, useState } from 'react';
import ChevronRight from '@mui/icons-material/ChevronRight';
import { Docked } from '../Dock/Docked';
import type { ConflictItem } from '../../services/warConflict/warConflict';
import type { WarConflictBrief, BriefTheatre } from '../../services/warConflict/warConflictBrief';
import { casualtyClaim } from '../../services/warConflict/warConflictView';
import { TIER_COLOR } from './Hooks/useGlobeWarConflict';
import { formatUtcDate } from '../../utils/utcTime';

export interface WarConflictBriefPanelProps {
  brief: WarConflictBrief | null;
  /** The brief's items, newest first. */
  items: readonly ConflictItem[];
  /** The days read, newest first. */
  days: readonly string[];
  /** The day chosen; null is the newest. */
  day: string | null;
  onDay: (day: string | null) => void;
  /** The theatre picked, or null for all. */
  theatre: string | null;
  onTheatre: (slug: string | null) => void;
  regionName: (code: string) => string | null;
  /** Each theatre's items a day, ending on the brief's day (theatre-lens.md, TL7): its chip's sparkline. */
  series?: ReadonlyMap<string, ReadonlyArray<{ day: string; count: number | null }>>;
}

const wrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0, pointerEvents: 'auto', maxWidth: 340,
  fontFamily: 'var(--sc-font-data)', fontSize: 11, lineHeight: 1.4, padding: '4px 8px', borderRadius: 3,
  background: 'var(--sc-surface-panel)', border: '1px solid var(--sc-divider)', color: 'var(--sc-text-body)',
};
const toggle: React.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, padding: 0, textAlign: 'left',
  background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer',
};
const heading: React.CSSProperties = { color: 'var(--sc-text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' };
const body: React.CSSProperties = { flexDirection: 'column', gap: 6, minHeight: 0, overflowY: 'auto' };
const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' };
const chip = (pressed: boolean): React.CSSProperties => ({
  font: 'inherit', fontSize: 11, cursor: 'pointer', padding: '2px 6px', borderRadius: 2,
  display: 'inline-flex', alignItems: 'center', gap: 4,
  border: `1px solid ${pressed ? 'var(--sc-accent)' : 'var(--sc-divider)'}`,
  background: pressed ? 'var(--sc-surface-input)' : 'transparent',
  color: pressed ? 'var(--sc-text-heading)' : 'var(--sc-text-secondary)',
});
const step: React.CSSProperties = { ...chip(false), padding: '0 6px' };
const list: React.CSSProperties = { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 2 };
const groupHead: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, color: 'var(--sc-text-heading)' };
const swatch = (color: string): React.CSSProperties => ({ width: 8, height: 8, borderRadius: 1, background: color, flex: '0 0 auto' });

/** What happened (the headline where it names no event), where, and the casualties as reported, each claim apart. */
const lineOf = (it: ConflictItem, regionName: (code: string) => string | null): string => [
  it.events.length ? it.events.map((e) => e.label).join(', ') : it.title,
  it.place?.words ?? (it.jurisdiction ? regionName(it.jurisdiction) ?? it.jurisdiction.toUpperCase() : ''),
  it.casualties.map(casualtyClaim).join('; '),
].filter(Boolean).join(' · ');

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const SPARK_BAR = 3;
const SPARK_GAP = 1;
const SPARK_HEIGHT = 12;

/**
 * A theatre's items a day as bars (theatre-lens.md, TL7), its own busiest day the
 * tallest: the brief's day, the last, at full strength; a day with none a stub on
 * the baseline; a day not read, nothing. Its numbers are in the chip's hover.
 */
const DaySparkline: React.FC<{ days: ReadonlyArray<{ day: string; count: number | null }>; color: string }> = ({ days, color }) => {
  const most = Math.max(1, ...days.map((d) => d.count ?? 0));
  const width = days.length * (SPARK_BAR + SPARK_GAP) - SPARK_GAP;
  return (
    <svg data-testid="war-brief-spark" aria-hidden="true" width={width} height={SPARK_HEIGHT} viewBox={`0 0 ${width} ${SPARK_HEIGHT}`} style={{ flex: '0 0 auto' }}>
      {days.map((d, i) => {
        if (d.count === null) return null;
        const height = Math.max(1, Math.round((d.count / most) * SPARK_HEIGHT));
        return <rect key={d.day} x={i * (SPARK_BAR + SPARK_GAP)} y={SPARK_HEIGHT - height} width={SPARK_BAR} height={height} fill={color} opacity={i === days.length - 1 ? 1 : 0.5} />;
      })}
    </svg>
  );
};

/** A theatre's items a day in words, for its chip's hover: the days read, each with its count. */
const daysInWords = (name: string, days: ReadonlyArray<{ day: string; count: number | null }>) => {
  const read = days.filter((d) => d.count !== null);
  return read.length
    ? `${name}, items a day (UTC): ${read.map((d) => `${formatUtcDate(Date.parse(`${d.day}T00:00:00Z`))} ${d.count}`).join(' · ')}`
    : undefined;
};

export const WarConflictBriefPanel: React.FC<WarConflictBriefPanelProps> = ({
  brief, items, days, day, onDay, theatre, onTheatre, regionName, series,
}) => {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const shownDay = day ?? brief?.day ?? days[0] ?? null;
  const at = shownDay ? days.indexOf(shownDay) : -1;
  const date = shownDay ? formatUtcDate(Date.parse(`${shownDay}T00:00:00Z`), { year: true }) : '';
  const summary = brief
    ? `${date} · ${plural(brief.count, 'item', 'items')} · ${plural(brief.theatres.length, 'theatre', 'theatres')}`
    : `${date ? `${date} · ` : ''}no items`;

  const groups: Array<{ key: string; theatre: BriefTheatre | null; items: ConflictItem[] }> = brief
    ? [
      ...brief.theatres.map((t) => ({ key: t.slug, theatre: t, items: items.filter((it) => it.theatre?.slug === t.slug) })),
      ...(brief.noTheatre ? [{ key: 'none', theatre: null, items: items.filter((it) => !it.theatre) }] : []),
    ].filter((g) => theatre === null || g.key === theatre)
    : [];

  return (
    <Docked slot="warConflictBrief">
      <div style={wrap} data-testid="war-brief-panel">
        <button type="button" style={toggle} aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((was) => !was)} data-testid="war-brief-toggle">
          <ChevronRight style={{ fontSize: 14, transform: open ? 'rotate(90deg)' : undefined }} aria-hidden />
          <span style={heading}>War &amp; Conflict Brief</span>
          <span>{summary}</span>
        </button>
        <div id={bodyId} style={{ ...body, display: open ? 'flex' : 'none' }} hidden={!open}>
          <div style={row}>
            <button type="button" style={step} aria-label="Earlier day" disabled={at < 0 || at >= days.length - 1} onClick={() => onDay(days[at + 1])}>‹</button>
            <span>{date} (UTC)</span>
            <button type="button" style={step} aria-label="Later day" disabled={at <= 0} onClick={() => onDay(at - 1 === 0 ? null : days[at - 1])}>›</button>
          </div>
          {brief && (
            <div style={row} role="group" aria-label="Theatre">
              <button type="button" style={chip(theatre === null)} aria-pressed={theatre === null} onClick={() => onTheatre(null)}>All {brief.count}</button>
              {brief.theatres.map((t) => {
                const counted = series?.get(t.slug);
                const said = counted ? daysInWords(t.name, counted) : undefined;
                return (
                  <button key={t.slug} type="button" style={chip(theatre === t.slug)} aria-pressed={theatre === t.slug} onClick={() => onTheatre(t.slug)} title={said}>
                    {t.tier && <span style={swatch(TIER_COLOR[t.tier])} aria-hidden />}
                    {t.name} {t.count}
                    {said && counted && <DaySparkline days={counted} color={t.tier ? TIER_COLOR[t.tier] : 'currentColor'} />}
                  </button>
                );
              })}
            </div>
          )}
          {groups.map((g) => (
            <section key={g.key} data-testid="war-brief-group" data-theatre={g.key}>
              <div style={groupHead}>
                {g.theatre?.tier && <span style={swatch(TIER_COLOR[g.theatre.tier])} aria-hidden />}
                {g.theatre ? g.theatre.name : 'Naming no war'}
              </div>
              <ul style={list}>
                {g.items.map((it) => <li key={it.id} title={it.title}>{lineOf(it, regionName)}</li>)}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </Docked>
  );
};

export default WarConflictBriefPanel;

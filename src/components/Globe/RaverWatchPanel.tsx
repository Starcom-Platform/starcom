/**
 * Raver Watch's panel on the globe (the owner's decisions of 2026-10-01).
 *
 * Two jobs, both from Mecha Jono's v1.1 answers:
 *
 *   The timeline reaches forward. Scene events are published two weeks ahead,
 *   so Tonight, This weekend and the next seven days each set the shared
 *   window, which every layer then reads; Live returns to now.
 *
 *   What cannot be drawn is listed rather than lost. A note that names no
 *   place, or a region with no outline here, and a warning for all of Europe
 *   (which is also outlined) are listed newest first. Policy news is news, not
 *   an incident, so it has its own list, and so has scene news (festivals,
 *   tours, releases; RW17), which is never drawn. Each line gives the source, the date
 *   and a link to the source: nothing Raver Watch does not publish. A scene-news line
 *   names the festival and the artists its tags name (RN13).
 *
 *   This weekend spans every zone's Friday 00:00 to Monday 06:00 (RN11a).
 *   Every viewer gets the same window, so a shared link agrees with the panel.
 *   Each event counts by its own town's weekend.
 *
 * Docked, like every other panel on the globe, so it cannot land on them.
 */
import React from 'react';
import { Docked } from '../Dock/Docked';
import type { RaverWatchItem } from '../../services/raverWatch/raverWatch';
import { tonight, thisWeekend, nextDays, type TimeWindowMs } from '../../services/raverWatch/raverWatchWindows';
import { festivalText, lineupText } from '../../services/raverWatch/raverWatchView';
import { formatUtcDate } from '../../utils/utcTime';

export interface RaverWatchPanelProps {
  unplaced: readonly RaverWatchItem[];
  news: readonly RaverWatchItem[];
  /** Scene news: festivals, tours, line-ups and releases, listed and never drawn (RW17). */
  sceneNews?: readonly RaverWatchItem[];
  /** Whether the shared time is live. */
  isLive: boolean;
  /** The window the shared time holds, when paused. */
  windowMs?: TimeWindowMs | null;
  onWindow: (window: TimeWindowMs) => void;
  onLive: () => void;
  now?: () => number;
}

const wrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, pointerEvents: 'auto', maxWidth: 320,
  fontFamily: 'var(--sc-font-data)', fontSize: 11, lineHeight: 1.4, padding: '4px 8px', borderRadius: 3,
  background: 'var(--sc-surface-panel)', border: '1px solid var(--sc-divider)', color: 'var(--sc-text-body)',
};
const heading: React.CSSProperties = {
  color: 'var(--sc-protected)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
};
const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4 };
const button = (pressed: boolean): React.CSSProperties => ({
  font: 'inherit', fontSize: 11, cursor: 'pointer', padding: '2px 6px', borderRadius: 2,
  border: `1px solid ${pressed ? 'var(--sc-protected)' : 'var(--sc-divider)'}`,
  background: pressed ? 'var(--sc-surface-input)' : 'transparent',
  color: pressed ? 'var(--sc-text-heading)' : 'var(--sc-text-secondary)',
});
const list: React.CSSProperties = { margin: '2px 0 0', padding: 0, listStyle: 'none', maxHeight: 160, overflowY: 'auto' };
const muted: React.CSSProperties = { color: 'var(--sc-text-muted)' };
const link: React.CSSProperties = { color: 'var(--sc-accent)' };

type Preset = 'tonight' | 'weekend' | 'week';
const PRESETS: ReadonlyArray<{ id: Preset; label: string; window: (now: number) => TimeWindowMs }> = [
  { id: 'tonight', label: 'Tonight', window: tonight },
  { id: 'weekend', label: 'This weekend', window: (now) => thisWeekend(now) },
  { id: 'week', label: 'Next 7 days', window: (now) => nextDays(now, 7) },
];

const REGION_NAMES: Record<string, string> = { europe: 'Europe' };

/** Where a listed item applies, in words, as far as its note says. */
const whereOf = (item: RaverWatchItem): string =>
  item.region ? REGION_NAMES[item.region] ?? item.region
    : item.jurisdiction ? item.jurisdiction.toUpperCase()
      : 'no place named';

const Listed: React.FC<{ title: string; items: readonly RaverWatchItem[] }> = ({ title, items }) => {
  if (items.length === 0) return null;
  return (
    <details>
      <summary style={{ cursor: 'pointer' }}>{title} ({items.length})</summary>
      <ul style={list}>
        {items.map((item) => (
          <li key={item.id} data-testid="raver-watch-listed" style={{ margin: '3px 0' }}>
            {item.url && /^https?:\/\//i.test(item.url)
              ? <a href={item.url} target="_blank" rel="noopener noreferrer" style={link}>{item.title}</a>
              : <span>{item.title}</span>}
            <div style={muted}>
              {item.source} · {whereOf(item)} · {formatUtcDate(item.validFrom * 1000, { year: true })}
            </div>
            {(item.festivals?.length || item.lineup?.length) ? (
              <div style={muted}>
                {[item.festivals?.length ? festivalText(item.festivals) : '', item.lineup?.length ? lineupText(item.lineup, 'Artists:') : '']
                  .filter(Boolean).join(' · ')}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
};

const NO_ITEMS: readonly RaverWatchItem[] = [];

export const RaverWatchPanel: React.FC<RaverWatchPanelProps> = ({
  unplaced, news, sceneNews = NO_ITEMS, isLive, windowMs = null, onWindow, onLive, now = Date.now,
}) => {
  // A preset is chosen while the timeline holds the window it would set from
  // that window's own start, whoever set it: this panel, or a share handle.
  const holds = (preset: (typeof PRESETS)[number]) => {
    if (isLive || !windowMs) return false;
    const its = preset.window(windowMs.start);
    return its.start === windowMs.start && its.end === windowMs.end;
  };

  return (
    <Docked slot="raverWatch">
      <div style={wrap} data-testid="raver-watch-panel">
        <div style={heading}>Raver Watch</div>
        <div style={row} role="group" aria-label="When to look">
          <button type="button" style={button(isLive)} aria-pressed={isLive} onClick={onLive}>Live</button>
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              style={button(holds(preset))}
              aria-pressed={holds(preset)}
              onClick={() => onWindow(preset.window(now()))}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <Listed title="Elsewhere or unplaced" items={unplaced} />
        <Listed title="Policy and law" items={news} />
        <Listed title="Scene news" items={sceneNews} />
      </div>
    </Docked>
  );
};

export default RaverWatchPanel;

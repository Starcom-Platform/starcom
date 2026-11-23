/**
 * Hero Watch's panel on the globe (decision D-HW, step 6), as Raver Watch's: what the globe draws is
 * said by its key and its hovers; this says what the globe cannot.
 *
 *   The week: Mecha Jono's weekly summary, its words as written, folded to its title until opened.
 *   Relief: each country tinted, with its operations and its count of organisations, each linked to
 *     its source, so a reader can check them where they came from.
 *   Field missions with no place drawn here, each with its safety limits: a mission is never shown
 *     without them. And relief notes with no country drawn here.
 *
 * Text from the notes is shown as text: `**bold**` as bold and an http(s) address as a link, nothing
 * else read as markup. Docked, as every panel on the globe is, so it cannot land on the others.
 */
import React from 'react';
import { Docked } from '../Dock/Docked';
import type { FieldMission, ReliefOperation, ReliefPresence, WeekSummary } from '../../services/heroWatch/heroWatch';
import { lastDayOf, reliefPill, type ReliefCountry } from '../../services/heroWatch/heroWatchRelief';
import { formatUtcDate } from '../../utils/utcTime';

export interface HeroWatchPanelProps {
  summary: WeekSummary | null;
  /** The countries with relief drawn, while Relief is on. */
  relief: readonly ReliefCountry[];
  /** What is listed rather than drawn. */
  listed: { relief: ReadonlyArray<ReliefOperation | ReliefPresence>; missions: readonly FieldMission[] };
  showRelief: boolean;
  showMissions: boolean;
}

// Shrinks to the room the corner has and scrolls inside (a `fitsDock` slot): opened whole, it ran off the window.
const wrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0, overflowY: 'auto', pointerEvents: 'auto', maxWidth: 340,
  fontFamily: 'var(--sc-font-data)', fontSize: 11, lineHeight: 1.4, padding: '4px 8px', borderRadius: 3,
  background: 'var(--sc-surface-panel)', border: '1px solid var(--sc-divider)', color: 'var(--sc-text-body)',
};
const heading: React.CSSProperties = {
  color: 'var(--sc-protected)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase',
};
const list: React.CSSProperties = { margin: '2px 0 0', padding: 0, listStyle: 'none', maxHeight: 180, overflowY: 'auto' };
const muted: React.CSSProperties = { color: 'var(--sc-text-muted)' };
const link: React.CSSProperties = { color: 'var(--sc-accent)' };
const text: React.CSSProperties = { whiteSpace: 'pre-line', maxHeight: 220, overflowY: 'auto', margin: '2px 0 0' };

const isLink = (url: string | undefined): url is string => !!url && /^https?:\/\//i.test(url);
const Linked: React.FC<{ url?: string; children: React.ReactNode }> = ({ url, children }) => (isLink(url)
  ? <a href={url} target="_blank" rel="noopener noreferrer" style={link}>{children}</a>
  : <span>{children}</span>);

/** A note's words as text: `**bold**` as bold, and an http(s) address as a link. */
const NoteText: React.FC<{ value: string }> = ({ value }) => (
  <>
    {value.split(/(\*\*[^*]+\*\*|https?:\/\/[^\s)]+)/g).map((part, i) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (/^https?:\/\//.test(part)) return <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={link}>{part}</a>;
      return <React.Fragment key={i}>{part}</React.Fragment>;
    })}
  </>
);

const Folded: React.FC<{ title: React.ReactNode; testId: string; children: React.ReactNode }> = ({ title, testId, children }) => (
  <details data-testid={testId}>
    <summary style={{ cursor: 'pointer' }}>{title}</summary>
    {children}
  </details>
);

const until = (endS: number | undefined) => (endS === undefined ? null : `until ${formatUtcDate(lastDayOf(endS), { year: true })}`);

export const HeroWatchPanel: React.FC<HeroWatchPanelProps> = ({ summary, relief, listed, showRelief, showMissions }) => (
  <Docked slot="heroWatch">
    <div style={wrap} data-testid="hero-watch-panel">
      <div style={heading}>Hero Watch</div>
      {summary && (
        <Folded title={<>The week: {summary.title}</>} testId="hero-watch-summary">
          <div style={text}><NoteText value={summary.content} /></div>
        </Folded>
      )}
      {showRelief && relief.length > 0 && (
        <Folded title={`Relief (${relief.length})`} testId="hero-watch-relief">
          <ul style={list}>
            {relief.map((country) => (
              <li key={country.code} style={{ margin: '3px 0' }}>
                <div>{reliefPill(country)}</div>
                {country.operations.map((op) => (
                  <div key={op.id} style={{ paddingLeft: 8 }}>
                    <Linked url={op.url}>{op.title}</Linked>
                    <div style={muted}>{[op.source ?? 'IFRC GO', op.appealType, until(op.end)].filter(Boolean).join(' · ')}</div>
                  </div>
                ))}
                {country.presence && (
                  <div style={{ paddingLeft: 8 }}>
                    <Linked url={country.presence.url}>{country.presence.title}</Linked>
                    <div style={muted}>{[country.presence.source, country.presence.license].filter(Boolean).join(' · ')}</div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Folded>
      )}
      {showMissions && listed.missions.length > 0 && (
        <Folded title={`Field missions with no place drawn (${listed.missions.length})`} testId="hero-watch-unplaced-missions">
          <ul style={list}>
            {listed.missions.map((mission) => (
              <li key={mission.id} data-testid="hero-watch-listed-mission" style={{ margin: '3px 0' }}>
                <Linked url={mission.url}>{mission.title}</Linked>
                <div style={muted}>
                  {mission.objectives.length} ask{mission.objectives.length === 1 ? '' : 's'} · open to {formatUtcDate(lastDayOf(mission.validUntil), { year: true })}
                </div>
                <div style={muted}>Its limits: {mission.limits}</div>
              </li>
            ))}
          </ul>
        </Folded>
      )}
      {showRelief && listed.relief.length > 0 && (
        <Folded title={`Relief with no country drawn (${listed.relief.length})`} testId="hero-watch-unplaced-relief">
          <ul style={list}>
            {listed.relief.map((item) => (
              <li key={item.id} style={{ margin: '3px 0' }}>
                <Linked url={item.url}>{item.title}</Linked>
                <div style={muted}>{[item.source, item.jurisdiction ? item.jurisdiction.toUpperCase() : 'no place named'].filter(Boolean).join(' · ')}</div>
              </li>
            ))}
          </ul>
        </Folded>
      )}
    </div>
  </Docked>
);

export default HeroWatchPanel;

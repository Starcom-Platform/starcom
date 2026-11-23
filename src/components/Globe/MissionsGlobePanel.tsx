/**
 * Missions' panel on the globe (decision D-MF, step 5; MF16–MF17).
 *
 * At rest it lists the missions done from anywhere, the ones naming no place drawn here, under "Can be done
 * from anywhere (N)", and says how many are at places on the globe. A click on a place's clipboard opens that
 * place's missions here instead (the globe's note store carries the click, marked for this panel), with the
 * way back to the rest. Each mission is a row leading with what it asks; "See what to do" opens it in full,
 * as the Missions app does, with "Take this mission" and its limits first.
 */
import React, { useMemo, useState } from 'react';
import { Docked } from '../Dock/Docked';
import type { MissionCard } from '../../services/intel/received/missionCard';
import type { MissionsAtPlace } from '../../services/intel/received/missionPlaces';
import type { AcceptedPackage } from '../../services/intel/MissionPackageIngest';
import { closeGlobeNotes, useGlobeNotes } from '../../features/globe/noteDetail/globeNoteStore';
import { useMissionLabels } from '../../services/intel/useMissionLabels';
import { coordinateFor } from '../../services/intel/missionPackageThread';
import { useTakenMissions } from '../../services/intel/received/useTakenMissions';
import { PackageDetail } from '../../applications/teamworkspace/missions/ReceivedPackagesPanel';
import { effortText, endsText } from '../../applications/teamworkspace/missions/missionWords';
import { useMessages } from '../../i18n/app/i18n';

export interface MissionsGlobePanelProps {
  places: readonly MissionsAtPlace[];
  anywhere: readonly MissionCard[];
  /** The read still under way: not every package in yet. */
  reading: boolean;
  /** For tests: the moment "ends in" is counted from. */
  now?: number;
}

// Shrinks to the room the corner has and scrolls inside (a `fitsDock` slot), as AI Watch's panel.
const wrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0, overflowY: 'auto', pointerEvents: 'auto', maxWidth: 360,
  fontFamily: 'var(--sc-font-data)', fontSize: 11, lineHeight: 1.4, padding: '4px 8px', borderRadius: 3,
  background: 'var(--sc-surface-panel)', border: '1px solid var(--sc-divider)', color: 'var(--sc-text-body)',
};
const heading: React.CSSProperties = { color: 'var(--sc-protected)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' };
const list: React.CSSProperties = { margin: '2px 0 0', padding: 0, listStyle: 'none', maxHeight: 260, overflowY: 'auto' };
const muted: React.CSSProperties = { color: 'var(--sc-text-muted)' };
const action: React.CSSProperties = {
  background: 'none', border: '1px solid var(--sc-divider)', borderRadius: 3, color: 'var(--sc-accent)',
  font: 'inherit', padding: '1px 6px', cursor: 'pointer', marginTop: 2,
};

const coordinateOf = (pkg: AcceptedPackage): string => {
  const d = pkg.event.tags.find((t) => t[0] === 'd')?.[1];
  return d ? coordinateFor(pkg.event.pubkey, d) : '';
};

const MissionRow: React.FC<{ card: MissionCard; now: number; taken: boolean; onOpen: (pkg: AcceptedPackage) => void }> = ({ card, now, taken, onOpen }) => {
  const { lang, m } = useMessages();
  const words = m.missionParts.cards;
  const facts = [
    card.closesAt !== undefined ? endsText(card.closesAt, now, lang, words).text : null,
    card.effortMinutes ? effortText(card.effortMinutes, lang, m, words) : null,
    card.where === 'field' ? words.field : card.where === 'desk' ? words.desk : null,
    taken ? m.missionParts.taking.chip : null,
  ].filter(Boolean);
  return (
    <li data-testid="missions-globe-row" style={{ margin: '6px 0' }}>
      <div style={{ fontWeight: 600 }}>{card.headline}</div>
      {facts.length > 0 && <div style={muted}>{facts.join(' · ')}</div>}
      <button type="button" style={action} onClick={() => onOpen(card.pkg)} data-testid="missions-globe-open">{words.seeWhatToDo}</button>
    </li>
  );
};

export const MissionsGlobePanel: React.FC<MissionsGlobePanelProps> = ({ places, anywhere, reading, now: fixedNow }) => {
  const now = fixedNow ?? Date.now();
  const { open } = useGlobeNotes();
  const taken = useTakenMissions();
  const takenKeys = useMemo(() => new Set(taken.map((mission) => mission.key)), [taken]);
  const [detail, setDetail] = useState<AcceptedPackage | null>(null);
  // NavCom's labels on the mission opened in full, read while it is open (D-MX: MX1, MX5).
  const labels = useMissionLabels(detail ? [coordinateOf(detail)] : []);

  // A place's clipboard, clicked: its missions, by the keys the click carried.
  const placeOpen = open?.panel === 'missions' ? open : null;
  const atPlace = useMemo(() => {
    if (!placeOpen) return null;
    const byKey = new Map(places.flatMap((place) => place.cards).map((card) => [card.key, card]));
    return placeOpen.notes.flatMap((note) => byKey.get(note.id) ?? []);
  }, [placeOpen, places]);
  const placedCount = places.reduce((n, place) => n + place.cards.length, 0);

  const rows = (cards: readonly MissionCard[]) => (
    <ul style={list}>
      {cards.map((card) => <MissionRow key={card.key} card={card} now={now} taken={takenKeys.has(card.key)} onOpen={setDetail} />)}
    </ul>
  );

  return (
    <Docked slot="missions">
      <div style={wrap} data-testid="missions-globe-panel">
        <div style={heading}>Missions</div>
        {reading && <div style={muted}>Reading the missions posted…</div>}
        {placeOpen && atPlace ? (
          <div data-testid="missions-globe-place">
            <div style={{ fontWeight: 600 }}>{`${placeOpen.heading} · ${atPlace.length} mission${atPlace.length === 1 ? '' : 's'}`}</div>
            {rows(atPlace)}
            <button type="button" style={action} onClick={closeGlobeNotes} data-testid="missions-globe-back">All missions</button>
          </div>
        ) : (
          <>
            {!reading && (
              <div style={muted} data-testid="missions-globe-summary">
                {placedCount
                  ? `${placedCount} mission${placedCount === 1 ? '' : 's'} at ${places.length} place${places.length === 1 ? '' : 's'} on the globe: click a clipboard to see them.`
                  : 'No open mission names a place drawn here.'}
              </div>
            )}
            {anywhere.length > 0 && (
              <details open data-testid="missions-globe-anywhere">
                <summary style={{ cursor: 'pointer' }}>{`Can be done from anywhere (${anywhere.length})`}</summary>
                {rows(anywhere)}
              </details>
            )}
          </>
        )}
      </div>
      {detail && <PackageDetail pkg={detail} onClose={() => setDetail(null)} labels={labels} />}
    </Docked>
  );
};

export default MissionsGlobePanel;

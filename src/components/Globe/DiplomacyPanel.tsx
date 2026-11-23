/**
 * Diplomacy's drawer (decision D-DP, DP8, step 5): a docked panel, as AI Watch's. With a place selected
 * on the globe, its events, the most widely told first: the two countries; CAMEO's code and its name,
 * in the codebook's words (cameoCodes.ts); Goldstein on its scale, with the codebook's caveat that it
 * scores the type of event (DP11); when GDELT added it; how many outlets told its story; the coder's
 * confidence and the lead paragraph where the snapshot has them; and the report itself. Always the
 * primer: what CAMEO and Goldstein are, and what machine coding from the news cannot tell. With a
 * country selected (DP16), its relations in the time shown, its brief (DiplomacyBrief.tsx, DP6), its
 * events and the related intel.
 */
import React from 'react';
import { Docked } from '../Dock/Docked';
import { SymbolIcon } from '../../symbols/SymbolIcon';
import { DIPLOMACY_CATEGORY_SYMBOLS } from '../../symbols/symbolRegistry';
import { counted, fill, numbered, useMessages } from '../../i18n/app/i18n';
import { formatUtcDateTime } from '../../utils/utcTime';
import { gdeltStampToMs, type RealGdeltEvent } from '../../services/geopolitical/gdeltEventExport';
import { categorizeGdeltEvent, diplomaticEventColor } from '../../geopolitical/theme/diplomaticEventTheme';
import { cameoNameOf } from '../../geopolitical/theme/cameoCodes';
import { outletOf, storyOutlets } from '../../geopolitical/utils/diplomaticStories';
import type { DiplomaticPlace } from '../../geopolitical/utils/diplomaticPlaces';
import type { CountryRelation } from '../../geopolitical/utils/diplomaticRelations';
import { caseFromEvent } from '../../geopolitical/utils/diplomaticCase';
import { caseManagerAdapter } from '../../core/intel/adapters/caseManagerAdapter';
import { useApplicationRouter } from '../../hooks/useApplicationRouter';
import { useNavigate } from 'react-router-dom';
import { describeRecordTime, reportTime } from '../../services/intel/recordTime';
import type { IntelReportUI } from '../../types/intel/IntelReportUI';
import { cssColorOf } from '../../services/globe/globeLegendStore';
import { DiplomacyBriefView } from './DiplomacyBrief';
import { useCountryBrief } from '../../geopolitical/hooks/useCountryBrief';

export interface DiplomacyPanelProps {
  /** The place selected on the globe; null for none. */
  place: DiplomaticPlace | null;
  /** Country names by the three-letter code GDELT names actors by. */
  countryNames: ReadonlyMap<string, string>;
  onClose: () => void;
  /**
   * A country selected while Diplomacy is drawn (DP5, DP16): its counterparts and events, shown when no
   * place is; null for none.
   */
  country: {
    code: string;
    name: string;
    relations: readonly CountryRelation[];
    events: readonly RealGdeltEvent[];
    onClose: () => void;
  } | null;
  /** The Intel Reports about the countries in view, in the time shown (step 8); absent, none is shown. */
  relatedReports?: readonly IntelReportUI[];
}

/** How many events a place lists before saying how many more: Moscow had 266 in a day. */
const SHOWN = 25;

// Shrinks to the room the corner has and scrolls inside (a `fitsDock` slot), as AI Watch's panel.
const wrap: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0, overflowY: 'auto', pointerEvents: 'auto', maxWidth: 380,
  fontFamily: 'var(--sc-font-data)', fontSize: 11, lineHeight: 1.4, padding: '4px 8px', borderRadius: 3,
  background: 'var(--sc-surface-panel)', border: '1px solid var(--sc-divider)', color: 'var(--sc-text-body)',
};
const titleRow: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 };
const title: React.CSSProperties = { color: 'var(--sc-protected)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' };
const placeName: React.CSSProperties = { margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--sc-text-heading)' };
// The lists keep their height and the panel scrolls: shrunk in its column, a list showed a row and a half.
const list: React.CSSProperties = { margin: '2px 0 0', padding: 0, listStyle: 'none', flexShrink: 0 };
const relationList: React.CSSProperties = { ...list, maxHeight: 132, overflowY: 'auto' };
const muted: React.CSSProperties = { color: 'var(--sc-text-muted)' };
const link: React.CSSProperties = { color: 'var(--sc-accent)' };
const linkButton: React.CSSProperties = { ...link, background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', textAlign: 'left' };
const closeButton: React.CSSProperties = {
  background: 'none', border: '1px solid var(--sc-divider)', borderRadius: 3, color: 'var(--sc-text-muted)',
  fontSize: 11, padding: '1px 6px', cursor: 'pointer',
};

type Words = ReturnType<typeof useMessages>['m']['diplomacy'];

const EventRow: React.FC<{
  event: RealGdeltEvent; told: number; names: ReadonlyMap<string, string>; words: Words;
  /** Starts a case on this event's story (DP7). */
  onStartCase: (event: RealGdeltEvent) => void;
}> = ({ event, told, names, words, onStartCase }) => {
  const category = categorizeGdeltEvent(event.eventRootCode, event.eventCode);
  const cameo = cameoNameOf(event.eventCode);
  const reported = gdeltStampToMs(event.dateAdded);
  const nameOf = (code: string) => names.get(code) ?? code;
  const code = cameo
    ? fill(words.cameo, { code: event.eventCode, name: cameo.name })
      + (cameo.parent ? `, ${fill(words.cameoKind, { code: cameo.parent.code, name: cameo.parent.name })}` : '')
    : `CAMEO ${event.eventCode}`;
  const details = [
    fill(words.goldstein, { score: numbered(event.goldsteinScale) }),
    reported !== null ? fill(words.reported, { when: formatUtcDateTime(reported) }) : null,
    counted(words.story, told),
    event.confidence !== undefined ? fill(words.confidenceOf, { n: numbered(event.confidence) }) : null,
    event.lead ? words.lead : null,
  ].filter(Boolean).join(' · ');
  const outlet = outletOf(event.sourceUrl);
  return (
    <li data-testid="diplomacy-event" style={{ margin: '5px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {category && <SymbolIcon symbol={DIPLOMACY_CATEGORY_SYMBOLS[category]} size={12} color={cssColorOf(diplomaticEventColor(category))} />}
        <span>{fill(words.pair, { a: nameOf(event.actor1ISO3), b: nameOf(event.actor2ISO3) })}</span>
      </div>
      <div>{code}</div>
      <div style={muted}>{details}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {/^https?:\/\//.test(event.sourceUrl) && (
          <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" style={link}>
            {words.readSource}{outlet ? ` (${outlet})` : ''}
          </a>
        )}
        <button type="button" style={closeButton} onClick={() => onStartCase(event)}>{words.startCase}</button>
      </div>
    </li>
  );
};

/** Events, the most widely told first, then the latest; the first SHOWN, then how many more. */
const EventList: React.FC<{ events: readonly RealGdeltEvent[]; names: ReadonlyMap<string, string>; words: Words }> = ({ events, names, words }) => {
  const { navigateToApp } = useApplicationRouter();
  // A case on the event's story, its articles its sources, opened in Cases (DP7).
  const startCase = (event: RealGdeltEvent) => {
    void caseManagerAdapter.addCase(caseFromEvent(event, events, names)).then((id) => {
      if (id) navigateToApp('cases', undefined, { selectCaseId: id });
    });
  };
  // A story's outlets are counted among the events given: a place's, where all of a story's events
  // stand (a story is one pair, kind and place), or a country's.
  const outlets = storyOutlets(events);
  const sorted = [...events].sort((a, b) => (outlets.get(b.id) ?? 1) - (outlets.get(a.id) ?? 1) || b.dateAdded.localeCompare(a.dateAdded));
  return (
    <>
      <ul style={list}>
        {sorted.slice(0, SHOWN).map((event) => (
          <EventRow key={event.id} event={event} told={outlets.get(event.id) ?? 1} names={names} words={words} onStartCase={startCase} />
        ))}
      </ul>
      {sorted.length > SHOWN && <div style={muted}>{counted(words.moreEvents, sorted.length - SHOWN)}</div>}
    </>
  );
};

/** How many related reports the drawer lists before saying how many more. */
const RELATED_SHOWN = 8;

/** The Intel Reports about the countries in view (step 8), each saying which time placed it, opening in Intel. */
const RelatedIntel: React.FC<{ reports: readonly IntelReportUI[]; words: Words }> = ({ reports, words }) => {
  const navigate = useNavigate();
  return (
    <>
      <div style={{ ...title, marginTop: 4 }}>{words.relatedTitle}</div>
      {reports.length === 0 ? (
        <div style={muted}>{words.relatedNone}</div>
      ) : (
        <ul style={list}>
          {reports.slice(0, RELATED_SHOWN).map((report) => {
            const time = reportTime(report);
            const when = time ? describeRecordTime(time) : null;
            return (
              <li key={report.id} data-testid="diplomacy-related" style={{ margin: '3px 0' }}>
                <button type="button" style={linkButton} onClick={() => navigate(`/intel?reportId=${encodeURIComponent(report.id)}`)}>{report.title}</button>
                {when && <span style={muted}>{` · ${when.label} ${when.text}`}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {reports.length > RELATED_SHOWN && <div style={muted}>{counted(words.relatedMore, reports.length - RELATED_SHOWN)}</div>}
    </>
  );
};

export const DiplomacyPanel: React.FC<DiplomacyPanelProps> = ({ place, countryNames, onClose, country, relatedReports }) => {
  const { m } = useMessages();
  const words = m.diplomacy;
  const nameOf = (code: string) => countryNames.get(code) ?? code;
  // The place over the country, when both are selected: the place was chosen last, on the globe.
  const shown = place ? 'place' : country ? 'country' : null;
  // Read from the country's first selection, so its brief is there when a place over it is closed.
  const brief = useCountryBrief(country?.code ?? null);
  return (
    <Docked slot="diplomacy">
      <section style={wrap} data-testid="diplomacy-panel" aria-label={words.drawerTitle}>
        <div style={titleRow}>
          <span style={title}>{words.drawerTitle}</span>
          {shown && (
            <button type="button" style={closeButton} onClick={shown === 'place' ? onClose : country!.onClose}>{words.close}</button>
          )}
        </div>
        {shown === 'place' && place && (
          <>
            <h3 style={placeName}>{place.name}</h3>
            <div style={muted}>{`${counted(words.reports, place.events.length)}, ${counted(words.toldByOutlets, place.outlets)}`}</div>
            <EventList events={place.events} names={countryNames} words={words} />
            <div style={muted}>{words.goldsteinCaveat}</div>
            {relatedReports && <RelatedIntel reports={relatedReports} words={words} />}
          </>
        )}
        {shown === 'country' && country && (
          <>
            <h3 style={placeName}>{country.name}</h3>
            <div style={{ ...title, marginTop: 4 }}>{words.relationsTitle}</div>
            {country.relations.length ? (
              <>
                <div style={muted}>{counted(words.withCounterparts, country.relations.length)}</div>
                <ul style={relationList}>
                  {country.relations.map((relation) => (
                    <li key={relation.counterpart} data-testid="diplomacy-relation">
                      {`${nameOf(relation.counterpart)}: ${fill(words.relationLine, { coop: numbered(relation.cooperation), conflict: numbered(relation.conflict) })}`}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div style={muted}>{words.noRelations}</div>
            )}
            {brief && <DiplomacyBriefView brief={brief} words={words} />}
            {country.events.length > 0 && (
              <>
                <div style={{ ...title, marginTop: 4 }}>{words.itsEvents}</div>
                <EventList events={country.events} names={countryNames} words={words} />
                <div style={muted}>{words.goldsteinCaveat}</div>
              </>
            )}
            {relatedReports && <RelatedIntel reports={relatedReports} words={words} />}
          </>
        )}
        {!shown && <div style={muted}>{words.pickPlace}</div>}
        <details open={!shown}>
          <summary style={{ cursor: 'pointer' }}>{words.primerTitle}</summary>
          {words.primer.map((line) => <p key={line} style={{ margin: '3px 0' }}>{line}</p>)}
        </details>
      </section>
    </Docked>
  );
};

export default DiplomacyPanel;

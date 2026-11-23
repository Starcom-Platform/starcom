// CountryInfoPopup.tsx — click-to-select detail popup for the National
// Territories globe layer. Mirrors IntelReportPopup's visual shape (dark
// panel, header/close-button/body, backdrop) at a much smaller scale — no
// multi-item navigation, since only one country is ever selected at a time.
// Mounted via usePopup()'s showPopup (see PopupManager.tsx), which already
// supplies the backdrop, z-index, and Escape-to-close handling — this
// component only needs to render its own content and call onClose.
//
// Resource Zones / Diplomatic Events sections (Plan D: Selection-to-Context
// Bridge) query the CURRENTLY APPLIED config/filter state via
// countryContextQueries.ts — not the raw sample arrays — so this popup never
// claims a zone/event is present that the user has toggled off and can't see
// in the 3D scene. Each section renders when its layer is drawn: the globe
// says so when it opens this popup (the sub-mode, a pin, or the overlay, as
// Globe.tsx gates the layers), else the overlay toggles alone. In the Resource
// Zones sub-mode it used to say "turn on Resource Zones" (critique-2026-11-01, O9).
import React from 'react';
import styles from './CountryInfoPopup.module.css';
import { useGeoPoliticalSettings } from '../../../hooks/useGeoPoliticalSettings';
import { useVisualizationOverlay } from '../../../hooks/useVisualizationOverlay';
import { getActiveResourceTypeForCountry, getActiveEventsForCountry } from '../../../geopolitical/utils/countryContextQueries';
import { useGdeltSpan } from '../../../geopolitical/hooks/useGdeltSpan';
import { resourceTypeColor } from '../../../geopolitical/theme/resourceZoneTheme';
import { useResourceZonePercentiles } from '../../../geopolitical/hooks/useResourceZonePercentiles';
import { useRealDiplomaticEvents } from '../../../geopolitical/hooks/useRealDiplomaticEvents';
import { categorizeGdeltEvent, diplomaticEventColor } from '../../../geopolitical/theme/diplomaticEventTheme';
import { DIPLOMACY_CATEGORY_SYMBOLS } from '../../../symbols/symbolRegistry';
import { SymbolIcon } from '../../../symbols/SymbolIcon';
import { cssColorOf } from '../../../services/globe/globeLegendStore';
import { messagesNow } from '../../../i18n/app/i18n';
import { resourceLines } from '../../../geopolitical/utils/countryBrief';
import { resourceLineWords } from '../../../geopolitical/utils/resourceLineWords';
import { WatchPlaceButton } from '../../Watchlist/WatchPlaceButton';

export interface CountryInfoPopupProps {
  countryCode: string;
  name?: string;
  onClose: () => void;
  /** Whether the globe draws Resource Zones, as a sub-mode, a pin or the overlay; else the overlay toggle says. */
  resourceZonesOn?: boolean;
  /** Whether the globe draws Diplomatic Events, the same way. */
  diplomaticEventsOn?: boolean;
}

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  oil: 'Oil',
  gas: 'Natural Gas',
  minerals: 'Minerals',
  water: 'Water',
  renewable: 'Renewable Energy'
};

// GDELT's real dateAdded format, YYYYMMDDHHMMSS -> a readable date.
function formatGdeltDate(dateAdded: string): string {
  const iso = `${dateAdded.slice(0, 4)}-${dateAdded.slice(4, 6)}-${dateAdded.slice(6, 8)}`;
  return iso;
}

export const CountryInfoPopup: React.FC<CountryInfoPopupProps> = ({ countryCode, name, onClose, resourceZonesOn, diplomaticEventsOn }) => {
  const { config } = useGeoPoliticalSettings();
  const overlays = useVisualizationOverlay();
  const resourceZonesOverlayEnabled = resourceZonesOn ?? overlays.resourceZonesOverlayEnabled;
  const diplomaticEventsOverlayEnabled = diplomaticEventsOn ?? overlays.diplomaticEventsOverlayEnabled;
  const { percentilesByCountry, figures } = useResourceZonePercentiles(resourceZonesOverlayEnabled);
  const { events: realDiplomaticEvents, asOf: diplomaticAsOf, from: diplomaticFrom } = useRealDiplomaticEvents(diplomaticEventsOverlayEnabled);
  // What the globe shows of the day: the same span its Diplomacy layer draws (useGdeltSpan).
  const { span: diplomaticSpan } = useGdeltSpan({ from: diplomaticFrom, asOf: diplomaticAsOf });

  const activeResourceType = resourceZonesOverlayEnabled
    ? getActiveResourceTypeForCountry(countryCode, config.resourceZones, percentilesByCountry)
    : null;
  const activeEvents = diplomaticEventsOverlayEnabled
    ? getActiveEventsForCountry(countryCode, config.diplomaticEvents, realDiplomaticEvents, diplomaticSpan)
    : [];
  const bothOverlaysOff = !resourceZonesOverlayEnabled && !diplomaticEventsOverlayEnabled;
  // Where it stands for each type that is on, the one its fill is coloured for first: what its fill's hover says.
  const activeTypes = (Object.keys(config.resourceZones.resourceTypes) as Array<keyof typeof config.resourceZones.resourceTypes>)
    .filter((t) => config.resourceZones.resourceTypes[t]);
  const figureLines = resourceZonesOverlayEnabled && figures
    ? resourceLines(countryCode, figures)
      .filter((line) => activeTypes.includes(line.kind))
      .sort((a, b) => Number(b.kind === activeResourceType) - Number(a.kind === activeResourceType))
    : [];

  return (
    /*
     * No Modal, and no role of its own.
     *
     * This popup is only ever shown through PopupManager's showPopup, and
     * PopupFrame is already a complete dialog: role, aria-modal on the topmost,
     * Escape, a focus trap, focus restore, and a backdrop that closes. Wrapping
     * it in a Modal added a SECOND dialog and a second focus trap — the exact
     * thing PopupFrame's own comment warns about ("Two traps at once means
     * whichever...") — and the inner div added a third.
     *
     * A screen reader was told it had entered three dialogs to read one country
     * panel, and only the two redundant ones carried a name. The accessible
     * name now travels to the frame at showPopup, where the dialog actually is.
     */
    <>
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>{name || countryCode}</h3>
            <div className={styles.code}>{countryCode}</div>
          </div>
          {/* Watch the country: what lands in it pings (D-WL, WL4). */}
          <WatchPlaceButton a3={countryCode} name={name || countryCode} />
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.body}>
          {bothOverlaysOff && (
            <p className={styles.hint}>
              Turn on Resource Zones or Diplomatic Events (right side rail) to see this country&apos;s zones and events here.
            </p>
          )}

          {resourceZonesOverlayEnabled && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Resource Zone</div>
              {activeResourceType ? (
                <div className={styles.badge} style={{ borderColor: cssColorOf(resourceTypeColor(activeResourceType)), color: cssColorOf(resourceTypeColor(activeResourceType)) }}>
                  {RESOURCE_TYPE_LABELS[activeResourceType]}
                </div>
              ) : (
                <div className={styles.emptyState}>No active resource zone for this country.</div>
              )}
              {figureLines.length > 0 && (
                <ul className={styles.eventList} data-testid="country-resource-figures">
                  {figureLines.map((line) => {
                    const said = resourceLineWords(line, messagesNow().diplomacy);
                    return (
                      <li key={line.kind} className={styles.eventItem} data-kind={line.kind}>
                        <div>
                          <div>{`${said.name}: ${said.rank}`}</div>
                          <div className={styles.code}>{said.source}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {diplomaticEventsOverlayEnabled && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Diplomatic Events ({activeEvents.length})</div>
              {activeEvents.length > 0 ? (
                <ul className={styles.eventList}>
                  {activeEvents.map((event) => {
                    const category = categorizeGdeltEvent(event.eventRootCode, event.eventCode);
                    if (!category) return null;
                    return (
                      <li key={event.id} className={styles.eventItem}>
                        <SymbolIcon symbol={DIPLOMACY_CATEGORY_SYMBOLS[category]} size={12} color={cssColorOf(diplomaticEventColor(category))} />
                        <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer">
                          {messagesNow().diplomacy.categories[category].one} — {event.actor1ISO3}/{event.actor2ISO3} — {formatGdeltDate(event.dateAdded)}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className={styles.emptyState}>No active diplomatic events for this country.</div>
              )}
            </div>
          )}
        </div>
      </div>
        </>
  );
};

export default CountryInfoPopup;

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useApplicationRouter } from '../../hooks/useApplicationRouter';
import { useGlobeContext } from '../../context/GlobeContext';
import { useCountrySelection } from '../../context/CountrySelectionContext';
import { useVisualizationOverlay } from '../../hooks/useVisualizationOverlay';
import { useGeoPoliticalSettings } from '../../hooks/useGeoPoliticalSettings';
import { nationalTerritoriesService } from '../../geopolitical/services/NationalTerritoriesService';
import type { CountryDirectoryEntry } from '../../geopolitical/utils/countryDirectory';
import { getActiveResourceTypeForCountry, getActiveEventsForCountry } from '../../geopolitical/utils/countryContextQueries';
import { useGdeltSpan } from '../../geopolitical/hooks/useGdeltSpan';
import { useResourceZonePercentiles } from '../../geopolitical/hooks/useResourceZonePercentiles';
import { useRealDiplomaticEvents } from '../../geopolitical/hooks/useRealDiplomaticEvents';
import CommunityMenu from './CommunityMenu';
import SecureChatHeaderButton from '../SecureChat/SecureChatHeaderButton';
import Watchlist from '../Watchlist/Watchlist';
import YourKey from '../Identity/YourKey';
import UplinkButton from '../Extension/UplinkButton';
import { useFeatureFlag } from '../../utils/featureFlags';
import { createLogger } from '@utils/logger';
import { openOwnNamePrompt } from '../Identity/OwnNameRoot';
import { openCallsignPrompt } from '../Identity/callsignPrompt';
import { glossaryCommands } from '../Help/glossaryCommands';
import { startCoach } from '../Coach/coachOpen';
import { appResults, areaFocusFor, areaResults, asPaletteResult, loadSearchableRecords, recordResults, zoneFocusFor, zoneResults, type HeaderSearchResult } from './headerSearch';
import { openPalette, paletteMatch, registerPaletteSource, usePaletteOpen } from '../../features/palette/palette';
import { useZoneSearch } from '../../features/globe/zones/zoneSearch';
import { selectZonePlace } from '../../features/globe/zones/zonesStore';
import { setLitArea } from '../../features/globe/areas/litArea';
import { indexRecords, searchRecordIndex, type RecordIndex } from '../../services/search/recordSearch';
import styles from './GlobalHeader.module.css';
import { usePhone } from '../../hooks/usePhone';
import { StarcomMark } from '../../symbols/StarcomMark';
import { Glyph } from '../../symbols/Glyph';
import SoundToggle from '../Sound/SoundToggle';
import { fill, useMessages } from '../../i18n/app/i18n';
import { openMainSettings } from '../Settings/settingsEvents';
import { useDestinations } from '../Router/useDestinations';

const log = createLogger({ prefix: 'GlobalHeader' });


type SearchResult = HeaderSearchResult;

const GlobalHeader: React.FC = () => {
  const { navigateToApp } = useApplicationRouter();
  // The secure chat's button sits with the comms icons when the chat is on (decision
  // D-F, step 3.2).
  const secureChatEnabled = useFeatureFlag('secureChatEnabled');
  const { setFocusLocation } = useGlobeContext();
  const { selectCountry } = useCountrySelection();
  const { resourceZonesOverlayEnabled, diplomaticEventsOverlayEnabled, toggleResourceZonesOverlay, toggleDiplomaticEventsOverlay } = useVisualizationOverlay();
  const { config: geoPoliticalConfig } = useGeoPoliticalSettings();
  const { percentilesByCountry } = useResourceZonePercentiles(resourceZonesOverlayEnabled);
  const { events: realDiplomaticEvents, asOf: diplomaticAsOf, from: diplomaticFrom } = useRealDiplomaticEvents(diplomaticEventsOverlayEnabled);
  // What the globe shows of the day: the same span its Diplomacy layer draws (useGdeltSpan).
  const { span: diplomaticSpan } = useGdeltSpan({ from: diplomaticFrom, asOf: diplomaticAsOf });
  // On a phone the box is a few letters wide: "Search" fits, the rest was cut (K2).
  const phone = usePhone();
  const { m } = useMessages();
  const t = m.header;
  const destinations = useDestinations();
  // The box opens the command palette (D-CP, CP1); what the header finds is offered there.
  const paletteIsOpen = usePaletteOpen() !== null;
  const showSearch = paletteIsOpen;
  const [countryDirectory, setCountryDirectory] = useState<CountryDirectoryEntry[]>([]);
  // The records, read and indexed once per open of the palette, not on every keystroke.
  const records = useRef<Promise<RecordIndex> | null>(null);

  // Country directory loads once (memoized by the service) and is small
  // enough to keep entirely in memory for client-side substring filtering,
  // matching the mock-results approach below rather than a per-keystroke fetch.
  useEffect(() => {
    let cancelled = false;
    nationalTerritoriesService.getCountryDirectory().then((directory) => {
      if (!cancelled) setCountryDirectory(directory);
    }).catch((e) => {
      // getCountryDirectory() degrades to an empty array internally on any
      // fetch failure (see NationalTerritoriesService.ts) — this only fires
      // for a genuinely unexpected error. Without a .catch here it would be
      // a silent unhandled rejection, and country search would stay
      // permanently empty with no signal distinguishing "still loading"
      // from "failed to load" from "there are genuinely no matches."
      if (!cancelled) log.error('Failed to load country directory for search:', e);
    });
    return () => { cancelled = true; };
  }, []);

  // The applications that exist, then commands. Records (cases, missions,
  // reports) are found as the query is typed, in handleSearchChange.
  const staticResults: SearchResult[] = [
    ...appResults(navigateToApp, destinations),
    {
      id: 'cmd-name',
      type: 'command',
      title: '/name',
      description: t.commands.name,
      action: () => openOwnNamePrompt(),
    },
    {
      id: 'cmd-callsign',
      type: 'command',
      title: '/callsign',
      description: t.commands.callsign,
      action: () => openCallsignPrompt(),
    },
    {
      id: 'cmd-coach',
      type: 'command',
      title: '/coach',
      description: t.commands.coach,
      action: () => startCoach(),
    },
    // The glossary, and each word in it (plan item 3.2).
    ...glossaryCommands(),
    {
      id: 'cmd-toggle-resource-zones',
      type: 'command',
      title: '/resourcezones',
      description: resourceZonesOverlayEnabled ? t.commands.resourceZonesOff : t.commands.resourceZonesOn,
      action: () => toggleResourceZonesOverlay()
    },
    {
      id: 'cmd-toggle-diplomatic-events',
      type: 'command',
      title: '/diplomaticevents',
      description: diplomaticEventsOverlayEnabled ? t.commands.diplomaticOff : t.commands.diplomaticOn,
      action: () => toggleDiplomaticEventsOverlay()
    }
  ];

  // Country entries, built from the loaded directory — each flies the main
  // globe camera to that country's centroid via the same GlobeContext.setFocusLocation
  // TinyGlobe and IntelDashboard's "View on Globe" button already use, AND
  // selects it via the shared CountrySelectionContext — the same context
  // useNationalTerritories3D's 3D click/select flow writes to (see
  // useCountryInfoOverlay.ts) — so picking a country here also opens its
  // info popup, not just moving the camera to it.
  //
  // hasResourceZone/hasDiplomaticEvents (for the badge icons rendered below)
  // are precomputed here, once per countryDirectory/config/overlay-enabled
  // change via useMemo — NOT inside handleSearchChange, which would
  // recompute "does country X have active items" for all ~200 directory
  // entries on every keystroke.
  const countrySearchResults: SearchResult[] = useMemo(() => countryDirectory.map(entry => ({
    id: `country-${entry.countryCode}`,
    type: 'country' as const,
    title: entry.name,
    description: fill(t.flyTo, { name: entry.name }),
    hasResourceZone: resourceZonesOverlayEnabled
      ? getActiveResourceTypeForCountry(entry.countryCode, geoPoliticalConfig.resourceZones, percentilesByCountry) !== null
      : false,
    hasDiplomaticEvents: diplomaticEventsOverlayEnabled
      ? getActiveEventsForCountry(entry.countryCode, geoPoliticalConfig.diplomaticEvents, realDiplomaticEvents, diplomaticSpan).length > 0
      : false,
    action: () => {
      setFocusLocation({ lat: entry.lat, lng: entry.lng });
      selectCountry({ countryCode: entry.countryCode, name: entry.name });
    }
  })), [
    countryDirectory,
    geoPoliticalConfig.resourceZones,
    geoPoliticalConfig.diplomaticEvents,
    resourceZonesOverlayEnabled,
    diplomaticEventsOverlayEnabled,
    percentilesByCountry,
    realDiplomaticEvents,
    diplomaticSpan,
    setFocusLocation,
    selectCountry,
    t,
  ]);

  /*
   * Areas (BA24): picking one outlines it on the globe until it is cleared, and
   * flies to it, framed as a card about it would be.
   */
  const areaSearchResults: SearchResult[] = useMemo(() => areaResults((code) => {
    setLitArea(code);
    void areaFocusFor(code, { width: window.innerWidth, height: window.innerHeight })
      .then((focus) => { if (focus) setFocusLocation(focus); })
      .catch((e) => log.warn('an area could not be flown to', e));
  }, t), [setFocusLocation, t]);

  /*
   * Zones and their Sectors, read once the search opens: their names and boxes only, baked
   * (zoneSearch.ts), not the whole partition. A Zone the protocol defines is found here,
   * opening its Sectors, rather than as an outline among the areas: the same Zone twice would
   * be two answers to one name.
   */
  const zoneIndex = useZoneSearch(showSearch);
  const zoneSearchResults: SearchResult[] = useMemo(() => (zoneIndex ? zoneResults(zoneIndex, (place) => {
    selectZonePlace(place.id);
    const focus = zoneFocusFor(place, { width: window.innerWidth, height: window.innerHeight });
    if (focus) setFocusLocation(focus);
  }, t) : []), [zoneIndex, setFocusLocation, t]);
  const areasNotZones = useMemo(
    () => (zoneIndex ? areaSearchResults.filter((r) => !zoneIndex.byId.has(r.id.slice('area-'.length))) : areaSearchResults),
    [zoneIndex, areaSearchResults],
  );

  // What the header finds, offered in the command palette (D-CP): the applications and the slash commands with the
  // box empty; places as the words are typed; the records, read once an open, as they answer.
  const appGlyphs = useMemo(() => new Map(destinations.map((d) => [`app-${d.key}`, d.glyph] as const)), [destinations]);
  const sourceRef = useRef({ staticResults, zoneSearchResults, areasNotZones, countrySearchResults, appGlyphs, t, navigateToApp });
  sourceRef.current = { staticResults, zoneSearchResults, areasNotZones, countrySearchResults, appGlyphs, t, navigateToApp };
  useEffect(() => registerPaletteSource({
    id: 'header',
    results: (query) => {
      const { staticResults: own, zoneSearchResults: zones, areasNotZones: areas, countrySearchResults: countries, appGlyphs: glyphs, t: w } = sourceRef.current;
      // The slash commands and the applications are found by their words; with the box empty, the Globe's own show.
      if (!query) return own.map((r) => ({ ...asPaletteResult(r, glyphs, w), quiet: true }));
      return paletteMatch([...own, ...zones, ...areas, ...countries].map((r) => asPaletteResult(r, glyphs, w)), query);
    },
  }), []);
  useEffect(() => registerPaletteSource({
    id: 'records',
    results: (query) => {
      if (!query) return [];
      records.current ??= loadSearchableRecords().then(indexRecords);
      return records.current.then((all) => recordResults(searchRecordIndex(query, all), sourceRef.current.navigateToApp, sourceRef.current.t)
        .map((r) => asPaletteResult(r, sourceRef.current.appGlyphs, sourceRef.current.t)));
    },
  }), []);
  // Records are read afresh for each open.
  useEffect(() => { if (!paletteIsOpen) records.current = null; }, [paletteIsOpen]);

  return (
    <header className={styles.globalHeader}>
      <div className={styles.logoSection}>
        <StarcomMark className={styles.wingCommanderLogo} title="Starcom" />
        <div className={styles.textLogo}>
          <div className={styles.logo}>STARCOM</div>
          <div className={styles.version}>Earth Alliance</div>
        </div>
      </div>
      
      <div className={styles.searchSection}>
        {/* The command palette's opener (D-CP, CP1): Ctrl/Cmd-K or / open it too. */}
        <div className={styles.searchBar}>
          <button
            type="button"
            className={`${styles.searchInput} ${styles.searchOpener}`}
            aria-label={t.searchLabel}
            aria-haspopup="dialog"
            title={m.palette.opener}
            onClick={() => openPalette()}
            data-testid="header-search-opener"
          >
            {phone ? t.searchShort : t.search}
          </button>
          <div className={styles.searchHint}>{t.searchHint}</div>
        </div>
      </div>

      <div className={styles.actionsSection}>
        {/* Discord, the Telegram group and the source code: one menu, which
            counts Discord only while open (plan item 4.5). */}
        <CommunityMenu className={styles.iconButton} />

        {/* Watched places and what lands in them, in the app only (D-WL, WL8): beside chat. */}
        <Watchlist className={styles.iconButton} />

        {secureChatEnabled && (
          <div className={styles.chatButtonContainer}>
            <SecureChatHeaderButton className={styles.iconButton} />
          </div>
        )}

        {/* Sound on or off from anywhere; off until pressed (N12). */}
        <SoundToggle className={styles.iconButton} />

        {/* The app's settings. A phone has them under More, where there is room. */}
        {!phone && (
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t.settings}
            aria-haspopup="dialog"
            title={t.settings}
            onClick={openMainSettings}
          >
            <Glyph name="action:settings" size={20} />
          </button>
        )}

        {/* Starcom Uplink, the browser extension: connected or not, and what it does (D-EX). Desktop only. */}
        {!phone && <UplinkButton className={styles.iconButton} />}

        {/* Your key and npub, one click away from anywhere (plan item 2.3). */}
        <YourKey className={styles.iconButton} />
      </div>
    </header>
  );
};

export default GlobalHeader;

/**
 * A Zone or a Sector, open (ZSP 1.0; the layer is useZones3D): what it is, what
 * its ground is like, and the reports about it, placed inside it or naming it.
 * And the chip that names the place under the pointer before it is opened.
 *
 * Under ZSP 2.0 (D-ZR) a place also says what it lies in, Terra › Zone › Sector, and a Terra or Mare opens too,
 * listing its Zones. A Zone says the system that binds it; a Sector its landform in the IAU's word, its area and
 * what each of its edges follows.
 *
 * Every Zone so far has approximate lines, and both say so: a Sector's edge is
 * where its character changes, drawn from landmarks and maps, not surveyed.
 *
 * Its words are the catalogue's (`zones`, put there by D-ML; D-ZS). A place's own
 * name, character and landmarks are its document's, content, not interface.
 */
import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { Docked } from '../Dock/Docked';
import { useZonesState, useZonesValue, selectZonePlace } from '../../features/globe/zones/zonesStore';
import { useZoneIndex } from '../../features/globe/zones/useZoneIndex';
import { isPlacedOrNamed, reportsAbout } from '../../features/globe/zones/zoneReports';
import { useLatestReports } from './Hooks/useGlobeRegionMarks';
import { canonUrl, childrenOf, licenceUrl, type ZoneIndex, type ZspPlace } from '../../geopolitical/zones/zsp';
import { partitionColourOf } from '../../geopolitical/theme/partitionTheme';
import { sectorColor, swatchCss, zoneColor, zoneColorMeaning } from '../../geopolitical/theme/zoneTheme';
import { recordPath } from '../../routes/recordLink';
import { countryName } from '../../applications/intelanalyzer/state/readableNames';
import { counted, fill, numbered, useMessages } from '../../i18n/app/i18n';
import type { Messages } from '../../i18n/app/en';
import { fillNodes } from '../../i18n/app/fillNodes';
import styles from './GlobeZonePanel.module.css';

/** How many reports the panel lists before saying how many more there are. */
const LISTED = 6;

type Words = Messages['zones'];

const nameOf = (code: string): string => countryName(code.toUpperCase()) ?? code.toUpperCase();

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The colour the globe fills a place in, for its swatch. */
function fillOf(index: ZoneIndex, place: ZspPlace): string {
  if (index.edition === '2.0') return swatchCss(partitionColourOf(index, place.id) ?? 0x9a9a9a);
  const zone = index.zones.find((z) => z.root.id === place.zone);
  if (!zone) return swatchCss(0x9a9a9a);
  const base = zoneColor(zone.root);
  const i = zone.sectors.findIndex((s) => s.id === place.id);
  return swatchCss(i >= 0 ? sectorColor(base, i) : base);
}

const linesWord = (place: ZspPlace, w: Words): string => w.lines[place.precision] ?? w.lines.approximate;

/** ZSP's state is a judgement of stability; null is none made, never "stable" by default (2026-10-12). */
const stateWord = (state: string | undefined): string => (state === 'null' ? 'Not judged' : capital(state ?? ''));

const Facts: React.FC<{ rows: Array<[string, string]> }> = ({ rows }) => (
  <dl className={styles.facts}>
    {rows.filter(([, value]) => value).map(([term, value]) => (
      <React.Fragment key={term}>
        <dt>{term}</dt>
        <dd>{value}</dd>
      </React.Fragment>
    ))}
  </dl>
);

/** The first Zones a 2.0 manifest retired into this place (D-ZR): a report naming one is about it too. */
const retiredInto = (index: ZoneIndex, place: ZspPlace): string[] =>
  [...index.retired.values()].filter((r) => r.coveredBy.includes(place.id)).map((r) => r.id);

const PlaceIntel: React.FC<{ place: ZspPlace; w: Words; alsoNamed: readonly string[] }> = ({ place, w, alsoNamed }) => {
  const reports = useLatestReports(isPlacedOrNamed);
  const found = useMemo(() => reportsAbout(place, reports, alsoNamed), [place, reports, alsoNamed]);
  return (
    <section className={styles.section} aria-label={w.intelAbout[place.level]}>
      <h3 className={styles.heading}>{fill(w.intelIn[place.level], { n: found.length })}</h3>
      {found.length === 0 ? (
        <p className={styles.quiet}>{w.noIntel[place.level]}</p>
      ) : (
        <ul className={styles.reports}>
          {found.slice(0, LISTED).map(({ report, how }) => (
            <li key={report.id}>
              <a href={recordPath('report', report.id)}>{report.title || w.untitled}</a>
              <span className={styles.how}>{how === 'inside' ? w.placedInside : w.namesIt}</span>
            </li>
          ))}
          {found.length > LISTED && <li className={styles.quiet}>{counted(w.more, found.length - LISTED)}</li>}
        </ul>
      )}
    </section>
  );
};

const isContainer = (place: ZspPlace): place is ZspPlace & { level: 'terra' | 'mare' } => place.level === 'terra' || place.level === 'mare';

/** What a place is, above its name: a Terra's or Mare's kind; a Zone's class (1.0) or system (2.0); a Sector's landform. */
function eyebrowOf(place: ZspPlace, index: ZoneIndex, w: Words): string {
  if (isContainer(place)) return `${w.levels[place.level]} · ${w.worlds[place.level]}`;
  if (place.level === 'zone' && index.edition === '2.0') return [w.levels.zone, place.system].filter(Boolean).join(' · ');
  if (place.level === 'zone') return `${w.classes[(place.zoneClass ?? '') as keyof Words['classes']] ?? w.levels.zone} · ${zoneColorMeaning(place, w.colour)}`;
  return [w.levels[place.level], place.descriptor].filter(Boolean).join(' · ');
}

const PlaceBody: React.FC<{ place: ZspPlace; index: ZoneIndex; w: Words; close: string }> = ({ place, index, w, close }) => {
  const parent = place.parent ? index.byId.get(place.parent) ?? null : null;
  const inside = isContainer(place) ? childrenOf(index, place.id) : index.zones.find((z) => z.root.id === place.id)?.sectors ?? [];
  const insideHeading = isContainer(place) ? w.zonesIn : w.sectors;
  const wiki = canonUrl(place);
  const licence = index.zones.find((z) => z.root.id === place.zone)?.licence ?? index.containers.find((c) => c.root.id === place.container)?.licence;
  const licenceLink = licenceUrl(licence);
  const eyebrow = eyebrowOf(place, index, w);
  const alsoNamed = useMemo(() => retiredInto(index, place), [index, place]);
  // A 1.0 Zone stands alone; a 2.0 Zone names the Terra or Mare it lies in, as a Sector names its Zone.
  const within = parent && !isContainer(place) && (place.level !== 'zone' || index.edition === '2.0')
    ? w.levelOf[place.level as keyof Words['levelOf']] : null;
  return (
    <>
      <header className={styles.header}>
        <span className={styles.swatch} style={{ background: fillOf(index, place) }} aria-hidden="true" />
        <div className={styles.titles}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h2 className={styles.name}>{place.name}</h2>
          {parent && within && (
            <span className={styles.within}>
              {fillNodes(within, {
                zone: <button type="button" className={styles.link} onClick={() => selectZonePlace(parent.id)}>{parent.name}</button>,
              })}
            </span>
          )}
        </div>
        <button type="button" className={styles.close} aria-label={close} title={close} onClick={() => selectZonePlace(null)}>
          <X size={14} aria-hidden="true" />
        </button>
      </header>

      {(place.character ?? place.principle) && <p className={styles.lede}>{place.character ?? place.principle}</p>}

      <Facts rows={[
        [w.facts.state, stateWord(place.state)],
        [w.facts.lifecycle, place.level === 'zone' ? capital(place.lifecycle ?? '') : ''],
        [w.facts.alert, place.alert ?? ''],
        [w.facts.lines, linesWord(place, w)],
        [w.facts.terrain, place.terrain.join(', ')],
        [w.facts.hazards, place.hazards.join(', ')],
        [w.facts.resources, place.resources.join(', ')],
        [w.facts.landmarks, place.landmarks.join(', ')],
        [w.facts.countries, place.countries.map(nameOf).join(', ')],
        [w.facts.plates, (place.plates ?? []).join(', ')],
        [w.facts.area, place.areaKm2 ? fill(w.areaKm2, { n: numbered(Math.round(place.areaKm2)) }) : ''],
        [w.facts.edges, (place.edges ?? []).map((e) => (e.name ? `${e.name} (${w.follows[e.follows]})` : w.follows[e.follows])).join('; ')],
      ]} />

      {inside.length > 0 && (
        <section className={styles.section} aria-label={fill(insideHeading, { n: inside.length })}>
          <h3 className={styles.heading}>{fill(insideHeading, { n: inside.length })}</h3>
          <ul className={styles.sectors}>
            {inside.map((sector) => (
              <li key={sector.id}>
                <button type="button" className={styles.sector} onClick={() => selectZonePlace(sector.id)}>
                  <span className={styles.swatch} style={{ background: fillOf(index, sector) }} aria-hidden="true" />
                  {sector.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PlaceIntel place={place} w={w} alsoNamed={alsoNamed} />

      {place.sources.length > 0 && (
        <details className={styles.sources}>
          <summary>{fill(w.sources, { n: place.sources.length })}</summary>
          <ul>
            {place.sources.map((s) => (
              <li key={`${s.name}|${s.url ?? ''}`}>
                {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a> : s.name}
                {s.licence && <span className={styles.how}> · {s.licence}</span>}
                {s.for && <div className={styles.quiet}>{fill(w.sourceFor, { what: s.for })}</div>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <footer className={styles.footer}>
        <code className={styles.code}>{place.id}</code>
        {wiki && <a href={wiki} target="_blank" rel="noopener noreferrer">{w.wiki}</a>}
        {licence && (licenceLink
          ? <a href={licenceLink} target="_blank" rel="noopener noreferrer">{fill(w.licence, { licence })}</a>
          : <span className={styles.quiet}>{fill(w.licence, { licence })}</span>)}
      </footer>
    </>
  );
};

export const GlobeZonePanel: React.FC = () => {
  const on = useZonesValue((s) => s.on);
  const selected = useZonesValue((s) => s.selected);
  const { m } = useMessages();
  const { index } = useZoneIndex(on && selected !== null);
  const place = selected && index ? index.byId.get(selected) ?? null : null;
  if (!on || !place || !index) return null;
  return (
    <Docked slot="globeZone">
      <article className={styles.panel} aria-label={fill(m.zones.panelLabel[place.level], { name: place.name })}>
        <PlaceBody place={place} index={index} w={m.zones} close={m.settings.close} />
      </article>
    </Docked>
  );
};

/** The place under the pointer, named, until it is opened or the pointer leaves it. */
export const GlobeZoneHover: React.FC = () => {
  const { on, hovered, selected } = useZonesState();
  const { m } = useMessages();
  const w = m.zones;
  const { index } = useZoneIndex(on && hovered !== null);
  const place = hovered && index ? index.byId.get(hovered.id) ?? null : null;
  if (!on || !hovered || !place || !index) return null;
  const zone = place.level === 'zone' || isContainer(place) ? null : index.byId.get(place.zone);
  const container = index.edition === '2.0' && place.container && place.container !== place.id ? index.byId.get(place.container) : null;
  const also = (hovered.also ?? []).map((id) => {
    const other = index.byId.get(id);
    const otherZone = other ? index.byId.get(other.zone) : null;
    return other ? `${other.name}${otherZone && otherZone.id !== other.id ? ` (${otherZone.name})` : ''}` : id;
  });
  return (
    <div className={styles.hover} style={{ left: hovered.x, top: hovered.y }} role="tooltip" aria-live="polite">
      <div className={styles.hoverName}>{place.name}</div>
      <div className={styles.hoverWhat}>
        {zone && place.level !== 'zone'
          ? fill(w.levelOf[place.level as keyof Words['levelOf']], { zone: zone.name })
          : index.edition === '2.0' ? eyebrowOf(place, index, w) : w.classes[(place.zoneClass ?? '') as keyof Words['classes']] ?? w.levels.zone}
        {container ? ` · ${container.name}` : ''}
      </div>
      {also.length > 0 && <div className={styles.hoverWhat}>{fill(m.spheres.also, { names: also.join(', ') })}</div>}
      <div className={styles.hoverNote}>{linesWord(place, w)}{selected === place.id ? '' : ` · ${w.clickToOpen}`}</div>
    </div>
  );
};

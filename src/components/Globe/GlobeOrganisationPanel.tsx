/**
 * An Organisation, open (decision D-ZR, ZR10): its members, where that list was taken from and when, and the reports
 * about it. And the chip naming it under the pointer. One body is shown at a time (the owner, 2026-10-18).
 *
 * Its members are whole countries, by the area registry (areaRegistry.ts); its shape is theirs merged (areas-lod0).
 * Reports name it by its code, `union:eu`, or by an alias the registry knows (`eu`).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Docked } from '../Dock/Docked';
import {
  openOrganisationPanel, useOrganisationsState, useOrganisationsValue,
} from '../../features/globe/organisations/organisationsStore';
import { reportsInSphere } from '../../features/globe/spheres/sphereReports';
import { isPlacedOrNamed } from '../../features/globe/zones/zoneReports';
import { useLatestReports } from './Hooks/useGlobeRegionMarks';
import { areaByCode, type AreaDef } from '../../features/globe/areas/areaRegistry';
import { loadAreaShapes, type AreaShapes } from '../../features/globe/areas/areaShapes';
import { ORGANISATION_COLOR } from '../../geopolitical/hooks/useOrganisations3D';
import { swatchCss } from '../../geopolitical/theme/zoneTheme';
import { countryName } from '../../applications/intelanalyzer/state/readableNames';
import { recordPath } from '../../routes/recordLink';
import { counted, fill, useMessages } from '../../i18n/app/i18n';
import styles from './GlobeZonePanel.module.css';

const LISTED = 6;

const nameOf = (code: string): string => countryName(code.toUpperCase()) ?? code.toUpperCase();

function membersOf(def: AreaDef): string[] {
  return def.from === 'members' ? [...def.members.map(nameOf), ...(def.alsoNamed ?? [])] : [];
}

function useAreaShapes(wanted: boolean): AreaShapes | null {
  const [shapes, setShapes] = useState<AreaShapes | null>(null);
  useEffect(() => {
    if (!wanted || shapes) return;
    let alive = true;
    void loadAreaShapes().then((s) => { if (alive && s) setShapes(s); });
    return () => { alive = false; };
  }, [wanted, shapes]);
  return shapes;
}

export const GlobeOrganisationPanel: React.FC = () => {
  const on = useOrganisationsValue((s) => s.on);
  const open = useOrganisationsValue((s) => s.open);
  const shown = useOrganisationsValue((s) => s.shown);
  const { m } = useMessages();
  const w = m.organisations;
  const sw = m.spheres;
  const shapes = useAreaShapes(on && open);
  const def = shown ? areaByCode(shown) : null;
  const reports = useLatestReports(isPlacedOrNamed);
  const { named, inside } = useMemo(
    () => (def ? reportsInSphere(def.code, shapes?.get(def.code)?.geometry, reports) : { named: [], inside: 0 }),
    [def, shapes, reports],
  );
  if (!on || !open || !def || def.kind !== 'union') return null;
  const members = membersOf(def);
  return (
    <Docked slot="globeOrganisation">
      <article className={styles.panel} aria-label={fill(w.panelLabel, { name: def.name })}>
        <header className={styles.header}>
          <span className={styles.swatch} style={{ background: swatchCss(ORGANISATION_COLOR) }} aria-hidden="true" />
          <div className={styles.titles}>
            <span className={styles.eyebrow}>{fill(sw.eyebrow, { kind: w.organisation, members: counted(sw.members, members.length) })}</span>
            <h2 className={styles.name}>{def.name}</h2>
          </div>
          <button type="button" className={styles.close} aria-label={m.settings.close} title={m.settings.close} onClick={() => openOrganisationPanel(false)}>
            <X size={14} aria-hidden="true" />
          </button>
        </header>
        {def.note && <p className={styles.lede}>{def.note}</p>}
        <dl className={styles.facts}>
          <dt>{sw.membersHeading}</dt>
          <dd>{members.join(', ')}</dd>
          {(def.others ?? []).length > 0 && (
            <>
              <dt>{w.notMembers}</dt>
              <dd>{(def.others ?? []).map((o) => {
                const status = w.statuses[o.status as keyof typeof w.statuses] ?? o.status;
                return `${nameOf(o.code)} (${o.since ? `${status}, ${fill(w.since, { date: o.since })}` : status})`;
              }).join(', ')}</dd>
            </>
          )}
        </dl>
        <section className={styles.section} aria-label={fill(w.intelAbout, { n: named.length })}>
          <h3 className={styles.heading}>{fill(w.intelAbout, { n: named.length })}</h3>
          {named.length === 0 ? (
            <p className={styles.quiet}>{w.noIntel}</p>
          ) : (
            <ul className={styles.reports}>
              {named.slice(0, LISTED).map((report) => (
                <li key={report.id}><a href={recordPath('report', report.id)}>{report.title || sw.untitled}</a></li>
              ))}
              {named.length > LISTED && <li className={styles.quiet}>{counted(sw.more, named.length - LISTED)}</li>}
            </ul>
          )}
          <p className={styles.quiet}>{counted(sw.placedInside, inside)}</p>
        </section>
        <footer className={styles.footer}>
          <code className={styles.code}>{def.code}</code>
          <a href={def.source.url} target="_blank" rel="noopener noreferrer">{def.source.name}</a>
          <span className={styles.quiet}>{fill(sw.read, { date: def.source.read })}</span>
        </footer>
      </article>
    </Docked>
  );
};

/** The body under the pointer, named, until the pointer leaves it. */
export const GlobeOrganisationHover: React.FC = () => {
  const { on, hovered, open } = useOrganisationsState();
  const { m } = useMessages();
  if (!on || !hovered) return null;
  return (
    <div className={styles.hover} style={{ left: hovered.x, top: hovered.y }} role="tooltip" aria-live="polite">
      <div className={styles.hoverName}>{areaByCode(hovered.code)?.name ?? hovered.code}</div>
      <div className={styles.hoverNote}>{m.organisations.organisation}{open ? '' : ` · ${m.spheres.clickToOpen}`}</div>
    </div>
  );
};

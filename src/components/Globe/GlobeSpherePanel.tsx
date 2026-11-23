/**
 * A Sphere, open: the states a language or a community of states reaches, where
 * that list was taken from and when, the other Spheres at the place it was opened,
 * and the reports about it. And the chip naming every Sphere under the pointer.
 *
 * A Sphere's members are whole countries, by the area registry (areaRegistry.ts);
 * its shape is theirs merged (areas-lod0). Memberships its list counts but does
 * not draw are named apart, listed, not drawn. Spheres overlap, so the chip names them
 * all, the most specific first.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Docked } from '../Dock/Docked';
import { selectSphere, useSpheresState, useSpheresValue } from '../../features/globe/spheres/spheresStore';
import { reportsInSphere } from '../../features/globe/spheres/sphereReports';
import { isPlacedOrNamed } from '../../features/globe/zones/zoneReports';
import { useLatestReports } from './Hooks/useGlobeRegionMarks';
import { areaByCode, type AreaDef } from '../../features/globe/areas/areaRegistry';
import { loadAreaShapes, type AreaShapes } from '../../features/globe/areas/areaShapes';
import { sphereCss } from '../../geopolitical/theme/sphereTheme';
import { countryName } from '../../applications/intelanalyzer/state/readableNames';
import { recordPath } from '../../routes/recordLink';
import { counted, fill, useMessages } from '../../i18n/app/i18n';
import type { Messages } from '../../i18n/app/en';
import styles from './GlobeZonePanel.module.css';

const LISTED = 6;

type Words = Messages['spheres'];

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

const SphereIntel: React.FC<{ code: string; shapes: AreaShapes | null; w: Words }> = ({ code, shapes, w }) => {
  const reports = useLatestReports(isPlacedOrNamed);
  const { named, inside } = useMemo(() => reportsInSphere(code, shapes?.get(code)?.geometry, reports), [code, shapes, reports]);
  return (
    <section className={styles.section} aria-label={fill(w.intelAbout, { n: named.length })}>
      <h3 className={styles.heading}>{fill(w.intelAbout, { n: named.length })}</h3>
      {named.length === 0 ? (
        <p className={styles.quiet}>{w.noIntel}</p>
      ) : (
        <ul className={styles.reports}>
          {named.slice(0, LISTED).map((report) => (
            <li key={report.id}><a href={recordPath('report', report.id)}>{report.title || w.untitled}</a></li>
          ))}
          {named.length > LISTED && <li className={styles.quiet}>{counted(w.more, named.length - LISTED)}</li>}
        </ul>
      )}
      <p className={styles.quiet}>{counted(w.placedInside, inside)}</p>
    </section>
  );
};

export const GlobeSpherePanel: React.FC = () => {
  const on = useSpheresValue((s) => s.on);
  const selected = useSpheresValue((s) => s.selected);
  const also = useSpheresValue((s) => s.also.join(','));
  const { m } = useMessages();
  const w = m.spheres;
  const shapes = useAreaShapes(on && selected !== null);
  const def = selected ? areaByCode(selected) : null;
  if (!on || !def || def.kind !== 'sphere') return null;
  const members = membersOf(def);
  const others = also ? also.split(',').filter(Boolean) : [];
  return (
    <Docked slot="globeSphere">
      <article className={styles.panel} aria-label={fill(w.panelLabel, { name: def.name })}>
        <header className={styles.header}>
          <span className={styles.swatch} style={{ background: sphereCss(def.code) }} aria-hidden="true" />
          <div className={styles.titles}>
            <span className={styles.eyebrow}>
              {fill(w.eyebrow, { kind: w.kinds[(def.influence ?? '') as keyof Words['kinds']] ?? w.sphere, members: counted(w.members, members.length) })}
            </span>
            <h2 className={styles.name}>{def.name}</h2>
          </div>
          <button type="button" className={styles.close} aria-label={m.settings.close} title={m.settings.close} onClick={() => selectSphere(null)}>
            <X size={14} aria-hidden="true" />
          </button>
        </header>
        {def.note && <p className={styles.lede}>{def.note}</p>}
        <dl className={styles.facts}>
          <dt>{w.membersHeading}</dt>
          <dd>{members.join(', ')}</dd>
          {(def.others ?? []).length > 0 && (
            <>
              <dt>{w.listedNotDrawn}</dt>
              <dd>{(def.others ?? []).map((o) => nameOf(o.code)).join(', ')}</dd>
            </>
          )}
        </dl>
        {others.length > 0 && (
          <section className={styles.section} aria-label={w.otherHere}>
            <h3 className={styles.heading}>{w.alsoHere}</h3>
            <ul className={styles.sectors}>
              {others.map((code) => (
                <li key={code}>
                  <button type="button" className={styles.sector} onClick={() => selectSphere(code, [def.code, ...others])}>
                    <span className={styles.swatch} style={{ background: sphereCss(code) }} aria-hidden="true" />
                    {areaByCode(code)?.name ?? code}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        <SphereIntel code={def.code} shapes={shapes} w={w} />
        <footer className={styles.footer}>
          <code className={styles.code}>{def.code}</code>
          <a href={def.source.url} target="_blank" rel="noopener noreferrer">{def.source.name}</a>
          <span className={styles.quiet}>{fill(w.read, { date: def.source.read })}</span>
        </footer>
      </article>
    </Docked>
  );
};

/** Every Sphere under the pointer, named, until the pointer leaves them. */
export const GlobeSphereHover: React.FC = () => {
  const { on, hovered, selected } = useSpheresState();
  const { m: { spheres: w } } = useMessages();
  if (!on || !hovered || hovered.codes.length === 0) return null;
  const [first, ...rest] = hovered.codes;
  return (
    <div className={styles.hover} style={{ left: hovered.x, top: hovered.y }} role="tooltip" aria-live="polite">
      <div className={styles.hoverName}>{areaByCode(first)?.name ?? first}</div>
      {rest.length > 0 && <div className={styles.hoverWhat}>{fill(w.also, { names: rest.map((c) => areaByCode(c)?.name ?? c).join(', ') })}</div>}
      <div className={styles.hoverNote}>{w.sphere}{selected === first ? '' : ` · ${w.clickToOpen}`}</div>
    </div>
  );
};

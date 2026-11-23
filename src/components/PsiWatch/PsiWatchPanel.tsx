/**
 * Psi Watch's panel (decision D-PW, build step 3; Mecha Jono's kit v0, `schemas_psi.md` §3): the legend with the
 * one Experimental badge, small and once; the layers on, and which are not drawn yet; the field's readings with
 * their ages and percentiles; the sky's events for the next 30 days, one opened on the shared timeline with the
 * cursor and the weight under it; the results, rifts and windows of the layers on; and the daily note,
 * registrations and ledger. Everything here is the build kit's until the key change (PW12): the invented is
 * marked FIXTURE, and no result is ever recomputed. Never a person; never the publisher's name. A span brushed on the
 * Timestream (PW50) dims the alerts, windows and sky events that lie outside it.
 */
import React, { useEffect, useMemo } from 'react';
import { Docked } from '../Dock/Docked';
import { Glyph } from '../../symbols/Glyph';
import type { GlyphName } from '../../symbols/uiSymbols';
import { counted, fill, useMessages } from '../../i18n/app/i18n';
import { useClockNow, useTemporalStateOptional } from '../../context/TemporalContext';
import { useGlobeLayerControl } from '../Globe/Hooks/useGlobeLayerControl';
import { DATA_SCALES } from '../../styles/tokens';
import { formatUtcDateTime, localTimeTitle } from '../../utils/utcTime';
import {
  readAlert, readBrief, readField, readLedger, readRegistration, readScryResult, readSkyEvent, readWindowNote,
  type PsiChannel, type PsiSkyEvent,
} from '../../services/psiWatch/psiEvents';
import type { KitFixture } from '../../services/psiWatch/kitFixtures';
import { ageOf, shownState } from '../../services/psiWatch/windowProfile';
import { WindowTimeline } from './WindowTimeline';
import FinderSection from './FinderSection';
import ShieldSection from './ShieldSection';
import PsiModelSection from './PsiModelSection';
import { usePsiKit } from './usePsiKit';
import { setPsiLinesAllBodies, setPsiLinesEvent, setPsiOpened, usePsiLines } from '../../services/psiWatch/psiLinesStore';
import { ASTRO_BODIES, type AstroBody } from '../../services/psiWatch/astro/sky';
import { inBrush, useBrush } from '../../services/psiWatch/timestream/brush';
import styles from './PsiWatchPanel.module.css';
import { openPsiLists } from '../../features/psi/psiListsPanel';
import { openPsiLab } from '../../features/psi/psiLabPanel';

const HUE = DATA_SCALES.psiWatch;
const DAY_S = 86_400;

const Age: React.FC<{ at: number; now: number }> = ({ at, now }) => {
  const { m } = useMessages();
  const words = m.psiWatch.timeline;
  const age = ageOf(Math.max(0, now - at));
  const text = age.unit === 'now' ? words.updatedNow
    : counted(age.unit === 'minutes' ? words.updatedMinutes : age.unit === 'hours' ? words.updatedHours : words.updatedDays, age.n);
  return <span className={styles.muted} title={localTimeTitle(at * 1000)}>{text}</span>;
};

/** Units said beside a value; the rest ("Kp", "class", "z") the channel's own name already says. */
const UNITS: Record<string, string> = { 'km/s': ' km/s', nT: ' nT', '%': '%', deg: '°' };

const ChannelRow: React.FC<{ channel: PsiChannel; now: number }> = ({ channel, now }) => {
  const { m } = useMessages();
  const w = m.psiWatch.panel;
  // An unknown channel is drawn generically, by its id, its value and its unit (`schemas_psi.md` §2.2).
  const known = (w.channels as Record<string, string>)[channel.id];
  const unit = UNITS[channel.unit] ?? (known ? '' : channel.unit ? ` ${channel.unit}` : '');
  return (
    <li className={styles.reading} data-testid={`psi-channel-${channel.id}`}>
      <span>{known ?? channel.id}</span>
      <span className={styles.value}>{`${channel.value}${unit}`}</span>
      <span className={styles.readingNote}>
        {channel.percentile !== undefined && channel.history ? `${fill(w.percentile, { n: channel.percentile, history: channel.history })} · ` : ''}
        <Age at={channel.at} now={now} />
      </span>
    </li>
  );
};

export const PsiWatchPanel: React.FC = () => {
  const { m } = useMessages();
  const w = m.psiWatch.panel;
  const tl = m.psiWatch.timeline;
  const { layers } = useGlobeLayerControl();
  const temporal = useTemporalStateOptional();
  const now = Math.floor(useClockNow() / 1000);
  const cursor = temporal ? Math.floor(temporal.currentTime / 1000) : now;
  const brush = useBrush();
  const kit = usePsiKit(true);

  const of = (family: string) => kit.fixtures.filter((f) => f.family === family);
  // Planet lines draw the open event's bodies (PW20): the bodies astronomy-engine knows, never a fixed point. A
  // person's pick, or a card's (PW62), kept in the lines' store.
  const lines = usePsiLines();
  // The sky's events ahead (the next 30 days), and the one opened, whenever it is: a daily note opens its own (kit 2.3).
  const sky = useMemo(
    () => kit.fixtures.filter((f) => f.family === 'psi_sky_event')
      .map((f) => ({ fixture: f, event: readSkyEvent(f.event) }))
      .filter((s): s is { fixture: KitFixture; event: PsiSkyEvent } => s.event !== null
        && (s.event.address === lines.opened || (s.event.window.until >= now && s.event.window.from <= now + 30 * DAY_S)))
      .sort((a, b) => a.event.exact - b.event.exact),
    [kit.fixtures, now, lines.opened],
  );
  const chosen = sky.find((s) => s.event.address === lines.opened) ?? sky[0];
  useEffect(() => {
    const event = chosen?.event;
    setPsiLinesEvent(event ? {
      address: event.address,
      title: event.title,
      bodies: event.bodies.filter((body): body is AstroBody => (ASTRO_BODIES as readonly string[]).includes(body)),
      from: event.window.from, until: event.window.until, exact: event.exact,
    } : null);
  }, [chosen?.event]);
  const isOn = (id: string) => layers.some((layer) => layer.id === id && layer.isActive);
  // The layer chosen first, then the others on, in the rail's order.
  const psiLayersOn = layers.filter((layer) => layer.category === 'PsiWatch' && layer.isActive)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const field = of('psi_field')[0];
  const results = of('psi_scry_result').map((f) => readScryResult(f.event));
  const skyState = (from: number, until: number) => {
    const state = shownState(undefined, from, until, now);
    return state === 'armed' || state === 'live' || state === 'closed' ? tl.skyStates[state] : undefined;
  };

  const sectionOf = (id: string): React.ReactNode => {
    switch (id) {
      case 'PsiField': {
        if (!field) return null;
        const reading = readField(field.event);
        return (
          <details key={id} open data-testid="psi-field">
            <summary>{w.field}</summary>
            <ul className={styles.list}>{reading.channels.map((channel) => <ChannelRow key={channel.id} channel={channel} now={now} />)}</ul>
            <p className={styles.credit}>{w.credits}</p>
          </details>
        );
      }
      case 'PsiZones':
        return results.length ? (
          <details key={id} open data-testid="psi-results">
            <summary>{w.results}</summary>
            <ul className={styles.list}>
              {results.map((result) => (
                <li key={result.address}>
                  {result.content}
                </li>
              ))}
            </ul>
          </details>
        ) : null;
      case 'PsiRifts':
        return of('psi_alert').length ? (
          <details key={id} open data-testid="psi-rifts">
            <summary>{w.rifts}</summary>
            <ul className={styles.list}>
              {of('psi_alert').map((fixture) => {
                const alert = readAlert(fixture.event);
                const lit = inBrush(brush, (alert.validFrom ?? -Infinity) * 1000, (alert.validUntil ?? Infinity) * 1000);
                return (
                  <li key={alert.address} className={lit ? undefined : styles.dimmed}>
                    {alert.content}
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null;
      case 'PsiWindows':
        return of('psi_window').length ? (
          <details key={id} open data-testid="psi-windows">
            <summary>{w.windows}</summary>
            {of('psi_window').map((fixture) => {
              const note = readWindowNote(fixture.event);
              if (!note) return null;
              const state = shownState(note.state, note.window.from, note.window.until, now);
              return (
                <div key={note.address} className={`${styles.windowNote} ${inBrush(brush, note.window.from * 1000, note.window.until * 1000) ? '' : styles.dimmed}`}>
                  <p>{fill(w.inPlaces, { places: note.zones.map((zone) => zone.name).join(', ') })}</p>
                  <WindowTimeline
                    window={note.window}
                    title={note.title}
                    hue={HUE}
                    stateLabel={state ? tl.windowStates[state] : undefined}
                    updatedAt={fixture.event.created_at}
                    now={now}
                    cursor={cursor}
                    onSeek={temporal ? (unix) => temporal.setCurrentTime(unix * 1000) : undefined}
                  />
                </div>
              );
            })}
          </details>
        ) : null;
      case 'MagneticShield':
        return <ShieldSection key={id} cursorMs={cursor * 1000} live={temporal?.isLive ?? true} />;
      case 'PsiModel':
        return <PsiModelSection key={id} cursorMs={cursor * 1000} />;
      default:
        return null;
    }
  };

  return (
    <Docked slot="psiWatch">
      <section className={styles.panel} data-testid="psi-watch-panel" aria-label={w.title}>
        <header className={styles.head}>
          <span className={styles.title}>{w.title}</span>
          <span className={styles.badge} data-testid="psi-experimental">{w.experimental}</span>
        </header>
        <ul className={styles.legend}>
          {psiLayersOn.map((layer) => (
            <li key={layer.id} className={styles.row}>
              <Glyph name={`layer:${layer.id}` as GlyphName} size={14} />
              <span>{layer.label}</span>
              {!layer.isImplemented ? <span className={styles.muted}>{w.notDrawn}</span> : null}
            </li>
          ))}
        </ul>
        {kit.status === 'loading' ? <p className={styles.muted}>{w.loading}</p> : null}
        {kit.status === 'failed' ? <p role="status">{w.failed}</p> : null}

        {psiLayersOn.map((layer) => sectionOf(layer.id))}

        <details open data-testid="psi-sky">
          <summary>{w.sky}</summary>
          {isOn('PsiLines') ? (
            <label className={styles.row}>
              <input type="checkbox" checked={lines.allBodies} onChange={(e) => setPsiLinesAllBodies(e.currentTarget.checked)} />
              {w.allBodies}
            </label>
          ) : null}
          {chosen ? (
            <WindowTimeline
              window={chosen.event.window}
              title={chosen.event.title}
              hue={HUE}
              stateLabel={skyState(chosen.event.window.from, chosen.event.window.until)}
              now={now}
              cursor={cursor}
              onSeek={temporal ? (unix) => temporal.setCurrentTime(unix * 1000) : undefined}
            />
          ) : null}
          {sky.length === 0 && kit.status === 'ready' ? <p className={styles.muted}>{w.skyNone}</p> : null}
          <ul className={styles.list}>
            {sky.map(({ event }) => (
              <li key={event.address} className={inBrush(brush, event.window.from * 1000, event.window.until * 1000) ? undefined : styles.dimmed}>
                <button
                  type="button"
                  className={styles.pick}
                  aria-pressed={chosen?.event.address === event.address}
                  onClick={() => setPsiOpened(event.address)}
                  title={localTimeTitle(event.exact * 1000)}
                >
                  {event.title}
                  <span className={styles.muted}> · {fill(w.exactAt, { time: formatUtcDateTime(event.exact * 1000) })}</span>
                </button>
              </li>
            ))}
          </ul>
        </details>

        <FinderSection />

        {/* Every daily note, registration and ledger, and the Intel in the open window (PW88). */}
        <button type="button" className={styles.pick} title={m.psiWatch.lists.openTitle} onClick={() => openPsiLists('notes')} data-testid="psi-open-lists">
          {m.psiWatch.lists.open}
        </button>
        {/* Exploration, never a result, and the board's form (PW94–PW96). */}
        <button type="button" className={styles.pick} title={m.psiWatch.lab.openTitle} onClick={() => openPsiLab('explore')} data-testid="psi-open-lab">
          {m.psiWatch.lab.open}
        </button>

        {of('psi_brief').map((fixture) => {
          const brief = readBrief(fixture.event);
          return (
            <details key={brief.address} data-testid="psi-brief">
              <summary>{`${w.brief}: ${brief.title}`}</summary>
              {brief.sections.map((section) => (
                <div key={section.heading}>
                  <p className={styles.subhead}>{section.heading}</p>
                  <ul className={styles.list}>{section.lines.map((line) => <li key={line}>{line}</li>)}</ul>
                </div>
              ))}
            </details>
          );
        })}

        {of('psi_registration').length ? (
          <details data-testid="psi-registrations">
            <summary>{w.registrations}</summary>
            <ul className={styles.list}>
              {of('psi_registration').map((fixture) => {
                const registration = readRegistration(fixture.event);
                const result = results.find((r) => r.registration === registration.id);
                const verdict = result ? (w.verdicts as Record<string, string>)[result.verdict] ?? result.verdict : null;
                return (
                  <li key={registration.address}>
                    {registration.title}
                    <div className={styles.muted}>
                      {fill(w.sealed, { rung: registration.rung, time: formatUtcDateTime(Date.parse(registration.sealedAt), { year: true }) })}
                      {' · '}
                      {verdict ? fill(w.resultIs, { verdict }) : w.noResult}
                    </div>
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}

        {of('psi_ledger').map((fixture) => {
          const ledger = readLedger(fixture.event);
          const count = (name: string) => ledger.counts[name] ?? 0;
          return (
            <details key={ledger.address} data-testid="psi-ledger">
              <summary>{`${w.ledger}: ${ledger.title}`}</summary>
              <p>{fill(w.ledgerLine, { registered: count('registered'), scored: count('scored'), met: count('met'), missed: count('missed') })}</p>
            </details>
          );
        })}
      </section>
    </Docked>
  );
};

export default PsiWatchPanel;

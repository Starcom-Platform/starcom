/**
 * Psi Watch's lab (decision D-PW, PW4, PW10, PW94–PW96): one of the left panels. Explore: a kind of sky event (its
 * class, bodies, angle or phase, frame and sign), an event set and a window about each moment; the events the windows
 * hold, marked on the counts the same windows hold under 1,000 random time shifts, drawn; no p-value, no verdict,
 * nothing that reads as a result. The years held back for sealed tests stay out (PW75). Draft: the board's form, from
 * the same configuration, its JSON to copy; Starcom sends nothing (PW96). The Experimental badge, and nothing else
 * said of it (PW34).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { fill, numbered, useMessages } from '../../i18n/app/i18n';
import { formatUtcDate } from '../../utils/utcTime';
import { DATA_SCALES } from '../../styles/tokens';
import { ZODIAC_FRAMES } from '../../services/psiWatch/astro/frames';
import { ASPECT_KINDS } from '../../services/psiWatch/astro/aspects';
import { EVENT_SETS, type EventSetId } from '../../services/psiWatch/timestream/eventSets';
import { momentsOf, type SkySpec } from '../../services/psiWatch/timestream/echoReturns';
import { explore, histogram, openSpans, type LabExploration } from '../../services/psiWatch/lab/labExplore';
import { DIRECTIONS, draftOf, SIGN_NAMES, type Direction } from '../../services/psiWatch/lab/hypothesisDraft';
import { closePsiLab, openPsiLab, PSI_LAB_TABS, setLabConfig, setLabFields, usePsiLab, type LabConfig } from '../../features/psi/psiLabPanel';
import { useEventSet } from './Timestream/useEventSet';
import styles from './EventChartPanel.module.css';
import lab from './PsiLabPanel.module.css';

const BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'] as const;
const PLANETS = BODIES.slice(2);
const CLASSES = ['aspect', 'gc_contact', 'ingress', 'lunation', 'lunar_distance', 'node', 'station'] as const;
type LabClass = (typeof CLASSES)[number];

/** A class's spec as first chosen; its frame kept. */
const FIRST: Record<LabClass, Omit<SkySpec, 'frame'>> = {
  aspect: { class: 'aspect', sub: 'harmonic', bodies: ['Mars', 'Saturn'], targetDeg: 90 },
  gc_contact: { class: 'gc_contact', sub: 'harmonic', bodies: ['Sun'], targetDeg: 0 },
  ingress: { class: 'ingress', sub: 'sign', bodies: ['Mars'], sign: 0 },
  lunation: { class: 'lunation', sub: 'full', bodies: ['Sun', 'Moon'] },
  lunar_distance: { class: 'lunar_distance', sub: 'perigee', bodies: ['Moon'] },
  node: { class: 'node', sub: 'moon_ascending', bodies: ['Moon'] },
  station: { class: 'station', sub: 'retrograde', bodies: ['Mercury'] },
};

const HIST_W = 340;
const HIST_H = 96;
const HIST_PAD = 14;

/** The shifted counts as bars, the windows' own count a line across them (PW95). */
const ShiftChart: React.FC<{ exploration: LabExploration; label: string }> = ({ exploration, label }) => {
  const { from, step, counts } = histogram(exploration.shifted, exploration.observed);
  const most = Math.max(1, ...counts);
  const bw = (HIST_W - 2 * HIST_PAD) / counts.length;
  const x = (count: number) => HIST_PAD + ((count - from) / step) * bw;
  const top = HIST_PAD;
  const base = HIST_H - HIST_PAD;
  const last = from + counts.length * step - 1;
  return (
    <svg className={lab.chart} viewBox={`0 0 ${HIST_W} ${HIST_H}`} role="img" aria-label={label} data-testid="psi-lab-chart">
      <line x1={HIST_PAD} x2={HIST_W - HIST_PAD} y1={base} y2={base} stroke="var(--sc-divider)" />
      {counts.map((n, i) => {
        const h = (n / most) * (base - top);
        return <rect key={i} x={HIST_PAD + i * bw + 1} y={base - h} width={Math.max(1, bw - 2)} height={h} fill="var(--sc-text-secondary)" opacity={0.55} />;
      })}
      <line x1={x(exploration.observed) + bw / 2} x2={x(exploration.observed) + bw / 2} y1={top - 6} y2={base} stroke={DATA_SCALES.psiWatch} strokeWidth={2} data-testid="psi-lab-observed" />
      <text x={HIST_PAD} y={HIST_H - 2} fontSize={11} fill="var(--sc-text-secondary)">{numbered(from)}</text>
      <text x={HIST_W - HIST_PAD} y={HIST_H - 2} fontSize={11} textAnchor="end" fill="var(--sc-text-secondary)">{numbered(last)}</text>
    </svg>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className={lab.field}>
    <span className={styles.quiet}>{label}</span>
    {children}
  </label>
);

export const PsiLabPanel: React.FC = () => {
  const { open, tab, config, fields } = usePsiLab();
  const { m } = useMessages();
  const w = m.psiWatch.lab;
  const { spec, window } = config;
  const set = useEventSet(config.set, open && tab === 'explore');
  const key = JSON.stringify(config);
  const [run, setRun] = useState<{ key: string; exploration: LabExploration | null } | null>(null);
  const [running, setRunning] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const now = useMemo(() => Date.now(), []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePsiLab(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => { setSaid(null); }, [tab, key]);
  if (!open) return null;

  const changeSpec = (change: Partial<SkySpec>) => setLabConfig({ spec: { ...spec, ...change } });
  const changeClass = (c: LabClass) => setLabConfig({ spec: { ...FIRST[c], frame: spec.frame } });
  const changeSet = (id: EventSetId) => setLabConfig({ set: id, window: id === 'quakes' ? window : { ...window, unit: 'day' } });
  const changeWindow = (change: Partial<LabConfig['window']>) => setLabConfig({ window: { ...window, ...change } });
  const whole = (value: string) => Math.max(0, Math.floor(Number(value) || 0));

  const exploreNow = () => {
    if (!set) return;
    setRunning(true);
    // A beat for "Finding the moments…" to show: the search runs on this thread.
    setTimeout(() => {
      const moments = openSpans(set).flatMap((span) => momentsOf(spec, span.fromMs, span.untilMs));
      setRun({ key, exploration: moments.length ? explore(set, moments, window) : null });
      setRunning(false);
    }, 30);
  };
  const shown = run?.key === key ? run : null;

  const bodySelect = (index: number, choices: readonly string[]) => (
    <select value={spec.bodies[index] ?? ''} onChange={(e) => { const bodies = [...spec.bodies]; bodies[index] = e.target.value; changeSpec({ bodies }); }}
      data-testid={`psi-lab-body-${index}`}>
      {choices.map((b) => <option key={b} value={b}>{(m.psiWatch.lines.bodies as Record<string, string>)[b] ?? b}</option>)}
    </select>
  );
  const signSelect = (any: boolean) => (
    <select value={spec.sign ?? ''} onChange={(e) => changeSpec({ sign: e.target.value === '' ? undefined : Number(e.target.value) })} data-testid="psi-lab-sign">
      {any ? <option value="">{w.anySign}</option> : null}
      {SIGN_NAMES.map((s, i) => <option key={s} value={i}>{(m.psiWatch.timestream.signs as Record<string, string>)[s] ?? s}</option>)}
    </select>
  );
  const frameSelect = (
    <select value={spec.frame} onChange={(e) => changeSpec({ frame: e.target.value as SkySpec['frame'] })} data-testid="psi-lab-frame">
      {ZODIAC_FRAMES.map((f) => <option key={f} value={f}>{m.psiWatch.chart.frames[f]}</option>)}
    </select>
  );
  const subSelect = (choices: Record<string, string>) => (
    <select value={spec.sub} onChange={(e) => changeSpec({ sub: e.target.value })} data-testid="psi-lab-sub">
      {Object.entries(choices).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  );
  const angleSelect = (
    <select value={spec.targetDeg ?? 0} onChange={(e) => changeSpec({ targetDeg: Number(e.target.value) })} data-testid="psi-lab-angle">
      {ASPECT_KINDS.map((k) => <option key={k.name} value={k.angle}>{(w.angles as Record<string, string>)[k.name] ?? k.name}</option>)}
    </select>
  );

  const drafted = draftOf(spec, config.set, window, fields, now);
  const start = new Date(now + 86_400_000).toISOString().slice(0, 10);
  const json = drafted.draft ? JSON.stringify(drafted.draft, null, 2) : '';

  return createPortal((
    <aside className={styles.panel} role="dialog" aria-labelledby="psi-lab-heading" data-testid="psi-lab-panel">
      <div className={styles.head}>
        <h2 id="psi-lab-heading" className={styles.heading}>{w.heading}</h2>
        <span className={styles.badge}>{m.psiWatch.panel.experimental}</span>
        <button type="button" className={styles.close} aria-label={w.close} title={w.close} onClick={closePsiLab}>×</button>
      </div>
      <div className={styles.frames} role="tablist">
        {PSI_LAB_TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} aria-pressed={tab === t} className={styles.chip}
            onClick={() => openPsiLab(t)} data-testid={`psi-lab-tab-${t}`}>
            {w[t]}
          </button>
        ))}
      </div>

      <div className={lab.form}>
        <Field label={w.kind}>
          <select value={spec.class} onChange={(e) => changeClass(e.target.value as LabClass)} data-testid="psi-lab-class">
            {CLASSES.map((c) => <option key={c} value={c}>{w.classes[c]}</option>)}
          </select>
        </Field>
        {spec.class === 'aspect' ? <>
          <Field label={w.body}>{bodySelect(0, BODIES)}</Field>
          <Field label={w.withBody}>{bodySelect(1, BODIES)}</Field>
          <Field label={w.angle}>{angleSelect}</Field>
        </> : null}
        {spec.class === 'gc_contact' ? <>
          <Field label={w.body}>{bodySelect(0, BODIES)}</Field>
          <Field label={w.angle}>{angleSelect}</Field>
        </> : null}
        {spec.class === 'ingress' ? <>
          <Field label={w.body}>{bodySelect(0, BODIES)}</Field>
          <Field label={w.frame}>{frameSelect}</Field>
          <Field label={w.intoSign}>{signSelect(false)}</Field>
        </> : null}
        {spec.class === 'lunation' ? <>
          <Field label={w.phase}>{subSelect(w.phases)}</Field>
          <Field label={w.frame}>{frameSelect}</Field>
          <Field label={w.sign}>{signSelect(true)}</Field>
        </> : null}
        {spec.class === 'lunar_distance' ? <Field label={w.kind}>{subSelect(w.apsides)}</Field> : null}
        {spec.class === 'node' ? <Field label={w.kind}>{subSelect(w.nodes)}</Field> : null}
        {spec.class === 'station' ? <>
          <Field label={w.body}>{bodySelect(0, PLANETS)}</Field>
          <Field label={w.kind}>{subSelect(w.stations)}</Field>
          <Field label={w.frame}>{frameSelect}</Field>
          <Field label={w.sign}>{signSelect(true)}</Field>
        </> : null}
        <Field label={w.set}>
          <select value={config.set} onChange={(e) => changeSet(e.target.value as EventSetId)} data-testid="psi-lab-set">
            {EVENT_SETS.map((id) => <option key={id} value={id}>{m.psiWatch.timestream.eventSets[id]}</option>)}
          </select>
        </Field>
        <Field label={w.window}>
          <span className={lab.window}>
            <span className={styles.quiet}>{w.before}</span>
            <input type="number" min={0} step={1} value={window.before} onChange={(e) => changeWindow({ before: whole(e.target.value) })} data-testid="psi-lab-before" />
            <span className={styles.quiet}>{w.after}</span>
            <input type="number" min={0} step={1} value={window.after} onChange={(e) => changeWindow({ after: whole(e.target.value) })} data-testid="psi-lab-after" />
            <select value={window.unit} onChange={(e) => changeWindow({ unit: e.target.value as 'day' | 'hour' })} data-testid="psi-lab-unit">
              <option value="day">{w.units.day}</option>
              {config.set === 'quakes' ? <option value="hour">{w.units.hour}</option> : null}
            </select>
          </span>
        </Field>
      </div>

      {tab === 'explore' ? (
        <section data-testid="psi-lab-explore">
          <div className={styles.frames}>
            <button type="button" className={styles.chip} disabled={!set || running || window.before + window.after <= 0} onClick={exploreNow} data-testid="psi-lab-run">
              {w.run}
            </button>
            {running ? <span className={styles.quiet} role="status">{w.running}</span> : null}
          </div>
          {shown && !running ? (shown.exploration ? (
            <div data-testid="psi-lab-result">
              <p className={styles.quiet}>{fill(w.openRecord, {
                from: formatUtcDate(shown.exploration.fromMs, { year: true }),
                until: formatUtcDate(shown.exploration.untilMs - 1, { year: true }),
                days: numbered(Math.round(shown.exploration.openDays)),
              })}</p>
              <p className={styles.quiet}>{fill(w.found, { moments: numbered(shown.exploration.moments), windows: numbered(shown.exploration.windows) })}</p>
              {shown.exploration.leftOut ? <p className={styles.quiet}>{fill(w.leftOut, { n: numbered(shown.exploration.leftOut) })}</p> : null}
              <p className={styles.subject} data-testid="psi-lab-observed-line">{fill(w.observed, { n: numbered(shown.exploration.observed) })}</p>
              <p className={styles.quiet}>{fill(w.usual, { usual: numbered(Math.round(shown.exploration.usual * 10) / 10) })}</p>
              <ShiftChart exploration={shown.exploration} label={w.chart} />
              <p className={styles.quiet}>{w.chart}</p>
              <button type="button" className={styles.chip} onClick={() => openPsiLab('draft')} data-testid="psi-lab-draft-this">{w.draftThis}</button>
            </div>
          ) : <p className={styles.quiet} data-testid="psi-lab-nothing">{w.nothing}</p>) : null}
        </section>
      ) : (
        <section data-testid="psi-lab-draft" className={lab.form}>
          <p className={styles.quiet}>{w.from}</p>
          <Field label={w.title}>
            <input type="text" value={fields.title} placeholder={w.oneSentence} maxLength={200} onChange={(e) => setLabFields({ title: e.target.value })} data-testid="psi-lab-title" />
          </Field>
          <Field label={w.hypothesis}>
            <textarea value={fields.hypothesis} placeholder={w.oneSentence} maxLength={400} rows={3} onChange={(e) => setLabFields({ hypothesis: e.target.value })} data-testid="psi-lab-hypothesis" />
          </Field>
          <Field label={w.direction}>
            <select value={fields.direction} onChange={(e) => setLabFields({ direction: e.target.value as Direction })} data-testid="psi-lab-direction">
              {DIRECTIONS.map((d) => <option key={d} value={d}>{w.directions[d]}</option>)}
            </select>
          </Field>
          <Field label={w.p}>
            <input type="number" min={0} max={1} step={0.01} value={fields.p} onChange={(e) => setLabFields({ p: Number(e.target.value) })} data-testid="psi-lab-p" />
          </Field>
          <Field label={w.rr}>
            <input type="number" min={0} step={0.1} value={fields.rr} onChange={(e) => setLabFields({ rr: Number(e.target.value) })} data-testid="psi-lab-rr" />
          </Field>
          <Field label={w.sealedEnd}>
            <input type="date" value={fields.sealedEnd} min={start} onChange={(e) => setLabFields({ sealedEnd: e.target.value })} data-testid="psi-lab-sealed-end" />
          </Field>
          <p className={styles.quiet}>{fill(w.sealedFrom, { date: formatUtcDate(Date.parse(`${start}T00:00:00Z`), { year: true }) })}</p>
          {drafted.problems.length ? (
            <ul className={styles.list} data-testid="psi-lab-problems">
              {drafted.problems.map((p) => (
                <li key={p} className={styles.quiet}>{p === 'sealedEnd' ? fill(w.problems.sealedEnd, { date: formatUtcDate(Date.parse(`${start}T00:00:00Z`), { year: true }) }) : w.problems[p]}</li>
              ))}
            </ul>
          ) : (
            <>
              <h3 className={styles.subheading}>{w.json}</h3>
              <pre className={lab.json} data-testid="psi-lab-json">{json}</pre>
              <div className={styles.frames}>
                <button type="button" className={styles.chip} data-testid="psi-lab-copy"
                  onClick={() => {
                    // Called in the click itself, as a browser asks; where it is refused, the draft is there to select.
                    if (!navigator.clipboard) { setSaid(w.copyFailed); return; }
                    navigator.clipboard.writeText(json).then(() => setSaid(w.copied), () => setSaid(w.copyFailed));
                  }}>
                  {w.copy}
                </button>
              </div>
            </>
          )}
          {said ? <p className={styles.quiet} role="status" data-testid="psi-lab-said">{said}</p> : null}
        </section>
      )}
    </aside>
  ), document.body);
};

export default PsiLabPanel;

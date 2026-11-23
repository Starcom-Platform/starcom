import { formatCoordinate } from '../../types/intel/SourceObservation';
import { reportPlace, type ReportPlace } from '../../services/intel/reportPlace';
import { counted, fill, useMessages } from '../../i18n/app/i18n';
import { distanceIn } from '../../i18n/app/plain';
import type { LanguageId } from '../../i18n/app/languages';
import type { Messages } from '../../i18n/app/en';

type WorkspaceWords = Messages['workspace'];

/**
 * The three place states as one line of metadata. Kept beside the list rather
 * than in reportPlace itself, because the coordinate's formatting belongs to
 * whatever is displaying it and the claim does not.
 */
const placeLabel = (place: ReportPlace, t: WorkspaceWords): string => {
  if (place.kind === 'point') return formatCoordinate(place.latitude, place.longitude);
  if (place.kind === 'jurisdiction') return fill(t.placeAbout, { codes: place.codes.map((code) => code.toUpperCase()).join(', ') });
  return t.noPlace;
};
import EventTimeFields from './EventTimeFields';
import { EMPTY_EVENT_TIME_FIELDS, eventTimeFromFields, type EventTimeFields as EventTimeFieldValues } from '../../utils/eventTime';
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { isEncryptedAtRest } from '../../services/intel/IntelWorkspaceManager';
import { useIntelWorkspace } from '../../services/intel/IntelWorkspaceContext';
import styles from './IntelWorkspaceConsole.module.css';
import { intelWorkspaceManager } from '../../services/intel/IntelWorkspaceManager';
import { intelReportService } from '../../services/intel/IntelReportService';
import ReportDetailPanel from './ReportDetailPanel';
import ReportEditPanel from './ReportEditPanel';
import { IntelReportUI, type IntelReportPriority, type ReportCitation } from '../../types/intel/IntelReportUI';
import DistributionChoice from '../Shared/DistributionChoice';
import DistributionChip from '../Shared/DistributionChip';
import SeverityChoice from '../Shared/SeverityChoice';
import ReportSeverity from './ReportSeverity';
import { reportReach } from '../../services/intel/bundles/bundleDistribution';
import { PLACE_PRECISIONS } from '../../services/intel/placePrecision';
import CountryFinder from './CountryFinder';
import { placePick, reportDraft } from '../../services/intel/place/placePick';
import { parseReport } from '../../services/intel/serialization/intelReportSerialization';
import { validateReport } from '../../services/intel/validation/reportValidation';
import { buildIndex, search as searchReports } from '../../services/intel/search/reportSearchIndex';
import {
  CONTENT_SENSITIVITIES,
  type InformationVisibility,
  type ContentSensitivity,
} from '../../types/intel/IntelItemUI';
import type { IntelReliability } from '../../types/intel/IntelItemUI';
import type { Collaborator } from '../../types/intel/IntelCaseUI';
import { useGlobeContext } from '../../context/GlobeContext';
import { useVisualizationMode } from '../../context/VisualizationModeContext';
import { useApplicationRouter } from '../../hooks/useApplicationRouter';
import { statusName } from '../../services/intel/steps/statusSteps';
import { passesLensChoice } from '../../services/intel/bigThreeLenses';
import { LensBadges, LensFilter } from './BigThreeLens';
import { NamesPeopleLabel } from './NamesPeopleLabel';
import { useLensChoice } from '../../hooks/useLensChoice';

type ImportResultPreview = {
  id: string;
  status: 'OK' | 'WARN' | 'ERROR';
  warnings?: string[];
  errors?: string[];
  report?: IntelReportUI;
};

type FormState = {
  title: string;
  content: string;
  /** Who may receive it; undefined until someone chooses, which may wait (decisions D2, BD16). */
  visibility: InformationVisibility | undefined;
  sensitivity: ContentSensitivity;
  category: string;
  tags: string;
  type: string;
  source: string;
  reliability: IntelReliability;
  confidence: number;
  latitude: string;
  longitude: string;
  /** When the event a report describes happened (decision D-E). Reports only. */
  event: EventTimeFieldValues;
  /** How serious its author says it is, on the Cases' scale; '' is not assessed (plan item 1.9). */
  priority: '' | IntelReportPriority;
  /** Jurisdictions as the author names them, comma separated. Reports only. */
  jurisdictions: string;
  /** How precisely the place is given, as a radius in metres; '' is not stated. */
  precisionM: string;
  /** What the report rests on: the observation it was written on (decision D-MX, MX19). Reports only. */
  cites: ReportCitation[];
};

const EMPTY_FORM: FormState = {
  title: '',
  content: '',
  // Nothing chosen in advance (decision D2). This was 'public' for intel items.
  visibility: undefined,
  sensitivity: 'open',
  category: 'GENERAL',
  tags: '',
  type: 'OBSERVATION',
  source: 'UNKNOWN',
  reliability: 'C',
  confidence: 0.5,
  latitude: '',
  longitude: '',
  event: EMPTY_EVENT_TIME_FIELDS,
  priority: '',
  jurisdictions: '',
  precisionM: '',
  cites: [],
};

/** How precisely a place can be given, as a radius, in the language shown. Not stated is unknown, not exact. */
const precisionOptions = (lang: LanguageId, t: WorkspaceWords): Array<{ value: string; label: string }> => [
  { value: '', label: t.precisionNotStated },
  ...PLACE_PRECISIONS.map((p, i) => ({
    value: String(p.metres),
    label: fill(i === 0 ? t.precisionExact : t.precisionWithin, { distance: distanceIn(lang, p.metres) }),
  })),
];

/**
 * A field with its label above it, where it stays readable while typing
 * (plan item 1.9, story S8). Every field was labelled only by a placeholder
 * that vanished at the first keystroke.
 */
const Field: React.FC<{ label: string; required?: boolean; hint?: string; children: React.ReactNode }> = ({ label, required, hint, children }) => (
  <label className={styles.field}>
    <span className={styles.fieldLabel}>
      {label}
      {required && <span className={styles.required} aria-hidden="true"> *</span>}
      {hint && <span className={styles.fieldHint}> {hint}</span>}
    </span>
    {children}
  </label>
);

interface IntelWorkspaceConsoleProps {
  /** Deep-link a specific report into view on load — e.g. from the globe's
   * Intel Report popup or AnalysisWorkbench's export handoff. */
  initialReportId?: string;
  /**
   * Opens the report form at a place: "Create Intel Report" on the globe
   * (plan item 0.11). Nothing is saved until the person creates it.
   */
  newReportAt?: { lat: number; lng: number; precisionM?: number };
  /** Back from the globe without a place: the report as it was (plan item 3.5). */
  restoreDraft?: boolean;
}

export const IntelWorkspaceConsole: React.FC<IntelWorkspaceConsoleProps> = ({ initialReportId, newReportAt, restoreDraft }) => {
  const { reports, intelItems, loading } = useIntelWorkspace();
  const { lang, m: { workspace: t, eventTime: when, reasons, shared } } = useMessages();
  const [view, setView] = useState<'reports' | 'intel'>('reports');
  // Open already when the globe handed over a place to write about (plan item 0.11).
  const [showCreate, setShowCreate] = useState(newReportAt !== undefined || Boolean(restoreDraft));
  const [selectedReport, setSelectedReport] = useState<IntelReportUI | null>(null);
  const { setFocusLocation } = useGlobeContext();
  const { setVisualizationMode } = useVisualizationMode();
  const { navigateToApp } = useApplicationRouter();
  const listItemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const [highlightedReportId, setHighlightedReportId] = useState<string | undefined>(initialReportId);

  // Select and scroll a deep-linked report into view once reports have loaded.
  useEffect(() => {
    if (!initialReportId || loading) return;
    const match = reports.find(r => r.id === initialReportId);
    if (match) {
      setSelectedReport(match);
      listItemRefs.current.get(initialReportId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReportId, loading, reports.length]);
  const [form, setForm] = useState<FormState>(() => {
    // Back from picking its place on the globe: the report as it was written
    // (plan item 3.5). Peeked, not taken: a render may run twice; it is taken below.
    const draft = newReportAt || restoreDraft ? reportDraft.peek() as Partial<FormState> | null : null;
    const base: FormState = { ...EMPTY_FORM, ...(draft ?? {}) };
    return newReportAt ? {
      ...base,
      latitude: String(newReportAt.lat),
      longitude: String(newReportAt.lng),
      precisionM: newReportAt.precisionM !== undefined ? String(newReportAt.precisionM) : '',
    } : base;
  });
  useEffect(() => { if (newReportAt || restoreDraft) reportDraft.take(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /** Keep the report being written, and pick its place on the globe (plan item 3.5, story S6). */
  const pickOnGlobe = () => {
    reportDraft.save(form as unknown as Record<string, unknown>);
    placePick.request();
    navigateToApp('cybercommand');
  };
  const [creating, setCreating] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResults, setImportResults] = useState<ImportResultPreview[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importStrategy, setImportStrategy] = useState<'newId'|'overwrite'|'skip'>('newId');
  const [query, setQuery] = useState('');

  const searchIndex = useMemo(()=> buildIndex(reports), [reports]);

  /**
   * Reports whose content is ciphertext in the index.
   *
   * A CONFIDENTIAL report is encrypted at rest, so its body enters the search
   * index as an encrypted blob and can never match a query. Without saying so,
   * "No matches." is a false statement — the honest one is "no matches among
   * what could be read". CasesDashboard already discloses this for classified
   * descriptions; reports had the same hole and not the same sentence.
   */
  const unsearchableReports = useMemo(
    () => reports.filter(r => isEncryptedAtRest(r.content)).length,
    [reports],
  );
  const filteredReports = useMemo(()=> {
    if (!query.trim()) return reports;
    const results = searchReports(searchIndex, query.trim());
    const orderMap = new Map(results.map((r,i)=> [r.id, i]));
    return reports.filter(r => orderMap.has(r.id)).sort((a,b)=> (orderMap.get(a.id)! - orderMap.get(b.id)!));
  }, [query, reports, searchIndex]);
  /*
   * The big-three lenses (D-CT, CT5), the same choice the globe's Intel Reports layer keeps.
   * A report opened by its link is listed whatever the choice, so a link never lands on nothing.
   */
  const [lenses, chooseLenses] = useLensChoice();
  const listedReports = useMemo(
    () => filteredReports.filter((r) => r.id === initialReportId || passesLensChoice(r.hashtags, lenses)),
    [filteredReports, lenses, initialReportId],
  );

  if (loading) return <div className={styles.loading}>{t.loading}</div>;

  const missing = !form.title.trim() && !form.content.trim() ? t.required.both
    : !form.title.trim() ? t.required.title
      : !form.content.trim() ? t.required.content
        : null;

  const create = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    if (isReportView && eventTimeFromFields(form.event, when.errors).error) return;
    setCreating(true);
    try {
      if (isReportView) {
        const latitude = form.latitude.trim() === '' ? undefined : parseFloat(form.latitude);
        const longitude = form.longitude.trim() === '' ? undefined : parseFloat(form.longitude);
        const placed = latitude !== undefined && longitude !== undefined;
        // Jurisdictions as named, lowercased and trimmed and otherwise left alone
        // (see IntelReportUI.jurisdictions).
        const jurisdictions = form.jurisdictions.split(',').map((j) => j.trim().toLowerCase()).filter(Boolean);
        const r = await intelReportService.createReport({
          title: form.title.trim(),
          content: form.content.trim(),
          category: form.category,
          tags: form.tags.split(',').map(t=>t.trim()).filter(Boolean),
          latitude,
          longitude,
          ...(form.priority ? { priority: form.priority } : {}),
          ...(form.visibility ? { visibility: form.visibility } : {}),
          ...(jurisdictions.length ? { jurisdictions } : {}),
          // A precision is about a point, so none is kept without one.
          ...(placed && form.precisionM ? { geoPrecisionM: Number(form.precisionM) } : {}),
          ...(form.cites.length ? { cites: form.cites } : {}),
          ...eventTimeFromFields(form.event, when.errors).value
        // No author: the signer's, not 'anonymous' (plan item 2.2).
        });
        setSelectedReport(r);
      } else {
        intelWorkspaceManager.addIntelItem({
          title: form.title.trim(),
          type: form.type,
          visibility: form.visibility,
          sensitivity: form.sensitivity,
          source: form.source,
          reliability: form.reliability,
          confidence: form.confidence,
          tags: form.tags.split(',').map(t=>t.trim()).filter(Boolean),
          categories: form.category ? [form.category] : [],
          content: form.content.trim(),
          latitude: form.latitude.trim() === '' ? undefined : parseFloat(form.latitude),
          longitude: form.longitude.trim() === '' ? undefined : parseFloat(form.longitude)
        });
      }
      setForm(EMPTY_FORM);
      setShowCreate(false);
    } finally { setCreating(false); }
  };

  const handleParseImport = () => {
    setImportResults([]);
    const trimmed = importText.trim();
    if (!trimmed) return;
    try {
      const obj = JSON.parse(trimmed);
      const { report, warnings, errors } = parseReport(obj);
      if (errors.length) {
        setImportResults([{ id: 'N/A', status: 'ERROR', errors }]);
      } else if (report) {
        const issues = validateReport(report, { mode: 'import' });
        setImportResults([{ id: report.id, status: errors.length ? 'ERROR' : (issues.some(i=>i.severity==='ERROR')?'ERROR': (issues.some(i=>i.severity==='WARN')?'WARN':'OK')), warnings: [...warnings, ...issues.filter(i=>i.severity!=='ERROR').map(i=>i.message)], errors: issues.filter(i=>i.severity==='ERROR').map(i=>i.message), report }]);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t.unknownError;
      setImportResults([{ id: 'N/A', status: 'ERROR', errors: [fill(t.parseFailure, { message })] }]);
    }
  };

  const handleImportCommit = async () => {
    const successful = importResults.filter((r): r is ImportResultPreview & { report: IntelReportUI } => {
      return Boolean(r.report) && r.status !== 'ERROR';
    });
    for (const r of successful) {
      await intelReportService.importReport(r.report, { strategy: importStrategy });
    }
    setShowImport(false);
    setImportText('');
    setImportResults([]);
  };

  const handleAddCollaborator = async (report: IntelReportUI, collaborator: Collaborator) => {
    const updated: IntelReportUI = {
      ...report,
      collaborators: [...(report.collaborators || []), collaborator]
    };
    await intelReportService.saveReport(updated);
    const fresh = await intelReportService.getReport(report.id);
    // The save already succeeded by this point — a null refetch (e.g. the
    // report was concurrently deleted) shouldn't make the UI silently
    // pretend nothing happened; fall back to the object we know we just
    // persisted rather than leaving selectedReport stale.
    setSelectedReport(fresh ?? updated);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportText(String(reader.result||''));
    };
    reader.readAsText(file);
  };

  const isReportView = view === 'reports';

  return (
    <div className={styles.consoleRoot}>
      <div className={styles.sidebar}>
        <h2>{t.heading}</h2>
        <button data-testid="tab-reports" className={view==='reports'?styles.activeTab:styles.tab} onClick={()=>{setView('reports'); setShowCreate(false); setSelectedReport(null);}}>{fill(t.reportsTab, { n: reports.length })}</button>
        <button data-testid="tab-intel" className={view==='intel'?styles.activeTab:styles.tab} onClick={()=>{setView('intel'); setShowCreate(false); setSelectedReport(null);}}>{fill(t.intelTab, { n: intelItems.length })}</button>
        <button data-testid="new-record" className={styles.actionButton} onClick={()=>setShowCreate(s=>!s)}>{isReportView ? t.newReport : t.newIntel}</button>
        {isReportView && <button className={styles.actionButton} onClick={()=> setShowImport(true)}>{t.import}</button>}
        {isReportView && <input data-testid="search-reports" className={styles.searchInput} placeholder={t.search} value={query} onChange={e=> setQuery(e.target.value)} />}
        {isReportView && <LensFilter chosen={lenses} onChange={chooseLenses} hidden={filteredReports.length - listedReports.length} className={styles.lensFilter} />}
      </div>
      {/* On a phone an open report or the editor takes the screen in place of the
          list (the stylesheet reads data-detail-open). */}
      <div
        className={styles.withDetail}
        data-testid="workspace-body"
        data-detail-open={String(view === 'reports' && (selectedReport !== null || editMode) && !showCreate && !showImport)}
      >
        <div className={styles.main + ' ' + styles.listColumn}>
          {showCreate && (
            <div className={styles.createPanel}>
              <h3>{isReportView ? t.createReport : t.createIntel}</h3>
              {/* What it was written on, kept with it (D-MX, MX19). A report
                  need not rest on what it was started from, so it comes off. */}
              {isReportView && form.cites.length > 0 && (
                <div className={styles.restsOn} data-testid="report-rests-on">
                  <span>
                    {counted(t.restsOn, form.cites.length, { events: form.cites.map((c) => fill(t.eventRef, { id: c.eventId.slice(0, 8) })).join(', ') })}
                  </span>
                  <button type="button" className={styles.cancelBtn} onClick={() => setForm((f) => ({ ...f, cites: [] }))}>
                    {t.remove}
                  </button>
                </div>
              )}
              <div className={styles.formRow}>
                <Field label={t.labels.title} required>
                  <input data-testid="record-title" aria-required="true" value={form.title} onChange={e=>setForm({...form,title:e.target.value})} />
                </Field>
                {!isReportView && (
                  <>
                    {/*
                      * Was one <select> of four tier names, hand-written as
                      * <option> literals. Sensitivity is a select from the
                      * canonical list; distribution is asked below, as for a
                      * report, with nothing chosen in advance.
                      */}
                    <Field label={t.labels.sensitivity}>
                      <select
                        value={form.sensitivity}
                        onChange={e=>setForm({...form, sensitivity: e.target.value as ContentSensitivity})}
                      >
                        {CONTENT_SENSITIVITIES.map(c => (
                          <option key={c} value={c}>{shared.sensitivity[c]}</option>
                        ))}
                      </select>
                    </Field>
                  </>
                )}
                <Field label={t.labels.category}>
                  <input value={form.category} onChange={e=>setForm({...form,category:e.target.value})} />
                </Field>
              </div>
              {!isReportView && (
                <div className={styles.formRow}>
                  <Field label={t.labels.type}>
                    <input value={form.type} onChange={e=>setForm({...form,type:e.target.value})} />
                  </Field>
                  <Field label={t.labels.source}>
                    <input value={form.source} onChange={e=>setForm({...form,source:e.target.value})} />
                  </Field>
                  <Field label={t.labels.reliability}>
                    <select value={form.reliability} onChange={e=>setForm({...form,reliability: e.target.value as IntelReliability})}>
                      <option>A</option><option>B</option><option>C</option><option>D</option><option>E</option><option>F</option>
                    </select>
                  </Field>
                  <Field label={t.labels.confidence} hint={t.hints.confidence}>
                    <input type="number" step="0.05" min={0} max={1} value={form.confidence} onChange={e=>setForm({...form,confidence:parseFloat(e.target.value)})} />
                  </Field>
                </div>
              )}
              <Field label={t.labels.content} required>
                <textarea data-testid="record-content" aria-required="true" value={form.content} onChange={e=>setForm({...form,content:e.target.value})} rows={5} />
              </Field>
              <div className={styles.formRow}>
                <Field label={t.labels.tags} hint={t.hints.tags}>
                  <input data-testid="record-tags" value={form.tags} onChange={e=>setForm({...form,tags:e.target.value})} />
                </Field>
                {isReportView && (
                  <Field label={t.labels.jurisdictions} hint={t.hints.jurisdictions}>
                    <input data-testid="record-jurisdictions" value={form.jurisdictions} onChange={e=>setForm({...form,jurisdictions:e.target.value})} />
                  </Field>
                )}
              </div>
              {/* Where a report is about, found by name rather than by code (plan item 3.5, story S6). */}
              {isReportView && (
                <CountryFinder onChoose={(code) => setForm((f) => {
                  const had = f.jurisdictions.split(',').map((j) => j.trim().toLowerCase()).filter(Boolean);
                  return had.includes(code) ? f : { ...f, jurisdictions: [...had, code].join(', ') };
                })} />
              )}
              <div className={styles.formRow}>
                <Field label={t.labels.latitude}>
                  <input
                    data-testid="record-latitude"
                    value={form.latitude}
                    onChange={e=>setForm({...form, latitude: e.target.value})}
                    type="number"
                    step="0.0001"
                  />
                </Field>
                <Field label={t.labels.longitude}>
                  <input
                    data-testid="record-longitude"
                    value={form.longitude}
                    onChange={e=>setForm({...form, longitude: e.target.value})}
                    type="number"
                    step="0.0001"
                  />
                </Field>
                {isReportView && (
                  <button type="button" className={styles.cancelBtn} onClick={pickOnGlobe} data-testid="pick-on-globe">
                    {t.pickOnGlobe}
                  </button>
                )}
                {isReportView && (
                  <Field label={t.labels.placePrecision} hint={t.hints.placePrecision}>
                    <select
                      data-testid="record-precision"
                      value={form.precisionM}
                      disabled={form.latitude.trim() === '' || form.longitude.trim() === ''}
                      onChange={e=>setForm({...form, precisionM: e.target.value})}
                    >
                      {precisionOptions(lang, t).map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </Field>
                )}
              </div>
              {isReportView && (
                <EventTimeFields value={form.event} onChange={(event) => setForm({ ...form, event })} />
              )}
              {isReportView && (
                // How serious, on the Cases' scale (plan item 1.9), as five
                // buttons each drawn as its badge (BD17). Not assessed until
                // someone chooses: a default would read as an assessment.
                <SeverityChoice
                  value={form.priority || undefined}
                  onChange={(priority) => setForm({ ...form, priority: priority ?? '' })}
                  hint={shared.howSerious}
                />
              )}
              {/* Who may receive it, asked with nothing chosen, and allowed to
                  wait (D2, BD16). A report took one only when someone exported it. */}
              <DistributionChoice
                what={isReportView ? 'report' : 'item'}
                value={form.visibility}
                onChange={(visibility) => setForm({ ...form, visibility })}
                onDecideLater={() => setForm({ ...form, visibility: undefined })}
                consequence={isReportView ? reportReach(form.visibility, reasons) : form.visibility ? null : t.itemUndecided}
                dense
                testId={isReportView ? 'report-distribution' : 'item-distribution'}
              />
              <div className={styles.formActions}>
                {/* Create is off until these are there, and now it says so (story S8). */}
                {missing && (
                  <span className={styles.formMissing} data-testid="form-missing">{missing}</span>
                )}
                <button data-testid="cancel-record" onClick={()=>setShowCreate(false)} className={styles.cancelBtn}>{t.cancel}</button>
                <button data-testid="create-record" onClick={create} disabled={creating || !form.title.trim() || !form.content.trim() || (isReportView && !!eventTimeFromFields(form.event, when.errors).error)}className={styles.saveBtn}>{creating ? t.saving : t.create}</button>
              </div>
            </div>
          )}
          {showImport && (
            <div className={styles.createPanel}>
              <h3>{t.importHeading}</h3>
              <div className={styles.formRow}>
                <textarea rows={6} placeholder={t.pasteJson} value={importText} onChange={e=>setImportText(e.target.value)} />
              </div>
              <div className={styles.formRow}>
                <input type="file" accept="application/json" ref={fileInputRef} onChange={handleFileSelect} />
              </div>
              <div className={styles.formRow}>
                <label>{t.strategy}</label>
                <select value={importStrategy} onChange={e=>setImportStrategy(e.target.value as 'newId' | 'overwrite' | 'skip')}>
                  <option value="newId">{t.strategies.newId}</option>
                  <option value="overwrite">{t.strategies.overwrite}</option>
                  <option value="skip">{t.strategies.skip}</option>
                </select>
                <button onClick={handleParseImport} disabled={!importText.trim()}>{t.parse}</button>
              </div>
              {importResults.length>0 && (
                <div className={styles.importResults}>
                  <h4>{t.results}</h4>
                  <ul className={styles.list}>
                    {importResults.map((r,i)=>(
                      <li key={i} className={styles.listItem}>
                        <div className={styles.itemTitle}>{r.id} - {r.status}</div>
                        {r.errors && r.errors.length>0 && <div className={styles.errorBox}>{r.errors.join('; ')}</div>}
                        {r.warnings && r.warnings.length>0 && <div className={styles.warningBox}>{r.warnings.join('; ')}</div>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className={styles.formActions}>
                <button className={styles.cancelBtn} onClick={()=>{setShowImport(false); setImportResults([]); setImportText('');}}>{t.close}</button>
                <button className={styles.saveBtn} disabled={!importResults.some(r=>r.report && r.status!=='ERROR')} onClick={handleImportCommit}>{t.import}</button>
              </div>
            </div>
          )}
          {view === 'reports' && (
            <div className={styles.listSection}>
              <h3>{t.reportsHeading} {query && <span className={styles.small}>{counted(t.resultCount, filteredReports.length)}</span>}</h3>
              <ul className={styles.list}>
                {listedReports.map(r => (
                  <li
                    key={r.id}
                    // Addressable per record: an agent driving the pipeline has
                    // to select the report it just created, not "the first row".
                    data-testid="report-row"
                    data-report-id={r.id}
                    ref={(el) => { if (el) listItemRefs.current.set(r.id, el); else listItemRefs.current.delete(r.id); }}
                    className={r.id === highlightedReportId ? `${styles.listItem} ${styles.highlighted}` : styles.listItem}
                    onClick={()=> { setSelectedReport(r); setHighlightedReportId(undefined); }}
                  >
                    <div className={styles.itemTitle}>{r.title}</div>
                    <div className={styles.itemMarks}>
                      <ReportSeverity priority={r.priority} tags={r.tags} />
                      <LensBadges tags={r.hashtags} />
                      <NamesPeopleLabel namesPeople={r.namesPeople} sources={r.sourceLinks} />
                      <DistributionChip visibility={r.visibility} what="report" />
                    </div>
                    <div className={styles.itemMeta}>
                      {statusName('report', r.status, shared)} · {r.category}
                      {/*
                        * All three place states, said differently. This showed a
                        * coordinate or nothing, so a report kept because it named
                        * a country was indistinguishable from one that named
                        * nowhere — and after the ingest began accepting the
                        * latter, that blank covered two different claims.
                        */}
                      <span> · {placeLabel(reportPlace(r), t)}</span>
                    </div>
                  </li>
                ))}
              </ul>
              {lenses.length > 0 && filteredReports.length > 0 && listedReports.length === 0 && (
                <div className={styles.empty} data-testid="lens-empty">No report here is sorted under the lens chosen.</div>
              )}
              {query && filteredReports.length === 0 && (
                <div className={styles.empty}>
                  {t.noMatches}
                  {unsearchableReports > 0 && (
                    <> {counted(t.notSearched, unsearchableReports)}</>
                  )}
                </div>
              )}
            </div>
          )}
          {view === 'intel' && (
            <div className={styles.listSection}>
              <h3>{t.intelHeading}</h3>
              {intelItems.length === 0 && <div className={styles.empty}>{t.noIntel}</div>}
              <ul className={styles.list}>
                {intelItems.map(i => (
                  <li key={i.id} className={styles.listItem} data-testid="intel-row">
                    <div className={styles.itemTitle}>{i.title}</div>
                    <div className={styles.itemMarks}><DistributionChip visibility={i.visibility} what="item" /></div>
                    <div className={styles.itemMeta}>{i.type} · {fill(t.confidenceShort, { n: Math.round(i.confidence*100) })}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {view === 'reports' && !editMode && (
          <ReportDetailPanel
            report={selectedReport}
            onClose={()=>{setSelectedReport(null); setEditMode(false);}}
            onEnterEdit={()=> setEditMode(true)}
            onAddCollaborator={(c) => selectedReport ? handleAddCollaborator(selectedReport, c) : Promise.resolve()}
            onViewOnGlobe={selectedReport && selectedReport.latitude !== undefined && selectedReport.longitude !== undefined
              ? () => {
                  // Switch to the mode that actually draws intel reports before
                  // flying there. Report markers are gated on this
                  // (useGlobeIntelReportPipeline's isLayerActive('IntelReports')
                  // check), and the mode persists across sessions — so without
                  // this the camera lands on the right coordinates in, say,
                  // EcoNatural mode, with nothing to see and no explanation.
                  setVisualizationMode({ mode: 'CyberCommand', subMode: 'IntelReports' });
                  setFocusLocation({ lat: selectedReport.latitude as number, lng: selectedReport.longitude as number });
                  navigateToApp('cybercommand');
                }
              : undefined}
            onViewInIntelWeb={selectedReport
              ? () => {
                  // The REPORT ID, not a vault path: the path is a slug of the
                  // title plus a hash, computed inside the vault build. Sending
                  // an id lets that one implementation stay the only one.
                  navigateToApp('intelweb', 'standalone', { reportId: selectedReport.id });
                }
              : undefined}
          />
        )}
        {view === 'reports' && editMode && <ReportEditPanel report={selectedReport} onCancel={()=> setEditMode(false)} onSaved={(r)=>{setSelectedReport(r); setEditMode(false);}} onStatusChanged={(r)=>{setSelectedReport(r);}} onDeleted={()=>{setSelectedReport(null); setEditMode(false);}} />}
      </div>
    </div>
  );
};

export default IntelWorkspaceConsole;

import React, { useState, useMemo, useEffect } from 'react';
import { openGlossary } from '../Help/glossaryOpen';
import styles from './ReportEditPanel.module.css';
import { IntelReportUI, IntelReportStatus } from '../../types/intel/IntelReportUI';
import { intelReportService } from '../../services/intel/IntelReportService';
import { nostrIdentityService } from '../../services/identity/NostrIdentityService';
import EventTimeFields from './EventTimeFields';
import StatusSteps from '../Steps/StatusSteps';
import { eventTimeFromFields, fieldsFromEventTime, type EventTimeFields as EventTimeFieldValues } from '../../utils/eventTime';
import SeverityChoice from '../Shared/SeverityChoice';
import DistributionChoice from '../Shared/DistributionChoice';
import { reportReach } from '../../services/intel/bundles/bundleDistribution';
import { fill, useMessages } from '../../i18n/app/i18n';
import type { Messages } from '../../i18n/app/en';

interface Props {
  report: IntelReportUI | null;
  onCancel: () => void;
  onSaved: (r: IntelReportUI) => void;
  onStatusChanged: (r: IntelReportUI) => void;
  /** After a delete: the report is gone, so whoever shows it should stop. Closes the editor when absent. */
  onDeleted?: () => void;
}


type HintKey = keyof Messages['reportEdit']['hints'];

const ReportEditPanel: React.FC<Props> = ({ report, onCancel, onSaved, onStatusChanged, onDeleted }) => {
  const { m: { reportEdit: t, eventTime: when, reasons, shared } } = useMessages();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<IntelReportUI | null>(() => (report ? { ...report } : null));
  const [activeHint, setActiveHint] = useState<HintKey | null>(null);
  // Starts from what the report records. Only changing it writes an event time,
  // so an edit elsewhere never states a precision the author did not.
  const [eventFields, setEventFields] = useState(() => fieldsFromEventTime(report ?? {}));
  const eventTime = useMemo(() => eventTimeFromFields(eventFields, when.errors), [eventFields, when]);

  const changed = useMemo(() => {
    if (!report || !form) return false;
    const before = {
      title: report.title,
      summary: report.summary,
      content: report.content,
      category: report.category,
      tags: report.tags,
      conclusions: report.conclusions,
      recommendations: report.recommendations,
      methodology: report.methodology,
      confidence: report.confidence,
      priority: report.priority,
      visibility: report.visibility,
      targetAudience: report.targetAudience,
      sourceIntelIds: report.sourceIntelIds,
      entityRefs: report.entityRefs,
      latitude: report.latitude,
      longitude: report.longitude,
      startDate: report.startDate?.getTime(),
      endDate: report.endDate?.getTime(),
      timePrecisionMs: report.timePrecisionMs
    };
    const after = {
      title: form.title,
      summary: form.summary,
      content: form.content,
      category: form.category,
      tags: form.tags,
      conclusions: form.conclusions,
      recommendations: form.recommendations,
      methodology: form.methodology,
      confidence: form.confidence,
      priority: form.priority,
      visibility: form.visibility,
      targetAudience: form.targetAudience,
      sourceIntelIds: form.sourceIntelIds,
      entityRefs: form.entityRefs,
      latitude: form.latitude,
      longitude: form.longitude,
      startDate: form.startDate?.getTime(),
      endDate: form.endDate?.getTime(),
      timePrecisionMs: form.timePrecisionMs
    };
    return JSON.stringify(after) !== JSON.stringify(before);
  }, [form, report]);

  const validation = useMemo(() => {
    if (!form) return [] as string[];
    const errs: string[] = [];
    if (!form.title.trim()) errs.push(t.errors.titleRequired);
    if (form.title.length > 200) errs.push(t.errors.titleTooLong);
    if (!form.content.trim()) errs.push(t.errors.contentRequired);
    if (form.content.length < 10) errs.push(t.errors.contentTooShort);
    if (form.confidence != null && (form.confidence < 0 || form.confidence > 1)) errs.push(t.errors.confidenceRange);
    if (form.latitude != null && Number.isNaN(form.latitude)) errs.push(t.errors.latitudeNumber);
    if (form.longitude != null && Number.isNaN(form.longitude)) errs.push(t.errors.longitudeNumber);
    if (eventTime.error) errs.push(eventTime.error);
    return errs;
  }, [form, eventTime, t]);

  const updateArrayField = (key: keyof IntelReportUI, value: string) => {
    const list = value.split(',').map(v => v.trim()).filter(Boolean);
    setForm(prev => (prev ? { ...prev, [key]: list } as IntelReportUI : prev));
  };

  const updateEventTime = (next: EventTimeFieldValues) => {
    setEventFields(next);
    const { value, error: eventError } = eventTimeFromFields(next, when.errors);
    if (eventError) return;
    setForm(prev => (prev ? { ...prev, startDate: value.startDate, endDate: value.endDate, timePrecisionMs: value.timePrecisionMs } : prev));
  };

  const save = async () => {
    if (validation.length) { setError(t.errors.fix); return; }
    if (!changed) { onCancel(); return; }
    setWorking(true); setError(null);
    try {
      await intelReportService.saveReport(form as IntelReportUI);
      const refreshed = await intelReportService.getReport(form.id);
      if (refreshed) onSaved(refreshed);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t.errors.saveFailed;
      setError(message);
    } finally { setWorking(false); }
  };

  const attemptStatusChange = async (next: IntelReportStatus) => {
    setWorking(true); setError(null);
    try {
      const updated = await intelReportService.updateStatus(form.id, next, nostrIdentityService.signerPubkey() ?? undefined);
      if (updated) { setForm(updated); onStatusChanged(updated); }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t.errors.statusFailed;
      setError(message);
    } finally { setWorking(false); }
  };

  // No question first: a deletion is held ten seconds, and the app-wide Undo
  // bar is the way back (plan item 0.6).
  const attemptDelete = async () => {
    setWorking(true); setError(null);
    try {
      await intelReportService.deleteReport(form.id);
      // Not onStatusChanged(form): that handed the deleted report back to be
      // shown, so its panel stayed open on a report that no longer existed.
      (onDeleted ?? onCancel)();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t.errors.deleteFailed;
      setError(message);
    } finally { setWorking(false); }
  };


  // highlight helper
  const fieldChanged = (key: keyof IntelReportUI) => {
    if (!report || !form) return false;
    const before = report[key];
    const after = form[key];
    return changed && JSON.stringify(after) !== JSON.stringify(before);
  };

  useEffect(() => {
    if (!activeHint) return;
    const handleClick = () => setActiveHint(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [activeHint]);

  const InfoHint: React.FC<{ id: HintKey }> = ({ id }) => {
    const info = t.hints[id];
    const isOpen = activeHint === id;

    if (!info) return null;

    return (
      <span className={styles.infoWrapper}>
        <button
          type="button"
          className={styles.infoIcon}
          title={info.hover}
          aria-label={fill(t.help, { what: info.hover })}
          onClick={(event) => {
            event.stopPropagation();
            setActiveHint(isOpen ? null : id);
          }}
        >
          ?
        </button>
        {isOpen && (
          <div
            className={styles.infoPopover}
            role="tooltip"
            aria-live="polite"
            onClick={(event) => event.stopPropagation()}
          >
            <p>{info.detail}</p>
            {/* Every "?" leads to the words Starcom uses (plan item 3.2). */}
            <button
              type="button"
              className={styles.closePopover}
              onClick={(event) => {
                event.stopPropagation();
                setActiveHint(null);
                openGlossary();
              }}
            >
              {t.glossary}
            </button>
            <button
              type="button"
              className={styles.closePopover}
              onClick={(event) => {
                event.stopPropagation();
                setActiveHint(null);
              }}
            >
              {t.gotIt}
            </button>
          </div>
        )}
      </span>
    );
  };

  if (!report || !form) return null;

  return (
    <div className={styles.panelRoot}>
      <div className={styles.header}>
        <h3>{t.heading}</h3>
        <div className={styles.actions}>
          <button className={styles.button} onClick={onCancel}>{t.close}</button>
        </div>
      </div>
      <div className={styles.formGrid}>
        <label className={fieldChanged('title') ? styles.changed : undefined}>
          <span className={styles.labelHeader}>{t.labels.title} <InfoHint id="title" /></span>
          <input value={form.title} onChange={e=>setForm({...form, title:e.target.value})} />
        </label>
        <label className={fieldChanged('summary') ? styles.changed : undefined}>
          <span className={styles.labelHeader}>{t.labels.summary} <InfoHint id="summary" /></span>
          <textarea rows={2} value={form.summary || ''} onChange={e=>setForm({...form, summary:e.target.value, manualSummary: !!e.target.value})} />
        </label>
        <label className={fieldChanged('content') ? styles.changed : undefined}>
          <span className={styles.labelHeader}>{t.labels.content} <InfoHint id="content" /></span>
          <textarea rows={6} value={form.content} onChange={e=>setForm({...form, content:e.target.value})} />
        </label>
        <div className={styles.row}>
          <label>
            <span className={styles.labelHeader}>{t.labels.category} <InfoHint id="category" /></span>
            <input value={form.category} onChange={e=>setForm({...form, category:e.target.value})} />
          </label>
        </div>
        {/* The Cases' scale (plan item 1.9), as five buttons each its badge
            (BD17). Showed ROUTINE for a report nobody had assessed. */}
        <SeverityChoice
          value={form.priority}
          onChange={(priority) => setForm({ ...form, priority })}
          hint={shared.howSerious}
          help={<InfoHint id="priority" />}
        />
        {/* Asked as the form asks (BD16). A report that has a distribution keeps
            one: Decide later is offered only while nobody has decided. */}
        <DistributionChoice
          what="report"
          value={form.visibility}
          onChange={(visibility) => setForm({ ...form, visibility })}
          onDecideLater={report.visibility === undefined ? () => setForm({ ...form, visibility: undefined }) : undefined}
          consequence={reportReach(form.visibility, reasons)}
          dense
          testId="report-distribution"
        />
        <div className={styles.section}>
          <div className={styles.sectionHeading}>
            <h4 className={styles.sectionTitle}>{t.sections.geoint}</h4>
            <InfoHint id="geoint" />
          </div>
          <div className={styles.row}>
            <label className={fieldChanged('latitude') ? styles.changed : undefined}>
              <span className={styles.labelHeader}>{t.labels.latitude} <InfoHint id="latitude" /></span>
              <input
                type="number"
                step="0.0001"
                value={form.latitude ?? ''}
                onChange={e=>setForm({...form, latitude: e.target.value === '' ? undefined : parseFloat(e.target.value)})}
              />
            </label>
            <label className={fieldChanged('longitude') ? styles.changed : undefined}>
              <span className={styles.labelHeader}>{t.labels.longitude} <InfoHint id="longitude" /></span>
              <input
                type="number"
                step="0.0001"
                value={form.longitude ?? ''}
                onChange={e=>setForm({...form, longitude: e.target.value === '' ? undefined : parseFloat(e.target.value)})}
              />
            </label>
          </div>
        </div>
        <div className={styles.section}>
          <div className={styles.sectionHeading}>
            <h4 className={styles.sectionTitle}>{t.sections.eventTime}</h4>
          </div>
          <EventTimeFields value={eventFields} onChange={updateEventTime} />
        </div>
        <div className={styles.row}>
          <label>
            <span className={styles.labelHeader}>{t.labels.tags} <InfoHint id="tags" /></span>
            <input value={form.tags.join(', ')} onChange={e=>updateArrayField('tags', e.target.value)} />
          </label>
          <label>
            <span className={styles.labelHeader}>{t.labels.targetAudience} <InfoHint id="targetAudience" /></span>
            <input value={(form.targetAudience||[]).join(', ')} onChange={e=>updateArrayField('targetAudience', e.target.value)} />
          </label>
        </div>
        <div className={styles.row}>
          <label>
            <span className={styles.labelHeader}>{t.labels.confidence} <InfoHint id="confidence" /></span>
            <input type="number" min={0} max={1} step="0.05" value={form.confidence ?? 0.5} onChange={e=>setForm({...form, confidence: parseFloat(e.target.value)})} />
          </label>
          <label>
            <span className={styles.labelHeader}>{t.labels.sourceIntelIds} <InfoHint id="sourceIntelIds" /></span>
            <input value={(form.sourceIntelIds||[]).join(', ')} onChange={e=>updateArrayField('sourceIntelIds', e.target.value)} />
          </label>
        </div>
        <div className={styles.row}>
          <label>
            <span className={styles.labelHeader}>{t.labels.entityRefs} <InfoHint id="entityRefs" /></span>
            <input value={(form.entityRefs||[]).join(', ')} onChange={e=>updateArrayField('entityRefs', e.target.value)} />
          </label>
        </div>
        <div className={styles.section}>
          <div className={styles.sectionHeading}>
            <h4 className={styles.sectionTitle}>{t.sections.conclusions} <span className={styles.localOnly}>{t.localOnly}</span></h4>
            <InfoHint id="conclusions" />
          </div>
          <textarea rows={2} value={(form.conclusions||[]).join('\n')} onChange={e=>setForm({...form, conclusions: e.target.value.split(/\n+/).map(l=>l.trim()).filter(Boolean)})} />
        </div>
        <div className={styles.section}>
          <div className={styles.sectionHeading}>
            <h4 className={styles.sectionTitle}>{t.sections.recommendations} <span className={styles.localOnly}>{t.localOnly}</span></h4>
            <InfoHint id="recommendations" />
          </div>
          <textarea rows={2} value={(form.recommendations||[]).join('\n')} onChange={e=>setForm({...form, recommendations: e.target.value.split(/\n+/).map(l=>l.trim()).filter(Boolean)})} />
        </div>
        <div className={styles.section}>
          <div className={styles.sectionHeading}>
            <h4 className={styles.sectionTitle}>{t.sections.methodology}</h4>
            <InfoHint id="methodology" />
          </div>
          <textarea rows={2} value={(form.methodology||[]).join('\n')} onChange={e=>setForm({...form, methodology: e.target.value.split(/\n+/).map(l=>l.trim()).filter(Boolean)})} />
        </div>
        <div className={styles.section}>
          <div className={styles.sectionHeading}>
            <h4 className={styles.sectionTitle}>{t.sections.whereItStands}</h4>
            <InfoHint id="statusTransitions" />
          </div>
          <StatusSteps
            kind="report"
            status={form.status}
            busy={working}
            onMove={(to) => attemptStatusChange(to as IntelReportStatus)}
            // The service refuses it too; this says so before anyone tries.
            blocked={{ APPROVED: nostrIdentityService.signerPubkey() === form.author ? t.approveBlocked : null }}
            testId="report-steps"
            onDark
          />
        </div>
        {validation.length>0 && <div className={`${styles.msg} ${styles.msgCaution}`}>{validation.join(' | ')}</div>}
        {error && <div className={`${styles.msg} ${styles.msgDanger}`} role="alert">{error}</div>}
      </div>
      <div className={styles.actions}>
        <button className={`${styles.button} ${styles.danger}`} disabled={working} onClick={attemptDelete}>{t.delete}</button>
        <button className={styles.button} onClick={onCancel}>{t.cancel}</button>
        <button className={`${styles.button} ${styles.primary}`} disabled={working || !changed || validation.length>0} onClick={save}>{working ? t.saving : t.saveChanges}</button>
      </div>
    </div>
  );
};

export default ReportEditPanel;

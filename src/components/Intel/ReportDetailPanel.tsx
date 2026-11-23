import { formatCoordinate } from '../../types/intel/SourceObservation';
import { reportPlace } from '../../services/intel/reportPlace';
import { formatEventTime } from '../../utils/eventTime';
import React, { useEffect, useMemo, useState } from 'react';
import { useReportUsage } from '../../core/intel/hooks/useReportUsage';
import styles from './ReportDetailPanel.module.css';
import { IntelReportUI } from '../../types/intel/IntelReportUI';
import type { Collaborator } from '../../types/intel/IntelCaseUI';
import { serializeReport } from '../../services/intel/serialization/intelReportSerialization';
import UtcTime from '../Shared/UtcTime';
import AddToCase from './AddToCase';
import KeyName from '../Identity/KeyName';
import ReportSeverity from './ReportSeverity';
import { statusName } from '../../services/intel/steps/statusSteps';
import ReviewsPanel from '../Reviews/ReviewsPanel';
import { reportReviewTarget } from '../../services/reviews/reviewTargets';
import ReceivedFromLine from './Bundles/ReceivedFromLine';
import { RestsOn } from './RestsOn';
import SourceLinks from './SourceLinks';
import { LensBadges } from './BigThreeLens';
import AskDistributionDialog from '../Shared/AskDistributionDialog';
import DistributionChip from '../Shared/DistributionChip';
import StatusChip from '../Shared/StatusChip';
import { Glyph } from '../../symbols/Glyph';
import { fromRelayFeed, reportDownloadRefusal } from '../../services/intel/bundles/bundleDistribution';
import { setRecordDistribution } from '../../services/intel/attention/setRecordDistribution';
import type { InformationVisibility } from '../../types/intel/IntelItemUI';
import Translatable from '../Translation/Translatable';
import { counted, fill, useMessages } from '../../i18n/app/i18n';
import { fillNodes } from '../../i18n/app/fillNodes';
import { NamesPeopleLabel } from './NamesPeopleLabel';
import { localTitleIn, utcDateTimeIn } from '../../i18n/app/dates';
import { reviewReportPublish, reviewReportWithdrawal } from '../../services/publishing/reports';
import { publishedReport, subscribePublishedReports, type PublishedReport } from '../../services/intel/publishedReports';
import { cancelKept, keptForReport, useKeptNotes } from '../../services/intel/outbox/keptNotes';
import { eventOutbox } from '../../services/intel/outbox/EventOutbox';

interface Props {
  report: IntelReportUI | null;
  onClose: () => void;
  onEnterEdit: () => void;
  onAddCollaborator: (collaborator: Collaborator) => Promise<void>;
  /** Present only when the report has coordinates — flies the globe there and switches to it. */
  onViewOnGlobe?: () => void;
  onViewInIntelWeb?: () => void;
}

const ReportDetailPanel: React.FC<Props> = ({ report, onClose, onEnterEdit, onAddCollaborator, onViewOnGlobe, onViewInIntelWeb }) => {
  const { lang, m: { reportPanel: t, kept: keptWords, bundles, shared, time, eventTime } } = useMessages();
  const usage = useReportUsage(report?.id ?? null);
  const [newUserId, setNewUserId] = useState('');
  // Rendered with no report while nothing is selected.
  const reviewTarget = useMemo(() => (report ? reportReviewTarget(report) : null), [report]);
  const [newName, setNewName] = useState('');
  // Guards against a lost-update race: onAddCollaborator does a full-record
  // read-modify-write (see IntelWorkspaceConsole.handleAddCollaborator). A
  // second click before the first save+refetch resolves would build its
  // update from the same stale `report.collaborators` array, and the second
  // save would silently overwrite the first collaborator rather than both
  // persisting. Disabling the control while a save is in flight closes that
  // window entirely, rather than trying to merge concurrent writes.
  const [addingCollaborator, setAddingCollaborator] = useState(false);
  const [addCollaboratorError, setAddCollaboratorError] = useState<string | null>(null);
  const [addingToCase, setAddingToCase] = useState(false);
  // Export follows the rule Export as file does (plan item 9.13b, decision G8d).
  const [exportRefused, setExportRefused] = useState<string | null>(null);
  const [askingExport, setAskingExport] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  // Publishing it to the globe (decision D-RP): where it went, and what stopped it.
  const [published, setPublished] = useState<PublishedReport | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishNote, setPublishNote] = useState<string | null>(null);
  const [askingPublish, setAskingPublish] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const reportId = report?.id ?? null;
  useEffect(() => {
    setPublishNote(null);
    const read = () => setPublished(reportId ? publishedReport(reportId) : null);
    read();
    return subscribePublishedReports(read);
  }, [reportId]);
  // What waits on this device because no relay answered when it was sent (W1).
  const keptNotes = useKeptNotes();
  const kept = keptForReport(keptNotes, reportId ?? '');

  if (!report) return null;

  const writeOut = () => {
    const serialized = serializeReport(report);
    const blob = new Blob([JSON.stringify(serialized, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `report-${report.id}-v${report.version || 1}.intelReport.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 100);
  };

  // A report someone published goes; one of yours goes as its distribution
  // says, and nobody having decided is asked about first.
  const handleExport = () => {
    setExportRefused(null);
    const refusal = reportDownloadRefusal(report);
    if (!refusal) { writeOut(); return; }
    if (report.visibility === undefined && !fromRelayFeed(report)) { setAskingExport(true); return; }
    setExportRefused(refusal);
  };

  const chooseForExport = async (visibility: InformationVisibility) => {
    setExportBusy(true);
    try {
      await setRecordDistribution({ kind: 'report', id: report.id }, visibility);
    } catch (e) {
      setAskingExport(false);
      setExportRefused(fill(bundles.notSaved, { reason: e instanceof Error ? e.message : String(e) }));
      return;
    } finally {
      setExportBusy(false);
    }
    setAskingExport(false);
    const refusal = reportDownloadRefusal({ ...report, visibility });
    if (refusal) { setExportRefused(refusal); return; }
    writeOut();
  };

  // Only the person's own reports: one read from the relays is its author's, one sent here is its sender's.
  const ownReport = !fromRelayFeed(report) && !report.receivedFrom;

  const publish = async (target: IntelReportUI) => {
    setPublishNote(null);
    setPublishing(true);
    try {
      const outcome = await reviewReportPublish(target);
      if (outcome.status === 'refused') setPublishNote(outcome.reason);
    } catch (e) {
      setPublishNote(fill(t.notPublished, { reason: e instanceof Error ? e.message : String(e) }));
    } finally {
      setPublishing(false);
    }
  };

  // Withdrawing what was published from here (RP7): a notice replaces it, and relays are asked to delete it.
  const withdraw = async () => {
    setPublishNote(null);
    setWithdrawing(true);
    try {
      const outcome = await reviewReportWithdrawal(report);
      if (outcome.status === 'refused') setPublishNote(outcome.reason);
    } catch (e) {
      setPublishNote(fill(t.notWithdrawn, { reason: e instanceof Error ? e.message : String(e) }));
    } finally {
      setWithdrawing(false);
    }
  };

  // Nobody having decided who may receive it is asked about first, as for an export.
  const handlePublish = () => {
    if (report.visibility === undefined) { setAskingPublish(true); return; }
    void publish(report);
  };

  const chooseForPublish = async (visibility: InformationVisibility) => {
    setPublishBusy(true);
    try {
      await setRecordDistribution({ kind: 'report', id: report.id }, visibility);
    } catch (e) {
      setAskingPublish(false);
      setPublishNote(fill(bundles.notSaved, { reason: e instanceof Error ? e.message : String(e) }));
      return;
    } finally {
      setPublishBusy(false);
    }
    setAskingPublish(false);
    void publish({ ...report, visibility });
  };

  const handleAddCollaborator = async () => {
    const userId = newUserId.trim();
    if (!userId || addingCollaborator) return;
    setAddCollaboratorError(null);

    if (report.collaborators?.some(c => c.userId === userId)) {
      setAddCollaboratorError(`${userId} is already a collaborator on this report.`);
      return;
    }

    setAddingCollaborator(true);
    try {
      await onAddCollaborator({
        userId,
        name: newName.trim() || userId,
        addedAt: new Date().toISOString(),
        addedBy: report.author
      });
      setNewUserId('');
      setNewName('');
    } catch (err) {
      setAddCollaboratorError(err instanceof Error ? err.message : t.addFailed);
    } finally {
      setAddingCollaborator(false);
    }
  };

  // Public, the only content the cloud may be sent on the person's own key (D-ML, ML6): marked so, or
  // published by someone else and taken from the relay feed with no distribution of its own.
  const isPublic = report.visibility === 'public' || (report.visibility === undefined && fromRelayFeed(report));

  return (
    <div className={styles.panelRoot}>
      <div className={styles.header}>
        <h3 className={styles.title}>{report.title}</h3>
        <div className={styles.actions}>
          {onViewOnGlobe && <button className={styles.button} onClick={onViewOnGlobe}><Glyph name="app:cybercommand" size={14} />{t.viewOnGlobe}</button>}
          {onViewInIntelWeb && <button className={styles.button} onClick={onViewInIntelWeb}><Glyph name="app:intelweb" size={14} />{t.viewInIntelWeb}</button>}
          <button className={styles.button} onClick={() => setAddingToCase((open) => !open)}>{t.addToCase}</button>
          <button className={styles.button} onClick={handleExport}>{t.export}</button>
          {ownReport && (
            <button className={styles.button} onClick={handlePublish} disabled={publishing || withdrawing} data-testid="report-publish">
              {publishing ? t.publishing : published ? t.publishAgain : t.publish}
            </button>
          )}
          {ownReport && published && !published.withdrawnAt && !kept.withdrawal && (
            <button className={styles.button} onClick={() => void withdraw()} disabled={publishing || withdrawing} data-testid="report-withdraw">
              {withdrawing ? t.withdrawing : t.withdraw}
            </button>
          )}
          <button className={styles.button} onClick={onEnterEdit}>{t.edit}</button>
          <button className={styles.button} onClick={onClose} aria-label={t.close} title={t.close}>×</button>
        </div>
      </div>
      {exportRefused && <p className={styles.notice} role="alert">{exportRefused}</p>}
      {publishNote && <p className={styles.notice} role="alert" data-testid="report-publish-note">{publishNote}</p>}
      {ownReport && ([['report-kept', kept.publish, t.keptPublish], ['report-withdrawal-kept', kept.withdrawal, t.keptWithdrawal]] as const).map(
        ([testId, record, waiting]) => record && (
          <p key={testId} className={record.status === 'abandoned' ? styles.notice : styles.small} data-testid={testId}>
            {record.status === 'abandoned' ? fill(keptWords.givenUp, { n: record.attempts, reason: record.lastError ?? '' }) : waiting}{' '}
            {record.status === 'abandoned' && (
              <button className={styles.button} onClick={() => void eventOutbox.retry(record.id)}>{keptWords.tryAgain}</button>
            )}
            <button className={styles.button} onClick={() => void cancelKept(record)}>{keptWords.cancelSending}</button>
          </p>
        ),
      )}
      {published && ownReport && (published.withdrawnAt ? (
        <p className={styles.small} data-testid="report-withdrawn">
          {fill(t.withdrawn, { when: utcDateTimeIn(lang, published.withdrawnAt, true) })}
        </p>
      ) : (
        <p className={styles.small} data-testid="report-published">
          {fill(t.published, { when: utcDateTimeIn(lang, published.at, true), n: published.relays })}
          {new Date(report.updatedAt).getTime() > published.reportUpdatedAt && <> {t.changedSince}</>}
        </p>
      ))}
      <AskDistributionDialog
        open={askingPublish}
        title={t.publishTitle}
        what="report"
        reason={t.publishAsk}
        onChoose={(visibility) => void chooseForPublish(visibility)}
        onCancel={() => setAskingPublish(false)}
        busy={publishBusy}
        testId="report-publish-ask"
      />
      <AskDistributionDialog
        open={askingExport}
        title={bundles.exportTitle.report}
        what="report"
        reason={reportDownloadRefusal({}) ?? ''}
        onChoose={(visibility) => void chooseForExport(visibility)}
        onCancel={() => setAskingExport(false)}
        busy={exportBusy}
        testId="report-export-ask"
      />
      {addingToCase && (
        <AddToCase key={report.id} recordId={report.id} recordTitle={report.title} onClose={() => setAddingToCase(false)} />
      )}
      <div className={styles.metaRow}>
        <StatusChip kind="report" status={report.status} testId="report-status" />
        {/* Shown when unassessed too, as such (plan item 1.9). */}
        <ReportSeverity priority={report.priority} tags={report.tags} />
        {/* The big-three lenses it is sorted under (D-CT, CT6). */}
        <LensBadges tags={report.hashtags} />
        {/* It names a person, as its source names them (D-NP, NP1). */}
        <NamesPeopleLabel namesPeople={report.namesPeople} sources={report.sourceLinks} />
        {/* Who may receive it (BD18). It showed only as a question at export. */}
        <DistributionChip visibility={report.visibility} what="report" />
        <span className={styles.badge}>v{report.version || 1}</span>
      </div>
      {/* WHERE THIS WENT.
          Evidence in this pipeline points backwards — a mission cites its
          reports, a case cites its evidence — and never forwards, so a
          contributor had no way to learn whether their report reached anything.
          "Did what I wrote matter?" is the most ordinary question a collector
          has and it had no answer anywhere in the interface. */}
      {!usage.loading && (
        <div className={styles.metaRow} data-testid="report-usage">
          {usage.reachedNothing ? (
            <span className={styles.small}>{t.notUsed}</span>
          ) : (
            <span className={styles.small}>
              {`${counted(t.usedCases, usage.cases.length)} · ${counted(t.usedMissions, usage.missions.length)}`}
            </span>
          )}
        </div>
      )}
      {report.tags && report.tags.length>0 && (
        <div className={styles.tagRow}>
          {report.tags.map(t=> <span key={t} className={styles.tag}>{t}</span>)}
        </div>
      )}
      {report.summary && (
        <div className={styles.section}>
          <h4>{t.summary}</h4>
          <div className={styles.contentBox}>{report.summary}</div>
          <Translatable text={report.summary} publicContent={isPublic} testId="report-summary-translate" />
        </div>
      )}
      <div className={styles.section}>
        <h4>{t.content}</h4>
        <div className={styles.contentBox}>{report.content}</div>
        <Translatable text={report.content} publicContent={isPublic} testId="report-content-translate" />
      </div>
      {report.conclusions && report.conclusions.length>0 && (
        <div className={styles.section}>
          <h4>{t.conclusions}</h4>
          <ul className={styles.list}>{report.conclusions.map((c,i)=><li key={i}>{c}</li>)}</ul>
        </div>
      )}
      {report.recommendations && report.recommendations.length>0 && (
        <div className={styles.section}>
          <h4>{t.recommendations}</h4>
          <ul className={styles.list}>{report.recommendations.map((r,i)=><li key={i}>{r}</li>)}</ul>
        </div>
      )}
      {/* Where its information was published, to follow (D-CT, CT2): its r tags, the original first. */}
      {report.sourceLinks && report.sourceLinks.length > 0 && (
        <div className={styles.section} data-testid="report-detail-sources">
          <SourceLinks links={report.sourceLinks} headingAs="h4" headingClassName="" />
        </div>
      )}
      {/* The observations it rests on, each as read here (D-MX: MX3, MX19, MX23). */}
      {report.cites && report.cites.length > 0 && (
        <div className={styles.section}>
          <h4>{t.restsOn}</h4>
          <RestsOn cites={report.cites} />
        </div>
      )}
      <div className={styles.section}>
        <h4>{t.metadata}</h4>
        <div className={styles.small}>{fillNodes(t.author, { who: <KeyName pubkey={report.author} /> })}</div>
        <ReceivedFromLine receivedFrom={report.receivedFrom} />
        <div className={styles.small}>{fill(t.category, { category: report.category })}</div>
        {/*
          * "Location" only when there IS one. A report that named a territory
          * is shown as its subject rather than its position, and one that named
          * nowhere says so — an absence of claim by the publisher, not a lookup
          * this node failed. See services/intel/reportPlace.ts.
          */}
        {(() => {
          const place = reportPlace(report);
          if (place.kind === 'point') {
            // With how precisely it was given, and the jurisdictions named beside
            // it, which a point used to hide (plan item 1.9).
            const named = (report.jurisdictions ?? []).filter((code) => code.trim().length > 0);
            return (
              <>
                <div className={styles.small}>{fill(t.location, { where: formatCoordinate(place.latitude, place.longitude, report.geoPrecisionM, { showUncertainty: true }) })}</div>
                {named.length > 0 && <div className={styles.small}>{fill(t.jurisdictions, { codes: named.map((code) => code.toUpperCase()).join(', ') })}</div>}
              </>
            );
          }
          if (place.kind === 'jurisdiction') {
            return <div className={styles.small}>{fill(t.subject, { codes: place.codes.map((code) => code.toUpperCase()).join(', ') })}</div>;
          }
          return <div className={styles.small}>{t.noPlace}</div>;
        })()}
        {report.confidence !== undefined && <div className={styles.small}>{fill(t.confidence, { n: Math.round((report.confidence||0)*100) })}</div>}
        {report.targetAudience && report.targetAudience.length>0 && <div className={styles.small}>{fill(t.audience, { who: report.targetAudience.join(', ') })}</div>}
        {/* When the event happened, apart from when the report was written (decision D-E). */}
        {report.startDate && (
          <div className={styles.small} title={localTitleIn(lang, report.startDate.getTime(), time.local)}>{fill(t.happened, { when: formatEventTime(report, lang, eventTime) })}</div>
        )}
        <div className={styles.small} title={localTitleIn(lang, report.createdAt.getTime(), time.local)}>{fill(t.created, { when: utcDateTimeIn(lang, report.createdAt.getTime(), true) })}</div>
        <div className={styles.small} title={localTitleIn(lang, report.updatedAt.getTime(), time.local)}>{fill(t.updated, { when: utcDateTimeIn(lang, report.updatedAt.getTime(), true) })}</div>
      </div>
      <div className={styles.section}>
        <h4>{t.collaborators}</h4>
        <div className={styles.small}>{t.collaboratorsNote}</div>
        {(!report.collaborators || report.collaborators.length===0) && (
          <div className={styles.small}>{t.noCollaborators}</div>
        )}
        {report.collaborators && report.collaborators.length>0 && (
          <ul className={styles.list}>
            {report.collaborators.map((c,i)=>(
              <li key={c.userId+i}><KeyName pubkey={c.userId} hint={c.name} /></li>
            ))}
          </ul>
        )}
        <div className={styles.formRow}>
          <input
            className={styles.input}
            placeholder={t.pubkeyPlaceholder}
            value={newUserId}
            onChange={e=>setNewUserId(e.target.value)}
            disabled={addingCollaborator}
          />
          <input
            className={styles.input}
            placeholder={t.namePlaceholder}
            value={newName}
            onChange={e=>setNewName(e.target.value)}
            disabled={addingCollaborator}
          />
          <button className={styles.button} onClick={handleAddCollaborator} disabled={!newUserId.trim() || addingCollaborator}>
            {addingCollaborator ? t.adding : t.add}
          </button>
        </div>
        {addCollaboratorError && <div className={styles.formError}>{addCollaboratorError}</div>}
      </div>
      {report.history && report.history.length>0 && (
        <div className={styles.section}>
          <h4>{t.history}</h4>
          <ul className={styles.list}>
            {report.history.slice().reverse().map((h,i)=>(
              <li key={i}>
                {/* A move in words, and whose it was: an approval says who gave it (plan item 1.7). */}
                {h.fromStatus && h.toStatus
                  ? h.user
                    ? fillNodes(t.moveBy, { from: statusName('report', h.fromStatus, shared), to: statusName('report', h.toStatus, shared), who: <KeyName pubkey={h.user} /> })
                    : fill(t.move, { from: statusName('report', h.fromStatus, shared), to: statusName('report', h.toStatus, shared) })
                  : h.action}
                {' '}<span className={styles.small}>{fillNodes(t.at, { when: <UtcTime at={h.timestamp} year /> })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* A report read from a relay can be reviewed: a comment or a verdict on the version read (plan item 5.1). */}
      {reviewTarget && (
        <div className={styles.section} data-testid="report-reviews">
          <ReviewsPanel target={reviewTarget} itemTitle={report.title} onDark />
        </div>
      )}
    </div>
  );
};

export default ReportDetailPanel;

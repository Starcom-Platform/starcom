/**
 * A case's own page (plan item 1.2, stories S11 and S12).
 *
 * A case used to open only as a "Connections" dialog over the list, so it had
 * no address of its own: it could not be linked to directly, reloaded or
 * reached with Back. The dialog's body is this page now, at /app/cases/<id>.
 * Everything a case holds is here: what it rests on, what it concludes, what
 * it still needs, what argues against it, and what was built from it.
 */
import React, { useEffect, useId, useMemo, useState } from 'react';
import { Alert, Autocomplete, Box, Button, Chip, IconButton, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { ArrowLeft, Edit, Trash2, X } from 'lucide-react';
import { recordPath } from '../../routes/recordLink';
import KeyName from '../../components/Identity/KeyName';
import { caseRestsOnSample, SAMPLE_REFUSAL } from '../../services/intel/sampleRecords';
import { FIELD_METHODS, type SubjectKind } from '../../types/intel/SourceObservation';
import { counted, fill, useMessages } from '../../i18n/app/i18n';
import { fillNodes } from '../../i18n/app/fillNodes';
import { utcDateTimeIn } from '../../i18n/app/dates';
import {
  collectionQueue, requirementPlace, REQUIREMENT_PLACE_CHARS,
} from '../../services/intel/collection/collectionRequirement';
import { useApplicationRouter } from '../../hooks/useApplicationRouter';
import { useCaseMissions } from '../../core/intel/hooks/useCaseMissions';
import type { useCaseManager } from '../../core/intel/hooks/useCaseManager';
import { isEncryptedAtRest, intelWorkspaceManager } from '../../services/intel/IntelWorkspaceManager';
import { intelReportService } from '../../services/intel/IntelReportService';
import { encryptedAtRest } from '../../services/epistemic/epistemicLanguage';
import type { CaseItem } from '../../core/intel/adapters/caseManagerAdapter';
import BundleExportButton from '../../components/Intel/Bundles/BundleExportButton';
import EvidenceViewer from '../../components/Extension/EvidenceViewer';
import { EVIDENCE_TAG } from '../../extension/evidenceItems';
import { evidenceFingerprintsFor } from '../../extension/evidenceFingerprints';
import { citesTheArchive } from '../../services/intel/recon/wayback';
import SendBundleButton from '../../components/Intel/Bundles/SendBundleButton';
import ReceivedFromLine from '../../components/Intel/Bundles/ReceivedFromLine';
import type { CaseVerdict } from '../../types/intel/IntelCaseUI';
import { reviewCaseAdjudication } from '../../services/publishing/findings';
import { describeDestination, whereItGoes } from '../../services/nostr/publishTargets';
import WhatIs from '../../components/Help/WhatIs';
import StatusSteps from '../../components/Steps/StatusSteps';
import ReviewsPanel from '../../components/Reviews/ReviewsPanel';
import { casePositionReviewTarget } from '../../services/reviews/reviewTargets';
import { publishedFindingsLedger } from '../../services/intel/findings/PublishedFindingsLedger';
import { useWaitingFindings, positionOfCase, withOutbox } from '../../services/intel/outbox/waitingFindings';
import { statusName } from '../../services/intel/steps/statusSteps';
import type { CaseRecord } from '../../core/intel/types/intelDataModels';
import type { InformationVisibility } from '../../types/intel/IntelItemUI';
import DistributionChip from '../../components/Shared/DistributionChip';
import StatusChip from '../../components/Shared/StatusChip';
import ProvenanceFrame from '../../components/Shared/ProvenanceFrame';
import { reportProvenance, recordProvenance, type Provenance } from '../../services/intel/provenance/provenance';
import { isOwnKey } from '../../services/identity/names';

/**
 * The last instant of a calendar date in the reader's own timezone, as ISO.
 *
 * Built from parts rather than parsed from a string: `new Date('2026-09-10')`
 * is UTC midnight while `new Date(2026, 8, 10)` is local midnight, and the
 * difference is exactly the bug this replaces.
 */
function endOfLocalDay(yyyyMmDd: string): string | undefined {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

/** A report or intel item that can be attached to a case, addressed by ID. */
interface LinkCandidate {
  id: string;
  title: string;
  kind: 'Report' | 'Intel';
  /**
   * Lifecycle stage, carried so a requirement's state can be DERIVED rather
   * than stored. A draft linked as an answer does not answer anything, and
   * without the stage here the only alternative is asking the person who
   * linked it whether it counts.
   */
  stage?: string;
  /** Whose it is, for the frame drawn around it (BD19). */
  provenance: Provenance;
  /** Evidence captured through Uplink, with files kept in this browser to view (D-EX, W8). */
  evidence?: boolean;
}

/** The statuses a case is recorded as having been at: NEW, where every case starts, and each move in its log. */
function statusesPassed(c: Pick<CaseItem, 'status' | 'activityLog'>): string[] {
  const seen = new Set<string>(['NEW', String(c.status)]);
  for (const entry of c.activityLog ?? []) {
    if (String(entry.action) !== 'STATUS_CHANGED') continue;
    for (const status of [entry.details?.from, entry.details?.to]) if (typeof status === 'string') seen.add(status);
  }
  return [...seen];
}

export interface CaseDetailProps {
  caseId: string;
  /** The dashboard's case manager, passed whole so there is one copy of the cases. */
  manager: ReturnType<typeof useCaseManager>;
  onBack: () => void;
  onEdit: (caseItem: CaseItem) => void;
}

/** A record a case cites, framed by whose it is (BD19), with the way to take it off. */
const EvidenceItem: React.FC<{ candidate: LinkCandidate; onRemove: () => void; removeLabel: string; onView?: () => void }> = ({ candidate, onRemove, removeLabel, onView }) => {
  const { m: { caseDetail: t } } = useMessages();
  return (
    <ProvenanceFrame provenance={candidate.provenance}>
      <Typography component="span" variant="body2" sx={{ overflowWrap: 'anywhere' }}>{fill(t.kindTitle, { kind: t.kinds[candidate.kind], title: candidate.title })}</Typography>
      {candidate.evidence && onView && <Button size="small" onClick={onView} sx={{ minWidth: 0, py: 0 }}>{t.view}</Button>}
      <IconButton size="small" aria-label={removeLabel} title={removeLabel} onClick={onRemove} sx={{ p: 0.25 }}>
        <X size={14} />
      </IconButton>
    </ProvenanceFrame>
  );
};

const CaseDetail: React.FC<CaseDetailProps> = ({ caseId, manager, onBack, onEdit }) => {
  const partsId = useId();
  const {
    cases,
    loading,
    linkEntitiesToCase,
    unlinkEntitiesFromCase,
    linkContradictionsToCase,
    unlinkContradictionsFromCase,
    statePosition,
    raiseRequirement,
    answerRequirement,
    claimRequirement,
    closeRequirement,
    addSources,
    removeSource,
    deleteCase,
    updateCase,
    error: managerError,
  } = manager;
  const { navigateToApp } = useApplicationRouter();
  const { lang, m: { caseDetail: t, cases: tc, shared, reasons } } = useMessages();
  /** A link to an article being added to the case's sources (D-DP, DP7). */
  const [pendingArticle, setPendingArticle] = useState('');
  const [candidates, setCandidates] = useState<LinkCandidate[] | null>(null);
  /** Evidence captured through Uplink, open to look at (D-EX, W8). */
  const [viewingEvidence, setViewingEvidence] = useState<{ id: string; title: string } | null>(null);
  const [candidatesFailed, setCandidatesFailed] = useState(false);
  const [pendingLink, setPendingLink] = useState<LinkCandidate | null>(null);

  /**
   * What can be attached, and what the case's links resolve to, loaded
   * whenever the case changes. A case opened from a link loads its reports
   * exactly as one opened by a click does.
   */
  useEffect(() => {
    let live = true;
    setCandidates(null);
    setCandidatesFailed(false);
    setPendingLink(null);
    void (async () => {
      try {
        // ensureInitialized FIRST: getIntelItems is a bare synchronous getter
        // whose getState() throws 'Workspace not initialized' before it.
        await intelWorkspaceManager.ensureInitialized();
        const [reports, items] = [await intelReportService.listReports(), intelWorkspaceManager.getIntelItems()];
        if (!live) return;
        setCandidates([
          ...reports.map((r): LinkCandidate => ({ id: r.id, title: r.title, kind: 'Report', stage: r.status, provenance: reportProvenance(r, isOwnKey) })),
          ...items.map((i): LinkCandidate => ({ id: i.id, title: i.title, kind: 'Intel', provenance: recordProvenance(i, isOwnKey), ...(i.tags.includes(EVIDENCE_TAG) ? { evidence: true } : {}) })),
        ]);
      } catch {
        if (live) setCandidatesFailed(true);
      }
    })();
    return () => { live = false; };
  }, [caseId]);

  // Derived from the canonical store on every render, never copied into local
  // state — so an attach/detach is reflected by the same data the table reads.
  const linkedCase = cases.find((c) => c.id === caseId) ?? null;
  // Where its position would go, or why nowhere (plan item 0.4): shown before
  // the click, not as an error after it.
  // Sample material goes nowhere, whatever the distribution says (plan item 0.9).
  const restsOnSample = linkedCase ? caseRestsOnSample(linkedCase) : false;
  const whereTo = linkedCase ? whereItGoes('FINDING', linkedCase.visibility, 'case', reasons, linkedCase.limitedTo) : null;
  const positionDestination = whereTo && restsOnSample ? { ...whereTo, refusal: SAMPLE_REFUSAL } : whereTo;
  // A Case's OUTPUT, derived from the forward link on MissionUI rather than
  // stored here — see useCaseMissions and mission-downstream-of-case.md.
  const { missions: caseMissions, loading: missionsLoading } = useCaseMissions(caseId);
  const linkedIds = linkedCase?.relatedEntities ?? [];

  /**
   * Derived on every render from the candidates' CURRENT lifecycle stages, so a
   * report that is later withdrawn stops answering its requirement without
   * anybody remembering to revisit it.
   */
  const requirementQueue = useMemo(() => {
    const stageOf = (id: string) => candidates?.find((c) => c.id === id)?.stage;
    return collectionQueue(linkedCase?.requirements ?? [], stageOf);
  }, [linkedCase?.requirements, candidates]);
  const contradictingIds = linkedCase?.contradictedBy ?? [];
  const [positionDraft, setPositionDraft] = useState('');
  const [moving, setMoving] = useState(false);
  // A move that failed is said here: its error went to a banner only the list shows.
  const [moveFailed, setMoveFailed] = useState(false);
  const [verdictDraft, setVerdictDraft] = useState<CaseVerdict | ''>('');
  /**
   * How each contradiction was answered, keyed by its id.
   *
   * statePosition has taken an `addressed` map since it was written, and this
   * screen never passed it — so CasePosition.addressed was always {} and every
   * PUBLISHED adjudication asserted that no contradictions were addressed. That
   * is a false factual claim about the analysis, sent to every peer that
   * ingests the claim, and it was unfalsifiable from here because there was no
   * way to say otherwise.
   *
   * Free text rather than a checkbox on purpose: "addressed" without saying HOW
   * is the same assertion-without-method the evidence rules refuse everywhere
   * else. The adapter agrees — it drops any entry whose reason is blank,
   * "otherwise the count published later would overstate the work done".
   */
  const [addressedDraft, setAddressedDraft] = useState<Record<string, string>>({});
  const [publishSubject, setPublishSubject] = useState('');
  const [publishSubjectKind, setPublishSubjectKind] = useState<SubjectKind>('organization');
  const [publishState, setPublishState] = useState<'idle' | 'publishing' | 'success' | 'queued' | 'error' | 'refused'>('idle');
  // What the outbox holds for this case's position, so "Queued" survives a reload (plan item 9.4).
  const waitingFor = useWaitingFindings();
  const positionState = withOutbox(publishState, linkedCase ? waitingFor(positionOfCase(linkedCase.caseNumber)) : undefined);
  // Read again whenever the ledger changes, a publish from here or a withdrawal elsewhere.
  const [ledgerVersion, setLedgerVersion] = useState(0);
  useEffect(() => publishedFindingsLedger.subscribe(() => setLedgerVersion((v) => v + 1)), []);
  const positionReviewTarget = useMemo(
    () => casePositionReviewTarget(linkedCase?.caseNumber),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linkedCase?.caseNumber, ledgerVersion],
  );
  const [publishRefusal, setPublishRefusal] = useState('');
  const [requirementQuestion, setRequirementQuestion] = useState('');
  const [requirementBecause, setRequirementBecause] = useState('');
  const [requirementStaleAfter, setRequirementStaleAfter] = useState('');
  /*
   * What field work would answer it, and where. Both optional: most
   * requirements are desk questions, and saying so by leaving these empty is
   * the honest default rather than a gap.
   */
  const [requirementModality, setRequirementModality] = useState<string[]>([]);
  const [requirementGeohash, setRequirementGeohash] = useState('');

  const attachedCandidates = linkedIds
    .map((id) => candidates?.find((c) => c.id === id))
    .filter((c): c is LinkCandidate => Boolean(c));

  const contradictingCandidates = contradictingIds
    .map((id) => candidates?.find((c) => c.id === id))
    .filter((c): c is LinkCandidate => Boolean(c));

  /**
   * Three states, not one count. Deriving "unresolvable" by filtering an async
   * pool means that on first render EVERY linked id looks unresolvable, and a
   * failed load looks identical to genuinely-missing records. Both would
   * announce "N linked records could not be found" while meaning something
   * else entirely.
   */
  const unresolvedState: 'loading' | 'failed' | 'ready' =
    candidatesFailed ? 'failed' : candidates === null ? 'loading' : 'ready';
  const unresolvedCount = unresolvedState === 'ready' ? linkedIds.length - attachedCandidates.length : 0;

  /**
   * Record counter-evidence, kept out of relatedEntities on purpose.
   *
   * Folding it into the supporting list would make "rests on five records"
   * indistinguishable from "rests on three records and two that dispute
   * them" — the distinction an adjudicator most needs, and the reason a case
   * that can only accumulate agreement is a filing cabinet rather than an
   * analytic object.
   */
  const attachContradiction = async () => {
    if (!caseId || !pendingLink) return;
    await linkContradictionsToCase(caseId, [pendingLink.id]);
    setPendingLink(null);
  };

  const attach = async () => {
    if (!caseId || !pendingLink) return;
    // The ID, never the title — relatedEntities holds record ids, and writing a
    // display name there is a bug this codebase has shipped once already on
    // this exact field (see contradictionProducer's doc comment).
    await linkEntitiesToCase(caseId, [pendingLink.id]);
    setPendingLink(null);
  };

  const detach = async (id: string) => {
    if (!caseId) return;
    await unlinkEntitiesFromCase(caseId, [id]);
  };

  const detachContradiction = async (id: string) => {
    if (!caseId) return;
    await unlinkContradictionsFromCase(caseId, [id]);
  };

  // No question first: the deletion is held ten seconds, and the Undo bar is
  // the way back (plan item 0.6). Back to the list once it is gone, without
  // showing "no case has this address" for the case just deleted.
  const [deleting, setDeleting] = useState(false);
  const deleteThisCase = async () => {
    setDeleting(true);
    if (await deleteCase(caseId)) onBack();
    else setDeleting(false);
  };

  // Asked for by Send and Export when nobody has decided (plan item 9.13), and
  // kept through the same update the edit form uses, so the page shows it.
  const chooseDistribution = async (visibility: InformationVisibility) => {
    if (!(await updateCase(caseId, { visibility }))) throw new Error('the case could not be saved');
  };

  if (!linkedCase && deleting) return null;

  if (!linkedCase) {
    return (
      <Paper elevation={3} sx={{ p: 3 }} data-testid="case-detail-missing">
        <Button startIcon={<ArrowLeft size={16} />} onClick={onBack} sx={{ mb: 2 }}>{t.allCases}</Button>
        {loading ? (
          <Typography variant="body2" color="text.secondary">{t.loading}</Typography>
        ) : (
          <Alert severity="warning">{t.missing}</Alert>
        )}
      </Paper>
    );
  }

  return (
    <Paper elevation={3} component="section" sx={{ p: 3, overflow: 'auto' }} data-testid="case-detail">
      <Button startIcon={<ArrowLeft size={16} />} onClick={onBack} sx={{ mb: 2 }}>{t.allCases}</Button>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        {/* h2: the shell titles the screen "Cases" with the page's one h1. */}
        <Typography variant="h5" component="h2">{linkedCase.title}</Typography>
        <Chip size="small" label={linkedCase.caseNumber || linkedCase.id} />
        <StatusChip kind="case" status={linkedCase.status} />
        <DistributionChip visibility={linkedCase.visibility} what="case" />
        {linkedCase.sample && <Chip size="small" label={tc.sample} title={tc.sampleMeans} />}
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<Edit size={16} />} onClick={() => onEdit(linkedCase)}>{t.edit}</Button>
        {/* Handed to a teammate as a signed file (plan item 2.4), when its distribution lets it go (plan item 9.13). */}
        <BundleExportButton
          subject={{ type: 'case', id: linkedCase.id }}
          number={linkedCase.caseNumber}
          distribution={linkedCase.visibility}
          onChooseDistribution={chooseDistribution}
        />
        <SendBundleButton
          subject={{ type: 'case', id: linkedCase.id }}
          people={(linkedCase.collaborators ?? []).map((c) => c.userId)}
          distribution={linkedCase.visibility}
          onChooseDistribution={chooseDistribution}
        />
        <Button
          size="small"
          color="error"
          startIcon={<Trash2 size={16} />}
          disabled={deleting}
          onClick={() => void deleteThisCase()}
          title={linkedCase.visibility === 'public' || linkedCase.visibility === 'limited'
            ? t.deleteOnlyHere
            : undefined}
        >
          {t.deleteCase}
        </Button>
      </Box>
      {/* Whose the case is, where it came from someone else (BD19). */}
      {linkedCase.receivedFrom && (
        <ProvenanceFrame provenance={recordProvenance(linkedCase, isOwnKey)} block>
          <ReceivedFromLine receivedFrom={linkedCase.receivedFrom} />
        </ProvenanceFrame>
      )}
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ whiteSpace: 'pre-wrap', fontStyle: isEncryptedAtRest(linkedCase.description) ? 'italic' : undefined }}
      >
        {isEncryptedAtRest(linkedCase.description) ? encryptedAtRest() : linkedCase.description}
      </Typography>
      {/* Where the case stands and the moves open from there (plan item 1.7).
          Through updateCase, which checks the table and logs the move. */}
      <Box sx={{ mt: 2 }}>
        <StatusSteps
          kind="case"
          status={linkedCase.status}
          busy={moving}
          onMove={(to) => {
            setMoving(true);
            setMoveFailed(false);
            void updateCase(linkedCase.id, { status: to as CaseRecord['status'] })
              .then((ok) => { if (!ok) setMoveFailed(true); })
              .finally(() => setMoving(false));
          }}
          // Only Closed can be reached by skipping steps; the case's log says which it passed.
          passed={linkedCase.status === 'CLOSED' ? statusesPassed(linkedCase) : undefined}
          blocked={{ RESOLVED: linkedCase.position?.statement?.trim() ? null : t.resolveBlocked }}
          testId="case-steps"
        />
        {moveFailed && (
          <Alert severity="warning" sx={{ mt: 1 }} data-testid="case-move-failed" onClose={() => setMoveFailed(false)}>
            {managerError ? fill(t.moveFailedBecause, { reason: managerError }) : t.moveFailed} {t.moveElsewhere}
          </Alert>
        )}
      </Box>
      {/* Two parts, as the interface spec splits a record (BD20): what the
          sources said, and what I assert from them. Side by side where there
          is room, the sources first where there is not. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 3, mt: 2, alignItems: 'start' }}>
        <Box component="section" aria-labelledby={`${partsId}-said`} sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }} data-testid="case-sources-said">
          <Typography id={`${partsId}-said`} variant="overline" component="h3" sx={{ color: 'var(--sc-text-heading)', lineHeight: 1.6 }}>{t.sourcesSaid}</Typography>
            <Typography variant="subtitle2">{t.linkedEvidence}</Typography>
            {unresolvedState === 'loading' && (
              <Typography variant="body2" color="text.secondary">{t.loadingCandidates}</Typography>
            )}
            {unresolvedState === 'failed' && (
              <Alert severity="warning" data-testid="candidates-failed">{t.candidatesFailed}</Alert>
            )}

            {linkedIds.length === 0 && unresolvedState === 'ready' && (
              <Typography variant="body2" color="text.secondary" data-testid="no-linked-evidence">{t.nothingLinked}</Typography>
            )}

            {attachedCandidates.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }} data-testid="linked-evidence-list">
                {attachedCandidates.map((c) => (
                  <EvidenceItem key={c.id} candidate={c} onRemove={() => detach(c.id)} removeLabel={fill(t.unlink, { title: c.title })} onView={() => setViewingEvidence({ id: c.id, title: c.title })} />
                ))}
              </Box>
            )}

            {/* What argues AGAINST the case, shown apart from what supports it.
                A reader who cannot see the two lists separately cannot tell a
                well-evidenced position from a contested one. */}
            <Typography variant="subtitle2" sx={{ mt: 2 }}>{t.contradicting}</Typography>
            {contradictingCandidates.length === 0 ? (
              <Typography variant="body2" color="text.secondary" data-testid="no-contradictions">{t.noContradictions}</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }} data-testid="contradiction-list">
                {contradictingCandidates.map((c) => (
                  <EvidenceItem key={c.id} candidate={c} onRemove={() => detachContradiction(c.id)} removeLabel={fill(t.removeContradiction, { title: c.title })} onView={() => setViewingEvidence({ id: c.id, title: c.title })} />
                ))}
              </Box>
            )}

            {viewingEvidence && (
              <Box sx={{ mt: 1.5 }}>
                <EvidenceViewer key={viewingEvidence.id} itemId={viewingEvidence.id} title={viewingEvidence.title} onClose={() => setViewingEvidence(null)} />
              </Box>
            )}

            {/* Only ever shown once the pool has actually loaded. While loading,
                every linked id resolves to nothing; on failure, so does every
                one. Announcing a count in either state would say "these records
                are missing" when the truth is "we have not looked yet". */}
            {unresolvedCount > 0 && (
              <Alert severity="info" data-testid="unresolved-links">{counted(t.unresolved, unresolvedCount)}</Alert>
            )}

            {unresolvedState === 'ready' && (
              <Autocomplete
                // Neither list: a record supports the case or argues against it, not both (plan item 1.3).
                options={(candidates ?? []).filter((c) => !linkedIds.includes(c.id) && !contradictingIds.includes(c.id))}
                getOptionLabel={(o) => fill(t.kindTitle, { kind: t.kinds[o.kind], title: o.title })}
                value={pendingLink}
                onChange={(_e, v) => setPendingLink(v)}
                renderInput={(params) => (
                  <TextField {...params} label={t.attachLabel} data-testid="link-candidate-input" />
                )}
              />
            )}
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button onClick={attachContradiction} disabled={!pendingLink} data-testid="attach-contradiction-action">
                {t.attachContradicting}
              </Button>
              <Button onClick={attach} variant="contained" disabled={!pendingLink} data-testid="attach-action">
                {t.attachEvidence}
              </Button>
            </Stack>

            {/* The articles the case rests on (D-DP, DP7): each its outlet, linked, and when it was
                reported where known. A case could hold records and nowhere the reports behind them. */}
            <Typography variant="subtitle2" sx={{ mt: 2 }}>{t.articles}</Typography>
            {(linkedCase.sources ?? []).length === 0 ? (
              <Typography variant="body2" color="text.secondary" data-testid="no-articles">{t.noArticles}</Typography>
            ) : (
              <Box component="ul" sx={{ m: 0, pl: 2 }} data-testid="article-list">
                {(linkedCase.sources ?? []).map((source) => {
                  const reported = source.reportedAt ? Date.parse(source.reportedAt) : NaN;
                  return (
                    <Box component="li" key={source.url} data-testid="case-article" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <a href={source.url} target="_blank" rel="noopener noreferrer">{source.outlet ?? source.url}</a>
                      {source.title && <Typography component="span" variant="body2">{source.title}</Typography>}
                      {Number.isFinite(reported) && (
                        <Typography component="span" variant="body2" color="text.secondary">
                          {fill(t.articleReported, { when: utcDateTimeIn(lang, reported, true) })}
                        </Typography>
                      )}
                      <Button size="small" onClick={() => { void removeSource(linkedCase.id, source.url); }}>
                        {fill(t.removeArticle, { outlet: source.outlet ?? source.url })}
                      </Button>
                    </Box>
                  );
                })}
              </Box>
            )}
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" component="form"
              onSubmit={(e) => {
                e.preventDefault();
                const url = pendingArticle.trim();
                if (!url) return;
                void addSources(linkedCase.id, [{ url }]).then((added) => { if (added) setPendingArticle(''); });
              }}>
              <TextField size="small" label={t.articleUrl} value={pendingArticle} onChange={(e) => setPendingArticle(e.target.value)} sx={{ flex: 1, minWidth: 200 }} />
              <Button type="submit" disabled={!pendingArticle.trim()}>{t.addArticle}</Button>
            </Stack>
        </Box>
        <Box component="section" aria-labelledby={`${partsId}-assert`} sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }} data-testid="case-i-assert">
          <Typography id={`${partsId}-assert`} variant="overline" component="h3" sx={{ color: 'var(--sc-text-heading)', lineHeight: 1.6 }}>{t.iAssert}</Typography>
            {/* What the case CONCLUDES — the thing the aggregation tier had
                nowhere to put. Shown above the evidence rather than below it,
                because the position is what a reader came for; the members and
                contradictions are the method that earns it. */}
            <Typography variant="subtitle2" sx={{ mt: 2 }}>{t.position} <WhatIs term="case-position" /></Typography>
            {linkedCase?.position ? (
              <Box data-testid="case-position" sx={{ mb: 1 }}>
                <Typography variant="body2">{linkedCase.position.statement}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {t.verdicts[linkedCase.position.verdict as keyof typeof t.verdicts] ?? linkedCase.position.verdict}
                  {' · '}
                  <KeyName pubkey={linkedCase.position.adjudicatedBy} />
                  {' · '}{linkedCase.position.adjudicatedAt.slice(0, 10)}
                  {' · '}{fill(t.restsOn, { n: linkedIds.length })}
                  {contradictingIds.length > 0 && `, ${fill(t.disputedBy, { n: contradictingIds.length })}`}
                  {/* How much of the disagreement was actually answered. Shown
                      beside the dispute count, because "disputed by 3" alone
                      reads the same whether all three were dealt with or none. */}
                  {contradictingIds.length > 0
                    && `, ${fill(t.addressed, { n: Object.keys(linkedCase.position.addressed ?? {}).length })}`}
                </Typography>

                {/* Publishing a case adjudication sends the VERDICT and the
                    counts, never the statement above. The gate keys on subject
                    kind and cannot read one off a case, and a case may concern
                    several subjects — so both are named here rather than
                    guessed. */}
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                  <TextField
                    size="small"
                    value={publishSubject}
                    onChange={(e) => setPublishSubject(e.target.value)}
                    placeholder={t.subjectPlaceholder}
                    inputProps={{ 'data-testid': 'publish-subject' }}
                  />
                  <TextField
                    select
                    size="small"
                    value={publishSubjectKind}
                    onChange={(e) => setPublishSubjectKind(e.target.value as SubjectKind)}
                    sx={{ minWidth: 140 }}
                    SelectProps={{ native: true, inputProps: { 'data-testid': 'publish-subject-kind' } }}
                  >
                    <option value="organization">{t.subjectKinds.organization}</option>
                    <option value="person">{t.subjectKinds.person}</option>
                    <option value="place">{t.subjectKinds.place}</option>
                    <option value="object">{t.subjectKinds.object}</option>
                    <option value="event">{t.subjectKinds.event}</option>
                    {/* Allowed without consent, deliberately: blocking it would
                        push an unsure adjudicator to pick a specific kind. */}
                    <option value="unknown">{t.subjectKinds.unknown}</option>
                  </TextField>
                  <Button
                    data-testid="publish-position"
                    disabled={!publishSubject.trim() || publishState === 'publishing' || Boolean(positionDestination?.refusal)}
                    onClick={async () => {
                      if (!linkedCase) return;
                      setPublishState('publishing');
                      /**
                       * Guarded, because this can now THROW.
                       *
                       * The signing path rejects when the host signer times
                       * out or its canonical form diverges, and the
                       * attestation builder refuses an undateable case. An
                       * escaping rejection left setPublishState on
                       * 'publishing' forever: the button stayed disabled
                       * reading "Publishing…", showed no error, and the only
                       * trace was an unhandled rejection in the console. A
                       * control that cannot fail visibly cannot be retried.
                       */
                      try {
                        // Through the publish review (plan item 0.1).
                        const result = await reviewCaseAdjudication(linkedCase, {
                          subjectRef: publishSubject.trim(),
                          subjectKind: publishSubjectKind,
                          /**
                           * Computed, not asserted (plan item 0.9): the demo
                           * seed writes cases into the workspace, and this was
                           * `false` for every one of them. The gate refuses
                           * silence, so it is always stated.
                           */
                          evidenceIsSynthetic: caseRestsOnSample(linkedCase),
                          // Its evidence's hashes, for a reader holding the same files (D-EX, EX23).
                          evidenceFingerprints: await evidenceFingerprintsFor(linkedCase),
                          // The Archive named when a snapshot backs it, as its terms ask (D-EX, EX34).
                          archiveCited: citesTheArchive(linkedCase, intelWorkspaceManager.getIntelItems()),
                        });
                        if (!result) {
                          setPublishState('idle');
                          return;
                        }
                        setPublishState(
                          result.refused ? 'refused'
                            : result.broadcast.success ? 'success'
                              : result.queued ? 'queued' : 'error');
                        if (result.refused) setPublishRefusal(result.refused.reason);
                      } catch (error) {
                        setPublishState('refused');
                        setPublishRefusal(error instanceof Error ? error.message : t.publishFailed);
                      }
                    }}
                  >
                    {positionState === 'publishing' ? t.publishing
                      : positionState === 'success' ? t.published
                        : positionState === 'queued' ? t.queued
                          : positionState === 'refused' ? t.refused
                            : positionState === 'error' ? t.retry : t.publish}
                  </Button>
                </Stack>
                {positionDestination && (
                  <Typography
                    variant="caption"
                    data-testid="position-destination"
                    // Goes nowhere is caution, restricted; a publish that was refused failed, in red (the colour rule).
                    sx={{ display: 'block', mt: 0.5, color: positionDestination.refusal ? 'var(--sc-caution)' : 'text.secondary' }}
                  >
                    {positionDestination.refusal ?? describeDestination(positionDestination.relays, reasons)}
                  </Typography>
                )}
                {publishState === 'refused' && publishRefusal && (
                  <Typography variant="caption" sx={{ color: 'var(--sc-danger)', display: 'block', mt: 0.5 }}>
                    {publishRefusal}
                  </Typography>
                )}
                {/* Once published, the position is a claim others can review (plan item 5.1). */}
                {positionReviewTarget && (
                  <Box sx={{ mt: 1.5 }}>
                    <ReviewsPanel target={positionReviewTarget} itemTitle={fill(t.positionOn, { title: linkedCase.title })} testId="case-position-reviews" />
                  </Box>
                )}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary" data-testid="no-position">{t.noPosition}</Typography>
            )}
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
              <TextField
                size="small"
                fullWidth
                multiline
                value={positionDraft}
                onChange={(e) => setPositionDraft(e.target.value)}
                placeholder={linkedCase?.position ? t.restate : t.conclude}
                inputProps={{ 'data-testid': 'position-input' }}
              />
              {/* No default. Each of the three is a real outcome, and picking
                  one silently on the adjudicator's behalf would be wrong some
                  of the time with nobody aware a choice had been made. */}
              <TextField
                select
                size="small"
                value={verdictDraft}
                onChange={(e) => setVerdictDraft(e.target.value as CaseVerdict)}
                sx={{ minWidth: 160 }}
                SelectProps={{ native: true, inputProps: { 'data-testid': 'verdict-select' } }}
              >
                <option value="">{t.verdictPick}</option>
                <option value="substantiated">{t.verdicts.substantiated}</option>
                <option value="unsubstantiated">{t.verdicts.unsubstantiated}</option>
                {/* Not a failure to conclude. A case that looked and could not
                    settle the question has produced information. */}
                <option value="inconclusive">{t.verdicts.inconclusive}</option>
              </TextField>
              {/* What this position does with each thing arguing against it.
                  Placed with the verdict rather than beside the contradiction
                  list, because it is part of STATING a position: a verdict that
                  ignores the contradictions on file is the thing a reader most
                  needs to be able to see. */}
              {contradictingCandidates.length > 0 && (
                <Box sx={{ mt: 1 }} data-testid="addressed-contradictions">
                  <Typography variant="caption" color="text.secondary">{t.answerEach}</Typography>
                  {contradictingCandidates.map((c) => (
                    <TextField
                      key={c.id}
                      fullWidth
                      size="small"
                      sx={{ mt: 1 }}
                      label={fill(t.kindTitle, { kind: t.kinds[c.kind], title: c.title })}
                      placeholder={t.answerPlaceholder}
                      value={addressedDraft[c.id] ?? ''}
                      onChange={(e) => setAddressedDraft((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      inputProps={{ 'data-testid': `addressed-${c.id}` }}
                    />
                  ))}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {fill(t.answeredOf, { n: Object.values(addressedDraft).filter((v) => v.trim()).length, total: contradictingCandidates.length })}
                  </Typography>
                </Box>
              )}
              <Button
                data-testid="state-position"
                disabled={!caseId || !positionDraft.trim() || !verdictDraft}
                onClick={async () => {
                  if (!caseId || !verdictDraft) return;
                  await statePosition(caseId, positionDraft, verdictDraft, addressedDraft);
                  setPositionDraft('');
                  setVerdictDraft('');
                  setAddressedDraft({});
                }}
              >
                {t.state}
              </Button>
            </Stack>

            {/* What the case still NEEDS, shown next to what it concluded.
                A position and its gaps belong on one screen: a reader who sees
                only the conclusion cannot tell a settled case from one that
                stopped asking. */}
            {/* The forward direction. Every step at this seam was pull-only —
                the destination reached back for the source — so an operator who
                had just reached a verdict had to leave, navigate, and re-find
                what they were already looking at. The screen used to say so in
                prose; now it does the thing instead. */}
            {/* The capability is only real if somebody can produce a link.
                A route nobody can address is the same wiring stub as a feature
                nobody can reach. */}
            <Button
              size="small"
              data-testid="copy-case-link"
              disabled={!caseId}
              onClick={() => {
                if (!caseId) return;
                void navigator.clipboard?.writeText(`${window.location.origin}${recordPath('case', caseId)}`);
              }}
              sx={{ mb: 1, mr: 1 }}
            >
              {t.copyLink}
            </Button>
            <Button
              size="small"
              data-testid="create-mission-from-case"
              disabled={!caseId}
              onClick={() => caseId && navigateToApp('teamworkspace', undefined, {
                initialTab: 'missions',
                missionFromCase: caseId,
              })}
              sx={{ mb: 1 }}
            >
              {t.buildMission}
            </Button>
            {/* Once closed, a story of what was done, written in Operations; a case has no address to link (D-RS, RS51). */}
            {linkedCase?.status === 'CLOSED' && (
              <Button
                size="small"
                data-testid="case-write-story"
                onClick={() => navigateToApp('teamworkspace', undefined, {
                  initialTab: 'operations',
                  storyTitle: fill(t.storyTitle, { title: linkedCase.title }),
                })}
                sx={{ mb: 1, ml: 1 }}
              >
                {t.writeStory}
              </Button>
            )}

            <Typography variant="subtitle2" sx={{ mt: 2 }}>{t.stillNeeded}</Typography>
            {requirementQueue.length === 0 ? (
              <Typography variant="body2" color="text.secondary" data-testid="no-requirements">
                {(linkedCase?.requirements ?? []).length > 0
                  ? t.allAnswered
                  : t.nothingNeeded}
              </Typography>
            ) : (
              <Stack spacing={0.5} sx={{ mb: 1 }} data-testid="requirement-queue">
                {requirementQueue.map(({ requirement, status }) => (
                  <Box key={requirement.id} sx={{ p: 1, borderRadius: 1, border: '1px solid var(--sc-divider)' }}>
                    <Typography variant="body2">{requirement.question}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {requirement.because}
                    </Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                      <Chip size="small" label={t.requirementStates[status.state]} data-testid={`requirement-state-${status.state}`} />
                      {/* Offered vs evidential, separately. "3 linked" reads as
                          answered when all three are drafts. */}
                      {status.offered > 0 && (
                        <Chip size="small" variant="outlined"
                          label={fill(t.evidentialOf, { n: status.evidential, total: status.offered })} />
                      )}
                      {status.hoursRemaining !== null && (
                        <Chip size="small" variant="outlined"
                          label={status.hoursRemaining < 0
                            ? t.pastUsefulness
                            : fill(t.hoursLeft, { n: Math.round(status.hoursRemaining) })} />
                      )}
                      {/* Offering an answer is linking a report, not asserting
                          the question is settled. Whether it counts is derived
                          from that report's stage, here and on every later
                          render. */}
                      <TextField
                        select size="small" value=""
                        onChange={async (e) => {
                          if (!caseId || !e.target.value) return;
                          await answerRequirement(caseId, requirement.id, e.target.value);
                        }}
                        sx={{ minWidth: 150 }}
                        SelectProps={{ native: true, inputProps: { 'data-testid': 'answer-requirement' } }}
                      >
                        <option value="">{t.offerAnswer}</option>
                        {linkedIds
                          .filter((id) => !requirement.answeredBy.includes(id))
                          .map((id) => {
                            const c = candidates?.find((x) => x.id === id);
                            return (
                              <option key={id} value={id}>
                                {c ? `${c.title}${c.stage ? ` (${statusName('report', c.stage, shared)})` : ''}` : id}
                              </option>
                            );
                          })}
                      </TextField>
                      {/* Intent, not a reservation — anyone can still answer a
                          claimed question, and the person who said they had
                          started is the one best placed to say they stopped. */}
                      <Button
                        size="small"
                        data-testid="claim-requirement"
                        onClick={async () => {
                          if (!caseId) return;
                          await claimRequirement(caseId, requirement.id, !requirement.claimedBy);
                        }}
                      >
                        {requirement.claimedBy
                          ? fillNodes(t.claimedBy, { who: <KeyName pubkey={requirement.claimedBy.by} /> })
                          : t.take}
                      </Button>
                      <Button
                        size="small"
                        data-testid="close-requirement"
                        onClick={async () => {
                          if (!caseId) return;
                          const reason = window.prompt(t.withdrawWhy);
                          // An empty reason is refused by the adapter rather
                          // than stored: a requirement dropped without one
                          // looks identical to one that was decided.
                          if (reason?.trim()) await closeRequirement(caseId, requirement.id, reason);
                        }}
                      >
                        {t.withdraw}
                      </Button>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
              <TextField
                size="small" fullWidth value={requirementQuestion}
                onChange={(e) => setRequirementQuestion(e.target.value)}
                placeholder={t.needToKnow}
                inputProps={{ 'data-testid': 'requirement-question' }}
              />
              <TextField
                size="small" fullWidth value={requirementBecause}
                onChange={(e) => setRequirementBecause(e.target.value)}
                placeholder={t.decisionWaits}
                inputProps={{ 'data-testid': 'requirement-because' }}
              />
              {/* Optional, and NOT a wish-by date. It is when the answer stops
                  serving the decision named above — the queue orders by it, and
                  a requirement with none sorts last rather than first. Without
                  this control the field existed, the ordering logic read it,
                  and nothing in the app could ever set it. */}
              <TextField
                size="small"
                type="date"
                value={requirementStaleAfter}
                onChange={(e) => setRequirementStaleAfter(e.target.value)}
                label={t.usefulUntil}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 150 }}
                inputProps={{ 'data-testid': 'requirement-stale-after' }}
              />
              {/* Which field method would settle it. Empty means nobody needs to
                  travel — most requirements are answered from a register, and
                  dispatching a person for one of those puts somebody somewhere
                  for no reason and returns nothing. */}
              <TextField
                select
                size="small"
                label={t.answerableBy}
                value={requirementModality}
                onChange={(e) => setRequirementModality(
                  typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value as unknown as string[],
                )}
                SelectProps={{ multiple: true }}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 130 }}
                inputProps={{ 'data-testid': 'requirement-modality' }}
              >
                {FIELD_METHODS.map((m) => (
                  <MenuItem key={m} value={m}>{t.methods[m]}</MenuItem>
                ))}
              </TextField>
              {/* A cell, never a pin. A requirement that travels says where
                  somebody is about to go, and the precision here is the same
                  one Starcom accepts back — asking finer would invite an
                  observation we would then drop, after the trip was taken. */}
              <TextField
                size="small"
                label={t.where}
                value={requirementGeohash}
                onChange={(e) => setRequirementGeohash(e.target.value)}
                placeholder={fill(t.geohash, { n: REQUIREMENT_PLACE_CHARS })}
                error={requirementGeohash.trim().length > 0 && !requirementPlace(requirementGeohash)}
                InputLabelProps={{ shrink: true }}
                sx={{ minWidth: 120 }}
                inputProps={{ 'data-testid': 'requirement-geohash' }}
              />
              <Button
                data-testid="raise-requirement"
                // Question and justification are required. A requirement nobody
                // can justify is a wish, and the queue is only worth reading if
                // every line says what turns on the answer.
                disabled={!caseId || !requirementQuestion.trim() || !requirementBecause.trim()}
                onClick={async () => {
                  if (!caseId) return;
                  await raiseRequirement(
                    caseId,
                    requirementQuestion,
                    requirementBecause,
                    // End of the stated day, not its first instant: "useful
                    // until the 10th" means through the 10th, and midnight
                    // would expire it before the day it names.
                    //
                    // In the operator's OWN day, not in UTC. The picker gives a
                    // local calendar date, and appending "T23:59:59.999Z" made
                    // it end-of-day in UTC — so east of Greenwich the
                    // requirement went stale before the day it names was over,
                    // and west of it, hours after. The comment above was right
                    // and the construction did not honour it.
                    requirementStaleAfter
                      ? endOfLocalDay(requirementStaleAfter)
                      : undefined,
                    { modality: requirementModality, geohash: requirementGeohash },
                  );
                  setRequirementQuestion('');
                  setRequirementBecause('');
                  setRequirementStaleAfter('');
                  setRequirementModality([]);
                  setRequirementGeohash('');
                }}
              >
                {t.raise}
              </Button>
            </Stack>

            {/* Output, not input — and read-only here on purpose. A Mission
                owns its own links (MissionsPanel attaches cases to a mission),
                so offering to edit them from this end would create a second
                writer for one fact. This end only reports. */}
            <Typography variant="subtitle2" sx={{ mt: 1 }}>{t.missionsBuilt}</Typography>
            {missionsLoading ? (
              <Typography variant="body2" color="text.secondary">{t.loadingMissions}</Typography>
            ) : caseMissions.length === 0 ? (
              <Typography variant="body2" color="text.secondary" data-testid="no-case-missions">{t.noneYet}</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }} data-testid="case-missions-list">
                {caseMissions.map((m) => (
                  <Chip key={m.id} label={fill(t.missionChip, { number: m.missionNumber, title: m.title, status: statusName('mission', m.status, shared) })} variant="outlined" />
                ))}
              </Box>
            )}
        </Box>
      </Box>
    </Paper>
  );
};

export default CaseDetail;

/**
 * Mission assembly — the screen that didn't exist. MissionService,
 * MissionPackageBuilder, and MissionPackageBroadcastService were fully
 * built, tested, and could sign (ML-DSA-65) and broadcast (Nostr kind
 * 30079) a real Mission Package — nothing in the app ever called any of
 * it. This is that missing UI: create a mission, attach real Intel Reports
 * and Cases, move it through its real status machine, publish it, and
 * collaborate on it with a team (comments/activity log/collaborators —
 * all real fields on MissionUI that had no view rendering them before this).
 *
 * See docs/missions/04-plan/sprint-1-mission-packages.md (Phases 1 and 2).
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { recordPath } from '../../../routes/recordLink';
import { useShowOnGlobe } from '../../../hooks/useShowOnGlobe';
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Chip,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Alert,
  CircularProgress,
  Divider,
  IconButton,
  Autocomplete,
} from '@mui/material';
import { Target, Plus, Send, Trash2, RotateCcw, MessageSquare, Globe as GlobeIcon } from 'lucide-react';
import {
  missionService, restsOnEvidence, restsOnEvidenceReadingBriefing, missionDestinations, evidenceIn, absentLink,
  missionDistributionLock, missionProfileLock, goesNowhereWords, type PublishToNavcomResult,
} from '../../../services/intel/MissionService';
import { fieldWorkProblem } from '../../../services/intel/packageProfile';
import MissionProfileFields from './MissionProfileFields';
import PackageClaims from './PackageClaims';
import { useMissionLabels } from '../../../services/intel/useMissionLabels';
import { statusName } from '../../../services/intel/steps/statusSteps';
import { setRecordDistribution } from '../../../services/intel/attention/setRecordDistribution';
import {
  reviewMissionPackage, reviewMissionRetry, reviewMissionClosing, reviewDelegation, reviewRevocation,
} from '../../../services/publishing/missions';
import type { ReviewOutcome } from '../../../services/publishing/publishReview';
import { missionCapabilityStore } from '../../../services/intel/capability/missionCapabilityStore';
import { intelReportService } from '../../../services/intel/IntelReportService';
import { intelCaseService } from '../../../services/intel/IntelCaseService';
import { computePipelineMetrics, type PipelineMetrics } from '../../../services/intel/pipelineMetrics';
import { computeMissionCorroboration, type MissionCorroboration } from '../../../services/intel/missionCorroboration';
import { reportsBehindMission } from '../../../services/intel/missionEvidence';
import { useReceivedPackages } from '../../../services/intel/useReceivedPackages';
import { MissionToward } from './MissionToward';
import { MissionCountLines } from './MissionCountLines';
import { MissionReportsReceived } from './MissionReportsReceived';
import { usePackageReplies } from '../../../services/intel/usePackageReplies';
import PackageRepliesPanel from './PackageRepliesPanel';
import { ReceivedPackagesPanel } from './ReceivedPackagesPanel';
import TakenMissionsList from './TakenMissionsList';
import TeamMissions from './TeamMissions';
import { useTakenMissions } from '../../../services/intel/received/useTakenMissions';
import { MissionObjectives } from './MissionObjectives';
import { describeDestination, destinationIsPublic, destinationLine, relayReach } from '../../../services/nostr/publishTargets';
import DistributionChoice from '../../../components/Shared/DistributionChoice';
import DistributionChip from '../../../components/Shared/DistributionChip';
import StatusChip from '../../../components/Shared/StatusChip';
import KeyName from '../../../components/Identity/KeyName';
import { missionRestsOnSample } from '../../../services/intel/sampleRecords';
import { caseManagerAdapter, type CaseItem } from '../../../core/intel/adapters/caseManagerAdapter';
import {
  MissionUI,
  MissionObjective,
  MissionStatus,
  MissionActivityAction,
  CreateMissionInput,
  type PublishReceipt,
} from '../../../types/intel/MissionUI';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import type { IntelCaseUI } from '../../../types/intel/IntelCaseUI';
import type { Comment as MissionComment } from '../../../types/intel/Collaboration';
import {
  CONTENT_SENSITIVITIES,
  type InformationVisibility,
  type ContentSensitivity,
} from '../../../types/intel/IntelItemUI';
import { useNostrIdentity, nostrIdentityService } from '../../../services/identity/NostrIdentityService';
import type { TeamMember } from '../../../types/cyberInvestigation';
import UtcTime from '../../../components/Shared/UtcTime';
import BundleExportButton from '../../../components/Intel/Bundles/BundleExportButton';
import SendBundleButton from '../../../components/Intel/Bundles/SendBundleButton';
import ReceivedBundlesButton from '../../../components/Intel/Bundles/ReceivedBundlesButton';
import ImportBundleDialog from '../../../components/Intel/Bundles/ImportBundleDialog';
import ReceivedFromLine from '../../../components/Intel/Bundles/ReceivedFromLine';
import WhatIs from '../../../components/Help/WhatIs';
import StatusSteps from '../../../components/Steps/StatusSteps';
import ReviewsPanel from '../../../components/Reviews/ReviewsPanel';
import { missionReviewTarget } from '../../../services/reviews/reviewTargets';
import Translatable from '../../../components/Translation/Translatable';
import { counted, fill, useMessages } from '../../../i18n/app/i18n';
import { fillNodes } from '../../../i18n/app/fillNodes';
import type { Messages } from '../../../i18n/app/en';
import { languageOf } from '../../../i18n/app/languages';
import { keptPackageOf, useKeptNotes } from '../../../services/intel/outbox/keptNotes';
import KeptNoteLine from '../../../components/Publishing/KeptNoteLine';

type MissionWords = Messages['missions'];


/** From here on, what the package carries cannot change (plan item 0.7; enforced by MissionService.saveMission). */
const PACKAGE_LOCKED_STATUSES: readonly MissionStatus[] = [
  MissionStatus.READY_FOR_PACKAGE, MissionStatus.PACKAGED, MissionStatus.DISPATCHED, MissionStatus.CLOSED,
];

/** Published, and closed since or not: its package is on the relays as it went out. */
const PUBLISHED_STATUSES: readonly MissionStatus[] = [MissionStatus.DISPATCHED, MissionStatus.CLOSED];

/** Where a mission's distribution sends it, in the app's one wording, or why it goes nowhere. */
function destinationWords(destinations: { relays: string[]; refusal: string | null }, reasons: Messages['reasons']): string {
  return destinations.refusal ?? describeDestination(destinations.relays, reasons);
}

/** "Sent to 3 of 5 relays". The count tried is left out only when it was never recorded. */
function relaysPhrase(receipt: PublishReceipt | undefined, t: MissionWords): string {
  if (!receipt) return t.sent;
  return receipt.relaysTried > 0
    ? counted(t.sentOf, receipt.relaysTried, { accepted: receipt.relaysAccepted })
    : counted(t.sentTo, receipt.relaysAccepted);
}

function makeActivityEntry(action: MissionActivityAction, userId: string, details: Record<string, unknown> = {}) {
  return {
    id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    action,
    timestamp: new Date().toISOString(),
    userId,
    details,
  };
}

interface MissionsPanelProps {
  /** The current team's roster — used as the pool a collaborator can be added from. */
  teamMembers: TeamMember[];
  /**
   * A case to build a mission FROM, carried from the case that decided it.
   *
   * The seam this closes was stated in prose on the Cases screen: "Attach this
   * case to a mission from the Missions tab in CollabCenter" — the app
     * has since been renamed OpsCenter, and the sentence is gone. Every forward
   * step there was pull-only — the destination reached back for the source —
   * so an operator who had just reached a verdict had to leave, navigate, and
   * re-find what they were already looking at.
   */
  missionFromCase?: string;
  /** A mission to open on arrival, from /r/mission/:id. */
  selectMissionId?: string;
}

export const MissionsPanel: React.FC<MissionsPanelProps> = ({ teamMembers, missionFromCase, selectMissionId }) => {
  const { lang, m: { missions: t } } = useMessages();
  const [missions, setMissions] = useState<MissionUI[]>([]);
  // What the cards count against: the reports and cases held here (plan item 1.8).
  const [held, setHeld] = useState<{ reports: IntelReportUI[]; cases: IntelCaseUI[] }>({ reports: [], cases: [] });
  const [metrics, setMetrics] = useState<PipelineMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  /** Only the missions nobody has chosen a distribution for (plan item 9.13). */
  const [onlyUndecided, setOnlyUndecided] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  /**
   * Opens the create dialog once on arrival with a case in hand, so an operator
   * who just adjudicated lands on a form rather than on a list they must act on
   * again. A ref, not state: re-running would fight anyone who closed it.
   */
  /** Selects on arrival, once — same guard as the create-dialog effect below. */
  const arrivedAtMission = useRef(false);
  useEffect(() => {
    if (!selectMissionId || arrivedAtMission.current) return;
    arrivedAtMission.current = true;
    setSelectedMissionId(selectMissionId);
  }, [selectMissionId]);

  /**
   * Consumed once, and marked consumed.
   *
   * This ref was checked and never set, so the arrival case stayed attached to
   * EVERY mission created afterwards in the same visit — including one the
   * operator opened by hand from NEW MISSION, having cancelled the first
   * dialog. Verified in a browser: arrive from a case, cancel, create an
   * unrelated mission, and it comes out resting on that case.
   *
   * That is worse than it sounds. relatedCases is what assertRestsOnEvidence
   * checks, so a mission could pass the evidence gate on a case nobody chose
   * for it — the gate satisfied by an accident of navigation rather than by
   * work. A mission that rests on the wrong thing is harder to notice than one
   * that rests on nothing.
   */
  /**
   * The case this particular dialog was opened from — not "have we ever
   * arrived from one".
   *
   * The ref that guarded this was checked and never set, so the arrival case
   * stayed attached to EVERY mission created afterwards in the same visit,
   * including one opened by hand from NEW MISSION after cancelling the first
   * dialog. Verified in a browser before and after: arrive from a case, cancel,
   * create an unrelated mission, and it came out resting on that case.
   *
   * That is worse than it sounds. relatedCases is what assertRestsOnEvidence
   * reads, so a mission could pass the evidence gate on a case nobody chose for
   * it — satisfied by an accident of navigation rather than by work. A mission
   * resting on the wrong thing is harder to notice than one resting on nothing.
   *
   * Held in state rather than a ref because it must survive to the render that
   * passes it down, and be cleared when this dialog closes rather than when the
   * component next happens to update.
   */
  const [openedFromCase, setOpenedFromCase] = useState<string | undefined>(undefined);
  /** A dispatched mission the dialog about to open will follow up. Cleared with the dialog, like the case. */
  const [followUpOf, setFollowUpOf] = useState<MissionUI | undefined>(undefined);
  const arrivedFromCase = useRef(false);
  useEffect(() => {
    if (!missionFromCase || arrivedFromCase.current) return;
    arrivedFromCase.current = true;
    setOpenedFromCase(missionFromCase);
    setCreateOpen(true);
  }, [missionFromCase]);

  // Who signs (plan item 2.2): the extension's key when one is installed. This
  // was this browser's key, which an extension never signs with.
  const { pubkey: currentUser } = useNostrIdentity();

  // Mission Packages other nodes have published. Read-only: a verified package
  // is a true statement by that node, not a record in this workspace.
  const received = useReceivedPackages();
  const taken = useTakenMissions();

  // And what came back to OURS. Read-only for the same reason.
  const replies = usePackageReplies(missions);

  // A read that answers after the panel has gone is dropped: setting state then reached a page that was
  // no longer there (seen as "window is not defined" when a test ended first, 2026-10-12).
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(async () => {
    const [nextMissions, reports, cases] = await Promise.all([
      missionService.listMissions(),
      intelReportService.listReports(),
      intelCaseService.listCases(),
    ]);
    if (!mounted.current) return;
    setMissions(nextMissions);
    setHeld({ reports, cases });
    setMetrics(computePipelineMetrics(reports, cases, nextMissions));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    // A report or case deleted, restored or linked changes what a card counts.
    const offReports = intelReportService.onChange(() => void refresh());
    const offCases = intelCaseService.onChange(() => void refresh());
    const offMissions = missionService.onChange(setMissions);
    return () => { offMissions(); offReports(); offCases(); };
  }, [refresh]);

  const selectedMission = missions.find((m) => m.id === selectedMissionId) ?? null;
  // Found without opening each one (plan item 9.13). Once the last is decided, the list is whole again.
  const undecided = missions.filter((m) => m.visibility === undefined);
  const filtering = onlyUndecided && undecided.length > 0;
  const listed = filtering ? undecided : missions;
  // The detail's count, not the card's own: through linked cases too, and only what is held here.
  const cardCounts = (mission: MissionUI) => ({
    reports: reportsBehindMission(mission, held.reports, held.cases).length,
    cases: mission.relatedCases.filter((id) => held.cases.some((c) => c.id === id)).length,
  });

  return (
    <Box>
      {/* Wraps (K2): on a phone New Mission ran off the right edge. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" component="h2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Target size={20} />
          {t.heading}
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          <ReceivedBundlesButton onImported={() => void refresh()} onOpen={(subject) => { if (subject.type === 'mission') setSelectedMissionId(subject.id); }} />
          <Button variant="outlined" onClick={() => setImportOpen(true)} data-testid="import-bundle">
            {t.importBundle}
          </Button>
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>
            {t.newMission}
          </Button>
        </Stack>
      </Box>
      <ImportBundleDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => void refresh()}
        onOpen={(subject) => { setImportOpen(false); if (subject.type === 'mission') setSelectedMissionId(subject.id); }}
      />

      {/* The counters, and now what they are counting: see ReceivedPackagesPanel. */}
      <ReceivedPackagesPanel received={received} />

      {/* A person's own missions, under the ones received (D-MF, MF1). */}
      {(received.accepted.length > 0 || taken.length > 0) && (
        <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, mb: 1 }} data-testid="own-missions-heading">
          {t.yourMissions}
        </Typography>
      )}
      {/* What each joined team is working on, read from its own relay (D-RS, RS55). */}
      <TeamMissions received={received.accepted} />
      {/* The missions taken on, each a checklist, kept on this device (D-MF, MF7). */}
      <TakenMissionsList />

      {/* The return path. Starcom published packages and consumed nothing in
          reply until 2026-09-20; this is where an answer lands. */}
      <PackageRepliesPanel replies={replies} />

      {/* Two numbers, stated whether or not they flatter us.
          A pipeline layer can be well-formed, shipped and useless, and without
          a figure nobody finds out — so the evidence gate and the findings join
          are judged here rather than asserted elsewhere. */}
      {metrics && metrics.missionCount > 0 && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 2 }} data-testid="pipeline-metrics">
          {fill(t.metricsEvidence, { n: new Intl.NumberFormat(languageOf(lang).html, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(metrics.meanEvidencePerMission) })}
          {' · '}{counted(t.metricsReach, metrics.reportCount, { percent: Math.round(metrics.reportsReachingAMission * 100) })}
          {metrics.missionsWithoutEvidence > 0 && (
            <> · {fillNodes(t.restingOnNothing, { n: <strong>{metrics.missionsWithoutEvidence}</strong> })}</>
          )}
          {metrics.reportsBackingMoreThanOneMission === 0 && metrics.reportsReached > 0 && (
            <> · {t.noReuse}</>
          )}
        </Typography>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
      ) : missions.length === 0 ? (
        <Alert severity="info">{received.accepted.length > 0 || taken.length > 0 ? t.noOwnMissions : t.noMissions}</Alert>
      ) : (
        <Stack spacing={1.5}>
          {undecided.length > 0 && (
            <Box>
              <Chip
                clickable
                size="small"
                color="warning"
                variant={filtering ? 'filled' : 'outlined'}
                label={counted(t.undecided, undecided.length)}
                onClick={() => setOnlyUndecided(!filtering)}
                aria-pressed={filtering}
                title={filtering ? t.undecidedShowing : t.undecidedShow}
                data-testid="missions-undecided-filter"
              />
            </Box>
          )}
          {listed.map((mission) => (
            <Paper
              key={mission.id}
              sx={{ '&:hover': { borderColor: 'primary.main' }, border: '1px solid transparent', overflow: 'hidden' }}
            >
              {/* A button, so Tab reaches it and Enter opens it. It was a Paper
                  with onClick: mouse only (plan item 1.6, story S18). */}
              <ListItemButton onClick={() => setSelectedMissionId(mission.id)} sx={{ p: 2 }} data-testid={`open-mission-${mission.id}`}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <Box>
                    <Typography variant="subtitle1">{mission.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {mission.missionNumber} · {counted(t.objectives, mission.objectives.length)}
                      {' · '}{counted(t.reportsBehind, cardCounts(mission).reports)}
                      {' · '}{counted(t.cases, cardCounts(mission).cases)}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <DistributionChip visibility={mission.visibility} what="mission" testId={`mission-card-distribution-${mission.id}`} />
                    {/* Field work, tagged for NavCom's map (D-MX, MX13). */}
                    {mission.fieldWork && (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={mission.fieldWork.jurisdiction ? fill(t.fieldWorkIn, { region: mission.fieldWork.jurisdiction }) : t.fieldWork}
                        title={t.fieldWorkTitle}
                        data-testid={`mission-card-fieldwork-${mission.id}`}
                      />
                    )}
                    <StatusChip kind="mission" status={mission.status} testId={`mission-card-status-${mission.id}`} />
                  </Stack>
                </Box>
              </ListItemButton>
            </Paper>
          ))}
        </Stack>
      )}

      {createOpen && (
        <CreateMissionDialog
          fromCaseId={openedFromCase}
          followUpOf={followUpOf}
          onClose={() => {
            setCreateOpen(false);
            // Cleared on close, so the next NEW MISSION starts from nothing.
            setOpenedFromCase(undefined);
            setFollowUpOf(undefined);
          }}
          onCreated={(mission) => {
            setCreateOpen(false);
            setOpenedFromCase(undefined);
            setFollowUpOf(undefined);
            setSelectedMissionId(mission.id);
          }}
        />
      )}

      {selectedMission && (
        <MissionDetailDialog
          key={selectedMission.id}
          mission={selectedMission}
          teamMembers={teamMembers}
          currentUser={currentUser}
          // Both directions are looked up from the one stored link, so they cannot disagree.
          followUpTo={missions.find((m) => m.id === selectedMission.metadata?.followUpOf)}
          followUps={missions.filter((m) => m.metadata?.followUpOf === selectedMission.id)}
          onOpenMission={(id) => setSelectedMissionId(id)}
          onStartFollowUp={() => {
            setFollowUpOf(selectedMission);
            setSelectedMissionId(null);
            setCreateOpen(true);
          }}
          onClose={() => setSelectedMissionId(null)}
        />
      )}
    </Box>
  );
};

// ─── A report from a comment ────────────────────────────────────────────

/**
 * "This needs a new report", said in a mission's comment thread, becomes one.
 *
 * Reports were written in other screens, so acting on a comment meant leaving
 * the mission, writing the report elsewhere, and coming back to attach it by
 * name. Here the report starts from the comment's words, is saved through the
 * same intelReportService every producer uses, and is attached to the mission it
 * came from, with the comment recorded against the link.
 */
const ReportFromCommentDialog: React.FC<{
  comment: MissionComment;
  onClose: () => void;
  onCreated: (report: IntelReportUI) => void;
}> = ({ comment, onClose, onCreated }) => {
  const { m: { missions: { fromComment: t } } } = useMessages();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState(comment.content);
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!title.trim() || !content.trim()) {
      setError(t.required);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const report = await intelReportService.createReport({
        title: title.trim(),
        content: content.trim(),
        category: 'GENERAL',
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      onCreated(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth data-testid="report-from-comment-dialog">
      <DialogTitle>{t.heading}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label={t.title} value={title} onChange={(e) => setTitle(e.target.value)} required fullWidth autoFocus
            inputProps={{ 'data-testid': 'report-title-input' }}
          />
          <TextField
            label={t.content} value={content} onChange={(e) => setContent(e.target.value)} required fullWidth multiline minRows={4}
            helperText={t.contentHelp}
            inputProps={{ 'data-testid': 'report-content-input' }}
          />
          <TextField
            label={t.tags} value={tags} onChange={(e) => setTags(e.target.value)} fullWidth placeholder={t.tagsPlaceholder}
            inputProps={{ 'data-testid': 'report-tags-input' }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t.cancel}</Button>
        <Button variant="contained" onClick={handleCreate} disabled={saving} data-testid="report-from-comment-submit">
          {saving ? <CircularProgress size={18} /> : t.create}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Create ─────────────────────────────────────────────────────────────

const CreateMissionDialog: React.FC<{
  onClose: () => void;
  onCreated: (mission: MissionUI) => void;
  /** Attached on creation, so the mission rests on something from its first moment. */
  fromCaseId?: string;
  /** A dispatched mission this one follows up: linked by id, never by that mission's evidence. */
  followUpOf?: MissionUI;
}> = ({
  fromCaseId,
  followUpOf,
  onClose,
  onCreated,
}) => {
  const { m: { missions: words, reasons, shared } } = useMessages();
  const t = words.create;
  const [title, setTitle] = useState(followUpOf ? fill(t.followUpTitle, { title: followUpOf.title }) : '');
  const [briefing, setBriefing] = useState('');
  // Nothing chosen in advance (plan item 0.5, decision D2).
  const [visibility, setVisibility] = useState<InformationVisibility | undefined>(undefined);
  const [limitedTo, setLimitedTo] = useState<string[]>([]);
  const [sensitivity, setSensitivity] = useState<ContentSensitivity>('open');
  const [objectivesText, setObjectivesText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!title.trim() || !briefing.trim()) {
      setError(t.required);
      return;
    }
    if (!visibility) {
      setError(t.chooseDistribution);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input: CreateMissionInput = {
        title: title.trim(),
        briefing: briefing.trim(),
        visibility,
        ...(visibility === 'limited' && limitedTo.length > 0 ? { limitedTo } : {}),
        sensitivity,
        objectives: objectivesText.split('\n').map((o) => o.trim()).filter(Boolean),
        // Arrives already resting on the case that prompted it, so the evidence
        // gate is satisfied by the work that led here rather than by a second
        // trip through the attach control.
        ...(fromCaseId ? { relatedCases: [fromCaseId] } : {}),
        // Linked to the mission it follows, not to that mission's evidence: a
        // follow-up has to rest on something of its own before it is packaged.
        ...(followUpOf ? { metadata: { followUpOf: followUpOf.id } } : {}),
      };
      const mission = await missionService.createMission(input);
      onCreated(mission);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth data-testid="create-mission-dialog">
      <DialogTitle>{followUpOf ? fill(t.followUpHeading, { number: followUpOf.missionNumber }) : words.newMission}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {followUpOf && (
            <Alert severity="info" data-testid="follow-up-note">{fill(t.followUpNote, { number: followUpOf.missionNumber })}</Alert>
          )}
          <TextField
            label={t.title} value={title} onChange={(e) => setTitle(e.target.value)} required fullWidth autoFocus
            inputProps={{ 'data-testid': 'mission-title-input' }}
          />
          <TextField
            label={t.briefing}
            value={briefing}
            onChange={(e) => setBriefing(e.target.value)}
            required
            fullWidth
            multiline
            minRows={4}
            inputProps={{ 'data-testid': 'mission-briefing-input' }}
          />
          <DistributionChoice
            what="mission"
            value={visibility}
            onChange={setVisibility}
            consequence={visibility ? destinationWords(missionDestinations({ visibility, limitedTo }, reasons), reasons) : null}
            teams={{ chosen: limitedTo, onChange: setLimitedTo }}
            testId="mission-distribution"
          />
          <TextField
            select
            label={t.sensitivity}
            helperText={t.sensitivityHelp}
            value={sensitivity}
            onChange={(e) => setSensitivity(e.target.value as ContentSensitivity)}
            fullWidth
          >
            {CONTENT_SENSITIVITIES.map((c) => (
              <MenuItem key={c} value={c}>{shared.sensitivity[c]}</MenuItem>
            ))}
          </TextField>
          <TextField
            label={t.objectives}
            value={objectivesText}
            onChange={(e) => setObjectivesText(e.target.value)}
            fullWidth
            multiline
            minRows={3}
            helperText={t.objectivesHelp}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving} data-testid="create-mission-cancel">{t.cancel}</Button>
        <Button onClick={handleCreate} variant="contained" disabled={saving || !visibility} data-testid="create-mission-submit">
          {saving ? <CircularProgress size={20} /> : t.create}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

// ─── Detail (attach, transition, publish, collaborate) ─────────────────

const MissionDetailDialog: React.FC<{
  mission: MissionUI;
  teamMembers: TeamMember[];
  currentUser: string | null;
  onClose: () => void;
  /** The mission this one follows up, when it was started from a dispatched one. */
  followUpTo?: MissionUI;
  /** Missions started as follow-ups to this one. */
  followUps: MissionUI[];
  onOpenMission: (id: string) => void;
  onStartFollowUp: () => void;
}> = ({ mission, teamMembers, currentUser, onClose, followUpTo, followUps, onOpenMission, onStartFollowUp }) => {
  const { lang, m } = useMessages();
  const { missions: t, reasons, shared } = m;
  const showOnGlobe = useShowOnGlobe();
  const [reports, setReports] = useState<IntelReportUI[]>([]);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<string | null>(null);
  // Its package, kept on this device because no relay took it, to go when one answers (W1c).
  const keptPackage = keptPackageOf(useKeptNotes(), mission.id);
  // Where this mission's distribution sends it (plan item 0.4), or why nowhere.
  const destinations = useMemo(() => missionDestinations(mission, reasons), [mission, reasons]);
  const publishTargets = destinations.relays;

  /**
   * What the findings track already knows about this mission's evidence.
   *
   * Corroboration has been computed in this app for a long time and never
   * consulted by dispatch. Shown here, at the point the decision is made,
   * because the interesting state is not "rests on nothing" — the gate catches
   * that — but "looks supported and rests on one line of sight", which nothing
   * previously prompted anyone to notice.
   *
   * CaseItem carries relatedEntities in the same shape IntelCaseUI does, which
   * is the only field this needs.
   */
  const corroboration: MissionCorroboration = useMemo(
    () => computeMissionCorroboration(mission, reports, cases as never),
    [mission, reports, cases],
  );
  const publishIsPublic = destinationIsPublic(publishTargets);
  // `visibility` says who may receive a mission; nothing here encrypts the
  // wire, so a restricted package on a public relay is readable by anyone. The
  // service refuses that outright; the button is disabled so the refusal is
  // visible before the click rather than as an error after it.
  // A mission must rest on something before it can be packaged. Surfaced on the
  // transition itself so an operator is not offered a step that will throw.
  // The service's own predicate, not a second copy of the rule. A button
  // enabled by one definition and refused by another is worse than no button.
  // Asynchronous for a protected mission, whose briefing is ciphertext at rest: a direct
  // observation declared in it can only be read by decrypting it, which the gate does too.
  // The synchronous answer shows first, so an unprotected mission never flickers.
  // Only links to records held here count (plan item 0.6): the lookup is the
  // reports and cases this dialog has loaded, which follow deletes and Undo.
  const evidence = useMemo(() => evidenceIn(reports.map((r) => r.id), cases.map((c) => c.id)), [reports, cases]);
  const [missionRestsOnEvidence, setMissionRestsOnEvidence] = useState(() => restsOnEvidence(mission, evidence));
  useEffect(() => {
    let live = true;
    setMissionRestsOnEvidence(restsOnEvidence(mission, evidence));
    void restsOnEvidenceReadingBriefing(mission, evidence).then((rests) => { if (live) setMissionRestsOnEvidence(rests); });
    return () => { live = false; };
  }, [mission, evidence]);

  // The service's own predicate, not a second copy of the rule — the same
  // reason restsOnEvidence is imported above rather than reimplemented. This
  // WAS a second copy (`publishIsPublic && ['CONFIDENTIAL','SECRET',
  // 'TOP_SECRET'].includes(...)`), and once the gate moved onto `visibility` it
  // could disagree in both directions: a 'limited' mission left the button
  // enabled and threw on click, while a SECRET-but-'public' one had the button
  // disabled for a publish the gate would have allowed.
  // Sample material goes nowhere, whatever the distribution says (plan item 0.9).
  // Where a different distribution would send it, it also says how to choose one (plan item 9.13).
  const refusal = missionRestsOnSample(mission) ? t.sampleRefusal : goesNowhereWords(mission, destinations.refusal, m);
  const goesNowhere = refusal !== null;
  const [commentText, setCommentText] = useState('');
  const [reportFromComment, setReportFromComment] = useState<MissionComment | null>(null);

  // Kept current, not read once: a linked report or case deleted elsewhere, or
  // brought back with Undo, changes what this mission rests on (plan item 0.6).
  const [linksLoaded, setLinksLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () => {
      void Promise.all([intelReportService.listReports(), caseManagerAdapter.getCases()]).then(([nextReports, nextCases]) => {
        if (!live) return;
        setReports(nextReports);
        setCases(nextCases);
        setLinksLoaded(true);
      });
    };
    load();
    const offReports = intelReportService.onChange(load);
    const offCases = intelCaseService.onChange(load);
    return () => { live = false; offReports(); offCases(); };
  }, []);

  const attachedReports = useMemo(
    () => reports.filter((r) => mission.relatedReports.includes(r.id)),
    [reports, mission.relatedReports]
  );
  const attachedCases = useMemo(
    () => cases.filter((c) => mission.relatedCases.includes(c.id)),
    [cases, mission.relatedCases]
  );
  // Who an objective can be given to, and what it can rest on, from the mission
  // itself (plan item 2.5): its collaborators and you, its reports and cases.
  const objectivePeople = useMemo(() => {
    const me = nostrIdentityService.signerPubkey();
    const keys = mission.collaborators.map((c) => c.userId).filter((k) => /^[0-9a-f]{64}$/.test(k));
    return me && !keys.includes(me) ? [me, ...keys] : keys;
  }, [mission.collaborators]);
  const objectiveEvidence = useMemo(() => [
    ...attachedReports.map((r) => ({ id: r.id, label: fill(t.reportLabel, { title: r.title }) })),
    ...attachedCases.map((c) => ({ id: c.id, label: fill(t.caseLabel, { title: c.title }) })),
  ], [attachedReports, attachedCases, t]);
  // Links whose record is not here: shown, and named, rather than dropped from
  // view while the mission still carries them (plan item 0.6).
  const absentReports = useMemo(
    () => (linksLoaded ? mission.relatedReports.filter((id) => !evidence.hasReport(id)) : []),
    [linksLoaded, mission.relatedReports, evidence],
  );
  const absentCases = useMemo(
    () => (linksLoaded ? mission.relatedCases.filter((id) => !evidence.hasCase(id)) : []),
    [linksLoaded, mission.relatedCases, evidence],
  );
  const availableReports = useMemo(
    () => reports.filter((r) => !mission.relatedReports.includes(r.id)),
    [reports, mission.relatedReports]
  );
  const availableCases = useMemo(
    () => cases.filter((c) => !mission.relatedCases.includes(c.id)),
    [cases, mission.relatedCases]
  );

  const save = async (updated: MissionUI) => {
    setBusy(true);
    setActionError(null);
    try {
      await missionService.saveMission(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t.errors.save);
    } finally {
      setBusy(false);
    }
  };

  const attachReport = (report: IntelReportUI, extra: Record<string, unknown> = {}) => {
    save({
      ...mission,
      relatedReports: [...mission.relatedReports, report.id],
      // The LINK is always logged; only the actor can be unknown. Gating the
      // whole entry on identity meant an unattributed action left no trace at
      // all, which is the one case an audit trail exists for.
      activityLog: [...mission.activityLog, makeActivityEntry(MissionActivityAction.REPORT_LINKED, currentUser ?? '', { reportId: report.id, title: report.title, ...extra })],
    });
  };

  const detachReport = (reportId: string) => {
    // Attaching was recorded and detaching was not, so the log read as though
    // a report were still linked long after it was removed. REPORT_UNLINKED
    // existed in the enum with no producer anywhere.
    save({
      ...mission,
      relatedReports: mission.relatedReports.filter((id) => id !== reportId),
      activityLog: [...mission.activityLog, makeActivityEntry(MissionActivityAction.REPORT_UNLINKED, currentUser ?? '', { reportId })],
    });
  };

  const attachCase = (caseItem: CaseItem) => {
    save({
      ...mission,
      relatedCases: [...mission.relatedCases, caseItem.id],
      activityLog: [...mission.activityLog, makeActivityEntry(MissionActivityAction.CASE_LINKED, currentUser ?? '', { caseId: caseItem.id, title: caseItem.title })],
    });
  };

  const detachCase = (caseId: string) => {
    save({
      ...mission,
      relatedCases: mission.relatedCases.filter((id) => id !== caseId),
      activityLog: [...mission.activityLog, makeActivityEntry(MissionActivityAction.CASE_UNLINKED, currentUser ?? '', { caseId })],
    });
  };

  const transitionTo = async (status: MissionStatus) => {
    setBusy(true);
    setActionError(null);
    try {
      await missionService.updateStatus(mission.id, status, currentUser ?? undefined);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t.errors.status);
    } finally {
      setBusy(false);
    }
  };

  // Kept to go later: the mission's own line says it waits, with Cancel (W1c).
  const describePublish = (result: PublishToNavcomResult) => (result.kept ? null : (
    result.broadcast.success
      ? fill(t.published, { relays: relaysPhrase(result.mission.dispatchReceipt, t) })
      // Which relays said what is on the last attempt's line, under the button.
      : fill(t.notPublished, { packaged: statusName('mission', MissionStatus.PACKAGED, shared), retry: t.retryPublish })
  ));

  /** What a review ended in: sent, cancelled (nothing happened), or refused. */
  const afterReview = (outcome: ReviewOutcome<PublishToNavcomResult>) => {
    if (outcome.status === 'sent') setPublishResult(describePublish(outcome.result));
    else if (outcome.status === 'refused') setActionError(outcome.reason);
  };

  /**
   * What the review of a closing ended in (D-MX, MX12). Declined, the mission
   * stays closed here and its package says open. Sent, the closed mission's own
   * line says so; only a closing no relay took needs saying here.
   */
  const afterClosingReview = (outcome: ReviewOutcome<PublishToNavcomResult>) => {
    if (outcome.status === 'sent' && !outcome.result.broadcast.success) {
      setPublishResult(t.closingNoRelay);
    } else if (outcome.status === 'refused') setActionError(outcome.reason);
  };

  /** Close it as done or called off, then offer its closing for review: its package, saying closed. */
  const closeAs = async (as: 'completed' | 'cancelled') => {
    setBusy(true);
    setActionError(null);
    setPublishResult(null);
    try {
      await missionService.closeMission(mission.id, as, currentUser ?? undefined);
      afterClosingReview(await reviewMissionClosing(mission.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t.errors.close);
    } finally {
      setBusy(false);
    }
  };

  const publishClosing = async () => {
    setBusy(true);
    setActionError(null);
    setPublishResult(null);
    try {
      afterClosingReview(await reviewMissionClosing(mission.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t.errors.closing);
    } finally {
      setBusy(false);
    }
  };

  // Both go through the publish review, which shows the package and where it
  // goes before anything is signed or sent (plan item 0.1).
  const handlePublish = async () => {
    setBusy(true);
    setActionError(null);
    setPublishResult(null);
    try {
      afterReview(await reviewMissionPackage(mission.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t.errors.publish);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Sends the package kept at packaging, exactly as it was signed. This used to
   * step back to READY_FOR_PACKAGE and publish again, which rebuilt the package
   * from the mission as it stood by then (plan item 0.7).
   */
  const handleRetryPublish = async () => {
    setBusy(true);
    setActionError(null);
    setPublishResult(null);
    try {
      afterReview(await reviewMissionRetry(mission.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t.errors.retry);
    } finally {
      setBusy(false);
    }
  };

  const postComment = () => {
    if (!commentText.trim() || !currentUser) return;
    const comment: MissionComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      content: commentText.trim(),
      createdAt: new Date().toISOString(),
      createdBy: currentUser,
      mentions: [],
      attachments: [],
    };
    save({ ...mission, comments: [...mission.comments, comment] });
    setCommentText('');
  };

  const [newObjective, setNewObjective] = useState('');

  /**
   * Objectives were settable only at creation, and toggling one wrote nothing
   * to the activity log — so OBJECTIVE_ADDED, OBJECTIVE_REMOVED and
   * OBJECTIVE_COMPLETED were three vocabulary entries no code produced. A log
   * that shows a mission's objectives changing is the difference between a
   * record of the work and a snapshot of its final state.
   */
  const addObjective = () => {
    const description = newObjective.trim();
    if (!description) return;
    const objective = {
      id: `objective-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      description,
      completed: false,
    };
    setNewObjective('');
    save({
      ...mission,
      objectives: [...mission.objectives, objective],
      activityLog: [...mission.activityLog, makeActivityEntry(
        MissionActivityAction.OBJECTIVE_ADDED, currentUser ?? '', { objectiveId: objective.id, description },
      )],
    });
  };

  /**
   * Edits to an objective's detail — what it hands back, how long it takes, its
   * limits, who it is for, who claimed it.
   *
   * Logged as UPDATED rather than given its own vocabulary entry. The activity
   * log's job is to show the work moving; a separate action per field would
   * bury OBJECTIVE_ADDED and OBJECTIVE_COMPLETED in noise, and the vocabulary
   * would have to grow every time a field does. The changed field names are
   * recorded in the entry's details, so the log still says WHAT moved.
   */
  const patchObjective = (objectiveId: string, patch: Partial<MissionObjective>) => {
    save({
      ...mission,
      objectives: mission.objectives.map((o) => (o.id === objectiveId ? { ...o, ...patch } : o)),
      activityLog: [...mission.activityLog, makeActivityEntry(
        MissionActivityAction.UPDATED, currentUser ?? '',
        { objectiveId, fields: Object.keys(patch).join(', ') },
      )],
    });
  };

  // Through the service, which logs the whole objective and holds it ten
  // seconds with Undo (plan item 0.6).
  const removeObjective = async (objectiveId: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await missionService.removeObjective(mission.id, objectiveId, currentUser ?? '');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t.errors.removeObjective);
    } finally {
      setBusy(false);
    }
  };

  // Offered once per opening: if its closing cannot be offered, a second Delete deletes it anyway.
  const [closingOffered, setClosingOffered] = useState(false);

  // No question first: the deletion is held ten seconds, and the Undo bar is
  // the way back (plan item 0.6). Before this, no screen could delete a mission.
  // A published one is offered its closing first (D-MX, MX12): deleting it here
  // leaves its package on the relays, still saying open. Deleted whatever the answer.
  const deleteMission = async () => {
    setBusy(true);
    setActionError(null);
    if (mission.publishedAs && !mission.closingReceipt && !closingOffered) {
      setClosingOffered(true);
      try {
        const outcome = await reviewMissionClosing(mission.id);
        if (outcome.status === 'refused') throw new Error(outcome.reason);
      } catch (err) {
        setActionError(fill(t.errors.deleteAgain, { reason: err instanceof Error ? err.message : t.errors.closingNotOffered }));
        setBusy(false);
        return;
      }
    }
    try {
      await missionService.deleteMission(mission.id);
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t.errors.delete);
      setBusy(false);
    }
  };

  const toggleObjective = (objectiveId: string) => {
    const target = mission.objectives.find((o) => o.id === objectiveId);
    if (!target) return;
    const nowComplete = !target.completed;
    save({
      ...mission,
      objectives: mission.objectives.map((o) => o.id === objectiveId ? { ...o, completed: nowComplete } : o),
      // Completing and un-completing are different events. Recording an
      // un-check as OBJECTIVE_COMPLETED would put a false statement in a log
      // built to be read as evidence.
      activityLog: [...mission.activityLog, makeActivityEntry(
        nowComplete ? MissionActivityAction.OBJECTIVE_COMPLETED : MissionActivityAction.UPDATED,
        currentUser ?? '',
        { objectiveId, description: target.description, completed: nowComplete },
      )],
    });
  };

  const [delegations, setDelegations] = useState(() => missionCapabilityStore.delegations(mission.id));
  const [delegateNote, setDelegateNote] = useState<string | null>(null);
  /** Which delegation is being withdrawn, and why. Null when none is. */
  const [revokeFor, setRevokeFor] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  /**
   * Hand dispatch authority to a collaborator.
   *
   * Only somebody who already holds it may pass it on — the service verifies
   * the chain first, so this cannot mint authority the caller lacks. The grant
   * is published because the holder is on another device: a delegation they
   * cannot fetch is not a delegation.
   */
  const delegateDispatch = async (member: TeamMember) => {
    setBusy(true);
    setActionError(null);
    setDelegateNote(null);
    try {
      const outcome = await reviewDelegation(mission.id, member.pubkey);
      if (outcome.status !== 'sent') {
        if (outcome.status === 'refused') setActionError(outcome.reason);
        return;
      }
      const { relaysOk } = outcome.result;
      setDelegations(missionCapabilityStore.delegations(mission.id));
      setDelegateNote(
        relaysOk > 0
          ? counted(t.delegated, relaysOk, { name: member.name })
          : fill(t.delegatedLocal, { name: member.name }),
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t.errors.delegate);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Take back a delegation this device issued.
   *
   * The reason is required, and typed rather than defaulted. A withdrawal is
   * the one message the holder cannot ask a follow-up question about — they
   * simply stop being able to dispatch — so "withdrawn" with no cause tells
   * somebody their authority is gone and nothing else. It travels in the
   * revocation event, so they read it wherever they fetch from.
   */
  const revokeDispatch = async (holder: string, reason: string) => {
    setBusy(true);
    setActionError(null);
    setDelegateNote(null);
    try {
      const outcome = await reviewRevocation(mission.id, holder, reason.trim());
      if (outcome.status !== 'sent') {
        if (outcome.status === 'refused') setActionError(outcome.reason);
        return;
      }
      const { relaysOk } = outcome.result;
      setDelegations(missionCapabilityStore.delegations(mission.id));
      setRevokeFor(null);
      setRevokeReason('');
      setDelegateNote(
        relaysOk > 0
          ? counted(t.withdrawn, relaysOk)
          // Not a partial success. Nothing was replaced, so the grant a holder
          // already fetched still verifies and the local record is kept.
          : t.withdrawnNot,
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t.errors.withdraw);
    } finally {
      setBusy(false);
    }
  };

  const addCollaborator = (member: TeamMember) => {
    if (!member.pubkey || mission.collaborators.some((c) => c.userId === member.pubkey)) return;
    save({
      ...mission,
      collaborators: [
        ...mission.collaborators,
        { userId: member.pubkey, name: member.name, addedAt: new Date().toISOString(), addedBy: currentUser ?? 'unknown' },
      ],
      activityLog: [...mission.activityLog, makeActivityEntry(MissionActivityAction.COLLABORATOR_ADDED, currentUser ?? '', { userId: member.pubkey, name: member.name })],
    });
  };

  const removeCollaborator = (userId: string) => {
    save({
      ...mission,
      collaborators: mission.collaborators.filter((c) => c.userId !== userId),
      activityLog: [...mission.activityLog, makeActivityEntry(MissionActivityAction.COLLABORATOR_REMOVED, currentUser ?? '', { userId })],
    });
  };

  const availableCollaborators = teamMembers.filter(
    (m) => m.pubkey && !mission.collaborators.some((c) => c.userId === m.pubkey)
  );

  /**
   * From READY_FOR_PACKAGE on, what the package carries cannot change; the
   * service refuses it (plan item 0.7). Comments, claims and ticking an
   * objective done stay open: they are progress, not the package.
   */
  const packageLocked = PACKAGE_LOCKED_STATUSES.includes(mission.status);
  // Said where the distribution is shown, and where it is asked for (plan item 9.13).
  const distributionLock = missionDistributionLock(mission, m);
  const chooseDistribution = (visibility: InformationVisibility) => setRecordDistribution({ kind: 'mission', id: mission.id }, visibility);
  const reviewTarget = useMemo(() => missionReviewTarget(mission), [mission]);
  // Who has publicly taken up its package, from NavCom's labels (D-MX, MX1).
  const labels = useMissionLabels(mission.publishedAs ? [mission.publishedAs] : []);

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth data-testid="mission-detail-dialog">
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{mission.title}</span>
        <StatusChip kind="mission" status={mission.status} testId="mission-status-chip" />
        {mission.sample && <Chip label={t.sample} size="small" title={t.sampleTitle} />}
        <ReceivedFromLine receivedFrom={mission.receivedFrom} />
        {/* The capability is only real if somebody can produce a link. A route
            nobody can address is the same wiring stub as a feature nobody can
            reach. */}
        <Button
          size="small"
          data-testid="copy-mission-link"
          onClick={() => void navigator.clipboard?.writeText(
            `${window.location.origin}${recordPath('mission', mission.id)}`
          )}
          sx={{ fontSize: '0.7rem', py: 0, minWidth: 0, ml: 1 }}
        >
          {t.copyLink}
        </Button>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {actionError && <Alert severity="error">{actionError}</Alert>}
          <StatusSteps
            kind="mission"
            status={mission.status}
            busy={busy}
            onMove={(to) => transitionTo(to as MissionStatus)}
            blocked={{
              [MissionStatus.READY_FOR_PACKAGE]: missionRestsOnEvidence ? fieldWorkProblem(mission, Date.now(), lang, t.fieldWorkProblems)
                : t.needsEvidenceStep,
            }}
            testId="mission-steps"
          />
          {corroboration.reportsBehind > 0 && (
            <Alert
              severity={corroboration.singleSourceOnly ? 'warning' : 'success'}
              data-testid="mission-corroboration"
              action={<WhatIs term="corroboration" />}
            >
              {corroboration.singleSourceOnly ? (
                <>
                  {fillNodes(t.singleSource, {
                    reports: counted(t.reportsCount, corroboration.reportsBehind),
                    feeds: counted(t.feeds, corroboration.feedsBehind),
                    nothing: <strong>{t.nothingCorroborated}</strong>,
                  })}
                  {corroboration.feedsBehind === 1 && corroboration.reportsBehind > 1 && ` ${t.sameAuthor}`}
                </>
              ) : (
                fill(t.corroborated, {
                  list: corroboration.corroboratedEntities.map((e) => counted(t.entityFeeds, e.sourceCount, { entity: e.entity })).join(', '),
                })
              )}
              {/* A second axis, not a second opinion. Corroboration counts
                  independent feeds; reliability is what is known of them. Three
                  feeds agreeing, none with any track record, reads as supported
                  on one axis and unjudged on the other. */}
              {corroboration.reliability.allUnprovenOrWeak && (
                <Box sx={{ mt: 0.5 }}>
                  <strong>{t.notGraded}</strong>{' '}
                  {corroboration.reliability.ungraded > 0 ? counted(t.allWeakUngraded, corroboration.reliability.ungraded) : t.allWeak}
                  {' '}{t.judgesOnly}
                </Box>
              )}
            </Alert>
          )}

          {mission.status === MissionStatus.PLANNING && !missionRestsOnEvidence && (
            <Alert severity="info" data-testid="needs-evidence">{t.needsEvidence}</Alert>
          )}

          {mission.status === MissionStatus.READY_FOR_PACKAGE && (
            // A list of relay URLs is not something a newcomer can read for
            // safety, so the consequence is stated in words first and the
            // addresses second.
            <Alert severity={goesNowhere ? 'error' : publishIsPublic ? 'warning' : 'info'} data-testid="publish-destination">
              {refusal
                /*
                 * The gate's own words, not a second explanation composed here.
                 * The previous text said "Classification encrypts content at
                 * rest", which was the reason the label was useless: it
                 * described what the marking did NOT do on the wire while
                 * implying it did something.
                 */
                ? refusal
                // The app's one wording for where it goes (plan item 0.3).
                : describeDestination(publishTargets, reasons)}
              <Box component="ul" sx={{ m: 0, pl: 2 }}>
                {/* Going nowhere, it lists nowhere. */}
                {!goesNowhere && publishTargets.map((r) => (
                  <li key={r}>
                    <code>{r}</code> · {t.relayReach[relayReach(r)]}
                  </li>
                ))}
              </Box>
            </Alert>
          )}

          {publishResult && (
            <Alert severity={mission.status === MissionStatus.DISPATCHED || mission.closingReceipt ? 'success' : 'warning'}>{publishResult}</Alert>
          )}
          {/* Kept on the mission, so it survives closing the dialog: where the
              package went, or what the last attempt reached. */}
          {PUBLISHED_STATUSES.includes(mission.status) && mission.dispatchReceipt && (
            <Typography variant="body2" data-testid="dispatch-receipt">
              {/* Named once closed, so it is not read as the closing. */}
              {fillNodes(mission.status === MissionStatus.CLOSED ? t.receiptClosed : t.receipt, {
                relays: relaysPhrase(mission.dispatchReceipt, t),
                when: <UtcTime at={mission.dispatchReceipt.at} year />,
              })}
            </Typography>
          )}
          {mission.publishedAs && PUBLISHED_STATUSES.includes(mission.status) && (
            <PackageClaims claims={labels.claims(mission.publishedAs)} answered={labels.answered} testId="mission-claims" />
          )}
          {mission.status === MissionStatus.PACKAGED && keptPackage && (
            <KeptNoteLine record={keptPackage} waiting={m.kept.packageWaits} testId="mission-package-kept" />
          )}
          {mission.status === MissionStatus.PACKAGED && !keptPackage && mission.lastPublishAttempt && (
            <Typography variant="body2" color="warning.main" data-testid="last-publish-attempt">
              {fillNodes(mission.lastPublishAttempt.error ? t.lastAttemptError : t.lastAttempt, {
                accepted: mission.lastPublishAttempt.relaysAccepted,
                tried: mission.lastPublishAttempt.relaysTried,
                error: mission.lastPublishAttempt.error ?? '',
                when: <UtcTime at={mission.lastPublishAttempt.at} year />,
              })}
            </Typography>
          )}
          {packageLocked && !PUBLISHED_STATUSES.includes(mission.status) && (
            <Alert severity="info" data-testid="package-locked">
              {fill(t.locked, { planning: statusName('mission', MissionStatus.PLANNING, shared) })}
            </Alert>
          )}
          {mission.status === MissionStatus.DISPATCHED && (
            <Alert
              severity="info"
              data-testid="close-mission-prompt"
              action={
                <Stack direction="row" spacing={1}>
                  <Button color="inherit" size="small" disabled={busy} onClick={() => void closeAs('completed')} data-testid="close-completed">
                    {t.closeCompleted}
                  </Button>
                  <Button color="inherit" size="small" disabled={busy} onClick={() => void closeAs('cancelled')} data-testid="close-cancelled">
                    {t.closeCancelled}
                  </Button>
                </Stack>
              }
            >
              {t.closePrompt}
            </Alert>
          )}
          {mission.status === MissionStatus.CLOSED && (
            <Alert
              severity={mission.closingReceipt ? 'success' : 'warning'}
              data-testid="mission-closed"
              data-closing={mission.closingReceipt ? 'published' : 'unpublished'}
              action={!mission.closingReceipt && mission.publishedAs ? (
                <Button color="inherit" size="small" disabled={busy} onClick={() => void publishClosing()} data-testid="publish-closing">
                  {t.publishClosing}
                </Button>
              ) : undefined}
            >
              {t.closedAs[mission.closedAs ?? 'done']}{' '}
              {mission.closingReceipt
                ? fillNodes(t.closingPublished, { relays: relaysPhrase(mission.closingReceipt, t), when: <UtcTime at={mission.closingReceipt.at} year /> })
                : mission.publishedAs
                  ? t.closingOpen
                  : t.closingUnrecorded}
            </Alert>
          )}
          {PUBLISHED_STATUSES.includes(mission.status) && (
            <Alert
              severity="info"
              data-testid="follow-up-prompt"
              action={
                <Button color="inherit" size="small" onClick={onStartFollowUp} data-testid="start-follow-up">
                  {t.startFollowUp}
                </Button>
              }
            >
              {fill(t.followUpPrompt, { status: statusName('mission', mission.status, shared) })}
            </Alert>
          )}
          {(followUpTo || followUps.length > 0) && (
            <Box data-testid="mission-follow-up-links">
              {followUpTo && (
                <Typography variant="body2" component="div">
                  {fillNodes(t.followUpTo, {
                    mission: (
                      <Button size="small" onClick={() => onOpenMission(followUpTo.id)} data-testid="open-followed-mission">
                        {followUpTo.missionNumber} {followUpTo.title}
                      </Button>
                    ),
                  })}
                </Typography>
              )}
              {followUps.length > 0 && (
                <Typography variant="body2" component="div">
                  {fillNodes(t.followedUpBy, {
                    missions: (
                      <>
                        {followUps.map((f) => (
                          <Button key={f.id} size="small" onClick={() => onOpenMission(f.id)} data-testid={`open-follow-up-${f.id}`}>
                            {f.missionNumber} {f.title}
                          </Button>
                        ))}
                      </>
                    ),
                  })}
                </Typography>
              )}
            </Box>
          )}
          {!currentUser && (
            <Alert severity="info">{t.noKey}</Alert>
          )}

          {/* Changeable after creation (plan item 0.4), until the package locks:
              the distribution travels in the package, so it locks with it. */}
          <DistributionChoice
            what="mission"
            value={mission.visibility}
            onChange={(visibility) => { void save({ ...mission, visibility }); }}
            consequence={destinationWords(destinations, reasons)}
            disabled={busy}
            lockedBecause={distributionLock}
            teams={{ chosen: mission.limitedTo ?? [], onChange: (limitedTo) => { void save({ ...mission, limitedTo }); } }}
            testId="mission-distribution"
          />

          {/* What NavCom reads of its package (rev 11; D-MX): who takes it, and
              whether it is field work. It travels in the package, so it locks
              with it. */}
          <MissionProfileFields
            mission={mission}
            onChange={(patch) => { void save({ ...mission, ...patch }); }}
            disabled={busy}
            lockedBecause={missionProfileLock(mission, m)}
            reachesNavcom={mission.visibility === 'public'}
          />

          {/* What a report on it counts (MX32): its package carries them, so they lock with it. */}
          <MissionCountLines
            mission={mission}
            onChange={(countLines) => { void save({ ...mission, countLines }); }}
            disabled={busy}
            lockedBecause={missionProfileLock(mission, m)}
          />

          {/* The causes and initiatives it works toward (RS59): its package carries them, so it locks with it. */}
          <MissionToward
            mission={mission}
            onChange={(toward) => { void save({ ...mission, toward }); }}
            disabled={busy}
            lockedBecause={missionProfileLock(mission, m)}
          />

          {/* The reports sealed to its publisher, once published, to settle or challenge (MX32). */}
          <MissionReportsReceived mission={mission} />

          <Box>
            <Typography variant="subtitle2" color="text.secondary">{t.briefing}</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{mission.briefing}</Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>{t.objectivesHeading}</Typography>
            <MissionObjectives
              objectives={mission.objectives}
              busy={busy}
              locked={packageLocked}
              onToggle={toggleObjective}
              onRemove={removeObjective}
              onPatch={patchObjective}
              people={objectivePeople}
              evidence={objectiveEvidence}
            />
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <TextField
                size="small"
                fullWidth
                value={newObjective}
                onChange={(e) => setNewObjective(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addObjective(); } }}
                placeholder={t.addObjective}
                disabled={busy || packageLocked}
                inputProps={{ 'data-testid': 'new-objective-input' }}
              />
              <Button onClick={addObjective} disabled={busy || packageLocked || !newObjective.trim()} data-testid="add-objective">
                {t.add}
              </Button>
            </Stack>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>{t.relatedReports}</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
              {attachedReports.map((r) => (
                <Chip key={r.id} label={r.title} onDelete={packageLocked ? undefined : () => detachReport(r.id)} size="small" />
              ))}
              {absentReports.map((id) => (
                <AbsentLinkChip key={id} kind="report" id={id} onDetach={packageLocked ? undefined : () => detachReport(id)} />
              ))}
            </Stack>
            <Autocomplete
              options={availableReports}
              getOptionLabel={(r) => r.title}
              onChange={(_, value) => value && attachReport(value)}
              disabled={busy || packageLocked}
              renderInput={(params) => (
                <TextField {...params} label={t.attachReport} size="small"
                  inputProps={{ ...params.inputProps, 'data-testid': 'attach-report-input' }}
                />
              )}
              value={null}
              blurOnSelect
            />
          </Box>

          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>{t.relatedCases}</Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1 }}>
              {attachedCases.map((c) => (
                <Chip key={c.id} label={c.title} onDelete={packageLocked ? undefined : () => detachCase(c.id)} size="small" />
              ))}
              {absentCases.map((id) => (
                <AbsentLinkChip key={id} kind="case" id={id} onDetach={packageLocked ? undefined : () => detachCase(id)} />
              ))}
            </Stack>
            <Autocomplete
              options={availableCases}
              getOptionLabel={(c) => c.title}
              onChange={(_, value) => value && attachCase(value)}
              disabled={busy || packageLocked}
              renderInput={(params) => (
                <TextField {...params} label={t.attachCase} size="small"
                  inputProps={{ ...params.inputProps, 'data-testid': 'attach-case-input' }}
                />
              )}
              value={null}
              blurOnSelect
            />
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>{t.collaborators}</Typography>
            <List dense disablePadding>
              {mission.collaborators.map((c) => (
                <ListItem key={c.userId} disableGutters
                  secondaryAction={<IconButton size="small" onClick={() => removeCollaborator(c.userId)}><Trash2 size={16} /></IconButton>}
                >
                  <ListItemText primary={c.name} secondary={fillNodes(t.added, { when: <UtcTime at={c.addedAt} year /> })} />
                </ListItem>
              ))}
            </List>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2 }} gutterBottom>
              {t.dispatchAuthority} <WhatIs term="dispatch" />
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
              {t.dispatchNote}
            </Typography>
            {delegations.length > 0 && (
              <List dense disablePadding data-testid="dispatch-delegations">
                {delegations.map((d) => (
                  <ListItem key={d.holder} disableGutters sx={{ display: 'block' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <ListItemText
                        primary={<KeyName pubkey={d.holder} hint={mission.collaborators.find((c) => c.userId === d.holder)?.name} />}
                        secondary={fill(t.mayDispatch, { n: d.chain.length })}
                      />
                      <Button
                        size="small"
                        disabled={busy}
                        data-testid={`withdraw-dispatch-${d.holder.slice(0, 8)}`}
                        onClick={() => { setRevokeFor(revokeFor === d.holder ? null : d.holder); setRevokeReason(''); }}
                      >
                        {revokeFor === d.holder ? t.cancel : t.withdraw}
                      </Button>
                    </Box>
                    {revokeFor === d.holder && (
                      <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                        <TextField
                          size="small" fullWidth autoFocus
                          value={revokeReason}
                          onChange={(e) => setRevokeReason(e.target.value)}
                          placeholder={t.withdrawWhy}
                          inputProps={{ 'data-testid': 'withdraw-reason' }}
                        />
                        <Button
                          size="small"
                          // Required, not defaulted. A withdrawal is the one
                          // message the holder cannot ask about.
                          disabled={busy || !revokeReason.trim()}
                          data-testid="withdraw-confirm"
                          onClick={() => void revokeDispatch(d.holder, revokeReason)}
                        >
                          {t.withdraw}
                        </Button>
                      </Box>
                    )}
                  </ListItem>
                ))}
              </List>
            )}
            {delegateNote && <Alert severity="info" sx={{ mb: 1 }}>{delegateNote}</Alert>}
            {mission.collaborators.length > 0 && (
              <Autocomplete
                options={mission.collaborators.filter((c) => c.userId !== currentUser)}
                getOptionLabel={(c) => c.name}
                onChange={(_, value) => {
                  if (value) void delegateDispatch({ pubkey: value.userId, name: value.name } as TeamMember);
                }}
                disabled={busy}
                renderInput={(params) => (
                  <TextField {...params} label={t.delegateTo} size="small"
                    inputProps={{ ...params.inputProps, 'data-testid': 'delegate-dispatch-input' }}
                  />
                )}
                value={null}
                blurOnSelect
              />
            )}

            {availableCollaborators.length > 0 && (
              <Autocomplete
                options={availableCollaborators}
                getOptionLabel={(m) => m.name}
                onChange={(_, value) => value && addCollaborator(value)}
                disabled={busy}
                renderInput={(params) => (
                  <TextField {...params} label={t.addCollaborator} size="small"
                    inputProps={{ ...params.inputProps, 'data-testid': 'add-collaborator-input' }}
                  />
                )}
                value={null}
                blurOnSelect
              />
            )}
          </Box>

          <Box>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <MessageSquare size={16} /> {t.comments}
            </Typography>
            <List dense disablePadding>
              {mission.comments.map((c) => (
                <ListItem
                  key={c.id}
                  disableGutters
                  alignItems="flex-start"
                  secondaryAction={
                    <Button size="small" onClick={() => setReportFromComment(c)} disabled={busy || packageLocked}
                      title={packageLocked ? t.reportFromLocked : undefined}
                      data-testid={`report-from-comment-${c.id}`}>
                      {t.reportFromThis}
                    </Button>
                  }
                >
                  <ListItemText
                    primaryTypographyProps={{ component: 'div' }}
                    primary={<>
                      {c.content}
                      {/* Another's words in the language shown, on this device only: a comment is not Public (ML6). */}
                      {c.createdBy !== currentUser && <Translatable text={c.content} testId={`comment-translate-${c.id}`} />}
                    </>}
                    secondary={<><KeyName pubkey={c.createdBy} /> · <UtcTime at={c.createdAt} year /></>}
                    sx={{ pr: 20 }}
                  />
                </ListItem>
              ))}
            </List>
            <Stack direction="row" spacing={1}>
              <TextField
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={t.addComment}
                size="small"
                fullWidth
                disabled={!currentUser}
                inputProps={{ 'data-testid': 'comment-input' }}
              />
              <Button onClick={postComment} disabled={!currentUser || !commentText.trim()} data-testid="post-comment">{t.post}</Button>
            </Stack>
            {reportFromComment && (
              <ReportFromCommentDialog
                comment={reportFromComment}
                onClose={() => setReportFromComment(null)}
                onCreated={(report) => {
                  setReports((prev) => [...prev, report]);
                  attachReport(report, { fromCommentId: reportFromComment.id });
                  setReportFromComment(null);
                }}
              />
            )}
          </Box>

          {/* What others say about the package once it is out (plan item 5.1). */}
          {reviewTarget && <ReviewsPanel target={reviewTarget} itemTitle={mission.title} testId="mission-reviews" />}

          {mission.activityLog.length > 0 && (
            <Box>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>{t.activity}</Typography>
              <List dense disablePadding>
                {mission.activityLog.slice().reverse().map((entry) => (
                  <ListItem key={entry.id} disableGutters>
                    <ListItemText
                      primary={t.actions[entry.action as keyof MissionWords['actions']] ?? entry.action}
                      secondary={<><KeyName pubkey={entry.userId} /> · <UtcTime at={entry.timestamp} year /></>}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </Stack>
      </DialogContent>
      {/* The steps are at the top of the dialog. Publishing, which makes the last two, is here. */}
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {/* Wraps: in a row on a phone it ran off the left edge, Publish and all. */}
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }} data-testid="mission-actions">
          {mission.status === MissionStatus.READY_FOR_PACKAGE && (
            <>
              {/* The object named, and where it goes beneath it (plan item 3.7, decision D8). */}
              <Stack spacing={0.25} alignItems="flex-start">
                <Button variant="contained" color="primary" startIcon={<Send size={16} />} disabled={busy || goesNowhere} onClick={handlePublish} data-testid="publish-to-navcom">
                  {t.publishPackage}
                </Button>
                {!goesNowhere && (
                  <Typography variant="caption" color="text.secondary" data-testid="publish-destination-line">
                    {destinationLine(publishTargets, lang, t)} <WhatIs term="navcom" />
                  </Typography>
                )}
              </Stack>
            </>
          )}
          {mission.status === MissionStatus.PACKAGED && !keptPackage && (
            <Button variant="contained" color="warning" startIcon={<RotateCcw size={16} />} disabled={busy} onClick={handleRetryPublish} data-testid="retry-publish">
              {t.retryPublish}
            </Button>
          )}
          {/* Its cases' pins and its own reports' pins. Offered at every
              status: where a mission's evidence is does not depend on how far
              the mission has got. */}
          <Button
            size="small"
            startIcon={<GlobeIcon size={16} />}
            onClick={() => void showOnGlobe({ kind: 'mission', id: mission.id })}
            data-testid="show-mission-on-globe"
          >
            {t.showOnGlobe}
          </Button>
          <BundleExportButton
            subject={{ type: 'mission', id: mission.id }}
            number={mission.missionNumber}
            distribution={mission.visibility}
            onChooseDistribution={chooseDistribution}
            distributionLocked={distributionLock}
          />
          <SendBundleButton
            subject={{ type: 'mission', id: mission.id }}
            people={(mission.collaborators ?? []).map((c) => c.userId)}
            distribution={mission.visibility}
            onChooseDistribution={chooseDistribution}
            distributionLocked={distributionLock}
          />
          <Button
            size="small"
            color="error"
            startIcon={<Trash2 size={16} />}
            disabled={busy}
            onClick={() => void deleteMission()}
            title={mission.publishedAs && !mission.closingReceipt
              ? t.deleteClosingFirst
              : mission.status !== MissionStatus.DRAFT && mission.status !== MissionStatus.PLANNING && mission.status !== MissionStatus.READY_FOR_PACKAGE
                ? t.deleteHereOnly
                : undefined}
            data-testid="delete-mission"
          >
            {t.deleteMission}
          </Button>
          <Button onClick={onClose}>{t.close}</Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
};

/**
 * A link whose record is not here (plan item 0.6): the deleted record's title
 * with "(deleted)", or the id of one never held here. It still carries the
 * link, so it can be removed like any other.
 */
const AbsentLinkChip: React.FC<{ kind: 'report' | 'case'; id: string; onDetach?: () => void }> = ({ kind, id, onDetach }) => {
  const { m: { missions: t } } = useMessages();
  const { label, deleted } = absentLink(kind, id, t.absentLabel);
  return (
    <Chip
      label={label}
      onDelete={onDetach}
      size="small"
      variant="outlined"
      title={deleted ? t.absentDeleted[kind] : t.absentNotHeld[kind]}
      sx={{ color: 'text.secondary', borderStyle: 'dashed' }}
      data-testid={`absent-${kind}-${id}`}
    />
  );
};

export default MissionsPanel;

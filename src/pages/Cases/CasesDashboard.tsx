import React, { useState, useMemo, useEffect, useRef } from 'react';
import { recordPath } from '../../routes/recordLink';
import { useShowOnGlobe } from '../../hooks/useShowOnGlobe';
import {
  Box,
  Typography,
  Paper,
  Button,
  Divider,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Chip,
  IconButton,
  Tabs,
  Tab,
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Stack,
  Alert,
  Link
} from '@mui/material';
import {
  FolderPlus,
  Search,
  Eye,
  Edit,
  Trash2,
  Users,
  AlertCircle,
  Clock,
  Filter,
  RefreshCw,
  Globe as GlobeIcon
} from 'lucide-react';
import { useCaseManager } from '../../core/intel/hooks/useCaseManager';
import { encryptedAtRest, notSearched } from '../../services/epistemic/epistemicLanguage';
import { isEncryptedAtRest } from '../../services/intel/IntelWorkspaceManager';
import type { CaseItem } from '../../core/intel/adapters/caseManagerAdapter';
import { CasePriority, caseGroup } from '../../types/intel/IntelCaseUI';
import {
  CONTENT_SENSITIVITIES,
  type InformationVisibility,
  type ContentSensitivity,
} from '../../types/intel/IntelItemUI';
import DistributionChoice from '../../components/Shared/DistributionChoice';
import DistributionChip from '../../components/Shared/DistributionChip';
import StatusChip from '../../components/Shared/StatusChip';
import ProvenanceFrame from '../../components/Shared/ProvenanceFrame';
import { recordProvenance } from '../../services/intel/provenance/provenance';
import { isOwnKey } from '../../services/identity/names';
import type { ReceivedFrom } from '../../types/intel/IntelCaseUI';
import SeverityBadge from '../../components/Shared/SeverityBadge';
import { severityLevel } from '../../components/Shared/severityLevel';
import { counted, fill, useMessages } from '../../i18n/app/i18n';
import type { Messages } from '../../i18n/app/en';
import CaseDetail from './CaseDetail';
import KeyName from '../../components/Identity/KeyName';
import { describeDestination, whereItGoes } from '../../services/nostr/publishTargets';
import { migrateInvestigationsToCases } from '../../services/intel/migration/investigationsToCases';
import UtcTime from '../../components/Shared/UtcTime';
import ImportBundleDialog from '../../components/Intel/Bundles/ImportBundleDialog';
import ReceivedBundlesButton from '../../components/Intel/Bundles/ReceivedBundlesButton';
import { SHELL_PADDING } from '../../styles/shell';
import CapturesInbox from '../../components/Extension/CapturesInbox';


interface CaseFormState {
  title: string;
  description: string;
  priority: CasePriority;
  /** Undefined until someone chooses (plan item 0.5). */
  visibility: InformationVisibility | undefined;
  /** Under Limited, the joined team relays it also goes to (LW1). */
  limitedTo: string[];
  sensitivity: ContentSensitivity;
  tags: string;
}

/** Where a case's published position goes, in the app's one wording, or why nowhere. */
function caseDestinationWords(visibility: InformationVisibility | undefined, reasons: Messages['reasons'], limitedTo: readonly string[] = []): string {
  const { relays, refusal } = whereItGoes('FINDING', visibility, 'case', reasons, limitedTo);
  return refusal ?? describeDestination(relays, reasons);
}

const emptyCaseForm: CaseFormState = {
  title: '',
  description: '',
  priority: CasePriority.MEDIUM,
  // Asked every time, with nothing chosen in advance (plan item 0.5, decision
  // D2): Public cannot be recalled, so it is never the answer nobody gave.
  visibility: undefined,
  limitedTo: [],
  sensitivity: 'open',
  tags: '',
};

/**
 * Cases Dashboard
 * 
 * Investigation case management dashboard powered by the Intel Data Core.
 * Displays cases from the caseManagerAdapter with real-time updates,
 * filtering, search, and CRUD operations.
 */
interface CasesDashboardProps {
  /**
   * A subject to open a case ABOUT, carried from wherever the operator was.
   *
   * The analyzer can name what a case should concern but cannot name its
   * evidence: a CorroboratedFinding carries `contributingFingerprints`, which
   * are hashes, not report ids. So this pre-fills the title and leaves
   * attaching evidence to the operator rather than inventing a linkage the
   * data does not support — the search-and-attach control is right there, and
   * the subject name is what makes it findable.
   */
  openCaseAbout?: string;
  /**
   * What to put in the new case's description when it is opened about
   * something that came from elsewhere.
   *
   * A case opened about a foreign record with only a title loses the one thing
   * that makes it checkable later: which node said it, over which relay, and
   * when they said it. The operator can edit or delete every word of this — it
   * is their case — but it starts by recording where the subject came from.
   */
  openCaseNote?: string;
  /**
   * A case to open on arrival, from /r/case/:id.
   *
   * Opens the same connections view a click produces, so a link and a click
   * land in one state rather than two that drift.
   */
  selectCaseId?: string;
  /**
   * The open case, when something outside keeps it (the Cases app keeps it in
   * the address). Read only together with onOpenCase.
   */
  openCaseId?: string | null;
  /** Opens a case, or returns to the list with null. */
  onOpenCase?: (caseId: string | null) => void;
}

/** A list row's title, framed by whose it is where it came from someone else (BD19); your own are left plain. */
const FramedIfReceived: React.FC<{ record: { receivedFrom?: ReceivedFrom }; children: React.ReactNode }> = ({ record, children }) =>
  record.receivedFrom
    ? <ProvenanceFrame provenance={recordProvenance(record, isOwnKey)} block>{children}</ProvenanceFrame>
    : <>{children}</>;

const CasesDashboard: React.FC<CasesDashboardProps> = ({
  openCaseAbout, openCaseNote, selectCaseId, openCaseId: openCaseIdProp, onOpenCase,
}) => {
  const manager = useCaseManager();
  const {
    cases,
    stats,
    loading,
    error,
    refreshData,
    deleteCase,
    addCase,
    updateCase,
    decryptCaseDescription,
  } = manager;
  const { m: { cases: t, shared, reasons } } = useMessages();

  // Bring forward any investigations still sitting in the two legacy stores
  // this screen consolidated (see the migration module's header). Runs here
  // rather than at app boot so migrated records appear exactly where the user
  // is already looking, and so the cost is only paid by someone who actually
  // opens Cases. Idempotent — safe on every mount.
  /** How many legacy investigations were brought in, said in the language shown when it is drawn. */
  const [migrationNotice, setMigrationNotice] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    migrateInvestigationsToCases()
      .then((result) => {
        if (cancelled || result.migrated === 0) return;
        setMigrationNotice(result.migrated);
        refreshData();
      })
      .catch(() => { /* the migration logs its own failures; never block the dashboard */ });
    return () => { cancelled = true; };
  }, [refreshData]);

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [tabValue, setTabValue] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');

  // Create/Edit dialog — null means closed, an id means editing that case,
  // 'new' means creating one. Both flows share the same form/dialog since
  // they save through the same two required fields (title, description).
  const [dialogTarget, setDialogTarget] = useState<'new' | string | null>(null);
  const showOnGlobe = useShowOnGlobe();
  const [caseForm, setCaseForm] = useState<CaseFormState>(emptyCaseForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /**
   * A CONFIDENTIAL+ case whose description could not be decrypted. The
   * ciphertext is intact; the KEY is gone. The field is then locked and left
   * out of the save payload, because writing anything over it — including an
   * empty string — destroys the only copy.
   */
  const [descriptionLocked, setDescriptionLocked] = useState(false);
  const [decrypting, setDecrypting] = useState(false);

  /**
   * The open case, shown as its own page (plan item 1.2). The Cases app keeps
   * it in the address, /app/cases/<id>; rendered on its own, as in tests, the
   * dashboard keeps it here, starting from any case it was handed.
   */
  const [ownOpenCase, setOwnOpenCase] = useState<string | null>(selectCaseId ?? null);
  const openCaseId = onOpenCase ? (openCaseIdProp ?? null) : ownOpenCase;
  const openCase = (id: string | null) => (onOpenCase ? onOpenCase(id) : setOwnOpenCase(id));
  // A case a teammate exported, taken in (plan item 2.4).
  const [importOpen, setImportOpen] = useState(false);

  /**
   * Opens the create dialog once when arriving with a subject in hand, so the
   * operator lands on a filled form rather than on a list they must act on
   * again. Guarded by a ref: re-running on every render would fight anyone who
   * closed it.
   */
  const arrivedWithSubject = useRef(false);
  useEffect(() => {
    if (!openCaseAbout || arrivedWithSubject.current) return;
    arrivedWithSubject.current = true;
    setCaseForm({ ...emptyCaseForm, title: openCaseAbout, description: openCaseNote ?? '' });
    setSaveError(null);
    setDescriptionLocked(false);
    setDecrypting(false);
    setDialogTarget('new');
  }, [openCaseAbout, openCaseNote]);

  const openCreateDialog = () => {
    setCaseForm(emptyCaseForm);
    setSaveError(null);
    setDescriptionLocked(false);
    setDecrypting(false);
    setDialogTarget('new');
  };

  /**
   * This used to seed `description` straight from the stored record. For a
   * CONFIDENTIAL+ case that value is ciphertext, and editing it destroyed the
   * case: an untouched blob survives encryptFieldIfProtected's idempotency
   * guard (it JSON.parses it and recognises the marker), but one edited
   * character makes it non-JSON, so it is treated as fresh plaintext, encrypted
   * again, and the original key overwritten — with no error. See that guard's
   * own comment in IntelWorkspaceManager.
   */
  const openEditDialog = async (caseItem: CaseItem) => {
    setSaveError(null);
    setDescriptionLocked(false);
    setDialogTarget(caseItem.id);

    const seed = (description: string) => setCaseForm({
      title: caseItem.title,
      description,
      priority: (caseItem.priority as CasePriority) || CasePriority.MEDIUM,
      visibility: caseItem.visibility,
      limitedTo: caseItem.limitedTo ?? [],
      sensitivity: caseItem.sensitivity ?? 'open',
      tags: caseItem.tags.join(', '),
    });

    if (!isEncryptedAtRest(caseItem.description)) {
      seed(caseItem.description);
      return;
    }

    setDecrypting(true);
    seed('');
    try {
      const plaintext = await decryptCaseDescription(caseItem.id);
      if (plaintext === null) {
        // Key gone. Lock the field rather than showing an empty box that
        // invites the user to type over the only copy of the ciphertext.
        setDescriptionLocked(true);
        seed('');
      } else {
        seed(plaintext);
      }
    } finally {
      setDecrypting(false);
    }
  };

  const closeDialog = () => {
    setDialogTarget(null);
    setSaveError(null);
  };

  const handleSaveCase = async () => {
    // Description is required only when it is actually editable. With the key
    // missing the field is locked and omitted from the payload below, so
    // demanding a non-empty value would make the case permanently uneditable —
    // title, priority and tags frozen forever.
    if (!caseForm.title.trim() || (!descriptionLocked && !caseForm.description.trim())) {
      setSaveError(descriptionLocked ? t.titleRequired : t.titleAndDescription);
      return;
    }
    if (!caseForm.visibility) {
      setSaveError(t.chooseDistribution);
      return;
    }
    setSaving(true);
    setSaveError(null);
    const payload = {
      title: caseForm.title.trim(),
      // Omitted entirely when locked — the stored ciphertext must pass through
      // untouched, which is the one path the idempotency guard handles safely.
      ...(descriptionLocked ? {} : { description: caseForm.description.trim() }),
      priority: caseForm.priority,
      visibility: caseForm.visibility,
      // Teams only for Limited: picked under it, they mean nothing for Public or Private.
      limitedTo: caseForm.visibility === 'limited' ? caseForm.limitedTo : [],
      sensitivity: caseForm.sensitivity,
      tags: caseForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
    };
    try {
      const ok = dialogTarget === 'new'
        ? (await addCase(payload)) !== null
        // A case moves on from its page, through the moves its table allows (plan item 1.7).
        : await updateCase(dialogTarget as string, payload);
      if (ok) {
        closeDialog();
      } else {
        setSaveError(t.saveFailed);
      }
    } finally {
      setSaving(false);
    }
  };
  
  // Filter cases based on tab and search term
  /**
   * How many cases the search could not look inside. Without this line, "no
   * case matches" and "some descriptions could not be searched" render
   * identically — the same conflation this codebase treats as a defect
   * everywhere else.
   */
  const unsearchableCount = useMemo(
    () => (searchTerm === '' ? 0 : cases.filter((c) => isEncryptedAtRest(c.description)).length),
    [cases, searchTerm]
  );

  const filteredCases = useMemo(() => {
    return cases.filter(caseItem => {
      // Never match against ciphertext: it cannot contain what the user typed,
      // and including it leaks blob contents into a "why did this match?"
      // question. Counted below so a miss is never silently indistinguishable
      // from a search that could not look.
      const matchesSearch = searchTerm === '' ||
        caseItem.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (!isEncryptedAtRest(caseItem.description) &&
          caseItem.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        caseItem.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (caseItem.caseNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        caseItem.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
      
      let matchesTab = true;
      
      // Grouped as the header counts them (plan item 1.8).
      const group = caseGroup(caseItem.status);
      switch(tabValue) {
        case 0: break; // All
        case 1: matchesTab = group === 'open'; break;
        case 2: matchesTab = group === 'on-hold'; break;
        case 3: matchesTab = group === 'closed'; break;
        // There was a case 4, 'archived', for a status CaseStatus does not have,
        // so its tab was always empty. The tab went with it (plan item 1.5).
        // Tab 4 is now the cases nobody has chosen a distribution for, whatever
        // their status (plan item 9.13): they were found one at a time.
        case 4: matchesTab = caseItem.visibility === undefined; break;
        default: break;
      }
      
      return matchesSearch && matchesTab;
    });
  }, [cases, searchTerm, tabValue]);
  const undecidedCount = useMemo(() => cases.filter((c) => c.visibility === undefined).length, [cases]);
  
  // Handle page change
  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };
  
  // Handle rows per page change
  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };
  
  // Handle tab change
  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
    setPage(0);
  };
  
  // Status chip color mapping
  
  return (
    <Box sx={{ p: SHELL_PADDING, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {openCaseId ? (
        <CaseDetail
          caseId={openCaseId}
          manager={manager}
          onBack={() => openCase(null)}
          onEdit={(caseItem) => { void openEditDialog(caseItem); }}
        />
      ) : (
      <>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          {stats.totalCases > 0 && (
            <Typography variant="body2" color="text.secondary" data-testid="case-counts">
              {fill(t.counts, { open: stats.openCases, onHold: stats.onHoldCases, closed: stats.closedCases, total: stats.totalCases })}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshCw size={16} />}
            onClick={() => refreshData()}
            disabled={loading}
          >
            {t.refresh}
          </Button>
          <ReceivedBundlesButton onImported={() => refreshData()} onOpen={(subject) => { if (subject.type === 'case') openCase(subject.id); }} />
          <Button variant="outlined" onClick={() => setImportOpen(true)} data-testid="import-bundle">
            {t.importBundle}
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<FolderPlus />}
            onClick={openCreateDialog}
            data-testid="new-case"
          >
            {t.newCase}
          </Button>
        </Box>
      </Box>
      <ImportBundleDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => refreshData()}
        onOpen={(subject) => { setImportOpen(false); if (subject.type === 'case') openCase(subject.id); }}
      />
      
      {error && (
        <Paper elevation={1} sx={{ p: 2, mb: 2, bgcolor: 'error.dark', color: 'error.contrastText' }}>
          <Typography variant="body2"><AlertCircle size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} /> {error}</Typography>
        </Paper>
      )}

      {migrationNotice && (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setMigrationNotice(null)}>
          {counted(t.migrated, migrationNotice ?? 0)} {t.migratedNote}
        </Alert>
      )}
      
      <Divider sx={{ mb: 3 }} />

      {/* What the person sent from their browser through Uplink, waiting to be filed (D-EX, E2). */}
      <CapturesInbox />
      
      <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Tabs 
            value={tabValue} 
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab label={t.tabs.all} />
            <Tab label={t.tabs.open} />
            <Tab label={t.tabs.onHold} />
            <Tab label={t.tabs.closed} />
            <Tab
              label={fill(t.tabs.undecided, { n: undecidedCount })}
              title={t.tabs.undecidedMeans}
              data-testid="cases-undecided-tab"
            />
          </Tabs>
          
          <TextField
            placeholder={t.search}
            size="small"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={20} />
                </InputAdornment>
              ),
            }}
            sx={{ width: '300px' }}
          />
        </Box>
      </Paper>
      
      {unsearchableCount > 0 && (
        <Alert severity="info" sx={{ mb: 1 }} data-testid="unsearchable-notice">
          {notSearched(unsearchableCount, 'classified description', 'they are encrypted at rest').text}
        </Alert>
      )}

      <Paper elevation={3} sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress />
          </Box>
        ) : filteredCases.length > 0 ? (
          <>
            <TableContainer sx={{ flex: 1 }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>{t.columns.number}</TableCell>
                    <TableCell>{t.columns.title}</TableCell>
                    <TableCell>{t.columns.status}</TableCell>
                    <TableCell>{t.columns.priority}</TableCell>
                    <TableCell>{t.columns.distribution}</TableCell>
                    <TableCell>{t.columns.assigned}</TableCell>
                    <TableCell>{t.columns.start}</TableCell>
                    <TableCell>{t.columns.actions}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredCases
                    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                    .map((caseItem) => (
                      <TableRow key={caseItem.id} hover onClick={() => openCase(caseItem.id)} sx={{ cursor: 'pointer' }}>
                        <TableCell>{caseItem.caseNumber || caseItem.id}</TableCell>
                        <TableCell>
                          {/* A real link, so Tab reaches it, Enter opens the case, and it can be
                              copied or opened in a new tab (plan item 1.6, story S18). A plain
                              click opens the case here; a modified one is left to the browser. */}
                          {/* A row, so a title that wraps keeps its own box and the Sample chip
                              sits beside it or below it, never inside it (step 7's layout audit).
                              Framed by whose it is when it came from someone else (BD19). */}
                          <FramedIfReceived record={caseItem}>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1 }}>
                              <Link
                                href={recordPath('case', caseItem.id)}
                                variant="subtitle2"
                                color="inherit"
                                underline="hover"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                                  e.preventDefault();
                                  openCase(caseItem.id);
                                }}
                              >
                                {caseItem.title}
                              </Link>
                              {/* Demo material says so where it is listed (plan item 0.9). */}
                              {caseItem.sample && <Chip size="small" label={t.sample} title={t.sampleMeans} sx={{ height: 18 }} />}
                            </Box>
                          </FramedIfReceived>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            noWrap
                            sx={{ maxWidth: 250, fontStyle: isEncryptedAtRest(caseItem.description) ? 'italic' : undefined }}
                          >
                            {/* Deliberately NOT "open to view" — decryptCaseDescription
                                returns null when the key is missing, so promising
                                recoverability here would be a promise the dialog retracts. */}
                            {isEncryptedAtRest(caseItem.description) ? encryptedAtRest() : caseItem.description}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {/* The one status chip (BD24), where this coloured its own. */}
                          <StatusChip kind="case" status={caseItem.status} />
                        </TableCell>
                        <TableCell>
                          {/* The one severity badge (BD18), where this coloured
                              its own chip and drew Low in cyan. */}
                          <SeverityBadge level={severityLevel(caseItem.priority)} said={t.priorityAsSet} />
                        </TableCell>
                        {/*
                          * Was `caseItem.classification || 'UNCLASSIFIED'` —
                          * which displayed a marking for a case that carried
                          * none. An unmarked case now reads as unmarked.
                          */}
                        <TableCell><DistributionChip visibility={caseItem.visibility} what="case" /></TableCell>
                        <TableCell>
                          {caseItem.assignedTo.length > 1 ? (
                            <Chip
                              label={<><KeyName pubkey={caseItem.assignedTo[0]} /> +{caseItem.assignedTo.length - 1}</>}
                              size="small"
                              icon={<Users size={14} />}
                            />
                          ) : caseItem.assignedTo.length === 1 ? (
                            <KeyName pubkey={caseItem.assignedTo[0]} />
                          ) : (
                            <Typography variant="body2" color="text.secondary">{t.unassigned}</Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Clock size={14} style={{ marginRight: 4 }} />
                            <Typography variant="body2" sx={{ whiteSpace: "nowrap" }}>
                              {caseItem.startDate ? <UtcTime at={caseItem.startDate} day year /> : '—'}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex' }}>
                            {/* Labelled because these are icon-only: a screen
                                reader otherwise announces three unnamed buttons,
                                and tests had to select them by DOM index, which
                                silently retargets the moment one is inserted. */}
                            <IconButton size="small" color="primary" aria-label={fill(t.view, { title: caseItem.title })} data-testid="open-case" onClick={(e) => { e.stopPropagation(); openCase(caseItem.id); }}>
                              <Eye size={18} />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="secondary"
                              aria-label={fill(t.edit, { title: caseItem.title })}
                              onClick={(e) => { e.stopPropagation(); openEditDialog(caseItem); }}
                            >
                              <Edit size={18} />
                            </IconButton>
                            <IconButton
                              size="small"
                              aria-label={fill(t.showOnGlobe, { title: caseItem.title })}
                              onClick={(e) => { e.stopPropagation(); void showOnGlobe({ kind: 'case', id: caseItem.id }); }}
                            >
                              <GlobeIcon size={18} />
                            </IconButton>
                            <IconButton size="small" color="error" aria-label={fill(t.delete, { title: caseItem.title })} onClick={(e) => { e.stopPropagation(); deleteCase(caseItem.id); }}>
                              <Trash2 size={18} />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[5, 10, 25]}
              component="div"
              count={filteredCases.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              labelRowsPerPage={t.rowsPerPage}
              labelDisplayedRows={({ from, to, count }) => fill(t.pageOf, { from, to, count })}
            />
          </>
        ) : cases.length === 0 ? (
          /* No cases at all is its own state. It used to share the "no match"
             screen below, which offered to clear filters nobody had set. */
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', p: 4 }}
            data-testid="no-cases">
            <FolderPlus size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
            <Typography variant="h6">{t.noneYet}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420, textAlign: 'center' }}>
              {t.noneYetNote}
            </Typography>
            <Button variant="contained" startIcon={<FolderPlus />} sx={{ mt: 2 }} onClick={openCreateDialog}>
              {t.createFirst}
            </Button>
          </Box>
        ) : (
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            height: '100%',
            p: 4
          }}>
            <Filter size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
            <Typography variant="h6">{t.noMatch}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t.noMatchNote}
            </Typography>
            <Button 
              variant="outlined" 
              startIcon={<Search />} 
              sx={{ mt: 2 }}
              onClick={() => {
                setSearchTerm('');
                setTabValue(0);
              }}
            >
              {t.clearFilters}
            </Button>
          </Box>
        )}
      </Paper>

      </>
      )}

      <Dialog open={dialogTarget !== null} onClose={closeDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{dialogTarget === 'new' ? t.newCase : t.editCase}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {saveError && <Alert severity="error">{saveError}</Alert>}
            <TextField
              label={t.title}
              value={caseForm.title}
              onChange={(e) => setCaseForm((f) => ({ ...f, title: e.target.value }))}
              required
              fullWidth
              autoFocus
            />
            <TextField
              label={t.description}
              value={caseForm.description}
              onChange={(e) => setCaseForm((f) => ({ ...f, description: e.target.value }))}
              required={!descriptionLocked}
              disabled={descriptionLocked || decrypting}
              fullWidth
              multiline
              minRows={3}
              inputProps={{ 'data-testid': 'case-description-input' }}
              helperText={
                descriptionLocked
                  ? t.locked
                  : decrypting
                    ? t.decrypting
                    : undefined
              }
            />
            <TextField
              select
              label={t.priority}
              value={caseForm.priority}
              onChange={(e) => setCaseForm((f) => ({ ...f, priority: e.target.value as CasePriority }))}
              fullWidth
            >
              {Object.values(CasePriority).map((p) => (
                <MenuItem key={p} value={p}>{shared.severity[p.toLowerCase() as Lowercase<CasePriority>]}</MenuItem>
              ))}
            </TextField>
            <DistributionChoice
              what="case"
              value={caseForm.visibility}
              onChange={(visibility) => setCaseForm((f) => ({ ...f, visibility }))}
              consequence={caseDestinationWords(caseForm.visibility, reasons, caseForm.limitedTo)}
              teams={{ chosen: caseForm.limitedTo, onChange: (limitedTo) => setCaseForm((f) => ({ ...f, limitedTo })) }}
              testId="case-distribution"
            />
            <TextField
              select
              label={t.sensitivity}
              helperText={t.sensitivityNote}
              value={caseForm.sensitivity}
              onChange={(e) => setCaseForm((f) => ({ ...f, sensitivity: e.target.value as ContentSensitivity }))}
              fullWidth
            >
              {CONTENT_SENSITIVITIES.map((c) => (
                <MenuItem key={c} value={c}>{shared.sensitivity[c]}</MenuItem>
              ))}
            </TextField>
            <TextField
              label={t.tags}
              value={caseForm.tags}
              onChange={(e) => setCaseForm((f) => ({ ...f, tags: e.target.value }))}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={saving}>{t.cancel}</Button>
          <Button onClick={handleSaveCase} variant="contained" disabled={saving || !caseForm.visibility} data-testid="save-case">
            {saving ? <CircularProgress size={20} /> : dialogTarget === 'new' ? t.create : t.save}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};

export default CasesDashboard;

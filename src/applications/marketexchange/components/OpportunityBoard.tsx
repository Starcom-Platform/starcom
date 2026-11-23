/**
 * The Market Exchange's lead desk (decision D-LD; K10): what the Intelligence Market Exchange is for.
 *
 * ─── WHAT IT REPLACED ──────────────────────────────────────────────────────
 *
 * Four tabs of trading terminal (Markets, Portfolio, Trading, Analytics), every one an empty
 * placeholder, and then a column of cards that were dead ends: no record date, publisher, place or
 * link, in storage order, one audience at a time (critique audit, section 9).
 *
 * ─── WHAT IT IS ────────────────────────────────────────────────────────────
 *
 * A free index of work that pays, for the people who do that work: former military, police and
 * intelligence, private investigators, whitehat researchers, recovery agents, consultants,
 * compliance and sanctions analysts, insurance investigators, researchers and lawyers. Information is
 * the currency; charging admission to the index would be charging for the thing that makes it worth
 * visiting.
 *
 * One list holds every lead (LD1): each routed report, and each item of the public-record feeds
 * (D-BF) — a reward programme, a sanctions publication, a month of exclusions. Funding windows have
 * the Grants tab (GrantsBoard; D-MF, MF5): grants are not leads to work, and they alone close. A
 * summary line says what each source holds; several audiences filter at once; the list runs newest
 * first; the chosen lead's detail stands beside it.
 *
 * **No lead states an amount** attached to a statute: a flag naming a statute never states what
 * anybody gets — the peer's rule, binding on both nodes since spec rev 7. A figure that appears inside
 * a record ("was paid $25,242") stays visible: it is a fact about the record, not a promise. And no
 * person is named or located: the feeds count people (BF2).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme } from '@mui/material';
import type { IntelReportUI } from '../../../types/intel/IntelReportUI';
import { ARCHETYPES, ARCHETYPE_LABELS, routeAll, type Archetype } from '../../../services/exchange/opportunityAudience';
import { leadsFor, leadsFrom, sortLeads, type Lead, type LeadKind } from '../../../services/exchange/leads';
import { readRewardProgrammes } from '../../../services/exchange/feeds/rewardProgrammes';
import { WINDOW_DAYS, readSanctionsChanges, type SanctionsChanges } from '../../../services/exchange/feeds/sanctionsChanges';
import { readHealthExclusions, type HealthExclusions } from '../../../services/exchange/feeds/healthExclusions';
import { useBoardFeed, type BoardFeed } from '../useBoardFeed';
import { LeadDetail, LeadRow, StartCase } from './leadCards';
import { verifySigners } from '../../../services/identity/signerProfiles';
import { LeadMatrix } from './LeadMatrix';
import { DeciderGroups } from './DeciderGroups';
import { LeadMap } from './LeadMap';
import { KIND_NAME, monthName } from './leadText';

/** How many leads the list shows at first, and adds each time more are asked for. */
const LISTED = 100;

type Rewards = Awaited<ReturnType<typeof readRewardProgrammes>>;
// No deadlines here: only a funding window closes, and grants have a tab of their own (D-MF, MF5).
type View = 'list' | 'matrix' | 'decider' | 'map';
const VIEWS: Array<[View, string]> = [['list', 'List'], ['matrix', 'Counts'], ['decider', 'By decider'], ['map', 'Map']];

// Filters that wrap and take a line, not three: the audit measured 58% of the height above the first lead.
const COMPACT = { flexWrap: 'wrap', '& .MuiToggleButton-root': { py: 0.25, px: 1, fontSize: '0.75rem', lineHeight: 1.5 } } as const;

interface SummaryItem { id: string; text: string }

function rewardsItem(feed: BoardFeed<Rewards>): string {
  if (feed.loading) return 'Reward programmes: reading…';
  const read = feed.data;
  if (!read || !read.programmes.length) return 'Reward programmes: neither answered.';
  const notices = read.programmes.reduce((n, p) => n + p.total, 0);
  return `Reward programmes: ${read.programmes.length}, ${new Intl.NumberFormat('en-GB').format(notices)} notices open${read.failed.length ? ` (${read.failed.join(' and ')} did not answer)` : ''}`;
}

function sanctionsItem(feed: BoardFeed<SanctionsChanges>): string {
  if (feed.loading) return "Sanctions: reading OFAC's changes…";
  const n = feed.data?.publications.length ?? 0;
  return n ? `Sanctions: ${n} OFAC publications in ${WINDOW_DAYS} days` : "Sanctions: OFAC's changes did not load.";
}

function exclusionsItem(feed: BoardFeed<HealthExclusions>): string {
  if (feed.loading) return 'HHS-OIG exclusions: reading…';
  const latest = feed.data?.months[0];
  return latest ? `HHS-OIG exclusions: ${monthName(latest.month)}, ${latest.exclusions} excluded` : 'HHS-OIG exclusions: did not load.';
}

/** The row's second line: when it closes, else when it is dated, and where it came from. */



const OpportunityBoard: React.FC<{ reports: readonly IntelReportUI[] }> = ({ reports }) => {
  const rewards = useBoardFeed(readRewardProgrammes);
  const sanctions = useBoardFeed(readSanctionsChanges);
  const exclusions = useBoardFeed(readHealthExclusions);

  const routed = useMemo(() => routeAll(reports), [reports]);
  // Who published each report, by its key's own profile and the domain that lists it (D-MF, MF4).
  useEffect(() => { void verifySigners(reports.map((r) => r.author)); }, [reports]);
  const leads = useMemo(() => leadsFrom({
    reports: routed, rewards: rewards.data, sanctions: sanctions.data, exclusions: exclusions.data,
  }), [routed, rewards.data, sanctions.data, exclusions.data]);

  const [audiences, setAudiences] = useState<Archetype[]>([]);
  const [listed, setListed] = useState(LISTED);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [kinds, setKinds] = useState<LeadKind[]>([]);
  // Chosen on the map: a country's or a state's leads.
  const [place, setPlace] = useState<{ label: string; ids: ReadonlySet<string> } | null>(null);

  // Only audiences some lead reaches: a filter that can never match is a dead control.
  const present = useMemo(() => ARCHETYPES.filter((a) => leads.some((l) => l.audiences.includes(a))), [leads]);
  const shown = useMemo(() => {
    const ofKind = kinds.length ? leads.filter((l) => kinds.includes(l.kind)) : leads;
    const inPlace = place ? ofKind.filter((l) => place.ids.has(l.id)) : ofKind;
    return sortLeads(leadsFor(inPlace, new Set(audiences)), 'newest');
  }, [leads, kinds, place, audiences]);
  const today = new Date().toISOString().slice(0, 10);
  const chosen = shown.find((l) => l.id === chosenId)
    ?? shown[0];
  const loading = [rewards, sanctions, exclusions].some((f) => f.loading);
  // One column on a phone: the detail opens under its row, not below a hundred others.
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down('md'));

  // A lead's row; on a phone, its detail under it when chosen.
  const rowOf = (lead: Lead) => (
    <React.Fragment key={lead.id}>
      <LeadRow lead={lead} today={today} chosen={lead.id === chosen?.id} onChoose={setChosenId} />
      {narrow && lead.id === chosen?.id && <Paper sx={{ p: 2 }}><LeadDetail lead={lead} today={today} actions={<StartCase lead={lead} />} /></Paper>}
    </React.Fragment>
  );

  const summary: SummaryItem[] = [
    { id: 'rewards', text: rewardsItem(rewards) },
    { id: 'sanctions', text: sanctionsItem(sanctions) },
    { id: 'exclusions', text: exclusionsItem(exclusions) },
    { id: 'reports', text: `Reports: ${routed.length} of ${reports.length} offered to an audience` },
  ];

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Paid work and the public records behind it, free to read. Each lead says who decides; amounts and eligibility are
        theirs to set, and nothing here promises either.
      </Typography>

      {/* The public-record feeds and the reports, one line (LD1). */}
      <Box data-testid="board-summary" sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, mb: 1.5 }}>
        {summary.map((s) => <Typography key={s.id} variant="caption" color="text.secondary" data-testid={`board-summary-${s.id}`}>{s.text}</Typography>)}
      </Box>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }} alignItems="center">
        <ToggleButtonGroup
          size="small"
          sx={COMPACT}
          value={audiences}
          onChange={(_e, v: Archetype[]) => { setAudiences(v); setListed(LISTED); }}
          aria-label="Filter by who the work is offered to"
        >
          {present.map((a) => (
            <ToggleButton key={a} value={a}>{`${ARCHETYPE_LABELS[a]} (${leads.filter((l) => l.audiences.includes(a)).length})`}</ToggleButton>
          ))}
        </ToggleButtonGroup>
        {audiences.length > 0 && <Button size="small" onClick={() => setAudiences([])}>{`All (${leads.length})`}</Button>}
        <ToggleButtonGroup size="small" sx={COMPACT} exclusive value={view} onChange={(_e, v: View | null) => v && setView(v)} aria-label="View the leads as">
          {VIEWS.map(([v, label]) => <ToggleButton key={v} value={v}>{label}</ToggleButton>)}
        </ToggleButtonGroup>
        {kinds.map((k) => (
          <Chip key={k} size="small" label={`Kind: ${KIND_NAME[k]}`} onDelete={() => setKinds((held) => held.filter((x) => x !== k))} data-testid="kind-filter" />
        ))}
        {place && <Chip size="small" label={`Place: ${place.label}`} onDelete={() => setPlace(null)} data-testid="place-filter" />}
      </Stack>

      {leads.length === 0 ? (
        <Alert severity="info" data-testid="board-empty">
          {loading ? 'Reading the feeds…' : 'No leads yet. They appear as reports and feeds arrive.'}
        </Alert>
      ) : shown.length === 0 && view !== 'matrix' && view !== 'map' ? (
        <Alert severity="info" data-testid="board-none-for">No lead of the kinds, place and audiences chosen.</Alert>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 2fr) minmax(0, 3fr)' }, gap: 2, alignItems: 'start' }}>
          <Stack spacing={1} data-testid="lead-list" aria-label="Leads">
            {view === 'matrix' && (
              <LeadMatrix leads={leads} onPick={(kind, audience) => { setKinds([kind]); setAudiences(audience ? [audience] : []); setListed(LISTED); setView('list'); }} />
            )}
            {view === 'decider' && <DeciderGroups leads={shown} row={rowOf} />}
            {view === 'map' && (
              <LeadMap leads={leads} onPick={(label, ids) => { setPlace({ label, ids: new Set(ids) }); setListed(LISTED); setView('list'); }} />
            )}
            {view === 'list' && shown.slice(0, listed).map(rowOf)}
            {view === 'list' && shown.length > listed && (
              <Button size="small" onClick={() => setListed((n) => n + LISTED)}>
                {`Show ${Math.min(LISTED, shown.length - listed)} more of ${shown.length - listed}`}
              </Button>
            )}
          </Stack>
          {chosen && !narrow && (
            <Paper sx={{ p: 2, position: 'sticky', top: 0, maxHeight: '75vh', overflowY: 'auto' }}>
              <LeadDetail lead={chosen} today={today} actions={<StartCase lead={chosen} />} />
            </Paper>
          )}
        </Box>
      )}
    </Box>
  );
};

export default OpportunityBoard;

/**
 * The Market Exchange's Grants tab (decision D-MF, MF5): grants are not missions. Grants.gov's open funding
 * windows, the soonest to close first, as a list or on the deadline strip; the grant notices received with
 * them, a notice meeting a window marked on its row and its steps in its detail, and the notices no window
 * here meets listed after. Each says who decides; amounts and eligibility are the programme's to set. A
 * notice's signer is named as its own profile names it (MF4), never here.
 */
import React, { useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery, useTheme } from '@mui/material';
import { fundingLead, sortLeads, type Lead } from '../../../services/exchange/leads';
import { readFundingWindows } from '../../../services/exchange/feeds/grantsGov';
import { matchNotices, type GrantNotice } from '../../../services/exchange/grantNotices';
import { useBoardFeed } from '../useBoardFeed';
import KeyName from '../../../components/Identity/KeyName';
import { LeadDetail, LeadRow, StartCase } from './leadCards';
import { LeadTimeline } from './LeadTimeline';
import { dateOf, daysFrom, daysText } from './leadText';

const LISTED = 100;
const SOON_DAYS = 30;
type View = 'list' | 'timeline';

/** What a notice asks of people: its mission line and its steps, from its signer. */
const NoticeDetail: React.FC<{ notice: GrantNotice }> = ({ notice }) => (
  <Box data-testid="grant-notice" sx={{ mt: 2 }}>
    <Typography variant="overline" component="h3" sx={{ display: 'block' }}>
      From <KeyName pubkey={notice.signer} />
    </Typography>
    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>{notice.mission}</Typography>
    {notice.steps.length > 0 && (
      <Box component="ol" sx={{ m: 0, pl: 2.5, listStyleType: 'decimal' }}>
        {notice.steps.map((step, i) => <Typography key={i} component="li" variant="body2">{step}</Typography>)}
      </Box>
    )}
  </Box>
);

const GrantsBoard: React.FC<{ notices: readonly GrantNotice[] }> = ({ notices }) => {
  const funding = useBoardFeed(readFundingWindows);
  const today = funding.data?.today ?? new Date().toISOString().slice(0, 10);
  const windows = useMemo(() => funding.data?.windows ?? [], [funding.data]);
  const leads = useMemo(() => sortLeads(windows.map(fundingLead), 'closing'), [windows]);
  const { byWindow, unmatched } = useMemo(() => matchNotices(windows, notices), [windows, notices]);
  const noticeOf = (lead: Lead) => (lead.record.kind === 'funding' ? byWindow.get(lead.record.window.id) : undefined);

  const [view, setView] = useState<View>('list');
  const [listed, setListed] = useState(LISTED);
  const [chosenId, setChosenId] = useState<string | null>(null);
  const chosen = leads.find((l) => l.id === chosenId) ?? leads[0];
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down('md'));

  const detailOf = (lead: Lead) => {
    const notice = noticeOf(lead);
    return (
      <>
        <LeadDetail lead={lead} today={today} actions={<StartCase lead={lead} />} />
        {notice && <NoticeDetail notice={notice} />}
      </>
    );
  };
  const rowOf = (lead: Lead) => {
    const notice = noticeOf(lead);
    return (
      <React.Fragment key={lead.id}>
        <LeadRow
          lead={lead}
          today={today}
          chosen={lead.id === chosen?.id}
          onChoose={setChosenId}
          mark={notice ? <Chip size="small" variant="outlined" color="primary" sx={{ mt: 0.5 }} label="A notice asks people to pass it on" data-testid="grant-notice-mark" /> : undefined}
        />
        {narrow && lead.id === chosen?.id && <Paper sx={{ p: 2 }}>{detailOf(lead)}</Paper>}
      </React.Fragment>
    );
  };

  const soon = windows.filter((w) => daysFrom(today, w.closes) <= SOON_DAYS).length;
  const summary = funding.loading
    ? 'Grants.gov: reading…'
    : funding.data
      ? `Grants.gov: ${windows.length} open, ${soon} close within ${SOON_DAYS} days`
      : 'Grants.gov did not answer.';

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Funding open to apply for, the soonest to close first. Each programme decides who may apply and how much.
      </Typography>
      <Box data-testid="grants-summary" sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, mb: 1.5 }}>
        <Typography variant="caption" color="text.secondary">{summary}</Typography>
        {notices.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            {`Notices received: ${notices.length}, ${byWindow.size} on these windows`}
          </Typography>
        )}
      </Box>

      <ToggleButtonGroup size="small" exclusive value={view} onChange={(_e, v: View | null) => v && setView(v)} aria-label="View the grants as" sx={{ mb: 1.5 }}>
        <ToggleButton value="list">List</ToggleButton>
        <ToggleButton value="timeline">Deadlines</ToggleButton>
      </ToggleButtonGroup>

      {leads.length === 0 ? (
        <Alert severity="info" data-testid="grants-empty">{funding.loading ? 'Reading Grants.gov…' : 'No funding window is open in the categories read here.'}</Alert>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 2fr) minmax(0, 3fr)' }, gap: 2, alignItems: 'start' }}>
          <Stack spacing={1} data-testid="grants-list" aria-label="Grants">
            {view === 'timeline' && <LeadTimeline leads={leads} today={today} chosenId={chosen?.id} onChoose={setChosenId} row={rowOf} />}
            {view === 'list' && leads.slice(0, listed).map(rowOf)}
            {view === 'list' && leads.length > listed && (
              <Button size="small" onClick={() => setListed((n) => n + LISTED)}>
                {`Show ${Math.min(LISTED, leads.length - listed)} more of ${leads.length - listed}`}
              </Button>
            )}
          </Stack>
          {chosen && !narrow && (
            <Paper sx={{ p: 2, position: 'sticky', top: 0, maxHeight: '75vh', overflowY: 'auto' }}>{detailOf(chosen)}</Paper>
          )}
        </Box>
      )}

      {unmatched.length > 0 && (
        <Box data-testid="grant-notices-unmatched" sx={{ mt: 3 }}>
          <Typography variant="overline" component="h3" sx={{ display: 'block' }}>
            {`More notices: ${unmatched.length} outside the categories read here`}
          </Typography>
          <Stack spacing={1}>
            {unmatched.map((notice) => (
              <Paper key={notice.key} variant="outlined" sx={{ p: 1.25 }} data-testid="grant-notice-row">
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{notice.title}</Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  {notice.closes ? `Closes ${dateOf(notice.closes)} (${daysText(daysFrom(today, notice.closes))})` : 'No closing date stated'}
                </Typography>
                <NoticeDetail notice={notice} />
              </Paper>
            ))}
          </Stack>
        </Box>
      )}
    </Box>
  );
};

export default GrantsBoard;

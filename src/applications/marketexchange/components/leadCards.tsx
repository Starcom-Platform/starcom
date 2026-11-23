/**
 * A lead's detail on the Market Exchange's desk (decision D-LD, LD1): beside the list, whatever kind of
 * lead is chosen. A report says when it is dated, who published it, where it is about, the words that
 * routed it and the law they reach, and whose word the routing is (audit defect 5). A feed item says
 * what its source says, in its source's terms (D-BF). No person is named or placed.
 *
 * What it may pay comes first, on the row and at the head of the detail (critique C12, CR2): only what a
 * programme publishes, quoted from its own page and linked, or who decides where it publishes nothing, or
 * that nothing is paid. Never a figure of Starcom's, and never a promise.
 */
import React, { useContext, useState } from 'react';
import { Box, Button, ButtonBase, Chip, Link, Paper, Stack, Typography, Alert } from '@mui/material';
import { ARCHETYPE_LABELS, type Archetype } from '../../../services/exchange/opportunityAudience';
import type { Lead } from '../../../services/exchange/leads';
import type { FundingWindow } from '../../../services/exchange/feeds/grantsGov';
import type { RewardProgramme } from '../../../services/exchange/feeds/rewardProgrammes';
import type { SanctionsPublication } from '../../../services/exchange/feeds/sanctionsChanges';
import type { ExclusionMonth } from '../../../services/exchange/feeds/healthExclusions';
import { formatUtcDateTime } from '../../../utils/utcTime';
import { KIND_NAME, basisName, dateOf, daysFrom, daysText, monthName, tallySum, tallyText, topCounts, whenText } from './leadText';
import KeyName from '../../../components/Identity/KeyName';
import { Link as RouterLink, useInRouterContext } from 'react-router-dom';
import { caseFromLead } from '../../../services/exchange/leadCase';
import { caseManagerAdapter } from '../../../core/intel/adapters/caseManagerAdapter';
import { EnhancedApplicationRouterContext } from '../../../context/EnhancedApplicationRouterContext';
import { payLineOf, type PayLine } from '../../../services/exchange/payLine';
import { useAmountNotes } from '../../../services/exchange/useAmountNotes';

/** A quote in the programme's success green; who decides, or nothing paid, in the muted text (colour carries meaning). */
const payColor = (pay: PayLine) => (pay.kind === 'quoted' ? 'success.main' : 'text.secondary');

/** What it may pay, at the head of a lead's detail: the programme's words and where they are, and whose call it is. */
const PayBlock: React.FC<{ pay: PayLine }> = ({ pay }) => (
  <Box sx={{ borderLeft: '3px solid', borderColor: pay.kind === 'quoted' ? 'success.main' : 'divider', pl: 1, mb: 1 }} data-testid="lead-pay-detail" data-pay={pay.kind}>
    <Typography variant="overline" component="div" sx={{ lineHeight: 1.4 }}>What it may pay</Typography>
    <Typography variant="body2" sx={{ color: payColor(pay) }}>{pay.text}</Typography>
    {pay.source && (
      <Link href={pay.source.url} target="_blank" rel="noopener noreferrer" variant="body2">{`Read it on ${pay.source.label}`}</Link>
    )}
    {pay.kind !== 'none' && (
      <Typography variant="caption" color="text.secondary" component="div">
        The programme decides whether anything is paid, and how much. Starcom promises nothing, and this is not legal advice.
      </Typography>
    )}
  </Box>
);

/** How many organisations, vessels and aircraft a publication lists before saying how many more. */
const NAMED_LISTED = 12;

const Audiences: React.FC<{ audiences: readonly Archetype[] }> = ({ audiences }) => (
  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
    {audiences.map((a) => <Chip key={a} size="small" variant="outlined" label={ARCHETYPE_LABELS[a]} />)}
  </Stack>
);

/** The record's words with the part that routed it marked. */
function Marked({ text, phrase }: { text: string; phrase?: string }) {
  const at = phrase ? text.indexOf(phrase) : -1;
  if (!phrase || at < 0) return <>{text}</>;
  return <>{text.slice(0, at)}<mark data-testid="matched-phrase">{phrase}</mark>{text.slice(at + phrase.length)}</>;
}

const ReportDetail: React.FC<{ lead: Lead & { record: { kind: 'report' } } }> = ({ lead }) => {
  const { report, routing } = lead.record;
  const inTitle = !!routing.matched && report.title.includes(routing.matched);
  return (
    <>
      <Typography variant="body2" color="text.secondary" data-testid="lead-record">
        {`Dated ${formatUtcDateTime(new Date(report.createdAt).getTime(), { year: true })} · published by `}
        {/* By the name its key's own profile gives, never one coded here (D-MF, MF4). */}
        <KeyName pubkey={report.author} />
        {report.jurisdictions?.length ? ` · about ${report.jurisdictions.map((j) => j.toUpperCase()).join(', ')}` : null}
      </Typography>
      {routing.pattern && <Typography variant="body2" sx={{ mt: 1 }}>{routing.pattern}</Typography>}
      {routing.matched && (
        <Typography variant="body2" color="text.secondary" data-testid="why-here">
          {'Why it is here: '}
          <Marked text={inTitle ? report.title : routing.matched} phrase={routing.matched} />
        </Typography>
      )}
      {routing.statute && (
        <Alert severity="info" sx={{ mt: 1 }} data-testid="statute">
          <strong>{routing.statute.name}</strong>{` — decided by ${routing.statute.decidedBy}.`}
          {routing.statute.reference && (
            <>{' '}<Link href={routing.statute.reference} target="_blank" rel="noopener noreferrer">Read the programme</Link></>
          )}
        </Alert>
      )}
      <Typography variant="caption" color="text.secondary" component="div" data-testid="routing-basis" sx={{ mt: 1 }}>
        {routing.basis === 'declared' ? 'Audience stated by the publisher.' : 'Audience worked out here from the record, not stated by the publisher.'}
      </Typography>
    </>
  );
};

const FundingDetail: React.FC<{ window: FundingWindow; today: string }> = ({ window: w, today }) => (
  <>
    <Typography variant="body2" color="text.secondary" data-testid="lead-record">
      {[
        `Closes ${dateOf(w.closes)} (${daysText(daysFrom(today, w.closes))})`,
        w.opens ? `opened ${dateOf(w.opens)}` : null,
        w.agency || w.agencyCode,
        w.number || null,
        w.status === 'forecasted' ? 'forecast' : null,
      ].filter(Boolean).join(' · ')}
    </Typography>
    <Typography variant="body2" sx={{ mt: 1 }}>
      The agency awards it, on the notice&apos;s terms. Who it is offered to is worked out here from Grants.gov&apos;s funding category.
    </Typography>
  </>
);

const RewardDetail: React.FC<{ programme: RewardProgramme }> = ({ programme: p }) => (
  <>
    <Typography variant="body2">{p.paysFor}</Typography>
    <Typography variant="body2" sx={{ mt: 1 }} data-testid="reward-basis">
      {p.basis ? `${p.basis}; decided by ${p.decidedBy}. ` : `Decided by ${p.decidedBy}. `}
      {'Tips: '}
      <Link href={p.tip.url} target="_blank" rel="noopener noreferrer">{p.tip.label}</Link>
    </Typography>
    <Box component="ul" sx={{ m: '6px 0 0', pl: 2.5 }}>
      {p.kinds.map((k) => <li key={k.key} data-testid="reward-kind"><Typography variant="body2">{`${k.label}: ${new Intl.NumberFormat('en-GB').format(k.count)}`}</Typography></li>)}
    </Box>
    <Typography variant="caption" color="text.secondary" component="div">
      {`${new Intl.NumberFormat('en-GB').format(p.total)} notices open. ${p.leftOut} The programme decides any reward and its amount; no one is named or located here.`}
    </Typography>
  </>
);

const SanctionsDetail: React.FC<{ p: SanctionsPublication & { via: 'record' | 'file' } }> = ({ p }) => (
  <>
    <Typography variant="body2" data-testid="sanctions-tally">
      {[tallySum(p.added) && `Added: ${tallyText(p.added)}`, tallySum(p.removed) && `Removed: ${tallyText(p.removed)}`, p.amended && `Amended: ${p.amended} existing ${p.amended === 1 ? 'entry' : 'entries'}`].filter(Boolean).join('. ') || 'No entries changed.'}
    </Typography>
    {p.programmes.length > 0 && (
      <Typography variant="body2" color="text.secondary" data-testid="sanctions-programmes">
        {p.programmes.map((g) => `${g.code}${g.added ? ` +${g.added}` : ''}${g.removed ? ` −${g.removed}` : ''}`).join(' · ')}
      </Typography>
    )}
    {p.named.length > 0 && (
      <Box component="ul" sx={{ m: '6px 0 0', pl: 2.5 }}>
        {p.named.slice(0, NAMED_LISTED).map((n) => (
          <li key={`${n.action}-${n.type}-${n.name}`} data-testid="sanctions-named">
            <Typography variant="body2">{`${n.action === 'add' ? 'Added' : 'Removed'}: ${n.name} (${n.type.toLowerCase()}${n.countries.length ? `, ${n.countries.join(', ')}` : ''})`}</Typography>
          </li>
        ))}
      </Box>
    )}
    {p.named.length > NAMED_LISTED && (
      <Typography variant="caption" color="text.secondary" component="div">{`And ${p.named.length - NAMED_LISTED} more organisations, vessels or aircraft in OFAC's notice.`}</Typography>
    )}
    <Typography variant="caption" color="text.secondary" component="div">
      {`People are counted, never named. A designation is OFAC's; no reward is attached to it here.${p.via === 'record' ? ' Posted by Mecha Jono.' : ''}`}
    </Typography>
  </>
);

const ExclusionsDetail: React.FC<{ m: ExclusionMonth & { via: 'record' | 'file' } }> = ({ m }) => {
  const states = topCounts(m.byState, 10);
  const categories = topCounts(m.byCategory, 6);
  const bases = topCounts(m.byBasis, 6, basisName);
  return (
    <>
      <Typography variant="body2" data-testid="exclusion-counts">
        {`${m.exclusions} excluded (${m.people} ${m.people === 1 ? 'person' : 'people'}, ${m.exclusions - m.people} ${m.exclusions - m.people === 1 ? 'business' : 'businesses'}); ${m.reinstatements} reinstated.`}
      </Typography>
      <Typography variant="body2" color="text.secondary" data-testid="exclusion-bases">{`By basis: ${bases.shown.join('; ')}${bases.more ? `; and ${bases.more} more` : ''}.`}</Typography>
      <Typography variant="body2" color="text.secondary" data-testid="exclusion-states">{`By state: ${states.shown.join(', ')}${states.more ? `, and ${states.more} more` : ''}.`}</Typography>
      <Typography variant="body2" color="text.secondary">{`By category: ${categories.shown.join(', ')}${categories.more ? `, and ${categories.more} more` : ''}.`}</Typography>
      {m.organisations.length > 0 && (
        <Box component="ul" sx={{ m: '6px 0 0', pl: 2.5 }}>
          {m.organisations.map((o) => (
            <li key={`${o.name}-${o.state}`} data-testid="exclusion-organisation">
              <Typography variant="body2">{`${o.name} (${o.state}, ${o.category.toLowerCase()}): ${basisName(o.basis)}${o.date ? `, effective ${dateOf(o.date)}` : ''}`}</Typography>
            </li>
          ))}
        </Box>
      )}
      {m.practicesCounted > 0 && (
        <Typography variant="caption" color="text.secondary" component="div">
          {`${m.practicesCounted} professional ${m.practicesCounted === 1 ? 'practice' : 'practices'} under ${m.practicesCounted === 1 ? 'its' : 'their'} owner's name counted, not named.`}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" component="div">
        {"People are counted, never named. An exclusion is OIG's; no reward is attached to it here. To check a name, "}
        <Link href="https://exclusions.oig.hhs.gov/" target="_blank" rel="noopener noreferrer">search the LEIE</Link>
        {`.${m.via === 'record' ? ' Posted by Mecha Jono.' : ''}`}
      </Typography>
    </>
  );
};

/** The chosen lead in full, and what can be done with it (`actions`). */
export const LeadDetail: React.FC<{ lead: Lead; today: string; actions?: React.ReactNode }> = ({ lead, today, actions }) => {
  const r = lead.record;
  const amounts = useAmountNotes();
  // Starcom's own pages open in place inside the app's router; anywhere else, by address.
  const routed = useInRouterContext();
  const heading = r.kind === 'sanctions' ? `OFAC, ${dateOf(r.publication.date)}${r.publication.kind ? ` · ${r.publication.kind}` : ''}`
    : r.kind === 'exclusions' ? `${monthName(r.month.month)} supplement` : lead.title;
  return (
    <Box data-testid="lead-detail" data-kind={lead.kind}>
      <Typography variant="overline" component="div">{KIND_NAME[lead.kind]}</Typography>
      <Typography variant="subtitle1" component="h3" gutterBottom>
        {!lead.url ? heading
          : lead.url.startsWith('/') ? (routed ? <Link component={RouterLink} to={lead.url}>{heading}</Link> : <Link href={lead.url}>{heading}</Link>)
          : <Link href={lead.url} target="_blank" rel="noopener noreferrer">{heading}</Link>}
      </Typography>
      <PayBlock pay={payLineOf(lead, amounts)} />
      {r.kind === 'report' && <ReportDetail lead={lead as Lead & { record: { kind: 'report' } }} />}
      {r.kind === 'funding' && <FundingDetail window={r.window} today={today} />}
      {r.kind === 'reward' && <RewardDetail programme={r.programme} />}
      {r.kind === 'sanctions' && <SanctionsDetail p={r.publication} />}
      {r.kind === 'exclusions' && <ExclusionsDetail m={r.month} />}
      <Audiences audiences={lead.audiences} />
      {actions && <Box sx={{ mt: 1.5 }}>{actions}</Box>}
    </Box>
  );
};

/** What it may pay, under a row's title, before when and where from. */
const LeadPay: React.FC<{ lead: Lead }> = ({ lead }) => {
  const pay = payLineOf(lead, useAmountNotes());
  return <Typography variant="body2" component="div" sx={{ color: payColor(pay) }} data-testid="lead-pay" data-pay={pay.kind}>{pay.text}</Typography>;
};

/** A lead's row in a list: its kind, title, what it may pay, when, and where from; `mark` adds what else holds it (a notice). */
export const LeadRow: React.FC<{ lead: Lead; today: string; chosen: boolean; onChoose: (id: string) => void; mark?: React.ReactNode }> = ({ lead, today, chosen, onChoose, mark }) => (
  <Paper variant="outlined" sx={{ borderColor: chosen ? 'primary.main' : undefined }}>
    <ButtonBase
      onClick={() => onChoose(lead.id)}
      aria-pressed={chosen}
      data-testid="lead-row"
      data-kind={lead.kind}
      sx={{ display: 'block', width: '100%', textAlign: 'left', p: 1.25 }}
    >
      <Typography variant="overline" component="div" sx={{ lineHeight: 1.4 }}>{KIND_NAME[lead.kind]}</Typography>
      <Typography variant="body2" component="div" sx={{ fontWeight: 600 }}>{lead.title}</Typography>
      <LeadPay lead={lead} />
      <Typography variant="caption" color="text.secondary" component="div">
        {`${whenText(lead, today)} · `}
        {lead.kind === 'report' ? <KeyName pubkey={lead.source} /> : lead.source}
      </Typography>
      {mark}
    </ButtonBase>
  </Paper>
);

/**
 * A case seeded from the lead (LD3), opened in Cases. Shown only where the app's router is there to
 * open it: never a button that does nothing.
 */
export const StartCase: React.FC<{ lead: Lead }> = ({ lead }) => {
  const router = useContext(EnhancedApplicationRouterContext);
  const [failed, setFailed] = useState(false);
  if (!router) return null;
  const start = () => {
    setFailed(false);
    void caseManagerAdapter.addCase(caseFromLead(lead)).then(
      (id) => (id ? router.navigateToApp('cases', undefined, { selectCaseId: id }) : setFailed(true)),
      () => setFailed(true),
    );
  };
  return (
    <>
      <Button size="small" variant="outlined" onClick={start} data-testid="lead-start-case">Start a case</Button>
      {failed && <Typography variant="caption" color="error" component="div">The case could not be made.</Typography>}
    </>
  );
};

import React, { useMemo, useState } from 'react';
import { useApplicationRouter } from '../../../hooks/useApplicationRouter';
import { Box, Typography, Chip, Stack, Button, Collapse, IconButton, Alert } from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ExpandLess from '@mui/icons-material/ExpandLess';
import { useCorrelation } from '../state/CorrelationContext';
import { reviewFinding } from '../../../services/publishing/findings';
import { useWaitingFindings, claimsSlot, withOutbox } from '../../../services/intel/outbox/waitingFindings';
import { findingRelays } from '../../../services/intel/findings/FindingsBroadcastService';
import { destinationIsPublic, describeDestination } from '../../../services/nostr/publishTargets';
import { unmeasuredProvenance, fabricatedEvidence } from '../../../services/epistemic/epistemicLanguage';
import type { CorroboratedFinding } from '../state/correlationUtils';
import { attributeWords } from '../state/readableNames';

// 'queued' is a distinct state on purpose: the broadcast reached no relay,
// but the finding is durably queued for retry rather than lost. Collapsing
// it into 'error' would understate what happened; collapsing it into
// 'success' would claim the finding is public when it is not.
// 'refused' is its own state, distinct from 'error'. A refusal is a DECISION
// — the policy declined, nothing was signed and nothing was sent — while an
// error is an outage. Rendering a refusal as "Retry" invites the operator to
// mash a button that will keep saying no, and never tells them why.
type PublishState = 'idle' | 'publishing' | 'success' | 'queued' | 'error' | 'refused';

/**
 * FindingsPanel — the "Publish Finding" action (roadmap: "Findings
 * Publisher"). Lists corroborated findings (computeCorroboratedFindings:
 * 2+ independent sources, no unresolved conflict) with a deliberate,
 * one-at-a-time publish action per finding — never automatic the moment a
 * finding appears, matching "Publish to Navcom"'s own never-silent
 * discipline.
 */
const FindingsPanel: React.FC = () => {
  const { corroboratedFindings, excludedReports, names } = useCorrelation();
  const subjectOf = (f: CorroboratedFinding) => names.subject(f.entityRef);
  const { navigateToApp } = useApplicationRouter();
  const [expanded, setExpanded] = useState(true);
  const [publishState, setPublishState] = useState<Record<string, PublishState>>({});
  // What the outbox holds, so "Queued" survives a reload (plan item 9.4).
  const waitingFor = useWaitingFindings();
  const [refusalReason, setRefusalReason] = useState<Record<string, string>>({});

  /**
   * Where a finding goes, said BEFORE the button is pressed.
   *
   * The mission publish path has disclosed its destination for a while; this
   * one never has, and it is the more dangerous of the two — publishing a
   * finding is a single click from a list, with no dialog and no second step.
   * A relay list nobody can see is a promise about behaviour rather than a
   * statement of it, and this project has already published something
   * irretrievably while believing it was aimed elsewhere.
   */
  const relays = useMemo(() => findingRelays(), []);
  const publishIsPublic = useMemo(() => destinationIsPublic(relays), [relays]);

  /*
   * Returning null when there are no findings AND nothing was held back is
   * right — an empty panel for an empty corpus is just quiet.
   *
   * Returning null while drafts are sitting out of the evidence pool is not.
   * That is the case where an analyst has written reports, sees no findings,
   * and has no way to learn that the lifecycle gate is why.
   */
  if (corroboratedFindings.length === 0 && excludedReports.length === 0) return null;

  const keyFor = (f: CorroboratedFinding) => `${f.entityRef}||${f.attribute}`;

  const handlePublish = async (finding: CorroboratedFinding) => {
    const key = keyFor(finding);
    setPublishState(prev => ({ ...prev, [key]: 'publishing' }));
    try {
      // Through the publish review: the finding and where it goes are shown
      // before anything is signed (plan item 0.1). Cancel leaves it unpublished.
      const result = await reviewFinding(finding);
      if (!result) {
        setPublishState(prev => { const next = { ...prev }; delete next[key]; return next; });
        return;
      }
      if (result.refused) {
        setRefusalReason(prev => ({ ...prev, [key]: result.refused!.reason }));
        setPublishState(prev => ({ ...prev, [key]: 'refused' }));
        return;
      }
      const next: PublishState = result.broadcast.success
        ? 'success'
        : result.queued ? 'queued' : 'error';
      setPublishState(prev => ({ ...prev, [key]: next }));
    } catch {
      setPublishState(prev => ({ ...prev, [key]: 'error' }));
    }
  };

  return (
    <Box sx={{ p: 2, borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ cursor: 'pointer' }} onClick={() => setExpanded(v => !v)}>
        <Typography variant="subtitle2" component="h2" sx={{ color: '#00bfff', flex: 1 }}>
          Findings
        </Typography>
        <Chip
          label={corroboratedFindings.length}
          size="small"
          sx={{ backgroundColor: 'rgba(0, 255, 65, 0.2)', color: '#00ff41', border: '1px solid rgba(0, 255, 65, 0.3)' }}
        />
        <IconButton size="small" aria-label={expanded ? 'Collapse findings' : 'Expand findings'} sx={{ color: '#00bfff' }}>
          {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </IconButton>
      </Stack>
      <Collapse in={expanded}>
        <Stack spacing={1} sx={{ mt: 1 }}>
          {corroboratedFindings.length > 0 && (
            <Alert
              severity={publishIsPublic ? 'warning' : 'info'}
              data-testid="finding-destination"
              sx={{ py: 0, fontSize: '0.75rem' }}
            >
              {/* The app's one wording for where it goes (plan item 0.3): "nothing
                  leaves your network" only of relays that are on it. */}
              {describeDestination(relays)}
            </Alert>
          )}
          {excludedReports.length > 0 && (
            <Box
              sx={{
                p: 1, borderRadius: 1,
                backgroundColor: 'rgba(255, 193, 7, 0.08)',
                border: '1px solid rgba(255, 193, 7, 0.35)',
              }}
            >
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.78rem' }}>
                {excludedReports.length} report{excludedReports.length === 1 ? '' : 's'} not
                contributing evidence
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem' }}>
                {/* Naming the statuses rather than saying "some reports" — an
                    analyst can act on "3 drafts" and cannot act on "some". */}
                {Object.entries(
                  excludedReports.reduce<Record<string, number>>((acc, r) => {
                    acc[r.status] = (acc[r.status] ?? 0) + 1;
                    return acc;
                  }, {}),
                )
                  .map(([status, n]) => `${n} ${status.toLowerCase()}`)
                  .join(', ')}
                {' — submit a report for it to count as evidence.'}
              </Typography>
            </Box>
          )}
          {corroboratedFindings.map(f => {
            const key = keyFor(f);
            const state = withOutbox(publishState[key], waitingFor(claimsSlot(f.entityRef, f.attribute)));
            return (
              <Box
                key={key}
                data-testid="corroborated-finding"
                sx={{ p: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: 1, border: '1px solid rgba(255, 255, 255, 0.1)' }}
              >
                <Typography variant="body2" sx={{ color: 'white', fontSize: '0.8rem' }}>
                  {/* Names in place of ids, each id on hover (plan item 3.6). A
                      place finding's value is a position, said elsewhere. */}
                  <strong title={subjectOf(f) !== f.entityRef ? f.entityRef : undefined}>{subjectOf(f)}</strong>
                  {' — '}{attributeWords(f.attribute)}
                  {typeof f.value === 'string' && (
                    <>: <span title={names.value(f.attribute, f.value) !== f.value ? f.value : undefined}>{names.value(f.attribute, f.value)}</span></>
                  )}
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                  <Chip
                    label={`${Math.round(f.confidence * 100)}% confidence`}
                    size="small"
                    sx={{ backgroundColor: 'rgba(0, 191, 255, 0.15)', color: '#00bfff', fontSize: '0.7rem' }}
                  />
                  <Chip
                    label={`${f.sourceCount} sources`}
                    size="small"
                    sx={{ backgroundColor: 'rgba(255, 170, 0, 0.15)', color: '#ffaa00', fontSize: '0.7rem' }}
                  />
                  {/* THE SEAM. An analyst decided this warrants investigating
                      and had no way to act on it from here: they had to
                      remember what they saw, navigate to Cases, create one by
                      hand, and re-find the same evidence. The finding cannot
                      carry its sources — contributingFingerprints are hashes,
                      not report ids — so this carries the subject, which is
                      what makes the evidence findable at the other end. */}
                  <Button
                    size="small"
                    data-testid="open-case-from-finding"
                    onClick={() => navigateToApp('cases', undefined, { openCaseAbout: f.entityRef })}
                    sx={{ fontSize: '0.7rem', py: 0, minWidth: 0 }}
                  >
                    Open a case
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    data-testid="publish-finding"
                    /**
                     * Refused BEFORE the click, like the mission path.
                     *
                     * publicationPolicy refuses evidence that is not explicitly
                     * known-real — `undefined` as firmly as `true`, because
                     * "nobody said" is not permission. This panel used to offer
                     * the button anyway and report "Refused" afterwards, which
                     * teaches an operator that the control is unreliable rather
                     * than that their evidence is unmeasured.
                     */
                    disabled={state === 'publishing' || state === 'success' || f.isMock !== false}
                    color={state === 'success' ? 'success' : state === 'error' || state === 'refused' ? 'error' : state === 'queued' ? 'warning' : 'primary'}
                    onClick={() => handlePublish(f)}
                    sx={{ fontSize: '0.7rem', py: 0, minWidth: 0 }}
                  >
                    {state === 'publishing' ? 'Publishing…' : state === 'success' ? 'Published' : state === 'queued' ? 'Queued — not yet public' : state === 'refused' ? 'Refused' : state === 'error' ? 'Retry' : 'Publish Finding'}
                  </Button>
                </Stack>
                {/* Why the control is unavailable, stated where it is. A
                    disabled button with no sentence beside it is the same
                    failure as a refusal nobody can read. */}
                {f.isMock !== false && (
                  <Typography variant="caption" sx={{ color: '#ffaa00', display: 'block', mt: 0.5 }}>
                    {(f.isMock === true ? fabricatedEvidence() : unmeasuredProvenance()).text}
                  </Typography>
                )}
                {/* The reason, in full. A refusal the operator cannot read is
                    a button that stopped working for no stated cause. */}
                {state === 'refused' && refusalReason[key] && (
                  <Typography variant="caption" sx={{ color: '#ff8a80', display: 'block', mt: 0.5 }}>
                    {refusalReason[key]}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Stack>
      </Collapse>
    </Box>
  );
};

export default FindingsPanel;

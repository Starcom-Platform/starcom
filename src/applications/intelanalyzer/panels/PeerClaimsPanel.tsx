import React, { useState } from 'react';
import { useApplicationRouter } from '../../../hooks/useApplicationRouter';
import { Box, Typography, Chip, Stack, Button, Collapse, IconButton, MenuItem, Select } from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ExpandLess from '@mui/icons-material/ExpandLess';
import { useCorrelation } from '../state/CorrelationContext';
import { reviewRefutation } from '../../../services/publishing/findings';
import { useWaitingFindings, refutesClaim, withOutbox } from '../../../services/intel/outbox/waitingFindings';
import type { RefutationGround } from '../../../services/intel/findings/refutation';
import type { SubjectKind } from '../../../types/intel/SourceObservation';
import { noRefutationReceived } from '../../../services/epistemic/epistemicLanguage';
import KeyName from '../../../components/Identity/KeyName';

type RefuteState = 'idle' | 'publishing' | 'success' | 'queued' | 'error' | 'refused';

const GROUNDS: Array<{ value: RefutationGround; label: string }> = [
  { value: 'contradicting-evidence', label: 'I hold conflicting observations' },
  { value: 'failed-reproduction', label: 'I ran their method and did not get their result' },
  { value: 'source-defect', label: 'A source it depends on is discredited' },
  { value: 'superseded-by-time', label: 'It was true and no longer is' },
];

/**
 * PeerClaimsPanel — what other instances say about the things we investigate,
 * and the means to argue back.
 *
 * ─── WHY THIS PANEL EXISTS ─────────────────────────────────────────────────
 *
 * Foreign findings were ingested, verified, assessed for independence, and
 * displayed nowhere. The analysis surface could show only what this instance
 * concluded by itself, so an operator had no way to see that a peer disagreed
 * — and no way to disagree with a peer.
 *
 * ─── WHY DISAGREEMENT IS SHOWN FIRST ───────────────────────────────────────
 *
 * `contested` leads, and claims of OUR OWN lead within it. An interface that
 * surfaces agreement prominently and disagreement quietly reports consensus
 * whether or not consensus exists. The most useful thing on this screen is a
 * refutation of something we published.
 *
 * ─── WHY REFUTING REQUIRES A LOCAL FINDING ─────────────────────────────────
 *
 * The Refute control is offered only where this instance holds its own
 * corroborated finding on the same subject and attribute, because that finding
 * IS the evidence the refutation carries. There is deliberately no path here to
 * publish "wrong" with nothing behind it: a refutation with no weighable method
 * is refused on receipt by every conforming node, and the NIP's stated reason
 * is that otherwise the cheapest possible message outweighs expensive evidence.
 */
const PeerClaimsPanel: React.FC = () => {
  const { foreignAgreement, contested, corroboratedFindings } = useCorrelation();
  const { navigateToApp } = useApplicationRouter();
  const [expanded, setExpanded] = useState(true);
  const [refuteState, setRefuteState] = useState<Record<string, RefuteState>>({});
  // What the outbox holds, so "Queued" survives a reload (plan item 9.4).
  const waitingFor = useWaitingFindings();
  const [ground, setGround] = useState<Record<string, RefutationGround>>({});
  const [refusalReason, setRefusalReason] = useState<Record<string, string>>({});

  if (foreignAgreement.length === 0 && contested.length === 0) return null;

  const keyFor = (author: string, subject: string, attribute: string, publishedAt: string) =>
    `${author}||${subject}||${attribute}||${publishedAt}`;

  const localEvidenceFor = (subjectRef: string, attribute: string) =>
    corroboratedFindings.find((f) => f.entityRef === subjectRef && f.attribute === attribute);

  const handleRefute = async (peer: typeof foreignAgreement[number]) => {
    const key = keyFor(peer.authorPubkey, peer.entityRef, peer.attribute, peer.publishedAt);
    const evidence = localEvidenceFor(peer.entityRef, peer.attribute);
    if (!evidence) return;

    setRefuteState((p) => ({ ...p, [key]: 'publishing' }));
    try {
      // Through the publish review (plan item 0.1).
      const result = await reviewRefutation(
        {
          subjectRef: peer.entityRef,
          attribute: peer.attribute,
          authorPubkey: peer.authorPubkey,
          // The version being argued with, never "their latest". A refutation
          // is about a claim as it was made.
          publishedAt: peer.publishedAt,
        },
        ground[key] ?? 'contradicting-evidence',
        evidence,
        peer.subjectKind as SubjectKind,
      );
      if (!result) {
        setRefuteState((p) => { const next = { ...p }; delete next[key]; return next; });
        return;
      }
      if (result.refused) {
        setRefusalReason((p) => ({ ...p, [key]: result.refused!.reason }));
        setRefuteState((p) => ({ ...p, [key]: 'refused' }));
        return;
      }
      setRefuteState((p) => ({
        ...p,
        [key]: result.broadcast.success ? 'success' : result.queued ? 'queued' : 'error',
      }));
    } catch {
      setRefuteState((p) => ({ ...p, [key]: 'error' }));
    }
  };

  // Ours first: a refutation of something we published is the most useful
  // thing here, and burying it among other people's arguments would hide it.
  const contestedSorted = [...contested].sort((a, b) => Number(b.mine) - Number(a.mine));

  return (
    <Box data-testid="peer-claims-panel" sx={{ p: 2, borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ cursor: 'pointer' }} onClick={() => setExpanded((v) => !v)}>
        <Typography variant="subtitle2" component="h2" sx={{ color: '#00bfff', flex: 1 }}>
          Peer claims
        </Typography>
        {contested.length > 0 && (
          <Chip
            label={`${contested.length} contested`}
            size="small"
            sx={{ backgroundColor: 'rgba(255, 138, 128, 0.15)', color: '#ff8a80', fontSize: '0.7rem' }}
          />
        )}
        <Chip label={foreignAgreement.length} size="small" sx={{ backgroundColor: 'rgba(0, 191, 255, 0.15)', color: '#00bfff', fontSize: '0.7rem' }} />
        <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.6)' }}>
          {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </IconButton>
      </Stack>

      <Collapse in={expanded}>
        <Stack spacing={1} sx={{ mt: 1 }}>
          {/* Said plainly, because an empty contested list is the one thing on
              this panel a reader will misread as consensus. */}
          {contested.length === 0 && foreignAgreement.length > 0 && (
            <Typography variant="caption" data-testid="no-refutation" sx={{ color: 'rgba(255,255,255,0.55)' }}>
              {noRefutationReceived().text}
            </Typography>
          )}
          {contestedSorted.map((c) => (
            <Box
              key={`${c.authorPubkey}-${c.subjectRef}-${c.attribute}`}
              data-testid={c.mine ? 'contested-ours' : 'contested-peer'}
              sx={{
                p: 1, borderRadius: 1,
                backgroundColor: c.mine ? 'rgba(255, 138, 128, 0.08)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${c.mine ? 'rgba(255,138,128,0.35)' : 'rgba(255,255,255,0.1)'}`,
              }}
            >
              <Typography variant="body2" sx={{ color: 'white', fontSize: '0.8rem' }}>
                <strong>{c.subjectRef}</strong> — {c.attribute}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                {/* "Ours" is stated plainly. A claim of our own that somebody
                    has argued with is not a peer's problem to notice. */}
                {c.mine && <Chip label="our claim" size="small" sx={{ backgroundColor: 'rgba(255,138,128,0.2)', color: '#ff8a80', fontSize: '0.7rem' }} />}
                <Chip
                  label={c.state}
                  size="small"
                  sx={{
                    backgroundColor: c.state === 'refuted' ? 'rgba(255,82,82,0.2)' : 'rgba(255,170,0,0.15)',
                    color: c.state === 'refuted' ? '#ff5252' : '#ffaa00',
                    fontSize: '0.7rem',
                  }}
                />
                <Chip label={`${c.refutations} refutation${c.refutations === 1 ? '' : 's'}`} size="small" sx={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem' }} />
              </Stack>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mt: 0.5 }}>
                {c.grounds.join(', ')}
              </Typography>
              {/* A peer disagreeing with us is the strongest reason to open an
                  investigation on this screen, and it had nowhere to go. */}
              <Button
                size="small"
                data-testid="open-case-from-contested"
                onClick={() => navigateToApp('cases', undefined, { openCaseAbout: c.subjectRef })}
                sx={{ fontSize: '0.7rem', py: 0, minWidth: 0, mt: 0.5 }}
              >
                Open a case
              </Button>
            </Box>
          ))}

          {foreignAgreement.map((peer) => {
            const key = keyFor(peer.authorPubkey, peer.entityRef, peer.attribute, peer.publishedAt);
            const state = withOutbox(refuteState[key], waitingFor(refutesClaim({ authorPubkey: peer.authorPubkey, subjectRef: peer.entityRef, attribute: peer.attribute, publishedAt: peer.publishedAt })));
            const evidence = localEvidenceFor(peer.entityRef, peer.attribute);
            return (
              <Box key={key} data-testid="peer-claim" sx={{ p: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 1, border: '1px solid rgba(255,255,255,0.1)' }}>
                <Typography variant="body2" sx={{ color: 'white', fontSize: '0.8rem' }}>
                  <strong>{peer.entityRef}</strong> — {peer.attribute}
                </Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}>
                  <KeyName pubkey={peer.authorPubkey} />
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap' }}>
                  <Chip label={`weight ${peer.weight.toFixed(2)}`} size="small" sx={{ backgroundColor: 'rgba(0,191,255,0.15)', color: '#00bfff', fontSize: '0.7rem' }} />
                  {/* Agreement alone is not information: an instance that
                      reached our conclusion from our evidence has echoed. */}
                  <Chip label={peer.independence} size="small" sx={{ backgroundColor: 'rgba(255,170,0,0.15)', color: '#ffaa00', fontSize: '0.7rem' }} />
                  <Chip label={`adds ${peer.corroborationValue.toFixed(2)}`} size="small" sx={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem' }} />
                </Stack>

                {evidence ? (
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, flexWrap: 'wrap' }}>
                    <Select
                      size="small"
                      value={ground[key] ?? 'contradicting-evidence'}
                      onChange={(e) => setGround((p) => ({ ...p, [key]: e.target.value as RefutationGround }))}
                      sx={{ fontSize: '0.7rem', color: 'white', '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                      inputProps={{ 'data-testid': 'refutation-ground' }}
                    >
                      {GROUNDS.map((g) => (
                        <MenuItem key={g.value} value={g.value} sx={{ fontSize: '0.75rem' }}>{g.label}</MenuItem>
                      ))}
                    </Select>
                    <Button
                      size="small"
                      variant="outlined"
                      data-testid="refute-claim"
                      color={state === 'success' ? 'success' : state === 'error' || state === 'refused' ? 'error' : state === 'queued' ? 'warning' : 'primary'}
                      disabled={state === 'publishing' || state === 'success'}
                      onClick={() => handleRefute(peer)}
                      sx={{ fontSize: '0.7rem', py: 0, minWidth: 0 }}
                    >
                      {state === 'publishing' ? 'Publishing…'
                        : state === 'success' ? 'Refutation published'
                        : state === 'queued' ? 'Queued — not yet public'
                        : state === 'refused' ? 'Refused'
                        : state === 'error' ? 'Retry' : 'Refute'}
                    </Button>
                  </Stack>
                ) : (
                  /* Not a disabled button. Explaining that evidence is the
                     requirement is the point; a greyed control with no reason
                     reads as broken. */
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', display: 'block', mt: 1 }}>
                    No local finding on this subject — refuting requires evidence of your own.
                  </Typography>
                )}

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

export default PeerClaimsPanel;

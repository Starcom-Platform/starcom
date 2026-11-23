import React, { useEffect, useState } from 'react';
import { Box, Button, Chip, Collapse, IconButton, Stack, Typography } from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ExpandLess from '@mui/icons-material/ExpandLess';
import { useCorrelation } from '../state/CorrelationContext';
import { publishedFindingsLedger } from '../../../services/intel/findings/PublishedFindingsLedger';
import { federationIngestService } from '../../../services/intel/federation/FederationIngestService';
import { findingReviewTarget } from '../../../services/reviews/reviewTargets';
import { noRefutationReceived } from '../../../services/epistemic/epistemicLanguage';
import ReviewsPanel from '../../../components/Reviews/ReviewsPanel';

/**
 * The claims this node published, each with what came back about it (plan
 * item 5.1): the refutations received, how many other nodes published about
 * the same subject and attribute, and the reviews, in one place.
 *
 * Our claims were listed only once somebody had refuted them (PeerClaimsPanel),
 * so a claim nobody had argued with had nowhere to be read back or reviewed.
 * Other nodes on the same slot are counted as exactly that: their values may
 * agree or not, and this does not say which.
 */
const PublishedClaimsPanel: React.FC = () => {
  const { contested } = useCorrelation();
  const [expanded, setExpanded] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);
  // Read again whenever the ledger changes: a claim published or withdrawn
  // elsewhere did not show until something else re-rendered this.
  const [, setVersion] = useState(0);
  useEffect(() => publishedFindingsLedger.subscribe(() => setVersion((v) => v + 1)), []);
  const claims = publishedFindingsLedger.live();
  if (claims.length === 0) return null;

  return (
    <Box data-testid="published-claims-panel" sx={{ p: 2, borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ cursor: 'pointer' }} onClick={() => setExpanded((v) => !v)}>
        <Typography variant="subtitle2" component="h2" sx={{ color: '#00bfff', flex: 1 }}>
          Claims you published
        </Typography>
        <Chip label={claims.length} size="small" sx={{ backgroundColor: 'rgba(0, 191, 255, 0.15)', color: '#00bfff', fontSize: '0.7rem' }} />
        <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.6)' }}>
          {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </IconButton>
      </Stack>
      <Collapse in={expanded}>
        <Stack spacing={1} sx={{ mt: 1 }}>
          {claims.map((entry) => {
            const { subjectRef, attribute } = entry.content.claim;
            const argued = contested.find((c) => c.mine && c.subjectRef === subjectRef && c.attribute === attribute);
            const others = federationIngestService.store.forSlot(entry.slot).length;
            const target = findingReviewTarget(entry);
            return (
              <Box
                key={entry.slot}
                data-testid={`published-claim-${entry.slot}`}
                sx={{ p: 1, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <Typography variant="body2" sx={{ color: 'white', fontSize: '0.8rem' }}>
                  <strong>{subjectRef}</strong> — {attribute}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
                  {argued ? (
                    <>
                      <Chip label={argued.state} size="small" sx={{ backgroundColor: argued.state === 'refuted' ? 'rgba(255,82,82,0.2)' : 'rgba(255,170,0,0.15)', color: argued.state === 'refuted' ? '#ff5252' : '#ffaa00', fontSize: '0.7rem' }} />
                      <Chip label={`${argued.refutations} refutation${argued.refutations === 1 ? '' : 's'}`} size="small" sx={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem' }} />
                    </>
                  ) : (
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)' }}>{noRefutationReceived().text}</Typography>
                  )}
                </Stack>
                {others > 0 && (
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mt: 0.5 }}>
                    {others} other node{others === 1 ? '' : 's'} published about the same subject and attribute.
                  </Typography>
                )}
                {target ? (
                  <Button size="small" onClick={() => setReviewing((open) => (open === entry.slot ? null : entry.slot))} sx={{ fontSize: '0.7rem', py: 0, minWidth: 0, mt: 0.5 }} aria-expanded={reviewing === entry.slot}>
                    Reviews
                  </Button>
                ) : (
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mt: 0.5 }}>
                    Published before its address was kept, so it cannot be reviewed here.
                  </Typography>
                )}
                {target && reviewing === entry.slot && (
                  <Box sx={{ mt: 1 }} data-testid="published-claim-reviews">
                    <ReviewsPanel target={target} itemTitle={`${subjectRef} — ${attribute}`} />
                  </Box>
                )}
              </Box>
            );
          })}
        </Stack>
      </Collapse>
    </Box>
  );
};

export default PublishedClaimsPanel;

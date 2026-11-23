import React, { useState } from 'react';
import { Box, Typography, Chip, Stack, Button, Collapse, IconButton, Tooltip } from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ExpandLess from '@mui/icons-material/ExpandLess';
import { useCorrelation } from '../state/CorrelationContext';
import { useApplicationRouter } from '../../../hooks/useApplicationRouter';
import type { CorroborationGap } from '../state/correlationUtils';
import { attributeWords } from '../state/readableNames';
import { singleSourceClaims, singleSourceExplainer, fabricatedRecordLabel } from '../../../services/epistemic/epistemicLanguage';

/** Enough to be useful, few enough to stay a prompt rather than a backlog. */
const VISIBLE_LIMIT = 8;

/**
 * CorroborationGapsPanel — the analysis -> collection loop-back.
 *
 * FindingsPanel answers "what is corroborated?" This answers the question
 * that actually sends someone back out: "what is one source away from being
 * corroborated?" The corroboration pass already computes independence for
 * every claim and discards everything below two feeds; this surfaces that
 * discarded set (see computeCorroborationGaps) and hands each entry to
 * NetRunner with the subject pre-filled.
 *
 * Deliberately NOT publishable. A gap is a prompt for work, not evidence —
 * there is no "publish" action here and there should never be one. It is also
 * not a conflict: nothing disagrees with these claims, they are simply alone,
 * and entities with a real disagreement are excluded upstream.
 */
const CorroborationGapsPanel: React.FC = () => {
  const { corroborationGaps, names } = useCorrelation();
  const { navigateToApp } = useApplicationRouter();
  const [expanded, setExpanded] = useState(true);

  // An empty panel for a corpus with nothing thin is just quiet — unlike
  // FindingsPanel, there is no held-back state worth explaining here.
  if (corroborationGaps.length === 0) return null;

  const collect = (gap: CorroborationGap) => {
    // NetRunner reads initialTarget from its application context; see
    // NetRunnerApplication. The entity is the search subject — the attribute
    // is what we want corroborated ABOUT it, not a query term. It goes by its
    // id, not its shown name: an LEI names one company exactly.
    navigateToApp('netrunner', 'standalone', { initialTarget: gap.entityRef });
  };

  const shown = corroborationGaps.slice(0, VISIBLE_LIMIT);
  const hidden = corroborationGaps.length - shown.length;

  return (
    <Box sx={{ p: 1.5, borderTop: '1px solid rgba(255,255,255,0.08)' }} data-testid="corroboration-gaps-panel">
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2" component="h2" sx={{ color: '#ffb74d' }}>
          {singleSourceClaims(corroborationGaps.length).text}
        </Typography>
        <IconButton size="small" onClick={() => setExpanded(e => !e)} aria-label={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
          {singleSourceExplainer()}
        </Typography>

        <Stack spacing={1}>
          {shown.map((gap) => {
            // Names in place of ids, each id on hover (plan item 3.6).
            const subject = names.subject(gap.entityRef);
            const value = names.value(gap.attribute, gap.value);
            const feed = names.feed(gap.sourceId);
            return (
              <Box
                key={`${gap.entityRef}||${gap.attribute}`}
                data-testid="corroboration-gap"
                sx={{
                  p: 1,
                  borderLeft: '2px solid rgba(255, 183, 77, 0.5)',
                  background: 'rgba(255,255,255,0.02)',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600 }} title={subject !== gap.entityRef ? gap.entityRef : undefined}>
                  {subject}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                  {attributeWords(gap.attribute)}: <span title={value !== gap.value ? gap.value : undefined}>{value}</span>
                </Typography>

                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Tooltip title={`The one source behind this claim: ${gap.sourceId}`}>
                    <Chip label={feed} size="small" variant="outlined" />
                  </Tooltip>
                  {gap.isMock && (
                    <Tooltip title="Backed by fabricated data — collecting against it proves nothing">
                      <Chip label={fabricatedRecordLabel()} size="small" color="warning" />
                    </Tooltip>
                  )}
                  <Box sx={{ flexGrow: 1 }} />
                  <Button
                    size="small"
                    onClick={() => collect(gap)}
                    data-testid="collect-action"
                  >
                    Find a second source →
                  </Button>
                </Stack>
              </Box>
            );
          })}
        </Stack>

        {hidden > 0 && (
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
            +{hidden} more not shown
          </Typography>
        )}
      </Collapse>
    </Box>
  );
};

export default CorroborationGapsPanel;

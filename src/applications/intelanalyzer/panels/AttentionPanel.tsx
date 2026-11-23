import React from 'react';
import { unmeasuredProvenance } from '../../../services/epistemic/epistemicLanguage';
import { Box, Typography, Chip, Stack, Button, Tooltip } from '@mui/material';
import type { AttentionItem, AttentionState } from '../../../services/intel/attention/AttentionItem';
import type { QueueSnapshot } from '../../../services/intel/attention/AttentionQueue';

/**
 * What needs attention — Phase I.B's queue, rendered.
 *
 * Presentational by design: it takes a snapshot and an action callback and
 * owns no logic worth testing. The rules that decide what appears, how it
 * ranks, and what the badge counts live in AttentionQueue and the producers,
 * which is where the tests are. A panel that computed its own ordering would
 * make the queue's guarantees unverifiable from outside the UI.
 */
export interface AttentionPanelProps {
  snapshot: QueueSnapshot;
  onSetState: (id: string, state: AttentionState) => void;
  /**
   * Withdraw a claim this instance published.
   *
   * Offered only on decayed-finding items, because it is the only reason in
   * the queue whose subject is something WE said. Acting on the others means
   * going and looking at evidence; acting on this one means deciding whether
   * to keep standing behind a claim, which is a decision the queue can carry
   * end to end.
   */
  onRetract?: (item: AttentionItem) => void;
  /** Open the mission an item is about (plan item 2.5). */
  onOpenMission?: (missionId: string) => void;
  /** Change the distribution of a record an upgrade may have made Public (plan item 9.6). */
  onSetDistribution?: (item: AttentionItem, visibility: 'limited' | 'private') => void;
  /** Why an action on an item did not happen, by item id: a change of distribution, a withdrawal. */
  itemRefusals?: Record<string, string>;
}

const severityChip = (s: number) =>
  s >= 0.75 ? { label: 'high', color: 'error' as const }
  : s >= 0.4 ? { label: 'medium', color: 'warning' as const }
  : { label: 'low', color: 'default' as const };

const AttentionPanel: React.FC<AttentionPanelProps> = ({ snapshot, onSetState, onRetract, onOpenMission, onSetDistribution, itemRefusals }) => {
  const { items, failures, quiet } = snapshot;

  return (
    <Box sx={{ p: 1.5 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle2" component="h2">Needs attention</Typography>
        {/* Counts actionable items only — see QueueSnapshot.actionableCount. */}
        {snapshot.actionableCount > 0 && (
          <Chip size="small" color="warning" label={snapshot.actionableCount} />
        )}
      </Stack>

      {/* A failed producer is reported, never absorbed into a shorter list.
          Fewer items must not be able to masquerade as a calmer world. */}
      {failures.map((f) => (
        <Box key={f.producer} sx={{ mb: 1, p: 1, border: '1px solid', borderColor: 'error.main', borderRadius: 1 }}>
          <Typography variant="caption" color="error">
            {f.producer} failed — this list is incomplete, not short. ({f.message})
          </Typography>
        </Box>
      ))}

      {/* A real state with its own words. "Nothing needs your attention" and
          "the queue is broken" must never look the same. */}
      {quiet && (
        <Typography variant="body2" color="text.secondary">
          Nothing needs your attention. Every producer ran and found nothing.
        </Typography>
      )}

      {!quiet && items.length === 0 && failures.length > 0 && (
        <Typography variant="body2" color="error">
          No items to show, because the checks listed above did not run. This is not "all clear".
        </Typography>
      )}

      {/* Truncation is stated. A list that quietly stops teaches its reader
          that the bottom of the list is the end of the work. */}
      {snapshot.hiddenByBudget > 0 && (
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
          Showing the {items.length} most pressing of {snapshot.actionableCount}. {snapshot.hiddenByBudget} not
          shown — least severe and most recently raised are cut first, so nothing waits forever.
        </Typography>
      )}

      <Stack spacing={1}>
        {items.map((item: AttentionItem) => {
          const sev = severityChip(item.severity);
          return (
            <Box key={item.id} sx={{ p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.subject}</Typography>
                <Chip size="small" label={sev.label} color={sev.color} />
                {/* Provenance is labelled ON the item, not in a settings
                    screen nobody has open — and "unverified" is shown as its
                    own state rather than being quietly treated as real. */}
                {item.evidenceProvenance === 'mock' && <Chip size="small" color="secondary" label="MOCK DATA" />}
                {item.evidenceProvenance === 'unknown' && (
                  <Tooltip title={unmeasuredProvenance().text}>
                    <Chip size="small" variant="outlined" label="provenance unverified" />
                  </Tooltip>
                )}
                {item.state === 'acknowledged' && <Chip size="small" variant="outlined" label="acknowledged" />}
              </Stack>

              {/* Every item explains itself, in one sentence naming the rule. */}
              <Typography variant="caption" color="text.secondary" display="block">
                {item.explanation}
              </Typography>

              <Tooltip title={`Raised by ${item.producedBy}, first seen ${item.firstSeen}`}>
                <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 0.25 }}>
                  {/* An ask taken on from a package has neither a case nor a mission. */}
                  {item.reason}{!item.missionId && item.caseId ? ` · case ${item.caseId}` : ''}
                </Typography>
              </Tooltip>

              <Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
                {item.state === 'new' && (
                  <Button size="small" onClick={() => onSetState(item.id, 'acknowledged')}>Acknowledge</Button>
                )}
                {onOpenMission && item.missionId && (
                  <Button size="small" onClick={() => onOpenMission(item.missionId!)}>Open the mission</Button>
                )}
                {onRetract && item.reason === 'published-finding-decayed' && (
                  <Button size="small" color="warning" onClick={() => onRetract(item)}>Retract</Button>
                )}
                {/* Kept or changed here, so the list is reviewed once rather than record by record. */}
                {onSetDistribution && item.distributionOf && (
                  <>
                    <Button size="small" onClick={() => onSetState(item.id, 'resolved')}>Keep Public</Button>
                    {!item.distributionOf.locked && (
                      <>
                        <Button size="small" onClick={() => onSetDistribution(item, 'limited')}>Make it Limited</Button>
                        <Button size="small" onClick={() => onSetDistribution(item, 'private')}>Make it Private</Button>
                      </>
                    )}
                  </>
                )}
                <Button size="small" onClick={() => onSetState(item.id, 'resolved')}>Resolved</Button>
                <Button size="small" color="inherit" onClick={() => onSetState(item.id, 'dismissed')}>Dismiss</Button>
              </Stack>
              {itemRefusals?.[item.id] && (
                <Typography variant="caption" color="error" display="block" role="alert" sx={{ mt: 0.5 }}>
                  {itemRefusals[item.id]}
                </Typography>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
};

export default AttentionPanel;

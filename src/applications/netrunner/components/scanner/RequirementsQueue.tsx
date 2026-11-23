/**
 * What the investigations have asked for, shown where collection happens.
 *
 * ─── WHY ───────────────────────────────────────────────────────────────────
 *
 * Cases can record what they still need — a question, and the decision waiting
 * on it — and nothing on the collection side has ever been able to see one.
 * Verified in a browser: raise a requirement on a case, open NetRunner, and it
 * appears nowhere.
 *
 * So the loop runs one way. Investigation emits demand and collection never
 * receives it, which means what gets collected is bounded by what an analyst
 * happens to remember. That is the ceiling on throughput here, and no amount of
 * faster scanning raises it.
 *
 * ─── WHY IT SITS ABOVE THE TOOLS ───────────────────────────────────────────
 *
 * Reading order is the argument: what has been asked for, then the means to go
 * and find it. A queue below the search box is a queue nobody reads.
 */
import React, { useEffect, useState } from 'react';
import { Box, Card, CardContent, Chip, Typography } from '@mui/material';
import { ClipboardList } from 'lucide-react';

import { caseManagerAdapter } from '../../../../core/intel/adapters/caseManagerAdapter';
import { intelReportService } from '../../../../services/intel/IntelReportService';
import KeyName from '../../../../components/Identity/KeyName';
import {
  collectionQueue,
  fieldDispatchable,
  type CollectionRequirement,
  type RequirementStatus,
} from '../../../../services/intel/collection/collectionRequirement';

const ACCENT = '#00f5ff';
const MONO = "var(--sc-font-data)";
const DISPLAY = "var(--sc-font-text)";

interface QueueRow {
  requirement: CollectionRequirement;
  status: RequirementStatus;
  caseTitle: string;
}

const stateColour = (state: RequirementStatus['state']): string =>
  state === 'stale' ? '#ff5555'
    : state === 'pending-evidence' ? '#ff9955'
      : '#aaaaaa';

/**
 * How long is left, said in a way that does not turn absence into comfort.
 *
 * hoursRemaining is null when no deadline was set. "No deadline" is not
 * "plenty of time", and rendering an empty space for it would let a reader
 * supply the more flattering meaning.
 */
function timing(status: RequirementStatus): string {
  if (status.hoursRemaining === null) return 'no deadline set';
  if (status.hoursRemaining < 0) return `${Math.abs(Math.round(status.hoursRemaining))}h past useful`;
  return `${Math.round(status.hoursRemaining)}h left`;
}

const RequirementsQueue: React.FC = () => {
  const [rows, setRows] = useState<QueueRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [cases, reports] = await Promise.all([
          caseManagerAdapter.getCases(),
          intelReportService.listReports(),
        ]);
        // requirementStatus derives from the answering report's STAGE rather
        // than from a stored flag: a draft linked as an answer does not answer
        // anything, and asking the report is the only way to know.
        const stageOf = (reportId: string) => reports.find((r) => r.id === reportId)?.status;

        const collected: QueueRow[] = [];
        for (const item of cases) {
          const requirements = item.requirements ?? [];
          if (requirements.length === 0) continue;
          // collectionQueue already drops answered and closed, and orders by
          // what the evidence decides — undated last rather than first.
          for (const entry of collectionQueue(requirements, stageOf)) {
            collected.push({ requirement: entry.requirement, status: entry.status, caseTitle: item.title });
          }
        }
        if (!cancelled) setRows(collected);
      } catch {
        // An empty queue and an unreadable one are different claims; null keeps
        // them distinguishable rather than showing "nothing needed".
        if (!cancelled) setRows(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Nothing outstanding is not worth a panel; silence is the right size for it.
  if (rows === null || rows.length === 0) return null;

  const open = rows;

  return (
    <Card sx={{ backgroundColor: '#0a0a0a', border: `1px solid ${ACCENT}`, borderRadius: 0 }}>
      <CardContent sx={{ p: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
          <ClipboardList size={14} color={ACCENT} />
          <Typography sx={{ color: ACCENT, fontFamily: DISPLAY, fontSize: '0.75rem', letterSpacing: '0.1em' }}>
            ASKED FOR — {open.length}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
          {open.slice(0, 8).map(({ requirement, status, caseTitle }) => (
            <Box key={requirement.id} sx={{ borderLeft: `2px solid ${stateColour(status.state)}`, pl: 1 }}>
              <Typography sx={{ color: '#fff', fontFamily: MONO, fontSize: '0.7rem' }}>
                {requirement.question}
              </Typography>
              {/* The decision waiting on it — a collector choosing what to
                  chase next needs to know what turns on it. */}
              <Typography sx={{ color: '#888', fontFamily: MONO, fontSize: '0.63rem' }}>
                {requirement.because}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.3, flexWrap: 'wrap' }}>
                <Chip size="small" label={caseTitle.slice(0, 34)}
                  sx={{ borderRadius: 0, height: 16, fontFamily: MONO, fontSize: '0.55rem', color: '#aaa', border: '1px solid #333', backgroundColor: 'transparent' }} />
                <Chip size="small" label={status.state}
                  sx={{ borderRadius: 0, height: 16, fontFamily: MONO, fontSize: '0.55rem', color: stateColour(status.state), border: `1px solid ${stateColour(status.state)}`, backgroundColor: 'transparent' }} />
                <Chip size="small" label={timing(status)}
                  sx={{ borderRadius: 0, height: 16, fontFamily: MONO, fontSize: '0.55rem', color: '#888', border: '1px solid #333', backgroundColor: 'transparent' }} />
                {/* Linked and actually-evidential are different numbers, and
                    the gap between them is the honest part: three drafts
                    attached to a question have answered nothing. */}
                {status.offered > 0 && (
                  <Chip size="small" label={`${status.evidential}/${status.offered} count as evidence`}
                    sx={{ borderRadius: 0, height: 16, fontFamily: MONO, fontSize: '0.55rem', color: status.evidential === 0 ? '#ff9955' : '#8fb3c7', border: '1px solid #333', backgroundColor: 'transparent' }} />
                )}
                {requirement.claimedBy && (
                  <Chip size="small" label={<>taken by <KeyName pubkey={requirement.claimedBy.by} /></>}
                    sx={{ borderRadius: 0, height: 16, fontFamily: MONO, fontSize: '0.55rem', color: '#8fb3c7', border: '1px solid #333', backgroundColor: 'transparent' }} />
                )}
                {/* Both halves or neither.
                    A modality with no place is a request to go and look with
                    nowhere to go; a place with no modality does not say whether
                    standing there settles anything. Either alone reads as
                    actionable in a queue and is not, which is why the chip is
                    gated on the predicate rather than on the fields. */}
                {fieldDispatchable(requirement) && (
                  <Chip size="small"
                    label={`on foot: ${requirement.modality!.join('/')} @ ${requirement.place!.geohash}`}
                    sx={{ borderRadius: 0, height: 16, fontFamily: MONO, fontSize: '0.55rem', color: '#7fd4a0', border: '1px solid #2f5f45', backgroundColor: 'transparent' }} />
                )}
              </Box>
            </Box>
          ))}
        </Box>

        {open.length > 8 && (
          <Typography sx={{ color: '#666', fontFamily: MONO, fontSize: '0.6rem', mt: 0.6 }}>
            +{open.length - 8} more, in Cases
          </Typography>
        )}
      </CardContent>
    </Card>
  );
};

export default RequirementsQueue;

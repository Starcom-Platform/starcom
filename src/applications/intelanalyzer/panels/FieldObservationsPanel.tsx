import React, { useState } from 'react';
import { Box, Typography, Chip, Stack, Button, Collapse, IconButton, Tooltip } from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ExpandLess from '@mui/icons-material/ExpandLess';
import { useCorrelation } from '../state/CorrelationContext';
import { useApplicationRouter } from '../../../hooks/useApplicationRouter';
import {
  reportDraftFrom, seenWords, howObserved, type FieldObservation,
} from '../../../services/intel/observations/fieldObservations';
import { reportDraft } from '../../../services/intel/place/placePick';
import { formatCoordinate } from '../../../types/intel/SourceObservation';
import { formatUtcDateTime } from '../../../utils/utcTime';
import OperatorCard from '../../../components/Intel/OperatorCard';

/** The newest few: a list to read, not an archive to page through. */
const VISIBLE_LIMIT = 8;

/**
 * FieldObservationsPanel — what people have published through NavCom, read as
 * the observations they are (decision D-MX, MX21).
 *
 * Each one feeds correlation claim by claim, like any source's. Here it is what
 * its operator saw, where and when, under the callsign they gave, and a person
 * can write a report on it (MX19). The report rests on the observation; its
 * operator is credited by the citation, not named in the report's words.
 *
 * Shown only once something has been read. Until operators publish, nothing has.
 */
const FieldObservationsPanel: React.FC = () => {
  const { fieldObservations } = useCorrelation();
  const { navigateToApp } = useApplicationRouter();
  const [expanded, setExpanded] = useState(true);
  // The operator whose card is open, and what it opened from (D-MX: MX8, MX25).
  const [card, setCard] = useState<{ row: FieldObservation; anchor: HTMLElement } | null>(null);

  if (fieldObservations.length === 0) return null;

  const writeReport = (row: FieldObservation) => {
    reportDraft.save({ ...reportDraftFrom(row) });
    navigateToApp('inteldashboard', undefined, { restoreDraft: 'true', from: 'intelanalyzer' });
  };

  const shown = fieldObservations.slice(0, VISIBLE_LIMIT);
  const hidden = fieldObservations.length - shown.length;

  return (
    <Box sx={{ p: 1.5, borderTop: 1, borderColor: 'divider' }} data-testid="field-observations-panel">
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2" component="h2" sx={{ color: 'primary.main' }}>
          Field observations ({fieldObservations.length})
        </Typography>
        <IconButton size="small" onClick={() => setExpanded((e) => !e)} aria-label={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
          Published through NavCom by the people who made them. A report written on one rests on it.
        </Typography>

        <Stack spacing={1}>
          {shown.map((row) => (
            <Box
              key={row.eventId}
              data-testid="field-observation"
              sx={{ p: 1, borderLeft: 2, borderColor: 'primary.dark' }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {seenWords(row.seen)}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                {howObserved(row.method)} on {formatUtcDateTime(Date.parse(row.observedAt), { year: true })}
              </Typography>
              {/* On its own line, whole: at the rail's width a run-on line left "km" alone below. */}
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', whiteSpace: 'nowrap' }}>
                {formatCoordinate(row.lat, row.lon, row.precisionM, { showUncertainty: true })}
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                <Tooltip title="Their standing, as NavCom derives it">
                  <Chip
                    label={row.operatorLabel}
                    size="small"
                    variant="outlined"
                    onClick={(e) => setCard({ row, anchor: e.currentTarget })}
                    data-testid="operator-chip"
                  />
                </Tooltip>
                <Box sx={{ flexGrow: 1 }} />
                <Button size="small" onClick={() => writeReport(row)}>
                  Write a report on this
                </Button>
              </Stack>
            </Box>
          ))}
        </Stack>

        {hidden > 0 && (
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
            +{hidden} more not shown
          </Typography>
        )}
      </Collapse>
      {card && (
        <OperatorCard operator={card.row.operator} label={card.row.operatorLabel} anchorEl={card.anchor} onClose={() => setCard(null)} />
      )}
    </Box>
  );
};

export default FieldObservationsPanel;

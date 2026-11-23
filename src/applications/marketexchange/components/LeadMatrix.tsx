/**
 * The desk's matrix (decision D-LD, LD2): how many leads of each kind are offered to each audience. A
 * count is a filter: choosing it shows those leads in the list. A lead offered to several audiences is
 * counted under each, so a row's cells can add up to more than its leads; the last column says how
 * many leads the row holds.
 */
import React from 'react';
import { Box, ButtonBase, Typography } from '@mui/material';
import { ARCHETYPES, ARCHETYPE_LABELS, type Archetype } from '../../../services/exchange/opportunityAudience';
import { LEAD_KINDS, type Lead, type LeadKind } from '../../../services/exchange/leads';
import { KIND_NAME } from './leadText';

const cell: React.CSSProperties = { padding: '4px 8px', borderBottom: '1px solid var(--sc-divider)', textAlign: 'right', whiteSpace: 'nowrap' };

export const LeadMatrix: React.FC<{ leads: readonly Lead[]; onPick: (kind: LeadKind, audience: Archetype | null) => void }> = ({ leads, onPick }) => {
  const kinds = LEAD_KINDS.filter((k) => leads.some((l) => l.kind === k));
  const audiences = ARCHETYPES.filter((a) => leads.some((l) => l.audiences.includes(a)));
  if (!kinds.length) return <Typography variant="body2" color="text.secondary">No leads to count.</Typography>;
  const count = (kind: LeadKind, audience: Archetype | null) =>
    leads.filter((l) => l.kind === kind && (audience === null || l.audiences.includes(audience))).length;

  return (
    <Box sx={{ overflowX: 'auto' }} data-testid="lead-matrix">
      <Box component="table" sx={{ borderCollapse: 'collapse', fontSize: '0.8125rem', minWidth: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...cell, textAlign: 'left' }} scope="col">Kind</th>
            {audiences.map((a) => <th key={a} style={cell} scope="col">{ARCHETYPE_LABELS[a]}</th>)}
            <th style={cell} scope="col">Leads</th>
          </tr>
        </thead>
        <tbody>
          {kinds.map((k) => (
            <tr key={k}>
              <th style={{ ...cell, textAlign: 'left' }} scope="row">{KIND_NAME[k]}</th>
              {[...audiences, null].map((a) => {
                const n = count(k, a);
                return (
                  <td key={a ?? 'all'} style={cell}>
                    {n === 0 ? <span style={{ color: 'var(--sc-text-muted)' }}>·</span> : (
                      <ButtonBase
                        onClick={() => onPick(k, a)}
                        data-testid="matrix-cell"
                        aria-label={`${n} ${KIND_NAME[k].toLowerCase()} leads${a ? ` for ${ARCHETYPE_LABELS[a]}` : ''}: show them`}
                        sx={{ px: 0.75, borderRadius: 1, color: 'primary.main', fontWeight: a ? 400 : 600 }}
                      >
                        {n}
                      </ButtonBase>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
};

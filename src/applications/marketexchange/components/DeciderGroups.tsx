/**
 * The desk's leads grouped by who decides under them (decision D-LD, LD2): "Decided by the U.S.
 * Department of Justice and the court: 12", each group with its programme's page where the group has
 * one, the largest group first. Who decides is named as they name themselves; no amount is attached.
 */
import React, { useState } from 'react';
import { Box, Button, Link, Stack, Typography } from '@mui/material';
import type { Lead } from '../../../services/exchange/leads';

/** Rows a group shows before it is opened. */
const SHOWN = 5;

/** A decider's own page, where the leads under it do not carry one between them. */
const DECIDER_PAGES: Readonly<Record<string, string>> = {
  OFAC: 'https://ofac.treasury.gov/',
  'HHS-OIG': 'https://oig.hhs.gov/exclusions/',
};

function pageOf(leads: readonly Lead[]): string | undefined {
  const references = [...new Set(leads.map((l) => l.statute?.reference).filter(Boolean))];
  return references.length === 1 ? references[0] : DECIDER_PAGES[leads[0].decidedBy];
}

export const DeciderGroups: React.FC<{ leads: readonly Lead[]; row: (lead: Lead) => React.ReactNode }> = ({ leads, row }) => {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const groups = new Map<string, Lead[]>();
  for (const lead of leads) groups.set(lead.decidedBy, [...(groups.get(lead.decidedBy) ?? []), lead]);
  const sorted = [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  if (!sorted.length) return <Typography variant="body2" color="text.secondary">No leads to group.</Typography>;

  return (
    <Stack spacing={1.5} data-testid="decider-groups">
      {sorted.map(([decider, items]) => {
        const page = pageOf(items);
        const all = open.has(decider);
        return (
          <Box key={decider} data-testid="decider-group">
            <Typography variant="overline" component="h3">
              {`Decided by ${decider} (${items.length})`}
              {page && <>{' · '}<Link href={page} target="_blank" rel="noopener noreferrer">its programme</Link></>}
            </Typography>
            <Stack spacing={1}>{(all ? items : items.slice(0, SHOWN)).map((lead) => <React.Fragment key={lead.id}>{row(lead)}</React.Fragment>)}</Stack>
            {items.length > SHOWN && (
              <Button size="small" onClick={() => setOpen((held) => { const next = new Set(held); if (all) next.delete(decider); else next.add(decider); return next; })}>
                {all ? 'Show fewer' : `Show all ${items.length}`}
              </Button>
            )}
          </Box>
        );
      })}
    </Stack>
  );
};

import React from 'react';
import { Popover, Box, Typography } from '@mui/material';
import { nip19 } from 'nostr-tools';
import { useOperatorStanding, type OperatorStanding } from '../../services/intel/observations/useOperatorStanding';

/** NavCom's kinds of standing, in NavCom's words for what each answers (its spec, section 7.2). */
const KINDS = [
  { kind: 'Intel', answers: "What they knew that the grid didn't" },
  { kind: 'Honor', answers: "How far they've come with one body" },
  { kind: 'Hours', answers: "How much they've done" },
  { kind: 'Supply', answers: 'What they moved' },
  { kind: 'Karma', answers: 'Will they work with you again' },
] as const;

/** What this device can say of each kind: Intel from citations; the rest from events Starcom does not read yet. */
function valueOf(kind: (typeof KINDS)[number]['kind'], standing: OperatorStanding): string {
  if (kind === 'Intel') {
    if (standing.state === 'looking') return 'Counting, on the relays Starcom reads…';
    if (standing.state === 'unreachable') return 'No relay Starcom reads answered.';
    // Two counts, never a ratio: the reader does the division (NavCom's economy design, section 3).
    return `${standing.intel.submitted} submitted, ${standing.intel.refined} refined`;
  }
  if (kind === 'Karma') return 'From bounties, which Starcom does not read.';
  return 'From settled reports, which Starcom does not read yet.';
}

const npubOf = (hex: string): string => {
  try { return nip19.npubEncode(hex); } catch { return hex; }
};

interface OperatorCardProps {
  operator: string;
  /** The operator as read: their callsign and key, short. */
  label: string;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

/**
 * OperatorCard — an operator's standing as NavCom derives it (decision D-MX:
 * MX8, MX25, MX26): NavCom's kinds side by side, as this device sees them.
 * Never added together, never ranked, never a ratio; NavCom keeps no ledger,
 * so another device may count differently, and be right about what it saw.
 */
const OperatorCard: React.FC<OperatorCardProps> = ({ operator, label, anchorEl, onClose }) => {
  const standing = useOperatorStanding(anchorEl ? operator : null);
  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
    >
      <Box sx={{ p: 1.5, maxWidth: 400 }} data-testid="operator-card">
        <Typography variant="subtitle2">{label}</Typography>
        <Typography variant="caption" component="div" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
          {npubOf(operator)}
        </Typography>
        <Typography variant="caption" component="div" sx={{ color: 'primary.main', mt: 1 }}>
          NavCom's standing, as this device sees it
        </Typography>
        <Box component="dl" sx={{ m: 0, mt: 0.5, display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 1.5, rowGap: 0.5 }}>
          {KINDS.map(({ kind, answers }) => (
            <React.Fragment key={kind}>
              <Typography component="dt" variant="caption" sx={{ fontWeight: 600 }} title={answers}>{kind}</Typography>
              <Typography component="dd" variant="caption" sx={{ m: 0 }} data-testid={`standing-${kind.toLowerCase()}`}>
                {valueOf(kind, standing)}
              </Typography>
            </React.Fragment>
          ))}
        </Box>
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 1, mb: 0 }}>
          Refined: cited in a report or package another key signed. Never added together, never ranked:
          NavCom keeps no ledger, so each device counts what it can see.
        </Typography>
      </Box>
    </Popover>
  );
};

export default OperatorCard;

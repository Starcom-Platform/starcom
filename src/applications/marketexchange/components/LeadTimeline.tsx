/**
 * The desk's deadline timeline (decision D-LD, LD2): the leads that state a closing date, on the next
 * ninety days by their real dates, a dot each, stacked by day; a lead already closed greyed; then the
 * same leads grouped by when they close. Choosing a dot or a row chooses the lead, whose detail stands
 * beside it. Dates are the source's own, as UTC days.
 */
import React from 'react';
import { Box, Stack, Typography } from '@mui/material';
import type { Lead } from '../../../services/exchange/leads';
import { dateOf, daysFrom } from './leadText';

/** The days the strip covers. */
const TIMELINE_DAYS = 90;
/** Dots a day stacks before saying how many more. */
const STACK = 8;
/** Rows a group lists before saying how many more. */
const GROUP_LISTED = 25;

// Drawn at about the list column's width, so its type is read at its size, not scaled down.
const WIDTH = 560;
const HEIGHT = 128;
const AXIS_Y = 104;
const LEFT = 8;
const RIGHT = 8;

interface Group { label: string; from: number; to: number }
const GROUPS: Group[] = [
  { label: 'Closed', from: -Infinity, to: -1 },
  { label: 'Closes within a week', from: 0, to: 6 },
  { label: 'Within 30 days', from: 7, to: 29 },
  { label: `Within ${TIMELINE_DAYS} days`, from: 30, to: TIMELINE_DAYS - 1 },
  { label: 'Later', from: TIMELINE_DAYS, to: Infinity },
];

export const LeadTimeline: React.FC<{
  leads: readonly Lead[];
  today: string;
  chosenId?: string;
  onChoose: (id: string) => void;
  /** Renders a lead's row, as the list does. */
  row: (lead: Lead) => React.ReactNode;
}> = ({ leads, today, chosenId, onChoose, row }) => {
  const dated = leads.filter((l): l is Lead & { closes: string } => !!l.closes)
    .map((lead) => ({ lead, days: daysFrom(today, lead.closes) }))
    .sort((a, b) => a.days - b.days || a.lead.title.localeCompare(b.lead.title));
  if (dated.length === 0) {
    return <Typography variant="body2" color="text.secondary" data-testid="timeline-none">No lead shown states a closing date.</Typography>;
  }

  const x = (days: number) => LEFT + (Math.max(0, Math.min(TIMELINE_DAYS, days)) / TIMELINE_DAYS) * (WIDTH - LEFT - RIGHT);
  const byDay = new Map<number, typeof dated>();
  for (const d of dated) if (d.days >= 0 && d.days < TIMELINE_DAYS) byDay.set(d.days, [...(byDay.get(d.days) ?? []), d]);
  const ticks = Array.from({ length: Math.floor(TIMELINE_DAYS / 14) + 1 }, (_, i) => i * 14);
  const tickDate = (days: number) => dateOf(new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10));
  const closed = dated.filter((d) => d.days < 0).length;
  const later = dated.filter((d) => d.days >= TIMELINE_DAYS).length;

  return (
    <Box data-testid="lead-timeline">
      <Box sx={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" style={{ minWidth: WIDTH, display: 'block' }} role="img"
          aria-label={`Closing dates over the next ${TIMELINE_DAYS} days, from ${dateOf(today)}`}>
          <line x1={LEFT} x2={WIDTH - RIGHT} y1={AXIS_Y} y2={AXIS_Y} style={{ stroke: 'var(--sc-divider)' }} />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={AXIS_Y} y2={AXIS_Y + 4} style={{ stroke: 'var(--sc-divider)' }} />
              <text x={x(t)} y={AXIS_Y + 18} textAnchor={t === 0 ? 'start' : x(t) > WIDTH - 40 ? 'end' : 'middle'} style={{ fill: 'var(--sc-text-muted)', fontSize: 12 }}>
                {t === 0 ? 'Today' : tickDate(t).replace(/ \d{4}$/, '')}
              </text>
            </g>
          ))}
          {[...byDay].map(([day, items]) => (
            <g key={day}>
              {items.slice(0, STACK).map((d, i) => (
                <circle
                  key={d.lead.id}
                  data-testid="timeline-dot"
                  cx={x(day)}
                  cy={AXIS_Y - 8 - i * 10}
                  r={d.lead.id === chosenId ? 4.5 : 3.25}
                  role="button"
                  tabIndex={0}
                  aria-label={`${d.lead.title}, closes ${dateOf(d.lead.closes)}`}
                  onClick={() => onChoose(d.lead.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChoose(d.lead.id); } }}
                  style={{ fill: d.lead.id === chosenId ? 'var(--sc-protected)' : 'var(--sc-accent)', cursor: 'pointer' }}
                >
                  <title>{`${d.lead.title} · closes ${dateOf(d.lead.closes)}`}</title>
                </circle>
              ))}
              {items.length > STACK && (
                <text x={x(day)} y={AXIS_Y - 8 - STACK * 10} textAnchor="middle" style={{ fill: 'var(--sc-text-muted)', fontSize: 12 }}>{`+${items.length - STACK}`}</text>
              )}
            </g>
          ))}
        </svg>
      </Box>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
        {[`${dated.length} ${dated.length === 1 ? 'lead states' : 'leads state'} a closing date`,
          later ? `${later} close after ${TIMELINE_DAYS} days` : null,
          closed ? `${closed} closed` : null].filter(Boolean).join('; ')}.
      </Typography>
      <Stack spacing={1.5}>
        {GROUPS.map((g) => {
          const items = dated.filter((d) => d.days >= g.from && d.days <= g.to);
          if (!items.length) return null;
          return (
            <Box key={g.label} data-testid="timeline-group" sx={g.label === 'Closed' ? { opacity: 0.55 } : undefined}>
              <Typography variant="overline" component="h3">{`${g.label} (${items.length})`}</Typography>
              <Stack spacing={1}>{items.slice(0, GROUP_LISTED).map((d) => <React.Fragment key={d.lead.id}>{row(d.lead)}</React.Fragment>)}</Stack>
              {items.length > GROUP_LISTED && (
                <Typography variant="caption" color="text.secondary">{`And ${items.length - GROUP_LISTED} more in the list, by closing date.`}</Typography>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
};

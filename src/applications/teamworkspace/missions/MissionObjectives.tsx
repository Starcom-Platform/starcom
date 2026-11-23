/**
 * A mission's objectives, as work somebody could pick up.
 *
 * ─── WHAT THIS REPLACED ────────────────────────────────────────────────────
 *
 * A checkbox, a sentence and a bin icon. `MissionObjective` was
 * `{ id, description, completed }`, so there was nowhere to say what the doer
 * hands back, roughly how long it takes, what they must not do, who it is for,
 * or which record it rests on. Assembling a mission felt like filing because
 * the model gave it nothing else to be.
 *
 * ─── THE RULES THIS FOLLOWS ────────────────────────────────────────────────
 *
 * **An absent field is shown as absent.** `notStated` wording, never a default.
 * "60 minutes" where nobody estimated, or "Public" where nobody chose, is a
 * fabricated answer — the defect D-C removed from the intel popup, which showed
 * every report as LOW at 30% confidence because a miss fell through to a
 * default.
 *
 * **Completion stays a person's mark.** `completed` says somebody ticked it,
 * not that an artifact was checked. Where an objective expected something back,
 * that expectation is shown beside the tick so a reader can judge for
 * themselves. The tick is never blocked on it: a gate nothing can verify is
 * theatre, and this codebase has removed two of those already.
 *
 * **Claiming is not authority.** `claimedBy` records who took something on. It
 * grants nothing, because a local-first record cannot enforce a grant — see
 * guard-no-access-roles. It is here so open work is distinguishable from
 * claimed work, including on the globe.
 */
import React, { useState } from 'react';
import {
  Box, Checkbox, Chip, Collapse, IconButton, List, ListItem, MenuItem,
  Stack, TextField, Typography,
} from '@mui/material';
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import {
  type MissionObjective,
  type ObjectiveBeneficiary,
  OBJECTIVE_BENEFICIARY_LABELS,
} from '../../../types/intel/MissionUI';
import KeyName from '../../../components/Identity/KeyName';
import { counted, fill, useMessages } from '../../../i18n/app/i18n';
import { fillNodes } from '../../../i18n/app/fillNodes';
import { languageOf, type LanguageId } from '../../../i18n/app/languages';
import type { Messages } from '../../../i18n/app/en';

type Words = Messages['missionParts'];

/** A record an objective can rest on, as the mission links it. */
export interface ObjectiveEvidence { id: string; label: string }

const HEX_KEY = /^[0-9a-f]{64}$/;
/** Who it was given to: a name for a key, or what was typed in before keys were chosen. */
const Claimant: React.FC<{ value: string }> = ({ value }) => (HEX_KEY.test(value) ? <KeyName pubkey={value} /> : <>{value}</>);

/** Minutes as something a person reads without converting, in the language shown. */
const effortText = (minutes: number | undefined, t: Words, lang: LanguageId): string => {
  if (minutes === undefined) return t.notStated.effort;
  if (minutes < 60) return fill(t.minutes, { n: minutes });
  return fill(t.hours, { n: new Intl.NumberFormat(languageOf(lang).html, { maximumFractionDigits: 1 }).format(minutes / 60) });
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <Box sx={{ minWidth: 150 }}>
    <Typography variant="caption" color="text.secondary" component="div">{label}</Typography>
    {children}
  </Box>
);

const ObjectiveDetail: React.FC<{
  objective: MissionObjective;
  busy: boolean;
  /** What the package carries is locked; who claimed it and what it rests on are not. */
  locked: boolean;
  onChange: (patch: Partial<MissionObjective>) => void;
  people: string[];
  evidence: ObjectiveEvidence[];
}> = ({ objective, busy, locked, onChange, people, evidence }) => {
  const { m: { missionParts: t } } = useMessages();
  return (
  <Stack spacing={1.5} sx={{ pl: 4, pr: 2, pb: 2 }}>
    <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
      <Field label={t.handsBack}>
        <TextField
          size="small" variant="standard" disabled={busy || locked}
          value={objective.expectedArtifact ?? ''}
          placeholder={t.handsBackPlaceholder}
          onChange={(e) => onChange({ expectedArtifact: e.target.value || undefined })}
          inputProps={{ 'data-testid': `objective-artifact-${objective.id}` }}
        />
      </Field>
      <Field label={t.effort}>
        <TextField
          size="small" variant="standard" type="number" disabled={busy || locked}
          value={objective.effortMinutes ?? ''}
          placeholder={t.effortPlaceholder}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            // An unparseable or negative entry clears the estimate rather than
            // storing a number nobody meant.
            onChange({ effortMinutes: Number.isFinite(n) && n > 0 ? n : undefined });
          }}
          inputProps={{ 'data-testid': `objective-effort-${objective.id}`, min: 1 }}
        />
      </Field>
      <Field label={t.for}>
        <TextField
          select size="small" variant="standard" disabled={busy || locked}
          value={objective.beneficiary ?? ''}
          onChange={(e) => onChange({ beneficiary: (e.target.value || undefined) as ObjectiveBeneficiary | undefined })}
          sx={{ minWidth: 150 }}
          SelectProps={{ SelectDisplayProps: { 'aria-label': t.for } as never }}
          inputProps={{ 'data-testid': `objective-beneficiary-${objective.id}` }}
        >
          <MenuItem value="">{t.notStated.beneficiary}</MenuItem>
          {(Object.keys(OBJECTIVE_BENEFICIARY_LABELS) as ObjectiveBeneficiary[]).map((b) => (
            <MenuItem key={b} value={b}>{t.beneficiaries[b]}</MenuItem>
          ))}
        </TextField>
      </Field>
      {/* Given to someone on the mission, by name (plan item 2.5, story S16).
          It was typed in, so a teammate and a typo looked the same. */}
      <Field label={t.claimedBy}>
        <TextField
          select size="small" variant="standard" disabled={busy}
          value={objective.claimedBy ?? ''}
          onChange={(e) => onChange({ claimedBy: e.target.value || undefined })}
          sx={{ minWidth: 160 }}
          SelectProps={{ displayEmpty: true, SelectDisplayProps: { 'aria-label': t.claimedBy } as never }}
          inputProps={{ 'data-testid': `objective-claimed-${objective.id}` }}
        >
          <MenuItem value="">{t.nobodyYet}</MenuItem>
          {people.map((pubkey) => <MenuItem key={pubkey} value={pubkey}><KeyName pubkey={pubkey} /></MenuItem>)}
          {/* Typed in before keys were chosen: kept, and shown as written. */}
          {objective.claimedBy && !people.includes(objective.claimedBy) && (
            <MenuItem value={objective.claimedBy}><Claimant value={objective.claimedBy} /></MenuItem>
          )}
        </TextField>
      </Field>
    </Stack>
    {/* One of the mission's records, by what it is called (plan item 2.5,
        story S17). It asked for "a report or finding id". */}
    <Field label={t.restsOn}>
      <TextField
        select size="small" variant="standard" fullWidth disabled={busy}
        value={objective.evidenceRef ?? ''}
        onChange={(e) => onChange({ evidenceRef: e.target.value || undefined })}
        SelectProps={{ displayEmpty: true, SelectDisplayProps: { 'aria-label': t.restsOn } as never }}
        inputProps={{ 'data-testid': `objective-evidence-${objective.id}` }}
      >
        <MenuItem value="">{t.nothingLinked}</MenuItem>
        {evidence.map((e) => <MenuItem key={e.id} value={e.id}>{e.label}</MenuItem>)}
        {objective.evidenceRef && !evidence.some((e) => e.id === objective.evidenceRef) && (
          <MenuItem value={objective.evidenceRef}>{objective.evidenceRef}</MenuItem>
        )}
      </TextField>
    </Field>
    <Field label={t.mustNot}>
      <TextField
        size="small" variant="standard" fullWidth multiline disabled={busy || locked}
        value={(objective.limits ?? []).join('\n')}
        placeholder={t.noLimits}
        onChange={(e) => {
          const limits = e.target.value.split('\n').map((l) => l.trim()).filter(Boolean);
          onChange({ limits: limits.length ? limits : undefined });
        }}
        inputProps={{ 'data-testid': `objective-limits-${objective.id}` }}
      />
    </Field>
  </Stack>
  );
};

export const MissionObjectives: React.FC<{
  objectives: MissionObjective[];
  busy: boolean;
  /** From READY_FOR_PACKAGE on: removing, and editing what the package carries, are off. Ticking done is not. */
  locked?: boolean;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onPatch: (id: string, patch: Partial<MissionObjective>) => void;
  /** Who an objective can be given to: the keys on the mission. */
  people?: string[];
  /** What an objective can rest on: the records the mission links. */
  evidence?: ObjectiveEvidence[];
}> = ({ objectives, busy, locked = false, onToggle, onRemove, onPatch, people = [], evidence = [] }) => {
  const { lang, m: { missionParts: t } } = useMessages();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggleOpen = (id: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  if (objectives.length === 0) {
    return <Typography variant="body2" color="text.secondary">{t.noneYet}</Typography>;
  }

  return (
    <List dense disablePadding>
      {objectives.map((obj) => {
        const expanded = open.has(obj.id);
        return (
          <Box key={obj.id} data-testid={`objective-${obj.id}`}>
            <ListItem
              disableGutters
              secondaryAction={
                <Stack direction="row" alignItems="center">
                  <Checkbox
                    edge="end"
                    checked={obj.completed}
                    disabled={busy}
                    onChange={() => onToggle(obj.id)}
                    inputProps={{ 'aria-label': fill(t.markComplete, { what: obj.description }) } as never}
                  />
                  <IconButton size="small" disabled={busy || locked} onClick={() => onRemove(obj.id)}
                    aria-label={fill(t.removeObjective, { what: obj.description })}>
                    <Trash2 size={16} />
                  </IconButton>
                </Stack>
              }
            >
              <IconButton size="small" onClick={() => toggleOpen(obj.id)}
                aria-label={fill(expanded ? t.hideDetails : t.showDetails, { what: obj.description })}
                data-testid={`objective-expand-${obj.id}`}>
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </IconButton>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="body2"
                  sx={{ textDecoration: obj.completed ? 'line-through' : 'none' }}
                >
                  {obj.description}
                </Typography>
                {/* The summary line carries only what was actually stated. An
                    objective nobody has described further shows nothing here,
                    rather than a row of placeholder defaults. */}
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                  {obj.effortMinutes !== undefined && (
                    <Chip size="small" variant="outlined" label={effortText(obj.effortMinutes, t, lang)} />
                  )}
                  {obj.beneficiary && (
                    <Chip size="small" variant="outlined" label={t.beneficiaries[obj.beneficiary]} />
                  )}
                  {obj.claimedBy
                    ? <Chip size="small" variant="outlined" label={fillNodes(t.claimedChip, { who: <Claimant value={obj.claimedBy} /> })} />
                    : <Chip size="small" variant="outlined" label={t.unclaimed} />}
                  {obj.limits && obj.limits.length > 0 && (
                    <Chip size="small" variant="outlined" color="warning"
                      label={counted(t.limits, obj.limits.length)} />
                  )}
                </Stack>
                {/* Completion is a person's mark, not a checked artifact. Where
                    something was expected back, say so beside the tick rather
                    than letting a line-through imply it arrived. */}
                {obj.completed && obj.expectedArtifact && (
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}
                    data-testid={`objective-marked-done-${obj.id}`}>
                    {fill(t.markedDone, { what: obj.expectedArtifact })}
                  </Typography>
                )}
              </Box>
            </ListItem>
            <Collapse in={expanded} unmountOnExit>
              <ObjectiveDetail
                objective={obj}
                busy={busy}
                locked={locked}
                people={people}
                evidence={evidence}
                onChange={(patch) => onPatch(obj.id, patch)}
              />
            </Collapse>
          </Box>
        );
      })}
    </List>
  );
};

export default MissionObjectives;

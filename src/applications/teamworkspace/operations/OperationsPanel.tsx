/**
 * Operations: the roster's tab in the Missions app (decision D-RS, RS20–RS21), where its "Projects" placeholder was.
 *
 * Starcom provides the kinds; people and Mecha Jono make every one (CR6). Here a person makes a Directive or an
 * Epic, kept on this device until they post it (RS13), publicly, sealed to invitees, or to a team (RS14), through
 * the publish review. Everyone's public items are listed unmarked (RS19); a publisher followed with a click
 * (RS22) has theirs put first, and marked. An item opens with its two kinds of link said apart (RS18): what its
 * author counts as part of it, and the work that claims to be toward it.
 *
 * A quest line's missions are in order, each finished one unlocking the next, here (RS8, RS30); a quest is a goal a
 * person sets themselves (RS9). What is finished, and which quest lines a person has started, stays on this device,
 * never posted (RS29, RS31). "Your quests" heads the tab.
 *
 * An adventure is a call over missions (RS33): what is happening, its odds quoting their source, where and when,
 * its trials the packages it links, and the rules every one keeps. A field trial is offered only after the age
 * question, asked once and kept here (RS36); its return, seen or not, is sealed to its caller (RS35).
 *
 * A cause gives no orders: it says how much work cites it, from how many publishers, and following it stays on this
 * device (RS1, RS53). An initiative names its problem, a first step and whom it is for; others join by working
 * toward it, and its author grows it into a campaign or an epic (RS3, RS54). A story never names or places people:
 * kept with what does, it says what stops it being posted (RS11, RS51), and it is offered after an adventure's
 * return, an ended operation, and from Missions and Cases. A saga gathers its stories both ways, marked (RS12, RS52).
 */
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, Link, MenuItem, Paper, Radio, RadioGroup, Stack, TextField, Typography } from '@mui/material';
import { nip19 } from 'nostr-tools';
import KeyName from '../../../components/Identity/KeyName';
import { verifySigners } from '../../../services/identity/signerProfiles';
import { nostrIdentityService } from '../../../services/identity/NostrIdentityService';
import { realTimeTeamService } from '../../../services/RealTimeTeamService';
import { isJoinedRelay } from '../../../services/nostr/joinedRelays';
import { reviewRosterPost, type RosterVisibility } from '../../../services/publishing/rosterPosts';
import { listDrafts, newRosterId, removeDraft, saveDraft, subscribeDrafts, type RosterDraft } from '../../../services/roster/rosterDrafts';
import { followed, follow, followCause, followedCauses, followsCause, isFollowed, subscribeFollows, unfollow, unfollowCause } from '../../../services/roster/follows';
import { citingWork, citingWorkText } from '../../../services/roster/citingWork';
import { AdventureReturns } from './AdventureReturns';
import { storyProblems, storyProblemsText } from '../../../services/roster/storyCheck';
import { rosterItems, rosterReadStatus, startRosterRead, subscribeRoster } from '../../../services/roster/rosterRead';
import { ROSTER_KIND_NAME, coordinateOf, type ReadRosterItem, type RosterItem, type RosterKind } from '../../../services/roster/rosterItem';
import { useReceivedPackages } from '../../../services/intel/useReceivedPackages';
import { missionCardOf } from '../../../services/intel/received/missionCard';
import { epicProgress, missionTotals, missionTotalsVersion, startMissionTotalsRead, subscribeMissionTotals } from '../../../services/roster/missionTotals';
import { isQuestKind, leaveQuestLine, questSteps, questTally, startQuestLine, startedQuestLines, subscribeQuests, type QuestStep } from '../../../services/roster/questProgress';
import { takenMissions } from '../../../services/intel/received/takenMissions';
import { useTakenMissions } from '../../../services/intel/received/useTakenMissions';
import type { AcceptedPackage } from '../../../services/intel/MissionPackageIngest';
import { TakeMission } from '../missions/TakeMission';
import {
  SAFETY_RULES, adventureState, adventureTotals, adventuresVersion, momentText, returnOf, subscribeAdventures,
  type AdventureState,
} from '../../../services/roster/adventure';
import { placeMiddles, windowDark, type NwsReading } from '../../../services/roster/fieldGate';
import FieldGate from '../../../components/Fieldwork/FieldGate';
import { fetchWarnings, nwsCallOff, stateOf } from '../../../services/roster/adventureWarnings';
import { usStateName } from '../../../services/intel/received/usStates';
import { reviewAdventureReturn } from '../../../services/publishing/adventureReturns';

/** What a kind calls its purpose: a directive's intent, an epic's "so that", a quest's reason (RS2, RS7–RS9). */
const PURPOSE_LABEL: Partial<Record<RosterKind, string>> = {
  directive: 'Intent', epic: 'So that', quest_line: 'Skill it teaches', quest: 'Why', adventure: 'What to do',
  cause: 'The concern', initiative: 'The problem', saga: 'What it is the saga of',
};
const purposeLabel = (kind: RosterKind) => PURPOSE_LABEL[kind] ?? 'Purpose';

/** A reason the spec gives for refusing, as a sentence. */
const sentence = (reason: string) => (reason === 'no title' ? 'Give it a title.' : `${reason[0].toUpperCase()}${reason.slice(1)}.`);
const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);
const coordinates = (text: string) => lines(text).map((coordinate) => ({ coordinate, relay: '' }));

function postedLine(draft: RosterDraft): string {
  const last = draft.posts[draft.posts.length - 1];
  if (!last) return 'Not posted';
  const relays = `${last.relays} ${last.relays === 1 ? 'relay' : 'relays'}`;
  if (last.visibility === 'sealed') return `Sealed to ${last.to ?? 0} · ${relays}`;
  if (last.visibility === 'team') return `Posted to a team · ${relays}`;
  return `Posted publicly · ${relays}`;
}

const useDrafts = () => useSyncExternalStore(subscribeDrafts, listDrafts, listDrafts);
const useFollowed = () => useSyncExternalStore(subscribeFollows, followed, followed);
const useFollowedCauses = () => useSyncExternalStore(subscribeFollows, followedCauses, followedCauses);
const useRoster = () => useSyncExternalStore(subscribeRoster, rosterItems, rosterItems);
const useReadStatus = () => useSyncExternalStore(subscribeRoster, rosterReadStatus, rosterReadStatus);
const useStarted = () => useSyncExternalStore(subscribeQuests, startedQuestLines, startedQuestLines);
const finishedAt = (coordinate: string) => takenMissions.finishedAt(coordinate);
const takenAt = (coordinate: string) => takenMissions.all().find((m) => m.coordinate === coordinate);

/* ── The editor ─────────────────────────────────────────────────────────── */

interface Criterion { label: string; target: string }

/** The kinds that count their progress, the ones bounded in time and place, and the ones that link down (RS5–RS9). */
const COUNTED: readonly RosterKind[] = ['epic', 'campaign', 'operation'];
const BOUNDED: readonly RosterKind[] = ['campaign', 'operation', 'adventure'];
const LINKED: readonly RosterKind[] = [...COUNTED, 'quest_line', 'quest', 'adventure', 'saga'];
const COUNTS_FIELD: Partial<Record<RosterKind, { label: string; help: string }>> = {
  quest_line: { label: 'Its missions, in order, one address a line', help: 'Each one finished unlocks the next.' },
  quest: { label: 'Its missions, one address a line', help: 'The missions that make it up.' },
  adventure: { label: 'Its trials, mission packages, one address a line', help: 'The missions taken to answer the call.' },
  saga: { label: 'Its stories, chosen by you, one address a line', help: 'Stories told toward it are listed too, marked apart.' },
};
/** An adventure's window is times, in UTC (the time model, D-E): the field holds them without the Z. */
const withoutZ = (moment: string | undefined) => (moment ?? '').replace(/Z$/, '');

const countsField = (kind: RosterKind) => COUNTS_FIELD[kind] ?? { label: 'Counts as part of it, one address a line', help: 'Missions and items you count.' };
const today = () => new Date().toISOString().slice(0, 10);

const RosterEditor: React.FC<{
  kind: RosterKind;
  editing: RosterDraft | null;
  prefill?: Partial<RosterItem>;
  onDone: () => void;
  /** Told the new item's id once it is kept: an initiative grown into it says so (RS54). */
  onKept?: (d: string) => void;
}> = ({ kind, editing, prefill, onDone, onKept }) => {
  const counted = COUNTED.includes(kind);
  const linked = LINKED.includes(kind);
  const taken = useTakenMissions().filter((m) => m.coordinate);
  const adventure = kind === 'adventure';
  const [callWhat, setCallWhat] = useState(editing?.call?.what ?? '');
  const [callOdds, setCallOdds] = useState(editing?.call?.odds ?? '');
  const [callSource, setCallSource] = useState(editing?.call?.source ?? '');
  const [hazards, setHazards] = useState((editing?.hazards ?? []).join('\n'));
  const [publicAccess, setPublicAccess] = useState(editing?.access === 'public');
  const [fromHome, setFromHome] = useState(editing?.fromHome ?? '');
  const [firstStep, setFirstStep] = useState(editing?.firstStep ?? '');
  const [forWhom, setForWhom] = useState(editing?.forWhom ?? '');
  // A story kept with what names or places people stays open, kept under this id (RS51).
  const [keptD, setKeptD] = useState<string | null>(null);
  const [title, setTitle] = useState(editing?.title ?? prefill?.title ?? '');
  const [coordinator, setCoordinator] = useState(editing?.coordinator ? (nip19.npubEncode(editing.coordinator)) : '');
  const [purpose, setPurpose] = useState(editing?.purpose ?? '');
  const [endState, setEndState] = useState(editing?.endState ?? '');
  const [evidence, setEvidence] = useState(editing?.evidence ?? '');
  const [criteria, setCriteria] = useState<Criterion[]>((editing?.criteria ?? []).map((c) => ({ label: c.label, target: String(c.target) })));
  const [limits, setLimits] = useState((editing?.limits ?? []).join('\n'));
  const [from, setFrom] = useState(adventure ? withoutZ(editing?.window?.from) : editing?.window?.from ?? '');
  const [until, setUntil] = useState(adventure ? withoutZ(editing?.window?.until) : editing?.window?.until ?? '');
  const moment = (v: string) => (adventure && v ? `${v}Z` : v);
  const [places, setPlaces] = useState((editing?.places ?? prefill?.places ?? []).join(', '));
  const [toward, setToward] = useState((editing?.toward ?? prefill?.toward ?? []).map((l) => l.coordinate).join('\n'));
  const [counts, setCounts] = useState((editing?.counts ?? []).map((l) => l.coordinate).join('\n'));
  const [text, setText] = useState(editing?.text ?? '');
  const [why, setWhy] = useState<string | null>(null);

  const keep = () => {
    if (BOUNDED.includes(kind) && (!from || !until || !places.trim())) {
      const name = ROSTER_KIND_NAME[kind].toLowerCase();
      setWhy(`${/^[aeiou]/.test(name) ? 'An' : 'A'} ${name} needs a window and a place.`);
      return;
    }
    let coordinatorKey: string | undefined;
    if (kind === 'operation' && coordinator.trim()) {
      const keys = keysFrom(coordinator.trim());
      if (!keys || keys.length !== 1) { setWhy('Give the coordinator\'s key, as npub or hex.'); return; }
      [coordinatorKey] = keys;
    }
    const item: RosterItem = {
      d: editing?.d ?? keptD ?? newRosterId(kind), kind, title,
      ...(purpose.trim() ? { purpose: purpose.trim() } : {}),
      ...(kind === 'directive' && endState.trim() ? { endState: endState.trim() } : {}),
      ...(kind === 'epic' && evidence.trim() ? { evidence: evidence.trim() } : {}),
      ...(kind === 'initiative' && firstStep.trim() ? { firstStep: firstStep.trim() } : {}),
      ...(kind === 'initiative' && forWhom.trim() ? { forWhom: forWhom.trim() } : {}),
      ...(editing?.grewInto?.length ? { grewInto: editing.grewInto } : {}),
      ...(counted ? { criteria: criteria.filter((c) => c.label.trim() && /^[1-9]\d*$/.test(c.target)).map((c) => ({ label: c.label.trim(), target: Number(c.target) })) } : {}),
      ...(coordinatorKey ? { coordinator: coordinatorKey } : {}),
      ...(editing?.ended ? { ended: editing.ended } : {}),
      ...(adventure ? {
        call: { what: callWhat.trim(), odds: callOdds.trim(), source: callSource.trim() },
        hazards: lines(hazards),
        ...(publicAccess ? { access: 'public' as const } : {}),
        ...(fromHome.trim() ? { fromHome: fromHome.trim() } : {}),
      } : {}),
      limits: lines(limits),
      ...(from || until ? { window: { from: moment(from), until: moment(until) } } : {}),
      places: places.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean),
      toward: coordinates(toward),
      counts: linked ? coordinates(counts) : (editing?.counts ?? []),
      text,
    };
    const saved = saveDraft(item);
    if ('reason' in saved) { setWhy(sentence(saved.reason)); return; }
    onKept?.(item.d);
    // Kept, and told what stops it being posted; the review refuses it until then (RS51).
    const problems = kind === 'story' ? storyProblems(item) : [];
    if (problems.length) {
      setKeptD(item.d);
      setWhy(`Kept on this device. It can be posted once ${problems.length === 1 ? 'this is' : 'these are'} out:\n${storyProblemsText(problems)}`);
      return;
    }
    onDone();
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="roster-editor">
      <Typography variant="h6" component="h3" gutterBottom>{editing ? `Edit the ${ROSTER_KIND_NAME[kind].toLowerCase()}` : `A new ${ROSTER_KIND_NAME[kind].toLowerCase()}`}</Typography>
      <Stack spacing={1.5}>
        <TextField label="Title" id="roster-title" value={title} onChange={(e) => setTitle(e.target.value)} size="small" />
        <TextField label={purposeLabel(kind)} id="roster-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} size="small" multiline />
        {adventure && (
          <>
            <TextField label="What is happening" id="roster-call-what" value={callWhat} onChange={(e) => setCallWhat(e.target.value)} size="small" />
            <TextField label="Its odds, as its source states them" id="roster-call-odds" value={callOdds} onChange={(e) => setCallOdds(e.target.value)} size="small"
              helperText="Quote them. Never odds of your own." />
            <TextField label="Its source, a link" id="roster-call-source" value={callSource} onChange={(e) => setCallSource(e.target.value)} size="small" helperText="An https link to the forecast or authority." />
            <TextField label="Its hazards, one a line" id="roster-hazards" value={hazards} onChange={(e) => setHazards(e.target.value)} size="small" multiline
              helperText="What could hurt someone out there: cold, dark roads, water." />
            <FormControlLabel control={<Checkbox size="small" checked={publicAccess} onChange={(e) => setPublicAccess(e.target.checked)} />}
              label="Its places are public, and open and lawful to be in at that hour" />
            <TextField label="A way to take part from home" id="roster-from-home" value={fromHome} onChange={(e) => setFromHome(e.target.value)} size="small"
              helperText="For anyone who cannot go out." />
          </>
        )}
        {kind === 'directive' && (
          <TextField label="End state" id="roster-end-state" value={endState} onChange={(e) => setEndState(e.target.value)} size="small" multiline helperText="What is true when it is done." />
        )}
        {kind === 'initiative' && (
          <>
            <TextField label="A first step" id="roster-first-step" value={firstStep} onChange={(e) => setFirstStep(e.target.value)} size="small" multiline />
            <TextField label="Who it is for" id="roster-for" value={forWhom} onChange={(e) => setForWhom(e.target.value)} size="small" />
          </>
        )}
        {kind === 'story' && <Alert severity="info" role="note">A story never names or places people.</Alert>}
        {kind === 'story' && prefill?.title && !prefill.toward?.length && (
          <Typography variant="caption">It links to its operation once you have a key: post the operation first.</Typography>
        )}
        {kind === 'operation' && (
          <TextField label="Coordinator, if not you" id="roster-coordinator" value={coordinator} onChange={(e) => setCoordinator(e.target.value)} size="small" helperText="Their key, as npub or hex." />
        )}
        {counted && (
          <Box>
            <Typography variant="subtitle2">Criteria, as counts</Typography>
            {criteria.map((c, i) => (
              <Stack direction="row" spacing={1} key={i} sx={{ mt: 1 }}>
                <TextField label={`Criterion ${i + 1}`} id={`roster-criterion-${i}`} value={c.label} size="small"
                  onChange={(e) => setCriteria(criteria.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <TextField label={`Target ${i + 1}`} id={`roster-target-${i}`} value={c.target} size="small" type="number" inputProps={{ min: 1, step: 1 }}
                  onChange={(e) => setCriteria(criteria.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)))} />
                <Button onClick={() => setCriteria(criteria.filter((_, j) => j !== i))}>Remove</Button>
              </Stack>
            ))}
            <Button sx={{ mt: 1 }} onClick={() => setCriteria([...criteria, { label: '', target: '' }])}>Add a criterion</Button>
          </Box>
        )}
        {kind === 'epic' && (
          <TextField label="Evidence standard" id="roster-evidence" value={evidence} onChange={(e) => setEvidence(e.target.value)} size="small" multiline helperText="What counts as done." />
        )}
        <TextField label="Limits, one a line" id="roster-limits" value={limits} onChange={(e) => setLimits(e.target.value)} size="small" multiline minRows={2} helperText="What work under it must not do." />
        <Stack direction="row" spacing={1}>
          <TextField label={adventure ? 'From, UTC' : 'From'} id="roster-from" type={adventure ? 'datetime-local' : 'date'} value={from} onChange={(e) => setFrom(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
          <TextField label={adventure ? 'Until, UTC' : 'Until'} id="roster-until" type={adventure ? 'datetime-local' : 'date'} value={until} onChange={(e) => setUntil(e.target.value)} size="small" InputLabelProps={{ shrink: true }} />
        </Stack>
        <TextField label="Places, a comma between" id="roster-places" value={places} onChange={(e) => setPlaces(e.target.value)} size="small" helperText="Codes, as us-ca, de or union:eu." />
        <TextField label="Works toward, one address a line" id="roster-toward" value={toward} onChange={(e) => setToward(e.target.value)} size="small" multiline helperText="Anyone may say their work is toward something." />
        {linked && (
          <TextField label={countsField(kind).label} id="roster-counts" value={counts} onChange={(e) => setCounts(e.target.value)} size="small" multiline helperText={countsField(kind).help} />
        )}
        {(isQuestKind(kind) || adventure) && taken.length > 0 && (
          <Box data-testid="roster-add-taken">
            <Typography variant="caption" display="block">Missions you have taken</Typography>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              {taken.map((m) => (
                <Button key={m.key} size="small" variant="outlined" sx={{ textTransform: 'none' }}
                  disabled={lines(counts).includes(m.coordinate!)}
                  onClick={() => setCounts([...lines(counts), m.coordinate!].join('\n'))}>
                  {`Add “${m.title}”`}
                </Button>
              ))}
            </Stack>
          </Box>
        )}
        <TextField label="Text" id="roster-text" value={text} onChange={(e) => setText(e.target.value)} size="small" multiline minRows={3} />
        {why && <Alert severity="warning" role="alert" sx={{ whiteSpace: 'pre-wrap' }}>{why}</Alert>}
        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={keep}>Keep on this device</Button>
          <Button onClick={onDone}>Back</Button>
        </Stack>
      </Stack>
    </Paper>
  );
};

/* ── Posting ────────────────────────────────────────────────────────────── */

/** Keys given as npub or hex, a comma or space between; null when any is not one. */
function keysFrom(text: string): string[] | null {
  const given = text.split(/[\s,]+/).filter(Boolean);
  const keys: string[] = [];
  for (const k of given) {
    if (/^[0-9a-f]{64}$/.test(k)) { keys.push(k); continue; }
    try {
      const decoded = nip19.decode(k);
      if (decoded.type === 'npub') { keys.push(decoded.data as string); continue; }
    } catch { /* not a key */ }
    return null;
  }
  return keys;
}

const PostRoster: React.FC<{ draft: RosterDraft; onDone: (said: string) => void }> = ({ draft, onDone }) => {
  const teams = useMemo(() => realTimeTeamService.getTeams().filter((t) => t.relayUrl && isJoinedRelay(t.relayUrl)), []);
  const [mode, setMode] = useState<'public' | 'sealed' | 'team'>('public');
  const [keys, setKeys] = useState('');
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  const [why, setWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const post = async () => {
    let visibility: RosterVisibility;
    if (mode === 'sealed') {
      const to = keysFrom(keys);
      if (!to || to.length === 0) { setWhy('Give each person\'s key, as npub or hex.'); return; }
      visibility = { kind: 'sealed', to };
    } else if (mode === 'team') {
      const team = teams.find((t) => t.id === teamId);
      if (!team?.relayUrl) { setWhy('Choose a team whose relay you have joined.'); return; }
      visibility = { kind: 'team', relay: team.relayUrl, name: team.name };
    } else {
      visibility = { kind: 'public' };
    }
    setBusy(true);
    try {
      const outcome = await reviewRosterPost(draft.d, visibility);
      if (outcome.status === 'sent') {
        const relays = `${outcome.result.relays} ${outcome.result.relays === 1 ? 'relay' : 'relays'} took it.`;
        onDone(outcome.result.to !== undefined ? `Sealed to ${outcome.result.to}: ${relays}` : `Posted: ${relays}`);
      } else if (outcome.status === 'cancelled') {
        onDone('Nothing was posted.');
      } else {
        setWhy(outcome.reason);
      }
    } catch (error) {
      setWhy(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 1 }} data-testid="roster-post">
      <Typography variant="subtitle1" component="h4">Post “{draft.title}”</Typography>
      <RadioGroup value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
        <FormControlLabel value="public" control={<Radio />} label="Public" />
        <FormControlLabel value="sealed" control={<Radio />} label="Invite-only" />
        <FormControlLabel value="team" control={<Radio />} label="A team" disabled={teams.length === 0} />
      </RadioGroup>
      {mode === 'public' && <Typography variant="body2">Anyone can read it. A public relay keeps it, for good.</Typography>}
      {mode === 'sealed' && (
        <TextField label="Their keys" id="roster-post-keys" value={keys} onChange={(e) => setKeys(e.target.value)} size="small" fullWidth multiline
          helperText="Sealed to each, one by one. Only they can open it." />
      )}
      {mode === 'team' && (
        <TextField select label="The team" id="roster-post-team" value={teamId} onChange={(e) => setTeamId(e.target.value)} size="small" fullWidth
          helperText="Its members read it, on the team's own relay.">
          {teams.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
        </TextField>
      )}
      {teams.length === 0 && <Typography variant="caption" display="block">To post to a team, join its relay first.</Typography>}
      {why && <Alert severity="warning" role="alert" sx={{ mt: 1 }}>{why}</Alert>}
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button variant="contained" onClick={() => void post()} disabled={busy}>Post</Button>
        <Button onClick={() => onDone('')}>Back</Button>
      </Stack>
    </Paper>
  );
};

/* ── An item, opened ────────────────────────────────────────────────────── */

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <>
    <Typography component="dt" variant="caption" color="text.secondary">{label}</Typography>
    <Typography component="dd" variant="body2" sx={{ m: 0, mb: 1, whiteSpace: 'pre-wrap' }}>{children}</Typography>
  </>
);

/** An epic's progress, from its missions' posted totals (RS23): their signers post them, never who reported. */
const Progress: React.FC<{ item: RosterItem }> = ({ item }) => {
  useSyncExternalStore(subscribeMissionTotals, missionTotalsVersion, missionTotalsVersion);
  useEffect(() => startMissionTotalsRead(), []);
  // An Operation's counts a day late and rounded, so no one is followed as they go (RS26).
  const progress = epicProgress(item, missionTotals(), item.kind === 'operation' ? { lateAndCoarse: { today: today() } } : {});
  if (!progress) return null;
  const missions = `${progress.missions} ${progress.missions === 1 ? 'mission\'s' : 'missions\''}`;
  return (
    <Box data-testid="roster-progress" sx={{ mt: 1 }}>
      <Typography variant="subtitle2">Progress</Typography>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {progress.criteria.map((c) => <li key={c.label}>{`${c.label}: ${c.done} of ${c.target}`}</li>)}
      </ul>
      <Typography variant="caption" display="block">
        {progress.missions === 0 ? 'It counts no missions yet.'
          : progress.posted === 0 ? `None of its ${missions} signers has posted totals yet.`
            : `From the totals ${progress.posted} of its ${missions} signers have posted${progress.asOf ? `, as of ${progress.asOf}` : ''}.`}
      </Typography>
      {progress.coarse && <Typography variant="caption" display="block">A day late, rounded down, so no one is followed as they go.</Typography>}
    </Box>
  );
};

const dayOf = (iso: string) => iso.slice(0, 10);
const hostOf = (url: string) => { try { return new URL(url).host; } catch { return url; } };
const stepsWord = (n: number) => (n === 1 ? 'step' : 'steps');

/** A quest line's missions in order, or a quest's, as each stands on this device (RS29–RS31). */
const QuestSteps: React.FC<{
  item: RosterItem;
  titleOf: (coordinate: string) => string;
  packageOf: (coordinate: string) => AcceptedPackage | undefined;
  onOpen: (coordinate: string) => (() => void) | null;
}> = ({ item, titleOf, packageOf, onOpen }) => {
  useTakenMissions();
  const steps = questSteps(item, finishedAt);
  const tally = questTally(steps);

  const action = (step: QuestStep) => {
    const { coordinate } = step;
    const mission = takenAt(coordinate);
    if (step.state === 'finished') {
      // One finished by ticking its steps is unticked in Missions; one marked here can be unmarked here.
      const ticked = mission && mission.steps.length > 0 && mission.steps.every((s) => s.done);
      return (
        <>
          <Chip size="small" color="success" variant="outlined" label={`Finished ${dayOf(step.finishedAt ?? '')}`} />
          {!ticked && <Button size="small" onClick={() => takenMissions.unmarkFinished(coordinate)}>Mark not finished</Button>}
        </>
      );
    }
    if (step.state === 'after') return <Typography variant="caption">{`After “${titleOf(step.after ?? '')}”`}</Typography>;
    const next = step.state === 'next' ? <Chip size="small" color="primary" label="Next" /> : null;
    if (mission && mission.steps.length > 0) {
      const done = mission.steps.filter((s) => s.done).length;
      const n = mission.steps.length;
      return <>{next}<Typography variant="caption">{`Taken on: ${done} of ${n} ${stepsWord(n)} ticked. Tick ${n === 1 ? 'it' : 'them'} in Missions.`}</Typography></>;
    }
    if (mission) return <>{next}<Button size="small" variant="outlined" onClick={() => takenMissions.markFinished(coordinate)}>Mark finished</Button></>;
    const pkg = packageOf(coordinate);
    if (pkg) return <>{next}<FieldGate field={missionCardOf(pkg).where === 'field'}><TakeMission pkg={pkg} /></FieldGate></>;
    const open = coordinate.startsWith('30084:') ? onOpen(coordinate) : null;
    if (open) {
      return (
        <>
          {next}
          <Button size="small" onClick={open}>Open it</Button>
          <Button size="small" variant="outlined" onClick={() => takenMissions.markFinished(coordinate)}>Mark finished</Button>
        </>
      );
    }
    return <>{next}<Typography variant="caption">Not read here yet.</Typography></>;
  };

  return (
    <Box data-testid="quest-steps" sx={{ mt: 1 }}>
      <Typography variant="subtitle2">{item.kind === 'quest_line' ? 'Its missions, in order' : 'Its missions'}</Typography>
      <Typography variant="caption" display="block">
        {`${tally.total === 0 ? 'It has no missions yet.' : `${tally.finished} of ${tally.total} finished.`} Kept on this device, never posted.`}
      </Typography>
      {/* A quest line's order is the point of it: numbered, as signed. */}
      <Box component={item.kind === 'quest_line' ? 'ol' : 'ul'} sx={{ m: 0, pl: 3, listStyleType: item.kind === 'quest_line' ? 'decimal' : 'disc' }}>
        {steps.map((step) => (
          <li key={step.coordinate} data-testid="quest-step" data-state={step.state}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5, py: 0.25 }}>
              <Typography variant="body2" color={step.state === 'after' ? 'text.secondary' : 'text.primary'}>{titleOf(step.coordinate)}</Typography>
              {action(step)}
            </Stack>
          </li>
        ))}
      </Box>
    </Box>
  );
};

/* ── An adventure (RS33–RS36) ───────────────────────────────────────────── */

type NwsWatch = ReturnType<typeof nwsCallOff>;

/** The NWS's warnings for its US states, read while it is on or to come, again every five minutes (RS40). */
function useNwsWatch(places: readonly string[], active: boolean): { loading: boolean; watch: NwsWatch | null } {
  const [seen, setSeen] = useState<{ loading: boolean; watch: NwsWatch | null }>({ loading: active, watch: null });
  const key = places.join(',');
  useEffect(() => {
    if (!active) return undefined;
    const list = key.split(',').filter(Boolean);
    const states = list.map(stateOf).filter((x): x is string => !!x);
    if (states.length === 0) { setSeen({ loading: false, watch: nwsCallOff(list, [], []) }); return undefined; }
    let live = true;
    const read = () => fetchWarnings(states).then(({ warnings, failed }) => { if (live) setSeen({ loading: false, watch: nwsCallOff(list, warnings, failed) }); });
    void read();
    const timer = setInterval(() => void read(), 5 * 60_000);
    return () => { live = false; clearInterval(timer); };
  }, [key, active]);
  return seen;
}

/** What the trials' gate reads of the NWS: none to read outside the US, reading, could not be read, or read. */
function nwsReadingOf(places: readonly string[], nws: { loading: boolean; watch: NwsWatch | null }): NwsReading {
  if (!places.some((p) => stateOf(p))) return 'none';
  if (!nws.watch) return 'reading';
  return nws.watch.states.some((st) => !st.read) ? 'unread' : 'read';
}

const untilText = (until: string | null) => (until ? `, until ${momentText(until.replace(/:00\.000Z$/, 'Z'))}` : '');

/** What the authority says for its places: each warning quoted, and where it calls the adventure off (RS34, RS40). */
const AdventureWarnings: React.FC<{ loading: boolean; watch: NwsWatch | null }> = ({ loading, watch }) => (
  <Box data-testid="adventure-warnings" sx={{ mt: 1 }}>
    <Typography variant="subtitle2">Weather warnings</Typography>
    {loading && !watch && <Typography variant="body2">Reading the National Weather Service's warnings…</Typography>}
    {watch?.states.map((s) => {
      const name = usStateName(s.state);
      if (!s.read) return <Typography key={s.state} variant="body2">{`The NWS could not be read for ${name}. Check weather.gov before you go.`}</Typography>;
      if (s.severe.length === 0 && s.local.length === 0) return <Typography key={s.state} variant="body2">{`No NWS warning for ${name} now.`}</Typography>;
      return (
        <Box key={s.state}>
          {s.severe.map((w, i) => <Typography key={`s${i}`} variant="body2">{`${w.event}, ${w.sender}${untilText(w.until)}. Called off in all of ${name}.`}</Typography>)}
          {s.local.map((w, i) => <Typography key={`l${i}`} variant="body2">{`${w.event}, ${w.sender}: ${w.area}${untilText(w.until)}. Called off there.`}</Typography>)}
        </Box>
      );
    })}
    {watch && watch.outsideUS.length > 0 && (
      <Typography variant="body2">{`Outside the US no authority is read here: only its caller and its window call it off in ${watch.outsideUS.join(', ')}.`}</Typography>
    )}
  </Box>
);

/**
 * Its trials: each package it links, offered while it is on or to come; a field one through the gate (fieldGate.ts):
 * the NWS read, failing safe; the age question; the warning; for 13 to 17, daylight across its window, and a parent.
 */
const AdventureTrials: React.FC<{
  item: RosterItem;
  state: AdventureState;
  nws: NwsReading;
  titleOf: (coordinate: string) => string;
  packageOf: (coordinate: string) => AcceptedPackage | undefined;
}> = ({ item, state, nws, titleOf, packageOf }) => {
  useTakenMissions();
  const trials = [...new Set(item.counts.map((l) => l.coordinate).filter((c) => c.startsWith('30079:')))];
  const closed = state.state === 'over' || state.state === 'called_off';
  const isField = (c: string) => { const pkg = packageOf(c); return !!pkg && missionCardOf(pkg).where === 'field'; };
  const dark = useMemo(() => windowDark(item.window, placeMiddles(item.places)), [item.window, item.places]);

  const action = (coordinate: string) => {
    const mission = takenAt(coordinate);
    if (mission && mission.steps.length > 0) {
      const done = mission.steps.filter((x) => x.done).length;
      const n = mission.steps.length;
      return <Typography variant="caption">{`Taken on: ${done} of ${n} ${stepsWord(n)} ticked. Tick ${n === 1 ? 'it' : 'them'} in Missions.`}</Typography>;
    }
    if (mission) return <Typography variant="caption">Taken on.</Typography>;
    if (closed) return <Typography variant="caption">{state.state === 'called_off' ? 'Not to be taken: it was called off.' : 'Not to be taken: it is over.'}</Typography>;
    const pkg = packageOf(coordinate);
    if (!pkg) return <Typography variant="caption">Not read here yet.</Typography>;
    return <FieldGate field={isField(coordinate)} dark={dark} nws={nws}><TakeMission pkg={pkg} /></FieldGate>;
  };

  return (
    <Box data-testid="adventure-trials" sx={{ mt: 1 }}>
      <Typography variant="subtitle2">Its trials</Typography>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {trials.map((c) => (
          <li key={c}>
            <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ flexWrap: 'wrap', rowGap: 0.5, py: 0.25 }}>
              <Typography variant="body2">{titleOf(c)}</Typography>
              {action(c)}
            </Stack>
          </li>
        ))}
      </ul>
    </Box>
  );
};

/** Its return, once a trial is taken here: seen or not, with the counts its trials ask, sealed to its caller (RS35). */
const AdventureReturn: React.FC<{ item: ReadRosterItem; onStory?: () => void }> = ({ item, onStory }) => {
  useTakenMissions();
  useSyncExternalStore(subscribeAdventures, adventuresVersion, adventuresVersion);
  const [values, setValues] = useState<Record<string, string>>({});
  const [said, setSaid] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentNow, setSentNow] = useState(false);
  const taken = item.counts.map((l) => takenAt(l.coordinate)).filter((m): m is NonNullable<typeof m> => !!m);
  if (taken.length === 0) return null;
  const labels = [...new Set(taken.flatMap((m) => (m.counts ?? []).map((c) => c.label)))];
  const sent = returnOf(item.address);
  const send = async (seen: boolean) => {
    setBusy(true);
    try {
      const counts = labels.filter((l) => /^\d+$/.test(values[l] ?? '')).map((label) => ({ label, n: Number(values[label]) }));
      const outcome = await reviewAdventureReturn(item, seen, counts);
      if (outcome.status === 'sent') setSentNow(true);
      setSaid(outcome.status === 'sent' ? 'Sent, sealed to its caller.' : outcome.status === 'cancelled' ? 'Nothing was sent.' : outcome.reason);
    } catch (error) {
      setSaid(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box data-testid="adventure-return" sx={{ mt: 1 }}>
      <Typography variant="subtitle2">How did it go?</Typography>
      {sent && <Typography variant="caption" display="block">{`Returned ${sent.day}: ${sent.seen ? 'seen it' : 'not seen'}. Sealed to its caller.`}</Typography>}
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, my: 0.5 }}>
        {labels.map((label, i) => (
          <TextField key={label} label={label} id={`adventure-count-${i}`} type="number" size="small" inputProps={{ min: 0, step: 1 }}
            value={values[label] ?? ''} onChange={(e) => setValues({ ...values, [label]: e.target.value })} />
        ))}
      </Stack>
      <Stack direction="row" spacing={1}>
        <Button variant="contained" disabled={busy} onClick={() => void send(true)}>Seen it</Button>
        <Button variant="outlined" disabled={busy} onClick={() => void send(false)}>Not seen</Button>
      </Stack>
      <Typography variant="caption" display="block">Only its caller can open it. It does not say publicly that you went.</Typography>
      {said && <Alert severity="info" sx={{ mt: 1 }}>{said}</Alert>}
      {(sentNow || sent) && onStory && <Button sx={{ mt: 1 }} variant="outlined" onClick={onStory}>Write a story</Button>}
    </Box>
  );
};

/** Its caller's totals of the returns, a day late and rounded (RS35). */
const AdventureTotals: React.FC<{ address: string }> = ({ address }) => {
  useSyncExternalStore(subscribeMissionTotals, missionTotalsVersion, missionTotalsVersion);
  useEffect(() => startMissionTotalsRead(), []);
  const totals = adventureTotals(address, missionTotals(), today());
  return (
    <Typography variant="caption" display="block" data-testid="adventure-totals" sx={{ mt: 1 }}>
      {totals ? `Seen by ${totals.seen}, not by ${totals.notSeen}, as of ${totals.asOf}, from its caller's totals. A day late, rounded down.`
        : 'Its caller has posted no totals yet.'}
    </Typography>
  );
};

const RosterItemView: React.FC<{
  item: RosterItem & { author?: string; address?: string; heldBack?: string[] };
  all: ReadRosterItem[];
  onBack: () => void;
  /** For one's own item kept here: end an operation, and write its story (RS27); grow an initiative (RS54). */
  own?: { onEnd: (why: string) => void; onStory: () => void; onGrow?: (kind: 'campaign' | 'epic') => void };
  /** Open another item, by its address. */
  onOpenItem?: (item: ReadRosterItem) => void;
  /** Write a story about it: after an adventure's return (RS51). */
  onWriteStory?: (prefill: Partial<RosterItem>) => void;
}> = ({ item, all, onBack, own, onOpenItem, onWriteStory }) => {
  useFollowedCauses();
  const [ending, setEnding] = useState(false);
  const [why, setWhy] = useState('');
  const started = useStarted().find((s) => s.address === item.address);
  const me = nostrIdentityService.signerPubkey();
  // A mission it links is named by its package's headline, from the packages received; read only when it links one.
  const linksMission = [...item.counts, ...item.toward].some((l) => l.coordinate.startsWith('30079:'));
  // A cause or an initiative counts the missions toward it too (RS59), so it reads them.
  const received = useReceivedPackages(linksMission || item.kind === 'cause' || item.kind === 'initiative');
  const packageOf = (coordinate: string) => {
    const [kind, pubkey, ...rest] = coordinate.split(':');
    if (kind !== '30079') return undefined;
    const d = rest.join(':');
    return received.accepted.find((p) => p.event.pubkey === pubkey && p.event.tags.some((t) => t[0] === 'd' && t[1] === d));
  };
  const drafts = useDrafts();
  // Named by its title as read, or as kept or taken here; else by its own id, short of the package prefix.
  const titleOf = (coordinate: string) => {
    const roster = all.find((x) => x.address === coordinate) ?? (me ? drafts.find((x) => coordinateOf(me, x.d) === coordinate) : undefined);
    if (roster) return roster.title;
    const pkg = packageOf(coordinate);
    return (pkg && missionCardOf(pkg).headline) || takenAt(coordinate)?.title
      || coordinate.split(':').slice(2).join(':').replace(/^starcom_mission_package_/, '') || coordinate;
  };
  const openOf = (coordinate: string) => {
    const found = all.find((x) => x.address === coordinate);
    return found && onOpenItem ? () => onOpenItem(found) : null;
  };
  const quest = isQuestKind(item.kind);
  const adventure = item.kind === 'adventure';
  // An adventure's clock, redrawn each minute while it is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!adventure) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [adventure]);
  // Read the authority while it is on or to come; a whole-state warning everywhere it names calls it off (RS40).
  const base = adventure ? adventureState(item, now) : null;
  const nws = useNwsWatch(item.places, !!base && (base.state === 'on' || base.state === 'coming'));
  const state = adventure ? adventureState(item, now, nws.watch?.everywhere ?? undefined) : null;
  // A quest's missions are listed once, as its steps, and an adventure's as its trials; what claims to be toward it
  // stays under it.
  const saga = item.kind === 'saga';
  const countedUnder = quest || adventure || saga ? [] : item.counts;
  // A saga lists its stories itself; any other work toward it stays under it.
  const claims = item.address ? all.filter((x) => x.toward.some((l) => l.coordinate === item.address) && !(saga && x.kind === 'story')) : [];
  // A cause and an initiative count the work toward them, never the people (RS53, RS54).
  const cited = item.address && (item.kind === 'cause' || item.kind === 'initiative') ? citingWork(item.address, all, received.accepted) : null;
  // A saga's stories both ways, marked: its author's choice, then those told toward it, newest first (RS52).
  const chosen = saga ? item.counts.map((l) => l.coordinate) : [];
  const told = saga && item.address ? citingWork(item.address, all).items.filter((x) => x.kind === 'story' && !chosen.includes(x.address)) : [];
  const startable = item.kind === 'quest_line' && !own && item.address && item.author !== me;
  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="roster-item">
      <Stack direction="row" spacing={1} alignItems="center">
        <Chip size="small" label={ROSTER_KIND_NAME[item.kind]} />
        <Typography variant="h6" component="h3">{item.title}</Typography>
      </Stack>
      {item.author && <Typography variant="body2" sx={{ mb: 1 }}>By <KeyName pubkey={item.author} /></Typography>}
      {state && (
        <Chip size="small" data-testid="adventure-state" label={state.text} sx={{ mb: 1, maxWidth: '100%', height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal' } }}
          color={state.state === 'on' ? 'success' : state.state === 'coming' ? 'info' : 'default'} variant={state.state === 'on' ? 'filled' : 'outlined'} />
      )}
      <Box component="dl" sx={{ m: 0 }}>
        {item.kind === 'operation' && (item.coordinator ?? item.author) && (
          <Field label="Coordinated by"><KeyName pubkey={item.coordinator ?? item.author} /></Field>
        )}
        {item.kind === 'operation' && own && !item.coordinator && !item.author && <Field label="Coordinated by">you</Field>}
        {item.ended && !adventure && <Field label="Ended">{`${item.ended.date}: ${item.ended.why}`}</Field>}
        {item.call && (
          <>
            <Field label="The call">{item.call.what}</Field>
            <Field label="Its odds">{item.call.odds}</Field>
            <Field label="Its source">
              <Link href={item.call.source} target="_blank" rel="noopener noreferrer" underline="always">{hostOf(item.call.source)}</Link>
            </Field>
          </>
        )}
        {item.hazards && item.hazards.length > 0 && <Field label="Its hazards">{item.hazards.join('\n')}</Field>}
        {item.fromHome && <Field label="From home">{item.fromHome}</Field>}
        {item.purpose && <Field label={purposeLabel(item.kind)}>{item.purpose}</Field>}
        {item.endState && <Field label="End state">{item.endState}</Field>}
        {item.criteria && item.criteria.length > 0 && (
          <Field label="Criteria">{item.criteria.map((c) => `${c.label}: ${c.target}`).join('\n')}</Field>
        )}
        {item.evidence && <Field label="Evidence standard">{item.evidence}</Field>}
        {item.firstStep && <Field label="A first step">{item.firstStep}</Field>}
        {item.forWhom && <Field label="Who it is for">{item.forWhom}</Field>}
        {item.limits.length > 0 && <Field label="Limits">{item.limits.join('\n')}</Field>}
        {item.window && <Field label="Window">{`${item.window.from ? momentText(item.window.from) : 'open'} to ${item.window.until ? momentText(item.window.until) : 'open'}`}</Field>}
        {item.places.length > 0 && <Field label="Places">{item.places.join(', ')}</Field>}
        {item.text && <Field label="Text">{item.text}</Field>}
        {item.heldBack && item.heldBack.length > 0 && (
          <Field label="Held back">{['Starcom held back what names or places people:', ...item.heldBack].join('\n')}</Field>
        )}
        {item.toward.length > 0 && <Field label="Works toward">{item.toward.map((l) => titleOf(l.coordinate)).join('\n')}</Field>}
        {item.grewInto && item.grewInto.length > 0 && <Field label="Grew into">{item.grewInto.map((l) => titleOf(l.coordinate)).join('\n')}</Field>}
      </Box>
      {cited && (
        <Typography variant="body2" data-testid="roster-cited" sx={{ mt: 1 }}>
          {citingWorkText(cited, item.kind === 'cause' ? 'cite it' : 'toward it')}
        </Typography>
      )}
      {cited && cited.missions.length > 0 && (
        <Box data-testid="roster-cited-missions" sx={{ mt: 0.5 }}>
          <Typography variant="subtitle2">Missions toward it</Typography>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {cited.missions.map((p) => <li key={p.event.id}>{missionCardOf(p).headline || p.check.manifest?.name || p.event.id.slice(0, 8)}</li>)}
          </ul>
        </Box>
      )}
      {/* An adventure this person called: the returns sealed to them (RS41). */}
      {adventure && item.address && me && item.author === me && <AdventureReturns address={item.address} />}
      {item.kind === 'cause' && item.address && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
          <Button size="small" variant={followsCause(item.address) ? 'contained' : 'outlined'}
            onClick={() => (followsCause(item.address!) ? unfollowCause(item.address!) : followCause(item.address!))}>
            {followsCause(item.address) ? 'Following this cause' : 'Follow this cause'}
          </Button>
          <Typography variant="caption">Kept on this device only. No one else sees whom or what you follow.</Typography>
        </Stack>
      )}
      {saga && (
        <>
          <Box data-testid="saga-chosen" sx={{ mt: 1 }}>
            <Typography variant="subtitle2">{`Chosen by its author (${chosen.length})`}</Typography>
            <ul style={{ margin: 0, paddingLeft: 18 }}>{chosen.map((c) => <li key={c}>{titleOf(c)}</li>)}</ul>
          </Box>
          <Box data-testid="saga-told" sx={{ mt: 1 }}>
            <Typography variant="subtitle2">{`Told toward it (${told.length})`}</Typography>
            <ul style={{ margin: 0, paddingLeft: 18 }}>{told.map((x) => <li key={x.address}>{x.title}</li>)}</ul>
          </Box>
        </>
      )}
      <Progress item={item} />
      {quest && <QuestSteps item={item} titleOf={titleOf} packageOf={packageOf} onOpen={openOf} />}
      {adventure && state && (
        <>
          <Box data-testid="adventure-rules" sx={{ mt: 1 }}>
            <Typography variant="subtitle2">Every adventure keeps these</Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, listStyleType: 'disc' }}>
              {SAFETY_RULES.map((rule) => <li key={rule}><Typography variant="body2">{rule}</Typography></li>)}
            </Box>
          </Box>
          {base && (base.state === 'on' || base.state === 'coming') && <AdventureWarnings loading={nws.loading} watch={nws.watch} />}
          <AdventureTrials item={item} state={state} nws={nwsReadingOf(item.places, nws)} titleOf={titleOf} packageOf={packageOf} />
          {item.author && item.address && item.author !== me && state.state !== 'coming' && (
            <AdventureReturn item={item as ReadRosterItem} onStory={onWriteStory && (() => onWriteStory({
              title: `Adventure: ${item.title}`.slice(0, 200), toward: [{ coordinate: item.address!, relay: '' }],
            }))} />
          )}
          {item.address && <AdventureTotals address={item.address} />}
        </>
      )}
      {startable && !started && (
        <Button sx={{ mt: 1 }} variant="contained" onClick={() => startQuestLine(item.address!)}>Start this quest line</Button>
      )}
      {startable && started && (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
          <Typography variant="caption">{`Started ${dayOf(started.since)}, on this device.`}</Typography>
          <Button size="small" onClick={() => leaveQuestLine(item.address!)}>Leave it</Button>
        </Stack>
      )}
      {(countedUnder.length > 0 || claims.length > 0) && (
        <Box data-testid="roster-under" sx={{ mt: 1 }}>
          <Typography variant="subtitle2">Under it</Typography>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {countedUnder.map((l) => <li key={`c-${l.coordinate}`}>{titleOf(l.coordinate)}, counted by its author</li>)}
            {claims.map((x) => <li key={`w-${x.address}`}>{x.title}, claimed by the work</li>)}
          </ul>
        </Box>
      )}
      {own && (item.kind === 'operation' || adventure) && !item.ended && !ending && (
        <Button sx={{ mt: 1, mr: 1 }} variant="outlined" onClick={() => setEnding(true)}>{adventure ? 'Call it off' : 'Mark it ended'}</Button>
      )}
      {own && ending && !item.ended && (
        <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="center">
          <TextField label={adventure ? 'Why it was called off' : 'Why it ended'} id="roster-ended-why" value={why} onChange={(e) => setWhy(e.target.value)} size="small" />
          <Button variant="contained" onClick={() => { own.onEnd(why.trim()); setEnding(false); }}>{adventure ? 'Call it off now' : 'End it'}</Button>
        </Stack>
      )}
      {own && item.kind === 'operation' && item.ended && (
        <Button sx={{ mt: 1, mr: 1 }} variant="outlined" onClick={own.onStory}>Write its after-action story</Button>
      )}
      {/* Grown from its address, so what it grows into links toward it: once its author has a key (RS54). */}
      {own?.onGrow && item.kind === 'initiative' && !item.address && (
        <Typography variant="caption" display="block" sx={{ mt: 1 }}>Post it first, so what it grows into can link to it.</Typography>
      )}
      {own?.onGrow && item.kind === 'initiative' && item.address && (
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button variant="outlined" onClick={() => own.onGrow!('campaign')}>Grow it into a campaign</Button>
          <Button variant="outlined" onClick={() => own.onGrow!('epic')}>Grow it into an epic</Button>
        </Stack>
      )}
      <Button sx={{ mt: 1 }} onClick={onBack}>Back</Button>
    </Paper>
  );
};

/* ── The tab ────────────────────────────────────────────────────────────── */

const ItemRow: React.FC<{ item: ReadRosterItem; onOpen: () => void }> = ({ item, onOpen }) => {
  const following = isFollowed(item.author);
  return (
    <Stack direction="row" spacing={1} alignItems="center" data-testid="roster-row" sx={{ py: 0.5, flexWrap: 'wrap' }}>
      <Chip size="small" label={ROSTER_KIND_NAME[item.kind]} />
      <Button size="small" onClick={onOpen} sx={{ textTransform: 'none' }}>{item.title}</Button>
      <Typography variant="caption">by <KeyName pubkey={item.author} /></Typography>
      <Button size="small" variant={following ? 'contained' : 'outlined'}
        onClick={() => (following ? unfollow(item.author) : follow(item.author))}>
        {following ? 'Following' : 'Follow'}
      </Button>
    </Stack>
  );
};

type View =
  | { kind: 'list' }
  /** `grownFrom`: the initiative it is grown from, which says it grew into it once it is kept (RS54). */
  | { kind: 'edit'; rosterKind: RosterKind; d: string | null; prefill?: Partial<RosterItem>; grownFrom?: string }
  | { kind: 'post'; d: string }
  | { kind: 'open'; item: RosterItem & { author?: string; address?: string; heldBack?: string[] } }
  | { kind: 'own'; d: string };

/** A quest's row in Your quests: how many of its missions are finished. */
const QuestRow: React.FC<{ item: RosterItem; onOpen: () => void }> = ({ item, onOpen }) => {
  const tally = questTally(questSteps(item, finishedAt));
  return (
    <Stack direction="row" spacing={1} alignItems="center" data-testid="quest-row" sx={{ py: 0.5, flexWrap: 'wrap' }}>
      <Chip size="small" label={ROSTER_KIND_NAME[item.kind]} />
      <Button size="small" onClick={onOpen} sx={{ textTransform: 'none' }}>{item.title}</Button>
      <Typography variant="caption">{tally.total === 0 ? 'No missions in it yet' : `${tally.finished} of ${tally.total} finished`}</Typography>
    </Stack>
  );
};

/** A story asked for from elsewhere: a finished mission, a closed case (RS51). */
export interface WriteStory {
  title: string;
  /** The address of what it is the account of, when it has one. */
  toward?: string;
}

const storyView = (ask: WriteStory): View => ({
  kind: 'edit', rosterKind: 'story', d: null,
  prefill: { title: ask.title.slice(0, 200), ...(ask.toward ? { toward: [{ coordinate: ask.toward, relay: '' }] } : {}) },
});

const OperationsPanel: React.FC<{
  /** An item to open as the tab opens: a campaign or an operation clicked on the globe (RS25). */
  openAddress?: string;
  /** A story to write as the tab opens. */
  writeStory?: WriteStory;
}> = ({ openAddress, writeStory }) => {
  const drafts = useDrafts();
  useFollowed();
  useFollowedCauses();
  useTakenMissions();
  const items = useRoster();
  const status = useReadStatus();
  const started = useStarted();
  const [view, setView] = useState<View>(() => (writeStory ? storyView(writeStory) : { kind: 'list' }));
  // Asked again with another story while open: that one.
  const storyAsked = writeStory ? `${writeStory.title}|${writeStory.toward ?? ''}` : '';
  const [storyOpened, setStoryOpened] = useState(storyAsked);
  useEffect(() => {
    if (!writeStory || storyAsked === storyOpened) return;
    setView(storyView(writeStory));
    setStoryOpened(storyAsked);
  }, [writeStory, storyAsked, storyOpened]);
  const [said, setSaid] = useState('');
  const me = nostrIdentityService.signerPubkey();

  useEffect(() => startRosterRead(), []);
  // Opened from the globe: the item, once it has been read.
  const [opened, setOpened] = useState<string | null>(null);
  useEffect(() => {
    if (!openAddress || opened === openAddress) return;
    const found = items.find((i) => i.address === openAddress);
    if (found) { setView({ kind: 'open', item: found }); setOpened(openAddress); }
  }, [openAddress, opened, items]);
  useEffect(() => { void verifySigners([...new Set(items.map((i) => i.author))]); }, [items]);

  // A publisher followed, or a cause followed here (RS22, RS53).
  const isFollowing = (i: ReadRosterItem) => isFollowed(i.author) || (i.kind === 'cause' && followsCause(i.address));
  const following = items.filter(isFollowing);
  const everyone = items.filter((i) => !isFollowing(i));
  // Your quests: one's own, kept here, and the quest lines one has started (RS8, RS9).
  const ownQuests = drafts.filter((d) => isQuestKind(d.kind));
  const startedLines = items.filter((i) => i.kind === 'quest_line' && i.author !== me && started.some((s) => s.address === i.address));
  const startedUnread = status.loaded ? started.filter((s) => !items.some((i) => i.address === s.address)).length : 0;
  const openItem = (i: ReadRosterItem) => setView({ kind: 'open', item: i });
  const writeStoryOf = (prefill: Partial<RosterItem>) => setView({ kind: 'edit', rosterKind: 'story', d: null, prefill });

  if (view.kind === 'edit') {
    const editing = view.d ? drafts.find((x) => x.d === view.d) ?? null : null;
    const { grownFrom } = view;
    // The initiative it grew from says so, by the new item's address (RS54).
    const onKept = grownFrom && me ? (d: string) => {
      const from = drafts.find((x) => x.d === grownFrom);
      if (!from) return;
      const coordinate = coordinateOf(me, d);
      if ((from.grewInto ?? []).some((l) => l.coordinate === coordinate)) return;
      const { updatedAt: _u, posts: _p, ...initiative } = from;
      saveDraft({ ...initiative, grewInto: [...(initiative.grewInto ?? []), { coordinate, relay: '' }] });
    } : undefined;
    return <RosterEditor kind={view.rosterKind} editing={editing} prefill={view.prefill} onDone={() => setView({ kind: 'list' })} onKept={onKept} />;
  }
  if (view.kind === 'open') {
    return <RosterItemView key={view.item.address} item={view.item} all={items} onBack={() => setView({ kind: 'list' })} onOpenItem={openItem} onWriteStory={writeStoryOf} />;
  }
  if (view.kind === 'own') {
    const draft = drafts.find((x) => x.d === view.d);
    if (draft) {
      const address = me ? coordinateOf(me, draft.d) : undefined;
      return (
        <RosterItemView
          item={{ ...draft, ...(me ? { author: me, address } : {}) }}
          all={items}
          onBack={() => setView({ kind: 'list' })}
          onOpenItem={openItem}
          onWriteStory={writeStoryOf}
          own={{
            onEnd: (why) => { const { updatedAt: _u, posts: _p, ...item } = draft; saveDraft({ ...item, ended: { date: today(), why } }); },
            onStory: () => setView({ kind: 'edit', rosterKind: 'story', d: null, prefill: {
              title: `After action: ${draft.title}`.slice(0, 200),
              ...(address ? { toward: [{ coordinate: address, relay: '' }] } : {}),
            } }),
            onGrow: (kind) => setView({
              kind: 'edit', rosterKind: kind, d: null, grownFrom: draft.d,
              prefill: { title: draft.title, places: draft.places, ...(address ? { toward: [{ coordinate: address, relay: '' }] } : {}) },
            }),
          }}
        />
      );
    }
  }

  return (
    <Box data-testid="operations">
      <Typography variant="h6" component="h2" gutterBottom>Operations</Typography>
      <Typography variant="body2" sx={{ mb: 1 }}>
        A directive says what is wanted, and the limits. An epic says when it is done, as counts.
        A campaign and an operation are bounded in time and place.
        A quest line teaches a skill, one mission after another. A quest is a goal you set yourself.
        An adventure is a call to go out, while something is happening.
        A cause is a concern to follow: it gives no orders. An initiative proposes a first step, and grows when others join.
        A story tells what was done, seen and counted. A saga gathers the stories of a place or a thing, over years.
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
        <Button variant="contained" onClick={() => setView({ kind: 'edit', rosterKind: 'directive', d: null })}>New directive</Button>
        <Button variant="contained" onClick={() => setView({ kind: 'edit', rosterKind: 'epic', d: null })}>New epic</Button>
        <Button variant="contained" onClick={() => setView({ kind: 'edit', rosterKind: 'campaign', d: null })}>New campaign</Button>
        <Button variant="contained" onClick={() => setView({ kind: 'edit', rosterKind: 'operation', d: null })}>New operation</Button>
        <Button variant="contained" onClick={() => setView({ kind: 'edit', rosterKind: 'quest_line', d: null })}>New quest line</Button>
        <Button variant="contained" onClick={() => setView({ kind: 'edit', rosterKind: 'quest', d: null })}>New quest</Button>
        <Button variant="contained" onClick={() => setView({ kind: 'edit', rosterKind: 'adventure', d: null })}>New adventure</Button>
        <Button variant="contained" onClick={() => setView({ kind: 'edit', rosterKind: 'cause', d: null })}>New cause</Button>
        <Button variant="contained" onClick={() => setView({ kind: 'edit', rosterKind: 'initiative', d: null })}>New initiative</Button>
        <Button variant="contained" onClick={() => setView({ kind: 'edit', rosterKind: 'story', d: null })}>New story</Button>
        <Button variant="contained" onClick={() => setView({ kind: 'edit', rosterKind: 'saga', d: null })}>New saga</Button>
      </Stack>

      <Box data-testid="operations-quests" sx={{ mb: 2 }}>
        <Typography variant="subtitle1" component="h3">Your quests</Typography>
        {ownQuests.length === 0 && startedLines.length === 0 && <Typography variant="body2">No quests yet. Set one, or start a quest line.</Typography>}
        {ownQuests.map((d) => <QuestRow key={d.d} item={d} onOpen={() => setView({ kind: 'own', d: d.d })} />)}
        {startedLines.map((i) => <QuestRow key={i.address} item={i} onOpen={() => openItem(i)} />)}
        {startedUnread > 0 && (
          <Typography variant="caption" display="block">{`${startedUnread} started here ${startedUnread === 1 ? 'is' : 'are'} not read from the relays.`}</Typography>
        )}
      </Box>

      <Box data-testid="operations-own" sx={{ mb: 2 }}>
        <Typography variant="subtitle1" component="h3">On this device</Typography>
        {drafts.length === 0 && <Typography variant="body2">Nothing on this device yet.</Typography>}
        {drafts.map((d) => (
          <Box key={d.d} sx={{ py: 0.5 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
              <Chip size="small" label={ROSTER_KIND_NAME[d.kind]} />
              <Button size="small" sx={{ textTransform: 'none' }} onClick={() => setView({ kind: 'own', d: d.d })}>
                {d.title}
              </Button>
              <Typography variant="caption">{postedLine(d)}</Typography>
              <Button size="small" onClick={() => setView({ kind: 'edit', rosterKind: d.kind, d: d.d })}>Edit</Button>
              <Button size="small" onClick={() => { setSaid(''); setView({ kind: 'post', d: d.d }); }}>Post</Button>
              <Button size="small" onClick={() => removeDraft(d.d)}>Remove</Button>
            </Stack>
            {view.kind === 'post' && view.d === d.d && (
              <PostRoster draft={d} onDone={(text) => { setSaid(text); setView({ kind: 'list' }); }} />
            )}
          </Box>
        ))}
        {said && <Alert severity="info" sx={{ mt: 1 }} data-testid="roster-post-outcome">{said}</Alert>}
      </Box>

      {following.length > 0 && (
        <Box data-testid="operations-following" sx={{ mb: 2 }}>
          <Typography variant="subtitle1" component="h3">Following</Typography>
          {following.map((i) => <ItemRow key={i.address} item={i} onOpen={() => openItem(i)} />)}
        </Box>
      )}

      <Box data-testid="operations-everyone">
        <Typography variant="subtitle1" component="h3">Everyone</Typography>
        <Typography variant="caption" display="block" sx={{ mb: 0.5 }}>Each is its publisher's own. None is marked until you follow them.</Typography>
        {status.error && <Alert severity="warning">{status.error}</Alert>}
        {!status.loaded && !status.error && everyone.length === 0 && <Typography variant="body2">Reading the relays…</Typography>}
        {status.loaded && everyone.length === 0 && <Typography variant="body2">None posted yet.</Typography>}
        {everyone.map((i) => <ItemRow key={i.address} item={i} onOpen={() => openItem(i)} />)}
      </Box>
    </Box>
  );
};

export default OperationsPanel;

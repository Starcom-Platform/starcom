import React, { useState, useEffect, useContext, useSyncExternalStore } from 'react';
import { EnhancedApplicationRouterContext } from '../../context/EnhancedApplicationRouterContext';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  Stack,
  CircularProgress,
  Avatar,
  Card,
  CardContent,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import {
  UserPlus,
  Settings,
  Zap
} from 'lucide-react';
import { realTimeTeamService } from '../../services/RealTimeTeamService';
import { chatActivityLogStore } from '../../services/ChatActivityLogStore';
import type { TeamMember as RealTeamMember, CyberTeam } from '../../types/cyberInvestigation';
import { subscribeSealedChat, type SealedChatMessage } from '../../services/chat/sealedChat';
import { sendTeamMessage, teamChatKey, teamMembersFor } from '../../services/chat/teamChat';
import { readRelayInfo } from '../../services/nostr/relayInfo';
import { joinedRelays, relayAddress } from '../../services/nostr/joinedRelays';
import { lookAt } from '../../services/chat/chatUnread';
import { nostrIdentityService } from '../../services/identity/NostrIdentityService';
import { subscribeKeyLock } from '../../services/identity/keyLock';
import KeyName from '../../components/Identity/KeyName';
import Translatable from '../../components/Translation/Translatable';
import type { ApplicationContext } from '../../components/Router/EnhancedApplicationRouter';
import { MissionsPanel } from './missions/MissionsPanel';
import OperationsPanel from './operations/OperationsPanel';
import { listDrafts, subscribeDrafts } from '../../services/roster/rosterDrafts';
import { createLogger } from '@utils/logger';
import UtcTime from '../../components/Shared/UtcTime';
import { formatUtcDateTime } from '../../utils/utcTime';
import CreateTeamForm from './teams/CreateTeamForm';
import InviteLinkForm from './teams/InviteLinkForm';
import RelayAdminPanel from './teams/RelayAdminPanel';
import AccessRequestForm from './teams/AccessRequestForm';
import WhatIs from '../../components/Help/WhatIs';
import { useOpenCaseCount } from '../../hooks/useOpenCaseCount';
import { SHELL_PADDING } from '../../styles/shell';
const log = createLogger({ prefix: 'TeamWorkspaceApplication' });

// Missions draws in the root theme (starcomTheme, from the tokens), as Cases does
// (block D, step 9). Its own theme here glowed neon cyan around every panel.

// Real operative roster, sourced from realTimeTeamService (see Phase 3 de-fake pass) —
// no per-user "my team" resolution exists yet, so this flattens members across all known
// teams, deduped by identity. Keyed by pubkey first, falling back to walletAddress —
// NOT walletAddress alone: joinTeam() defaults an unset walletAddress to the literal
// string 'unknown', so two genuinely distinct pubkey-only members (e.g. AI agents with
// no wallet) would otherwise collapse into a single roster entry. Matches
// InvestigationContext.tsx's identical dedup logic for the same reason.
const dedupeMembers = (members: RealTeamMember[]): RealTeamMember[] => {
  const byIdentity = new Map<string, RealTeamMember>();
  for (const m of members) byIdentity.set(m.pubkey ?? m.walletAddress, m);
  return Array.from(byIdentity.values());
};

/**
 * The workspace's tabs, as one list. `activeTab` and the deep-link guard both
 * derive from this, so adding a tab cannot leave it un-linkable.
 */
/**
 * `investigations` was removed here, not renamed.
 *
 * It listed a legacy per-team investigation store, and both of its buttons
 * already navigated to /cases-dashboard — Investigations and Cases are the same
 * concept, decided in canonical-investigation-case-system.md, and this team's
 * records migrate automatically via services/intel/migration/
 * investigationsToCases.ts. Keeping a tab whose every action left the tab was
 * keeping a second name for Cases in the primary navigation.
 */
const WORKSPACE_TABS = ['overview', 'missions', 'operations', 'chat', 'operatives', 'admin'] as const;
type WorkspaceTab = (typeof WORKSPACE_TABS)[number];
const isWorkspaceTab = (v: unknown): v is WorkspaceTab =>
  typeof v === 'string' && (WORKSPACE_TABS as readonly string[]).includes(v);

// This is the Missions app reached via the app-switcher (id
// 'teamworkspace', registered in EnhancedApplicationRouter.tsx; OpsCenter
// until K1) — the
// canonical team UI. src/pages/Teams/TeamWorkspace.tsx (routed at
// /team/:teamId) used to be a second, independent implementation; it's now
// a thin redirect shim into this app (see Team UI Consolidation plan) —
// its one unique capability, the Investigations tab, was ported in below.
const TeamWorkspaceApplication: React.FC<ApplicationContext> = (props) => {
  const initialTeamId = typeof props.initialTeamId === 'string' ? props.initialTeamId : '';
  // Validated against the tab list itself, not a hand-kept subset. The
  // previous guard admitted only a hand-kept subset, so a deep-link
  // to any other tab fell through to Overview — silently, with the caller's
  // navigateToApp assertion still passing. 'missions' was unreachable that
  // way despite MissionsPanel being the tab most worth linking to. Opened
  // plain, it opens on missions, the tab it is named for (K1).
  // Operations took the empty Projects tab's place (D-RS, RS20): a link to 'projects' opens Operations.
  const askedTab = props.initialTab === 'projects' ? 'operations' : props.initialTab;
  const initialTab = isWorkspaceTab(askedTab) ? askedTab : 'missions';
  /** A case that decided a mission was warranted, carried from the Cases screen. */
  const missionFromCase = typeof props.missionFromCase === 'string' ? props.missionFromCase : undefined;
  /** Arrives from /r/mission/:id. The tab is set alongside it, or the link lands on Overview. */
  const selectMissionId = typeof props.selectMissionId === 'string' ? props.selectMissionId : undefined;

  // State management
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab);
  const operationsKept = useSyncExternalStore(subscribeDrafts, () => listDrafts().length, () => listDrafts().length);
  /*
   * The tab and the bar agree (plan item 4.6). This read its tab only on
   * mounting, so the app chosen from the bar while on another tab kept that
   * tab on screen. It follows the tab it is handed, and tells the router which
   * one shows. Optional: rendered without the router, as in tests, it only
   * follows.
   */
  const router = useContext(EnhancedApplicationRouterContext);
  useEffect(() => { setActiveTab(initialTab); }, [initialTab]);
  const chooseTab = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    router?.setContext('initialTab', tab);
  };
  const [teamMembers, setTeamMembers] = useState<RealTeamMember[]>([]);
  const [teams, setTeams] = useState<CyberTeam[]>([]);

  // Invite flow state — real generateSecureInviteCode/createTeam calls, no fabricated data.
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [askToJoinOpen, setAskToJoinOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');

  // Mecha Jono invite (Cycle 8) — direct join, not the invite-code flow
  // above: Mecha Jono is Starcom's own AI agent, not an external human
  // needing an invite code to redeem later.

  // Chat tab state — deliberately separate from selectedTeamId (invite
  // dialog state above): sharing one state would mean opening the invite
  // dialog silently switches which team's chat is displayed, and vice
  // versa. Two unrelated UI concerns that happen to both need "a team".
  const [chatTeamId, setChatTeamId] = useState(initialTeamId);
  const [chatMessages, setChatMessages] = useState<SealedChatMessage[]>([]);
  const [chatMessageInput, setChatMessageInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Real, cross-channel message-activity count for the Admin tab's analytics
  // panel — null until the first fetch resolves (not a fabricated 0),
  // refreshed periodically.
  const [chatStats, setChatStats] = useState<{ sent: number; received: number } | null>(null);
  const openCaseCount = useOpenCaseCount();
  useEffect(() => {
    let cancelled = false;
    const refreshChatStats = () => {
      chatActivityLogStore.getRecentStats().then(stats => {
        if (!cancelled) setChatStats({ sent: stats.sent, received: stats.received });
      }).catch(err => log.error('Failed to load chat activity stats', err));
    };
    refreshChatStats();
    const interval = setInterval(refreshChatStats, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Load real team rosters and keep them live via realTimeTeamService's event bus.
  useEffect(() => {
    const refresh = () => {
      const realTeams = realTimeTeamService.getTeams();
      setTeams(realTeams);
      setTeamMembers(dedupeMembers(realTeams.flatMap(t => t.members)));
    };

    setLoading(true);
    try {
      refresh();
    } catch (error) {
      log.error('Error loading team data:', error);
    } finally {
      setLoading(false);
    }

    const unsubscribers = [
      realTimeTeamService.on('team-created', refresh),
      realTimeTeamService.on('member-joined', refresh),
      realTimeTeamService.on('member-left', refresh),
      realTimeTeamService.on('member-status-updated', refresh)
    ];
    return () => unsubscribers.forEach(unsub => unsub());
  }, []);

  // Default the chat tab to the first known team once teams load — only
  // when nothing is selected yet, so switching teams from the selector
  // isn't overridden on the next roster refresh.
  useEffect(() => {
    if (!chatTeamId && teams.length > 0) {
      setChatTeamId(teams[0].id);
    }
  }, [teams, chatTeamId]);

  // The team's chat, sealed to each member (plan item 2.7). It was a NIP-28
  // channel named from the team's id: anyone could work it out, and every
  // message crossed the relays as plain text. A team is named in its messages
  // by its relay, the one thing every member's machine agrees on.
  const chatTeam = teams.find((t) => t.id === chatTeamId) ?? null;
  const chatKey = chatTeam ? teamChatKey(chatTeam) : null;

  /*
   * Whether the team's relay still lets you in, read when its chat opens (plan
   * item 9.8). A removed member was told nothing: the chat looked the same, and
   * what they wrote reached nobody. A members-only relay refuses a removed
   * member its list, and that refusal is said here.
   *
   * The same read says who is on the team (plan item 9.9, decision G4). A team
   * message is placed by the tag it carries, and anyone can seal one, so a
   * sender not on the relay's list is shown, flagged. The relay's operator,
   * named in its own description (NIP-11 `pubkey`), may write without being
   * listed. Nothing is read until the chat is open: a read signs in to the
   * team's relay.
   */
  const chatOpen = activeTab === 'chat';
  const [chatStanding, setChatStanding] = useState<string | null>(null);
  const [chatSenders, setChatSenders] = useState<{ members: Set<string> } | { unchecked: string } | null>(null);
  /*
   * This browser's key is locked (D-KL): the team relay is never signed in to, so nothing of the team's can be read or
   * checked until the person opens it. Said with the way to open it, rather than as a relay that did not answer.
   */
  const [chatLocked, setChatLocked] = useState(false);
  const [lockTick, setLockTick] = useState(0);
  useEffect(() => subscribeKeyLock(() => setLockTick((n) => n + 1)), []);
  const [chatOperator, setChatOperator] = useState<string | null>(null);
  useEffect(() => {
    setChatStanding(null);
    setChatSenders(null);
    setChatOperator(null);
    setChatLocked(false);
    if (!chatOpen || !chatTeam?.relayUrl || !chatTeam.relayPubkey) return;
    let live = true;
    const name = chatTeam.name;
    teamMembersFor(chatTeam)
      .then((read) => {
        if (!live) return;
        if ('unreadable' in read) {
          if (read.unreadable === 'locked') {
            setChatLocked(true);
          } else if (read.unreadable === 'refused') {
            setChatStanding(`${name}'s relay would not show its member list (${read.reason}). You may have been removed from ${name}: nothing can be sent to it.`);
          } else {
            setChatSenders({ unchecked: `Senders are not checked: the member list could not be read (${read.reason}).` });
          }
          return;
        }
        setChatSenders(read.source === 'relay'
          ? { members: new Set(read.members) }
          : { unchecked: `Senders are not checked: ${name}'s relay publishes no member list.` });
      })
      .catch(() => { /* the send says why, if it comes to that */ });
    readRelayInfo(chatTeam.relayUrl)
      .then((info) => { if (live) setChatOperator(info.operatorPubkey ?? null); })
      .catch(() => { /* no operator named: nobody is set apart */ });
    return () => { live = false; };
    // The team's identity, not the object: a roster refresh must not read the relay again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, chatTeam?.id, chatTeam?.relayUrl, chatTeam?.relayPubkey, lockTick]);

  /*
   * When you joined a team someone else made (plan item 9.7, decision G7). Each
   * message is sealed to the members at the time it is sent, so a member who
   * joins later cannot read what came before, and the chat said only "No
   * messages yet." A team made here has its maker as lead; one joined by invite
   * or request was recorded with none (recordJoinedTeam), and its relay was kept
   * as joined at that moment.
   */
  const chatJoinedAt = (() => {
    if (!chatTeam?.relayUrl || chatTeam.lead) return null;
    const address = relayAddress(chatTeam.relayUrl);
    const at = joinedRelays().find((r) => relayAddress(r.url) === address)?.joinedAt;
    const ms = at ? Date.parse(at) : NaN;
    return Number.isFinite(ms) ? ms : null;
  })();

  // Open on a team, its chat is where the team's messages are read (plan item 9.12).
  useEffect(() => (chatOpen && chatKey ? lookAt(`team:${chatKey}`) : undefined), [chatOpen, chatKey]);

  /** What is said beside a team message's sender: who runs the relay, or that they are not on its list. */
  const senderNote = (sender: string): { text: string; flag: boolean } | null => {
    if (!sender || sender === nostrIdentityService.signerPubkey()) return null;
    if (chatOperator && sender === chatOperator) return { text: "Runs this team's relay", flag: false };
    if (chatSenders && 'members' in chatSenders && !chatSenders.members.has(sender)) return { text: "Not on this team's member list", flag: true };
    return null;
  };
  useEffect(() => {
    setChatMessages([]);
    setChatError(null);
    if (!chatKey) return;
    return subscribeSealedChat((message) => {
      if (message.team !== chatKey) return;
      setChatMessages((prev) => (prev.some((m) => m.id === message.id)
        ? prev
        : [...prev, message].sort((a, b) => a.timestamp - b.timestamp)));
    });
  }, [chatKey]);

  const handleSendChatMessage = async () => {
    const content = chatMessageInput.trim();
    if (!content || !chatTeam || !chatKey || chatSending) return;
    setChatSending(true);
    setChatError(null);
    try {
      const sent = await sendTeamMessage(chatTeam, content);
      setChatMessageInput('');
      // Yours, shown once: no copy is sealed back to you.
      setChatMessages((prev) => [...prev, {
        id: sent.id, senderId: nostrIdentityService.signerPubkey() ?? '', recipients: sent.reached, content,
        timestamp: Date.now(), postQuantum: sent.postQuantum, decryptionFailed: false, team: chatKey,
      }]);
      if (sent.notReached.length > 0) {
        setChatError(`Not sealed to ${sent.notReached.length} of the team: ${sent.notReached.map((n) => n.reason).join('; ')}`);
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err));
    } finally {
      setChatSending(false);
    }
  };

  const handleOpenInvite = () => {
    setSelectedTeamId(teams[0]?.id ?? '');
    setInviteDialogOpen(true);
  };


  // No live presence signal exists for team members — nothing in
  // RealTimeTeamService ever transitions status away from the 'ONLINE' it's
  // hardcoded to at join time (confirmed: zero real callers of
  // updateMemberStatus), so a colored online/away/offline indicator would
  // be fabricated, not real. Matches the fix already applied to
  // CollaborationSidebar.tsx for the same reason — joinedAt is genuine,
  // unchanging fact instead.
  const formatTime = (timestamp: string | number | Date): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatUtcDateTime(date.getTime(), { year: true });
  };

  // CyberInvestigation.priority is uppercase ('LOW'|'MEDIUM'|'HIGH'|'CRITICAL') —
  // lowercased here so this doesn't silently fall through to the default for
  // every real investigation.
  if (loading) {
    return (
      <>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <CircularProgress />
          <Typography variant="h6" sx={{ ml: 2 }}>Loading Team Workspace...</Typography>
        </Box>
      </>
    );
  }

  return (
    <>
      <Box sx={{ 
        p: SHELL_PADDING, 
        // The shell's area, not the window's: at 100vh about 37 px were cut off
        // at 900 px tall (critique audit, section 5).
        height: '100%', 
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
  {/* Header */}
  <Box sx={{ mb: 3, position: 'relative', zIndex: 1 }}>
        {/* Tab Navigation. Wraps (K2): on a phone the six tabs, about 550 px,
            ran off both ends of the screen. */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, justifyContent: 'center' }}>
          {WORKSPACE_TABS.map((tab) => (
            <Button
              key={tab}
              variant={activeTab === tab ? 'contained' : 'outlined'}
              // Which tab is active was communicated by fill colour alone.
              onClick={() => chooseTab(tab)}
              aria-current={activeTab === tab ? 'page' : undefined}
              sx={{ textTransform: 'capitalize' }}
            >
              {tab}
            </Button>
          ))}
        </Box>
      </Box>

      {/* Tab Content */}
      <Box sx={{ 
        // What is left below the header and tabs, however tall they are.
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
            {/* Team Status */}
            <Box>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" component="h2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <UserPlus size={20} />
                  Team Status
                </Typography>
                {teams.length === 0 ? (
                  // Where a team starts (plan item 2.3, story S4): it used to be
                  // possible only from Admin, with nothing here to press.
                  <Stack spacing={1} alignItems="flex-start">
                    <Typography variant="body2" color="text.secondary">
                      No registered teams yet.
                    </Typography>
                    <Button variant="contained" size="small" onClick={() => setCreateTeamOpen(true)}>
                      Create a team
                    </Button>
                  </Stack>
                ) : teamMembers.length === 0 && (
                  <Typography variant="body2" color="text.secondary">
                    No members yet.
                  </Typography>
                )}
                {/* Which teams are here, by name and relay: after making one, the lead saw
                    themselves as a member and never which team they had made. */}
                {teams.length > 0 && (
                  <List dense disablePadding data-testid="overview-teams">
                    {teams.map((t) => (
                      <ListItem key={t.id} disableGutters>
                        <ListItemText
                          primary={t.name}
                          secondary={t.relayUrl ? `relay ${t.relayUrl.replace(/^wss?:\/\//, '')}` : 'no relay'}
                        />
                      </ListItem>
                    ))}
                  </List>
                )}
                {/* Without an invite, a person asks an admin to let their key in (plan item 2.3, step 5). */}
                <Button variant="outlined" size="small" sx={{ mt: 1 }} onClick={() => setAskToJoinOpen(true)}>
                  Ask to join a team
                </Button>
                <List>
                  {teamMembers.slice(0, 5).map((member) => (
                    <ListItem key={member.pubkey ?? member.walletAddress}>
                      <ListItemAvatar>
                        <Avatar>{member.name.split(' ').map(n => n[0]).join('')}</Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={member.name}
                        secondary={member.role}
                      />
                      <Typography variant="caption" color="text.secondary">
                        {member.joinedAt ? `Joined ${formatTime(member.joinedAt)}` : member.role}
                      </Typography>
                    </ListItem>
                  ))}
                </List>
              </Paper>
            </Box>
          </Box>
        )}

        {/* Investigations Tab — real per-team data, shares the Chat tab's chatTeamId
            selector rather than adding a second team picker */}
        {activeTab === 'missions' && (
          <Paper sx={{ p: 2 }}>
            <MissionsPanel teamMembers={teamMembers} missionFromCase={missionFromCase} selectMissionId={selectMissionId} />
          </Paper>
        )}

        {/* Operations: the roster, where the empty Projects placeholder was (D-RS, RS20–RS21). */}
        {activeTab === 'operations' && (
          <Paper sx={{ p: 2 }}>
            <OperationsPanel
              openAddress={typeof props.openRoster === 'string' ? props.openRoster : undefined}
              // A story asked for from a finished mission or a closed case (RS51).
              writeStory={typeof props.storyTitle === 'string' && props.storyTitle
                ? { title: props.storyTitle, ...(typeof props.storyToward === 'string' && props.storyToward ? { toward: props.storyToward } : {}) }
                : undefined}
            />
          </Paper>
        )}

        {/* Chat Tab — real PQC-backed channel, bound to the selected team's roster */}
        {activeTab === 'chat' && (
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" component="h2" gutterBottom>
              Team Chat
            </Typography>
            {/* Named for its scope. A message here reaches the team and
                outlives any one case; a case's own discussion lives in
                CollaborationSidebar, and a message to one person lives in the
                floating SecureChat window. Three scopes, one provider — see
                communication/chatScopes.ts before merging any of them. */}
            {teams.length === 0 ? (
              <Alert severity="info">Create a team first to start chatting.</Alert>
            ) : (
              <>
                <FormControl size="small" sx={{ mb: 2, minWidth: 240 }}>
                  <InputLabel id="chat-team-select-label">Team</InputLabel>
                  <Select
                    labelId="chat-team-select-label"
                    value={chatTeamId}
                    label="Team"
                    onChange={(e) => setChatTeamId(e.target.value)}
                  >
                    {teams.map(t => (
                      <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {!chatKey ? (
                  <Alert severity="info" data-testid="team-chat-no-relay">
                    {chatTeam?.name ?? 'This team'} has no relay, so its chat cannot be sealed. A team made with its relay can chat.
                  </Alert>
                ) : (
                  <>
                    <Box sx={{ maxHeight: 320, overflowY: 'auto', mb: 2 }} data-testid="team-chat-messages">
                      {chatMessages.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          {chatJoinedAt !== null ? 'No messages since you joined.' : 'No messages yet.'}
                        </Typography>
                      ) : (
                        <List dense>
                          {chatMessages.map((m) => {
                            const note = senderNote(m.senderId);
                            return (
                            <ListItem key={m.id} alignItems="flex-start">
                              <ListItemText
                                primary={<>
                                  <KeyName pubkey={m.senderId} />
                                  {/* A real space: the margin alone ran the two together for a screen reader. */}
                                  {note && ' '}
                                  {note && (
                                    <Typography component="span" variant="caption" sx={{ ml: 1, color: note.flag ? 'warning.main' : 'text.secondary' }}>
                                      {note.text}
                                    </Typography>
                                  )}
                                </>}
                                secondaryTypographyProps={{ component: 'div' }}
                                secondary={m.decryptionFailed
                                  // Says why, as the chat service put it: on another device, or not at all.
                                  ? m.content
                                  : <>
                                      {`${m.content}${m.postQuantum ? '' : ' · sealed, not post-quantum'}`}
                                      {/* Their words in the language shown, on this device only: team chat is sealed, never Public (ML6). */}
                                      {m.senderId !== nostrIdentityService.signerPubkey() && <Translatable text={m.content} testId={`team-chat-translate-${m.id}`} />}
                                    </>}
                              />
                            </ListItem>
                            );
                          })}
                        </List>
                      )}
                    </Box>
                    {chatLocked && chatTeam && (
                      <Alert
                        severity="info"
                        sx={{ mb: 2 }}
                        data-testid="team-chat-locked"
                        action={(
                          <Button
                            color="inherit"
                            size="small"
                            onClick={() => {
                              nostrIdentityService.unlockFor(`reading ${chatTeam.name}'s messages`).catch(() => { /* still locked: the notice stays */ });
                            }}
                          >
                            Unlock
                          </Button>
                        )}
                      >
                        Your key is locked, so new messages to {chatTeam.name} cannot be read or checked yet. Unlock it with your passphrase.
                      </Alert>
                    )}
                    {chatStanding && <Alert severity="warning" sx={{ mb: 2 }} data-testid="team-chat-standing">{chatStanding}</Alert>}
                    {chatJoinedAt !== null && chatTeam && (
                      <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }} data-testid="team-chat-joined">
                        {`You joined ${chatTeam.name} on ${formatUtcDateTime(chatJoinedAt, { year: true })}. Messages from before then were sealed to the members of that time, not to you, so they cannot show here.`}
                      </Typography>
                    )}
                    {chatSenders && 'unchecked' in chatSenders && (
                      <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }} data-testid="team-chat-senders-unchecked">
                        {chatSenders.unchecked}
                      </Typography>
                    )}
                    {chatError && <Alert severity="error" sx={{ mb: 2 }}>{chatError}</Alert>}
                    {/* Said where a message is written, and true of what happens. */}
                    <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>
                      Sealed to each member on the team relay's list (NIP-59), post-quantum (ML-KEM-768) for each who
                      published a key. The relay sees who receives something, never what. <WhatIs term="sealed" />
                    </Typography>
                    <Box display="flex" gap={1}>
                      <TextField
                        size="small"
                        fullWidth
                        placeholder="Message the team…"
                        value={chatMessageInput}
                        onChange={(e) => setChatMessageInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') void handleSendChatMessage(); }}
                      />
                      <Button variant="contained" onClick={() => void handleSendChatMessage()} disabled={!chatMessageInput.trim() || chatSending}>
                        Send
                      </Button>
                    </Box>
                  </>
                )}
              </>
            )}
          </Paper>
        )}

        {/* Operatives Tab — real roster from realTimeTeamService */}
        {activeTab === 'operatives' && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '1fr 1fr 1fr' }, gap: 3 }}>
            {teamMembers.length === 0 && (
              <Box sx={{ gridColumn: '1 / -1' }}>
                <Typography variant="body2" color="text.secondary">
                  No registered teams yet — operatives will appear here once a team is created.
                </Typography>
              </Box>
            )}
            {teamMembers.map((member) => (
              <Box key={member.pubkey ?? member.walletAddress}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                      <Avatar sx={{ width: 56, height: 56 }}>
                        {member.name.split(' ').map(n => n[0]).join('')}
                      </Avatar>
                      <Box>
                        <Typography variant="h6">
                          {member.name}
                        </Typography>
                        <Chip
                          label={member.role}
                          size="small"
                          variant="outlined"
                          sx={{ mt: 0.5 }}
                        />
                      </Box>
                    </Box>

                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>Specializations:</Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {member.specializations.map(spec => (
                          <Chip key={spec} label={spec} size="small" variant="outlined" />
                        ))}
                      </Box>
                    </Box>

                    <Typography variant="caption" color="text.secondary">
                      Last active: <UtcTime at={member.lastActivity} year />
                    </Typography>
                  </CardContent>
                </Card>
              </Box>
            ))}
          </Box>
        )}

        {/* Admin Tab */}
        {activeTab === 'admin' && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
            <Box>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" component="h2" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Settings size={20} />
                  Team Settings
                </Typography>
                <Stack spacing={2}>
                  <Button variant="outlined" startIcon={<UserPlus />} onClick={handleOpenInvite}>
                    Invite New Member
                  </Button>
                  <Button variant="outlined" startIcon={<Zap />} disabled>
                    Automation Rules
                  </Button>
                </Stack>
                <Alert severity="info" sx={{ mt: 2 }}>
                  Automation rules are not available yet. There are no permission settings;
                  authority is signed instead, as when a mission&apos;s dispatch is delegated.
                </Alert>
              </Paper>
            </Box>

            <Box>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" component="h2" gutterBottom>
                  Team Analytics
                </Typography>
                <Stack spacing={2}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Total Teams:</Typography>
                    <Typography variant="body2" fontWeight="bold">{realTimeTeamService.getTeamStats().totalTeams}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Total Members:</Typography>
                    <Typography variant="body2" fontWeight="bold">{teamMembers.length}</Typography>
                  </Box>
                  {/* No live presence signal exists (see formatTime's comment above) — an
                      "Online Members" count would just restate Total Members, since every
                      member's status is permanently 'ONLINE'. Removed rather than shown as fake. */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    {/* The cases, not RealTimeTeamService's investigations: no case is written there (plan item 1.8). */}
                    <Typography variant="body2">Open cases:</Typography>
                    <Typography variant="body2" fontWeight="bold">{openCaseCount ?? '…'}</Typography>
                  </Box>
                  {/* The directives and epics kept on this device (D-RS, RS13). */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Operations kept here:</Typography>
                    <Typography variant="body2" fontWeight="bold">{operationsKept}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2">Messages Today:</Typography>
                    <Typography variant="body2" fontWeight="bold">{chatStats ? chatStats.sent + chatStats.received : 0}</Typography>
                  </Box>
                </Stack>
              </Paper>
            </Box>
            {/* Each team's relay, managed by NIP-86 (plan item 2.3, step 5). */}
            <Box sx={{ gridColumn: '1 / -1' }}>
              <Paper sx={{ p: 2 }} data-testid="team-relays">
                <Typography variant="h6" component="h2" gutterBottom>
                  Team relays
                </Typography>
                {teams.some((t) => t.relayUrl) ? (
                  <Stack spacing={3} divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
                    {teams.filter((t) => t.relayUrl).map((t) => <RelayAdminPanel key={t.id} team={t} />)}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No team here has a relay. A team&apos;s relay is managed here when it takes
                    management calls (NIP-86) from your key.
                  </Typography>
                )}
              </Paper>
            </Box>
          </Box>
        )}
      </Box>

      <Dialog open={createTeamOpen} onClose={() => setCreateTeamOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create a team</DialogTitle>
        <DialogContent>
          <Stack sx={{ mt: 1 }}>
            <CreateTeamForm onCreated={() => setCreateTeamOpen(false)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateTeamOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={askToJoinOpen} onClose={() => setAskToJoinOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Ask to join a team</DialogTitle>
        <DialogContent>
          <Stack sx={{ mt: 1 }}>
            <AccessRequestForm />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAskToJoinOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={inviteDialogOpen} onClose={() => setInviteDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Invite New Member</DialogTitle>
        <DialogContent>
          {teams.length === 0 ? (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                No teams exist yet. Create one with the relay it will use, then invite to it.
              </Typography>
              <CreateTeamForm onCreated={(team) => setSelectedTeamId(team.id)} />
            </Stack>
          ) : (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <FormControl fullWidth>
                <InputLabel id="invite-team-select-label">Team</InputLabel>
                <Select
                  labelId="invite-team-select-label"
                  label="Team"
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                >
                  {teams.map((t) => (
                    <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {(() => {
                const team = teams.find((t) => t.id === selectedTeamId);
                return team ? <InviteLinkForm key={team.id} team={team} /> : null;
              })()}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInviteDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

    </Box>
    </>
  );
};

export default TeamWorkspaceApplication;

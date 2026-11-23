/**
 * BotCard — Individual bot card rendered in the NetRunner Bottom Bar roster.
 *
 * Extracted from NetRunnerBottomBar.tsx to reduce monolith size.
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Avatar,
  Chip,
  Card,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  FormControlLabel,
  Checkbox
} from '@mui/material';
import { Trash2, Clock, Activity, AlertTriangle, Target } from 'lucide-react';
import type { BotInstance, BotRosterService } from '../../services/BotRosterService';
import { botMissionExecutor } from '../../execution/BotMissionExecutor';
import { OsintBot, BotCapability } from '../../integration/BotRosterIntegration';
import type { IntelType } from '../../tools/NetRunnerPowerTools';

export interface MissionEvent {
  botName: string;
  status: 'success' | 'partial' | 'failed';
  target: string;
  /** First reported error, when the mission failed or only partially completed. */
  reason?: string;
  /**
   * Set when the mission's findings were actually persisted as a real Intel
   * Report — previously this only ever reached a console.log, so the
   * operative running the mission had no way to know it happened short of
   * opening devtools, let alone a way to go look at what was created.
   */
  reportId?: string;
  reportTitle?: string;
  /** Why no Intel Report was made: the findings were refused, or saving them failed. */
  reportNotSaved?: string;
  /**
   * Whether the findings were shared with the team, when that was asked for
   * (plan item 9.3). It went only to the console, after this notification had
   * already said the mission completed.
   */
  sharing?: { published: true; relays: number } | { published: false; why: string };
}

interface BotCardProps {
  bot: BotInstance;
  botService: BotRosterService;
  onDelete: (botId: string) => void;
  onRefresh: () => void;
  onMissionEvent?: (event: MissionEvent) => void;
}

function getBotStatusIcon(status: BotInstance['status']) {
  switch (status) {
    case 'active': return <Activity size={12} />;
    case 'error': return <AlertTriangle size={12} />;
    default: return <Clock size={12} />;
  }
}

const BotCard: React.FC<BotCardProps> = ({ bot, botService, onDelete, onRefresh, onMissionEvent }) => {
  const metrics = botService.getBotMetrics(bot.id);
  const statusColor = botService.getBotStatusColor(bot.id);
  const isRunning = bot.status === 'active';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [shareWithTeam, setShareWithTeam] = useState(false);

  const runMission = async () => {
    const trimmedTarget = target.trim();
    if (!trimmedTarget) return;
    const willShareWithTeam = shareWithTeam;
    setDialogOpen(false);
    setTarget('');
    setShareWithTeam(false);

    const osintBot: OsintBot = {
      id: bot.id,
      name: bot.name,
      description: bot.description,
      avatar: '🤖',
      status: 'active',
      capabilities: bot.capabilities as BotCapability[],
      compatibleTools: [],
      specializations: [bot.specialization as IntelType || 'identity'],
      scope: 'specialized',
      autonomyLevel:
        bot.autonomyLevel > 80 ? 'autonomous' :
        bot.autonomyLevel > 50 ? 'semi-autonomous' : 'supervised',
      author: 'user',
      version: '1.0.0',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      performance: {
        accuracy: 0, speed: 0, successRate: 0, intelQualityScore: 0,
        totalOperations: bot.tasksCompleted, totalIntelGenerated: 0,
        lastEvaluation: new Date().toISOString()
      },
      configuration: {
        maxConcurrentOperations: 3, maxDailyOperations: 100, rateLimiting: true,
        proxyRotation: false, obfuscation: false, loggingLevel: 'standard',
        notifyOnCompletion: true, saveResultsAutomatically: true, customParameters: {}
      }
    };

    onRefresh(); // reflect the now-running state immediately

    try {
      const result = await botMissionExecutor.executeSimpleMission(osintBot, trimmedTarget, 'reconnaissance');
      console.log(`✅ Mission completed:`, result);

      // Persisting the finding as a real Intel Report was previously a
      // fire-and-forget side effect the operative could only see by reading
      // the console. Awaited here, before the mission-event fires, so the
      // one notification an operative actually sees says whether it happened
      // — and links straight to it when it did — instead of always
      // reporting only "mission completed" regardless of what came of it.
      let reportId: string | undefined;
      let reportTitle: string | undefined;
      let reportNotSaved: string | undefined;
      try {
        const { convertAndStoreIntelReport } = await import('../../integration/OsintIntelBridge');
        const report = await convertAndStoreIntelReport(result);
        reportId = report.id;
        reportTitle = report.title;
      } catch (bridgeErr) {
        // A refusal is an answer the operative needs, not a fault for the console.
        if (bridgeErr instanceof Error && bridgeErr.name === 'SampleDataRefusedError') {
          reportNotSaved = bridgeErr.message;
        } else {
          console.error('⚠️ Intel bridge conversion failed:', bridgeErr);
          reportNotSaved = `No Intel Report was saved: ${bridgeErr instanceof Error ? bridgeErr.message : String(bridgeErr)}`;
        }
      }

      // Sample data is not published either. The bridge would refuse it after the
      // privacy confirmation, so the operative is not asked.
      let sharing: MissionEvent['sharing'];
      if (willShareWithTeam && result.status !== 'failed' && !result.usedMockData) {
        try {
          // Through the publish review, which shows the package and the public
          // relays it goes to (plan item 0.1). Cancel publishes nothing.
          const { reviewOsintBroadcast } = await import('../../../../services/publishing/netrunner');
          const broadcast = await reviewOsintBroadcast(result);
          if (!broadcast) {
            sharing = { published: false, why: 'the review was cancelled' };
          } else if (broadcast.success && (broadcast.relaysOk ?? 0) > 0) {
            sharing = { published: true, relays: broadcast.relaysOk as number };
          } else if (broadcast.relaysOk === 0) {
            // Signed and sent, and every relay refused or could not be reached.
            sharing = { published: false, why: broadcast.error ? `no relay took it (${broadcast.error})` : 'no relay took it' };
          } else {
            sharing = { published: false, why: broadcast.error ?? 'it was not sent' };
          }
        } catch (broadcastErr) {
          console.error('⚠️ Team broadcast failed:', broadcastErr);
          sharing = { published: false, why: broadcastErr instanceof Error ? broadcastErr.message : String(broadcastErr) };
        }
      }

      // One notification, once the sharing is settled, so it can say how that went.
      onMissionEvent?.({
        botName: bot.name,
        status: result.status,
        target: trimmedTarget,
        reason: result.status !== 'success' ? result.errors[0] : undefined,
        reportId,
        reportTitle,
        reportNotSaved,
        ...(sharing ? { sharing } : {})
      });
    } catch (err) {
      console.error(`❌ Mission failed:`, err);
      onMissionEvent?.({
        botName: bot.name,
        status: 'failed',
        target: trimmedTarget,
        reason: err instanceof Error ? err.message : 'Unknown error'
      });
    } finally {
      onRefresh();
    }
  };

  return (
    <Card
      sx={{
        minWidth: 180,
        backgroundColor: '#1e1e1e',
        borderRadius: 1,
        p: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        overflow: 'hidden',
        border: `1px solid ${statusColor}`,
        transition: 'transform 0.2s',
        '&:hover': {
          transform: 'scale(1.05)',
          borderColor: '#00f5ff'
        }
      }}
    >
      {/* Status Indicator */}
      <Box
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          height: 12,
          width: 12,
          borderRadius: '50%',
          backgroundColor: statusColor,
          border: '2px solid #000000'
        }}
      />

      {/* Bot Avatar and Name */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        <Avatar
          sx={{
            bgcolor: 'transparent',
            color: '#00ff88',
            border: '2px solid #00ff88',
            width: 32,
            height: 32,
            mr: 1
          }}
        >
          {bot.icon && <bot.icon size={24} />}
        </Avatar>
        <Typography
          variant="subtitle1"
          component="span"
          sx={{
            color: '#ffffff',
            fontWeight: 500,
            fontSize: '0.875rem',
            flex: 1
          }}
        >
          {bot.name}
        </Typography>
      </Box>

      {/* Bot Details - Status, Last Mission, Tasks */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography
            variant="body2"
            sx={{
              color: '#aaaaaa',
              fontWeight: 400,
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: 0.2
            }}
          >
            {getBotStatusIcon(bot.status)}
            {bot.status.charAt(0).toUpperCase() + bot.status.slice(1)}
          </Typography>

          <Chip
            label={`Missions: ${metrics.operationsCompleted}`}
            size="small"
            sx={{
              backgroundColor: '#0a0a0a',
              color: '#00ff88',
              border: '1px solid #00ff88',
              borderRadius: 1,
              height: 24,
              fontSize: '0.75rem',
              fontWeight: 500
            }}
          />
        </Box>

        {metrics.operationsCompleted > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: metrics.successRate >= 70 ? '#00ff88' :
                                  metrics.successRate >= 50 ? '#ffaa00' : '#ff4444'
                }}
              />
              <Typography
                variant="caption"
                sx={{ color: '#cccccc', fontSize: '0.7rem' }}
              >
                {metrics.successRate}% success
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      {/* Bot Actions */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={isRunning ? <CircularProgress size={12} color="inherit" /> : <Target size={14} />}
          disabled={isRunning}
          onClick={() => setDialogOpen(true)}
          sx={{
            bgcolor: '#00ff88',
            color: '#000000',
            borderRadius: 1,
            px: 2,
            py: 0.5,
            fontSize: '0.75rem',
            fontWeight: 500,
            '&:hover': { bgcolor: '#00ff99' },
            '&.Mui-disabled': { bgcolor: '#333333', color: '#888888' }
          }}
        >
          {isRunning ? 'Running...' : 'Run Mission'}
        </Button>

        <IconButton
          size="small"
          onClick={() => onDelete(bot.id)}
          sx={{
            color: '#ff4444',
            p: 0.5,
            '&:hover': { color: '#ffffff' }
          }}
        >
          <Trash2 size={16} />
        </IconButton>
      </Box>

      {/* Bot Activity — real: either genuinely in-progress, or a summary of the last real mission */}
      <Box
        sx={{
          mt: 1,
          bgcolor: '#0a0a0a',
          borderRadius: 1,
          p: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          borderTop: `1px solid ${statusColor}`,
          opacity: isRunning ? 1 : 0.7
        }}
      >
        {isRunning && (
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: '#00ff88',
              animation: 'pulse 2s infinite',
              '@keyframes pulse': {
                '0%': { opacity: 1, transform: 'scale(1)' },
                '50%': { opacity: 0.5, transform: 'scale(1.2)' },
                '100%': { opacity: 1, transform: 'scale(1)' }
              }
            }}
          />
        )}

        <Typography
          variant="body2"
          sx={{
            color: '#00ff88',
            fontWeight: 500,
            fontSize: '0.75rem',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {metrics.lastActivity}
        </Typography>

        {/* Configured autonomy tier — a label on how the bot was set up, not a measured
            behavior (recurring/scheduled autonomous execution isn't wired up yet). */}
        <Chip
          label={bot.aiControlled ? 'Autonomous' : 'Manual'}
          size="small"
          sx={{
            backgroundColor: bot.aiControlled ? '#00ff88' : '#ffaa00',
            color: '#000000',
            borderRadius: 1,
            height: 20,
            fontSize: '0.65rem',
            fontWeight: 600,
            minWidth: 40
          }}
        />
      </Box>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Run Mission — {bot.name}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Target URL or domain"
            placeholder="example.com"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runMission(); }}
          />
          <FormControlLabel
            sx={{ mt: 1 }}
            control={
              <Checkbox
                size="small"
                checked={shareWithTeam}
                onChange={(e) => setShareWithTeam(e.target.checked)}
              />
            }
            label="Share findings with team (broadcasts via Nostr — you'll get one more confirmation before anything is sent)"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={runMission} variant="contained" disabled={!target.trim()}>Run</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default BotCard;

/**
 * NetRunner Bottom Bar - Bot Roster
 * 
 * Horizontal scrolling bot roster with autonomous bots that can be controlled by AI Agent.
 * Supports default Starcom bots and user-created custom bots.
 * 
 * @author GitHub Copilot
 * @date July 12, 2025
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Chip
} from '@mui/material';
import {
  ChevronUp,
  ChevronDown,
  Plus,
  Settings,
  Bot
} from 'lucide-react';

// Import real bot services
import { BotRosterService, BotInstance } from '../../services/BotRosterService';
import { botMissionExecutor } from '../../execution/BotMissionExecutor';

// Extracted subcomponents
import BotCard, { type MissionEvent } from './BotCard';
import CreateBotDialog from './CreateBotDialog';
import Snackbar from '../../../../components/Shared/Snackbar';

interface NetRunnerBottomBarProps {
  open: boolean;
  height: number;
  onToggle: () => void;
}

/* BotRosterService class removed — now imported from ../../services/BotRosterService */

const NetRunnerBottomBar: React.FC<NetRunnerBottomBarProps> = ({
  open,
  height,
  onToggle
}) => {
  const [createBotOpen, setCreateBotOpen] = useState(false);
  const navigate = useNavigate();
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    type: 'success' | 'info' | 'error';
    reportId?: string;
  }>({
    open: false,
    message: '',
    type: 'info'
  });

  // Initialize real bot service
  const botService = useMemo(() => new BotRosterService(), []);
  const [bots, setBots] = useState<BotInstance[]>([]);

  // Load real bots on component mount — including any custom bots and mission
  // history persisted from a previous session (a page reload used to erase both).
  useEffect(() => {
    let cancelled = false;
    Promise.all([botService.ensureInitialized(), botMissionExecutor.ensureInitialized()]).then(() => {
      if (!cancelled) setBots(botService.getBots());
    });
    return () => { cancelled = true; };
  }, [botService]);

  const handleMissionEvent = (event: MissionEvent) => {
    const messages: Record<MissionEvent['status'], string> = {
      success: `${event.botName}: mission on "${event.target}" completed`,
      partial: `${event.botName}: mission on "${event.target}" completed with partial results`,
      failed: `${event.botName}: mission on "${event.target}" failed`
    };
    const types: Record<MissionEvent['status'], 'success' | 'info' | 'error'> = {
      success: 'success',
      partial: 'info',
      failed: 'error'
    };
    // Real reason, not just that something went wrong — a mission that fails
    // silently is indistinguishable from one that's still running to anyone
    // who isn't watching the console.
    let message = event.reason ? `${messages[event.status]} — ${event.reason}` : messages[event.status];
    // Whether the mission's findings actually became a real Intel Report used
    // to be a console.log only an operative reading devtools would ever see —
    // now it's the point of the notification, with a direct link to it.
    message = event.reportId ? `${message} — saved as Intel Report "${event.reportTitle}"` : message;
    message = event.reportNotSaved ? `${message} — ${event.reportNotSaved}` : message;
    // Whether sharing with the team happened (plan item 9.3): never green when it did not.
    let type = types[event.status];
    if (event.sharing && 'relays' in event.sharing) {
      message = `${message} — shared with the team on ${event.sharing.relays} relay${event.sharing.relays === 1 ? '' : 's'}`;
    } else if (event.sharing && 'why' in event.sharing) {
      message = `${message} — not published: ${event.sharing.why}`;
      if (type === 'success') type = 'info';
    }
    setSnackbar({ open: true, message, type, reportId: event.reportId });
  };

  // Real-time bot activity updates
  useEffect(() => {
    const interval = setInterval(() => {
      // Refresh bot list to show updated activities and performance
      setBots(botService.getBots());
    }, 2000); // Update every 2 seconds

    return () => clearInterval(interval);
  }, [botService]);

  const deleteBot = (botId: string) => {
    if (botService.deleteBot(botId)) {
      setBots(botService.getBots());
    }
  };

  return (
    <Box
      sx={{
        height: `${height}px`,
        width: '100%',
        backgroundColor: '#000000',
        borderTop: '1px solid #00f5ff',
        display: 'flex',
        transition: 'height 0.3s ease',
        overflow: 'hidden',
        fontFamily: "var(--sc-font-text)"
      }}
    >
      {/* Left Control Panel. Collapsed, the strip is 32 px and hides what overflows it, so
          its three controls sit in a row; stacked, the lower two were cut off
          (decision D-F, step 3.2). */}
      <Box
        data-controls={open ? 'column' : 'row'}
        sx={{
          width: '48px',
          backgroundColor: '#0a0a0a',
          borderRight: '1px solid #00f5ff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          py: 0.5,
          gap: 0.5,
          '&[data-controls="row"]': {
            width: 'auto',
            flexDirection: 'row',
            px: 0.5,
            py: 0
          }
        }}
      >
        {/* Expand/Collapse Toggle */}
        <Tooltip title={open ? "Collapse Bot Roster" : "Expand Bot Roster"}>
          <IconButton
            onClick={onToggle}
            size="small"
            sx={{ 
              color: '#ffffff',
              p: 0.25,
              '&:hover': { color: '#00f5ff' }
            }}
          >
            {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </IconButton>
        </Tooltip>

        {/* Create Bot Button */}
        <Tooltip title="Create New Bot">
          <IconButton
            onClick={() => setCreateBotOpen(true)}
            size="small"
            sx={{
              color: '#00ff88',
              border: '1px solid #00ff88',
              borderRadius: 0,
              p: 0.25,
              minWidth: 20,
              minHeight: 20,
              '&:hover': {
                backgroundColor: 'rgba(0, 255, 136, 0.1)'
              }
            }}
          >
            <Plus size={12} />
          </IconButton>
        </Tooltip>

        {/* Bot Management */}
        <Tooltip title="Bot Settings">
          <IconButton
            size="small"
            sx={{ 
              color: '#aaaaaa',
              p: 0.25,
              '&:hover': { color: '#ffffff' }
            }}
          >
            <Settings size={12} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Bot Roster - Horizontal Scroll */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box
          sx={{
            height: '56px',
            display: 'flex',
            alignItems: 'center',
            px: 2,
            borderBottom: '1px solid #00f5ff',
            backgroundColor: '#0a0a0a'
          }}
        >
          <Typography
            variant="h6"
            component="h2"
            sx={{
              flex: 1,
              color: '#00f5ff',
              fontWeight: 500,
              fontSize: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5
            }}
          >
            {/* Logo or Title */}
            <Box
              component="span"
              sx={{
                fontSize: '1.2rem',
                fontWeight: 700,
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: 0.3
              }}
            >
              <Bot size={24} />
              NetRunner Bot Roster
            </Box>

            {/* Version and Status */}
            <Box
              component="span"
              sx={{
                fontSize: '0.8rem',
                color: '#aaaaaa',
                display: 'flex',
                alignItems: 'center',
                gap: 0.2
              }}
            >
              <Chip
                label="v2.5.1"
                size="small"
                sx={{
                  backgroundColor: '#1e1e1e',
                  color: '#00ff88',
                  border: '1px solid #00ff88',
                  borderRadius: 1,
                  height: 24,
                  fontSize: '0.75rem',
                  fontWeight: 500
                }}
              />
            </Box>
          </Typography>
        </Box>

        {/* Bot List - Horizontal Scrollable */}
        <Box
          sx={{
            flex: 1,
            overflowX: 'auto',
            display: 'flex',
            p: 1,
            gap: 1,
            '&::-webkit-scrollbar': {
              height: '8px'
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: '#00f5ff',
              borderRadius: '4px'
            },
            '&::-webkit-scrollbar-track': {
              backgroundColor: '#0a0a0a'
            }
          }}
        >
          {bots.map(bot => (
            <BotCard
              key={bot.id}
              bot={bot}
              botService={botService}
              onDelete={deleteBot}
              onRefresh={() => setBots(botService.getBots())}
              onMissionEvent={handleMissionEvent}
            />
          ))}
        </Box>
      </Box>

      {/* Create Bot Dialog */}
      <CreateBotDialog
        open={createBotOpen}
        onClose={() => setCreateBotOpen(false)}
        botService={botService}
        onBotCreated={() => setBots(botService.getBots())}
      />

      <Snackbar
        open={snackbar.open}
        message={snackbar.message}
        type={snackbar.type}
        duration={snackbar.reportId ? 6000 : 3000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        actionLabel={snackbar.reportId ? 'View Report' : undefined}
        onAction={snackbar.reportId ? () => navigate(`/intel?reportId=${encodeURIComponent(snackbar.reportId!)}`) : undefined}
      />
    </Box>
  );
};

export default NetRunnerBottomBar;

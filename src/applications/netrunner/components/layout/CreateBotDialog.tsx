/**
 * CreateBotDialog — Bot Designer dialog for the NetRunner Bot Roster.
 *
 * Extracted from NetRunnerBottomBar.tsx to reduce monolith size.
 * Encapsulates all form state (name, description, specialization, autonomy, preview).
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Avatar,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Card
} from '@mui/material';
import { Bot } from 'lucide-react';

import type { BotCapability, AutonomyLevel } from '../../integration/BotRosterIntegration';
import type { IntelType } from '../../tools/NetRunnerPowerTools';
import type { BotRosterService } from '../../services/BotRosterService';
import { toolNamesFor } from '../../execution/toolsForSpecialization';

interface CreateBotDialogProps {
  open: boolean;
  onClose: () => void;
  botService: BotRosterService;
  onBotCreated: () => void;
}

/* ----- shared MUI sx tokens ----- */
const textFieldSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: '#0a0a0a',
    color: '#ffffff',
    '& fieldset': { borderColor: '#00f5ff' },
    '&:hover fieldset': { borderColor: '#00ff88' },
    '&.Mui-focused fieldset': { borderColor: '#00ff88' }
  },
  '& .MuiInputLabel-root': {
    color: '#aaaaaa',
    '&.Mui-focused': { color: '#00ff88' }
  }
};

const selectSx = {
  backgroundColor: '#0a0a0a',
  color: '#ffffff',
  '& .MuiSelect-icon': { color: '#00f5ff' },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#00f5ff' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#00ff88' },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#00ff88' }
};

const labelSx = {
  color: '#aaaaaa',
  '&.Mui-focused': { color: '#00ff88' }
};

const menuItemSx = { color: '#ffffff', backgroundColor: '#1e1e1e' };

/* ----- specialization menu items ----- */
const SPECIALIZATIONS: { value: IntelType; emoji: string; label: string; desc: string }[] = [
  { value: 'identity',       emoji: '🤖', label: 'Identity Intelligence',       desc: 'Person & entity identification and verification' },
  { value: 'network',        emoji: '🌐', label: 'Network Intelligence',        desc: 'Network infrastructure analysis and mapping' },
  { value: 'social',         emoji: '👥', label: 'Social Intelligence',         desc: 'Social media monitoring and analysis' },
  { value: 'financial',      emoji: '💼', label: 'Financial Intelligence',      desc: 'Financial transaction tracking and analysis' },
  { value: 'vulnerability',  emoji: '🛡️', label: 'Vulnerability Intelligence',  desc: 'Security vulnerability scanning and assessment' },
  { value: 'darkweb',        emoji: '🕵️', label: 'Darkweb Intelligence',        desc: 'Dark web monitoring and investigation' },
  { value: 'threat',         emoji: '⚠️', label: 'Threat Intelligence',         desc: 'Threat hunting and actor tracking' },
  { value: 'geospatial',     emoji: '🗺️', label: 'Geospatial Intelligence',     desc: 'Location-based analysis and tracking' },
  { value: 'infrastructure', emoji: '⚙️', label: 'Infrastructure Intelligence', desc: 'Digital infrastructure analysis' },
  { value: 'temporal',       emoji: '⏰', label: 'Temporal Intelligence',       desc: 'Time-based pattern analysis' },
];

const CreateBotDialog: React.FC<CreateBotDialogProps> = ({ open, onClose, botService, onBotCreated }) => {
  const [newBotName, setNewBotName] = useState('');
  const [newBotDescription, setNewBotDescription] = useState('');
  const [selectedSpecialization, setSelectedSpecialization] = useState<IntelType>('identity');
  const [selectedAutonomy, setSelectedAutonomy] = useState<AutonomyLevel>('supervised');
  const [previewBot, setPreviewBot] = useState<{
    name: string;
    specialization: IntelType;
    autonomy: AutonomyLevel;
    description: string;
    capabilities: BotCapability[];
    avatar: string;
  } | null>(null);

  // Update preview when form changes
  useEffect(() => {
    if (open && newBotName) {
      setPreviewBot({
        name: newBotName,
        specialization: selectedSpecialization,
        autonomy: selectedAutonomy,
        description: newBotDescription || `Custom ${selectedSpecialization} intelligence bot`,
        capabilities: botService.getCapabilitiesForSpecialization(selectedSpecialization),
        avatar: botService.getAvatarForSpecialization(selectedSpecialization),
      });
    }
  }, [open, newBotName, selectedSpecialization, selectedAutonomy, newBotDescription, botService]);

  const handleCreate = () => {
    const trimmedName = newBotName.trim();
    if (!trimmedName || !selectedSpecialization) return;

    botService.createCustomBot(
      trimmedName,
      selectedSpecialization,
      newBotDescription || `Custom ${selectedSpecialization} intelligence bot`,
      selectedAutonomy
    );

    // Reset and close
    setNewBotName('');
    setNewBotDescription('');
    setSelectedSpecialization('identity');
    setSelectedAutonomy('supervised');
    setPreviewBot(null);
    onBotCreated();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      sx={{
        '& .MuiDialog-paper': {
          backgroundColor: '#1e1e1e',
          borderRadius: 1,
          border: '1px solid #00f5ff',
          maxHeight: '90vh'
        }
      }}
    >
      <DialogTitle
        sx={{
          color: '#00f5ff',
          fontWeight: 500,
          fontSize: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          borderBottom: '1px solid #333333',
          pb: 2
        }}
      >
        <Bot size={24} />
        NetRunner Bot Designer
        <Chip
          label="v2.5.1"
          size="small"
          sx={{ ml: 'auto', backgroundColor: '#00ff88', color: '#000000', fontWeight: 600 }}
        />
      </DialogTitle>

      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ display: 'flex', height: '500px' }}>
          {/* ───── Left Panel — Configuration ───── */}
          <Box
            sx={{
              width: '60%',
              p: 3,
              borderRight: '1px solid #333333',
              display: 'flex',
              flexDirection: 'column',
              gap: 2.5,
              overflowY: 'auto'
            }}
          >
            <Typography variant="h6" sx={{ color: '#ffffff', fontWeight: 500, fontSize: '1rem', mb: 1 }}>
              Bot Configuration
            </Typography>

            {/* Bot Name */}
            <TextField
              label="Bot Name"
              variant="outlined"
              value={newBotName}
              onChange={e => setNewBotName(e.target.value)}
              fullWidth
              required
              placeholder="Enter a unique name for your bot"
              sx={textFieldSx}
              slotProps={{ htmlInput: { maxLength: 60 } }}
              helperText={newBotName.length > 0 && !newBotName.trim() ? 'Name cannot be only whitespace' : ' '}
              error={newBotName.length > 0 && !newBotName.trim()}
            />

            {/* Intelligence Specialization */}
            <FormControl fullWidth>
              <InputLabel sx={labelSx}>Intelligence Specialization</InputLabel>
              <Select
                value={selectedSpecialization}
                onChange={e => setSelectedSpecialization(e.target.value as IntelType)}
                label="Intelligence Specialization"
                sx={selectSx}
              >
                {SPECIALIZATIONS.map(s => (
                  <MenuItem key={s.value} value={s.value} sx={menuItemSx}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>{s.emoji}</span>
                      <Box>
                        <Typography variant="body1">{s.label}</Typography>
                        <Typography variant="caption" sx={{ color: '#aaaaaa' }}>{s.desc}</Typography>
                      </Box>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Autonomy Level */}
            <FormControl fullWidth>
              <InputLabel sx={labelSx}>Autonomy Level</InputLabel>
              <Select
                value={selectedAutonomy}
                onChange={e => setSelectedAutonomy(e.target.value as AutonomyLevel)}
                label="Autonomy Level"
                sx={selectSx}
              >
                <MenuItem value="supervised" sx={menuItemSx}>
                  <Box>
                    <Typography variant="body1">Supervised</Typography>
                    <Typography variant="caption" sx={{ color: '#aaaaaa' }}>
                      You start every mission
                    </Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="semi-autonomous" sx={menuItemSx}>
                  <Box>
                    <Typography variant="body1">Semi-Autonomous</Typography>
                    <Typography variant="caption" sx={{ color: '#aaaaaa' }}>
                      Recorded with the bot; missions still run only when you start them
                    </Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="autonomous" sx={menuItemSx}>
                  <Box>
                    <Typography variant="body1">Autonomous</Typography>
                    <Typography variant="caption" sx={{ color: '#aaaaaa' }}>
                      Recorded with the bot; nothing runs on its own yet
                    </Typography>
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>

            {/* Description */}
            <TextField
              label="Description"
              variant="outlined"
              value={newBotDescription}
              onChange={e => setNewBotDescription(e.target.value)}
              multiline
              rows={3}
              fullWidth
              placeholder="Describe the bot's purpose and capabilities..."
              sx={textFieldSx}
            />

            {/* What running a mission does. The tool list is the executor's own. */}
            <Box sx={{ backgroundColor: '#0a0a0a', border: '1px solid #00f5ff', borderRadius: 1, p: 2, mt: 1 }}>
              <Typography
                variant="subtitle2"
                sx={{ color: '#00f5ff', fontWeight: 600, mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}
              >
                What a mission does
              </Typography>

              <Typography variant="body2" sx={{ color: '#cccccc', fontSize: '0.8rem', mb: 1, lineHeight: 1.4 }}>
                When you press Run Mission on its card, this bot:
              </Typography>

              <Box component="ul" sx={{ m: 0, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography component="li" variant="caption" sx={{ color: '#00ff88' }}>
                  Runs {toolNamesFor(selectedSpecialization).join(', ')} against the target
                </Typography>
                <Typography component="li" variant="caption" sx={{ color: '#00ff88' }}>
                  Runs the rest, and reports &quot;not available&quot; for a tool whose key or service is not set up
                </Typography>
                <Typography component="li" variant="caption" sx={{ color: '#00ff88' }}>
                  Saves what it found as an Intel Report, and tells you when it finishes
                </Typography>
                <Typography component="li" variant="caption" sx={{ color: '#cccccc' }}>
                  Runs only when you start it: the autonomy level is recorded, but nothing runs on its own yet
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* ───── Right Panel — Preview ───── */}
          <Box sx={{ width: '40%', p: 3, backgroundColor: '#0a0a0a', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="h6" sx={{ color: '#ffffff', fontWeight: 500, fontSize: '1rem', mb: 1 }}>
              Bot Preview
            </Typography>

            {previewBot ? (
              <Card sx={{ backgroundColor: '#1e1e1e', border: '1px solid #00ff88', borderRadius: 1 }}>
                <Box sx={{ p: 2 }}>
                  {/* Bot Header */}
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Avatar
                      sx={{
                        bgcolor: 'transparent',
                        color: '#00ff88',
                        border: '2px solid #00ff88',
                        width: 40,
                        height: 40,
                        mr: 1.5,
                        fontSize: '1.5rem'
                      }}
                    >
                      {previewBot.avatar}
                    </Avatar>
                    <Box>
                      <Typography variant="subtitle1" sx={{ color: '#ffffff', fontWeight: 500, fontSize: '0.95rem' }}>
                        {previewBot.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#00ff88', fontWeight: 500 }}>
                        {previewBot.specialization.charAt(0).toUpperCase() + previewBot.specialization.slice(1)} Specialist
                      </Typography>
                    </Box>
                  </Box>

                  {/* Bot Stats */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {[
                      ['Autonomy Level:', previewBot.autonomy.charAt(0).toUpperCase() + previewBot.autonomy.slice(1)],
                      ['Capabilities:', String(previewBot.capabilities.length)],
                    ].map(([label, value]) => (
                      <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="caption" sx={{ color: '#aaaaaa' }}>{label}</Typography>
                        <Typography variant="caption" sx={{ color: '#00ff88' }}>{value}</Typography>
                      </Box>
                    ))}
                  </Box>

                  {/* Capabilities List */}
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" sx={{ color: '#aaaaaa', fontWeight: 500, mb: 1, display: 'block' }}>
                      Core Capabilities:
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {previewBot.capabilities.map((cap: string, index: number) => (
                        <Chip
                          key={index}
                          label={cap.charAt(0).toUpperCase() + cap.slice(1)}
                          size="small"
                          sx={{ backgroundColor: '#00ff88', color: '#000000', fontSize: '0.7rem', height: 20 }}
                        />
                      ))}
                    </Box>
                  </Box>

                  {/* Description */}
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" sx={{ color: '#aaaaaa', fontWeight: 500, mb: 0.5, display: 'block' }}>
                      Description:
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#ffffff', fontSize: '0.8rem', lineHeight: 1.4 }}>
                      {previewBot.description}
                    </Typography>
                  </Box>

                  {/* How it runs */}
                  <Box sx={{ mt: 2, p: 1.5, backgroundColor: '#0a0a0a', border: '1px solid #00ff88', borderRadius: 1 }}>
                    <Typography
                      variant="caption"
                      sx={{ color: '#00ff88', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}
                    >
                      Runs when you start it
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#cccccc', fontSize: '0.7rem', display: 'block', lineHeight: 1.3 }}>
                      A {previewBot.specialization} mission runs {toolNamesFor(previewBot.specialization).join(', ')}.
                    </Typography>
                  </Box>
                </Box>
              </Card>
            ) : (
              <Box sx={{ border: '2px dashed #333333', borderRadius: 1, p: 3, textAlign: 'center' }}>
                <Bot size={48} color="#333333" />
                <Typography variant="body2" sx={{ color: '#666666', mt: 1 }}>
                  Enter a bot name to see preview
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 3, borderTop: '1px solid #333333' }}>
        <Button
          onClick={onClose}
          sx={{
            color: '#ffffff',
            borderRadius: 1,
            px: 3,
            py: 1,
            fontSize: '0.875rem',
            fontWeight: 500,
            backgroundColor: '#333333',
            '&:hover': { backgroundColor: '#444444' }
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          disabled={!newBotName.trim() || !selectedSpecialization}
          sx={{
            color: '#000000',
            borderRadius: 1,
            px: 3,
            py: 1,
            fontSize: '0.875rem',
            fontWeight: 500,
            backgroundColor: '#00ff88',
            '&:hover': { backgroundColor: '#00ff99' },
            '&:disabled': { backgroundColor: '#333333', color: '#666666' }
          }}
        >
          Deploy Bot
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateBotDialog;

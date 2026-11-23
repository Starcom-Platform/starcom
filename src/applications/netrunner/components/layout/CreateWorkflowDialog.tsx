/**
 * CreateWorkflowDialog — builds a sequential, 2–5 step workflow chaining
 * roster bots' missions, following CreateBotDialog.tsx's structure/styling.
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { GitBranch, Trash2, Plus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

import type { BotInstance } from '../../services/BotRosterService';
import type { WorkflowEngine, WorkflowStep } from '../../integration/WorkflowEngine';

interface CreateWorkflowDialogProps {
  open: boolean;
  onClose: () => void;
  bots: BotInstance[];
  workflowEngine: WorkflowEngine;
  onWorkflowCreated: () => void;
}

type MissionType = 'reconnaissance' | 'monitoring' | 'assessment' | 'deep-analysis';

interface StepFormState {
  botId: string;
  target: string;
  missionType: MissionType;
}

const MAX_STEPS = 5;
const MIN_STEPS = 2;

const emptyStep = (): StepFormState => ({ botId: '', target: '', missionType: 'reconnaissance' });

/* ----- shared MUI sx tokens (mirrors CreateBotDialog.tsx) ----- */
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

const MISSION_TYPES: { value: MissionType; label: string }[] = [
  { value: 'reconnaissance', label: 'Reconnaissance' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'assessment', label: 'Assessment' },
  { value: 'deep-analysis', label: 'Deep Analysis' }
];

const CreateWorkflowDialog: React.FC<CreateWorkflowDialogProps> = ({
  open, onClose, bots, workflowEngine, onWorkflowCreated
}) => {
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<StepFormState[]>([emptyStep(), emptyStep()]);

  const updateStep = (index: number, patch: Partial<StepFormState>) => {
    setSteps(current => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));
  };

  const addStep = () => {
    setSteps(current => (current.length < MAX_STEPS ? [...current, emptyStep()] : current));
  };

  const removeStep = (index: number) => {
    setSteps(current => (current.length > MIN_STEPS ? current.filter((_, i) => i !== index) : current));
  };

  const trimmedName = name.trim();
  const stepsValid = steps.every(step => step.botId && step.target.trim());
  const canSubmit = trimmedName.length > 0 && stepsValid;

  const reset = () => {
    setName('');
    setSteps([emptyStep(), emptyStep()]);
  };

  const handleCreate = () => {
    if (!canSubmit) return;

    const stepIds = steps.map(() => uuidv4());
    const workflowSteps: WorkflowStep[] = steps.map((step, index) => ({
      id: stepIds[index],
      name: `Step ${index + 1}: ${step.target.trim()}`,
      description: '',
      botId: step.botId,
      parameters: { target: step.target.trim(), missionType: step.missionType },
      requiredCapabilities: [],
      dependsOn: index === 0 ? [] : [stepIds[index - 1]],
      timeout: 300,
      retryCount: 0,
      retryDelay: 0
    }));

    workflowEngine.createWorkflow({
      name: trimmedName,
      steps: workflowSteps,
      botIds: Array.from(new Set(steps.map(step => step.botId))),
      parallelExecution: false,
      configuration: {
        timeout: 3600,
        maxConcurrentSteps: 1,
        errorHandling: 'continue',
        notifyOnCompletion: true,
        notifyOnError: true,
        saveResultsAutomatically: true,
        priority: 'medium',
        customParameters: {}
      }
    });

    reset();
    onWorkflowCreated();
    onClose();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
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
        <GitBranch size={24} />
        Create Workflow
      </DialogTitle>

      <DialogContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <TextField
          label="Workflow Name"
          variant="outlined"
          value={name}
          onChange={e => setName(e.target.value)}
          fullWidth
          required
          placeholder="e.g. Domain Recon Chain"
          sx={textFieldSx}
          slotProps={{ htmlInput: { maxLength: 80 } }}
          helperText={name.length > 0 && !trimmedName ? 'Name cannot be only whitespace' : ' '}
          error={name.length > 0 && !trimmedName}
        />

        <Typography variant="caption" sx={{ color: '#aaaaaa' }}>
          Each step runs sequentially — step 2 only starts after step 1 completes.
        </Typography>

        {steps.map((step, index) => (
          <Box
            key={index}
            sx={{
              backgroundColor: '#0a0a0a',
              border: '1px solid #333333',
              borderRadius: 1,
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="caption" sx={{ color: '#00ff88', fontWeight: 600 }}>
                Step {index + 1}
              </Typography>
              {steps.length > MIN_STEPS && (
                <IconButton size="small" onClick={() => removeStep(index)} sx={{ color: '#ff4444', p: 0.25 }}>
                  <Trash2 size={14} />
                </IconButton>
              )}
            </Box>

            <FormControl fullWidth size="small">
              <InputLabel sx={labelSx}>Bot</InputLabel>
              <Select
                value={step.botId}
                onChange={e => updateStep(index, { botId: e.target.value })}
                label="Bot"
                sx={selectSx}
              >
                {bots.map(bot => (
                  <MenuItem key={bot.id} value={bot.id} sx={menuItemSx}>
                    {bot.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Target"
              variant="outlined"
              size="small"
              value={step.target}
              onChange={e => updateStep(index, { target: e.target.value })}
              fullWidth
              placeholder="example.com"
              sx={textFieldSx}
            />

            <FormControl fullWidth size="small">
              <InputLabel sx={labelSx}>Mission Type</InputLabel>
              <Select
                value={step.missionType}
                onChange={e => updateStep(index, { missionType: e.target.value as MissionType })}
                label="Mission Type"
                sx={selectSx}
              >
                {MISSION_TYPES.map(mt => (
                  <MenuItem key={mt.value} value={mt.value} sx={menuItemSx}>
                    {mt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        ))}

        <Button
          onClick={addStep}
          disabled={steps.length >= MAX_STEPS}
          startIcon={<Plus size={14} />}
          sx={{
            color: '#00ff88',
            border: '1px dashed #333333',
            borderRadius: 1,
            justifyContent: 'flex-start',
            '&:hover': { borderColor: '#00ff88', backgroundColor: 'rgba(0, 255, 136, 0.1)' },
            '&:disabled': { color: '#666666' }
          }}
        >
          Add Step {steps.length >= MAX_STEPS && <Chip label="max" size="small" sx={{ ml: 1, height: 16, fontSize: '0.6rem' }} />}
        </Button>
      </DialogContent>

      <DialogActions sx={{ p: 3, borderTop: '1px solid #333333' }}>
        <Button
          onClick={handleClose}
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
          disabled={!canSubmit}
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
          Create Workflow
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateWorkflowDialog;

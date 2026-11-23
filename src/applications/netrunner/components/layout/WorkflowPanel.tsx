/**
 * WorkflowPanel — sequential bot-mission chains for NetRunner's sidebar
 * "Workflows" tab. Owns its own BotRosterService + WorkflowEngine instances,
 * mirroring NetRunnerBottomBar.tsx's per-mount `useMemo(() => new ...)`
 * pattern (there's no shared context for bot roster state today).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, IconButton, Chip, CircularProgress } from '@mui/material';
import { Plus, Play, Trash2, ArrowLeft, CheckCircle2, XCircle, Circle } from 'lucide-react';

import { BotRosterService, BotInstance } from '../../services/BotRosterService';
import { WorkflowEngine, Workflow, WorkflowExecutionState } from '../../integration/WorkflowEngine';
import { OsintBot, BotCapability } from '../../integration/BotRosterIntegration';
import type { IntelType } from '../../tools/NetRunnerPowerTools';
import { netRunnerPowerTools } from '../../tools/NetRunnerPowerTools';
import { loadWorkflowDefinitions, loadWorkflowExecutions } from '../../services/persistence/NetRunnerPersistence';
import CreateWorkflowDialog from './CreateWorkflowDialog';
import UtcTime from '../../../../components/Shared/UtcTime';

// Bridges BotRosterService's simplified BotInstance to the fuller OsintBot
// shape botMissionExecutor/WorkflowEngine expect — same conversion BotCard.tsx
// does inline when it runs a single mission.
function toOsintBot(bot: BotInstance): OsintBot {
  return {
    id: bot.id,
    name: bot.name,
    description: bot.description,
    avatar: '🤖',
    status: 'active',
    capabilities: bot.capabilities as BotCapability[],
    compatibleTools: [],
    specializations: [(bot.specialization as IntelType) || 'identity'],
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
}

function stepStatusIcon(status: 'success' | 'failed' | undefined) {
  if (status === 'success') return <CheckCircle2 size={12} color="#00ff88" />;
  if (status === 'failed') return <XCircle size={12} color="#ff4444" />;
  return <Circle size={12} color="#666666" />;
}

const WorkflowPanel: React.FC = () => {
  const botService = useMemo(() => new BotRosterService(), []);
  const [botInstances, setBotInstances] = useState<BotInstance[]>([]);

  useEffect(() => {
    let cancelled = false;
    botService.ensureInitialized().then(() => {
      if (!cancelled) setBotInstances(botService.getBots());
    });
    return () => { cancelled = true; };
  }, [botService]);

  const osintBots = useMemo(() => botInstances.map(toOsintBot), [botInstances]);
  const workflowEngine = useMemo(
    () => new WorkflowEngine(osintBots, netRunnerPowerTools),
    [osintBots]
  );

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [executionsByWorkflow, setExecutionsByWorkflow] = useState<Record<string, WorkflowExecutionState>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [running, setRunning] = useState(false);

  // Rehydrate persisted workflows whenever the engine is (re)built — e.g. once
  // real bots finish loading and osintBots/workflowEngine are recreated.
  useEffect(() => {
    let cancelled = false;
    loadWorkflowDefinitions().then(persisted => {
      if (cancelled) return;
      workflowEngine.hydrateWorkflows(persisted);
      setWorkflows(workflowEngine.getWorkflows());
    });
    return () => { cancelled = true; };
  }, [workflowEngine]);

  // When a workflow is selected, pull its most recent persisted execution
  // (if any) so results survive a reload, not just a live run this session.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    loadWorkflowExecutions(selectedId).then(executions => {
      if (cancelled || executions.length === 0) return;
      setExecutionsByWorkflow(prev =>
        prev[selectedId] ? prev : { ...prev, [selectedId]: executions[executions.length - 1] }
      );
    });
    return () => { cancelled = true; };
  }, [selectedId]);

  const selectedWorkflow = workflows.find(w => w.id === selectedId) ?? null;
  const selectedExecution = selectedId ? executionsByWorkflow[selectedId] : undefined;

  const runWorkflow = async (workflowId: string) => {
    setRunning(true);
    try {
      const execution = await workflowEngine.executeWorkflow(workflowId);
      setExecutionsByWorkflow(prev => ({ ...prev, [workflowId]: execution }));
      setWorkflows(workflowEngine.getWorkflows());
    } finally {
      setRunning(false);
    }
  };

  const deleteWorkflow = (workflowId: string) => {
    if (workflowEngine.deleteWorkflow(workflowId)) {
      setWorkflows(workflowEngine.getWorkflows());
      if (selectedId === workflowId) setSelectedId(null);
    }
  };

  if (selectedWorkflow) {
    return (
      <Box sx={{ p: 1, height: '100%', overflowY: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
          <IconButton aria-label="Back to workflow list" size="small" onClick={() => setSelectedId(null)} sx={{ color: '#00f5ff', p: 0.25 }}>
            <ArrowLeft size={14} />
          </IconButton>
          <Typography variant="caption" sx={{ color: '#ffffff', fontWeight: 600, flex: 1 }}>
            {selectedWorkflow.name}
          </Typography>
          <IconButton
            aria-label="Run workflow"
            size="small"
            disabled={running}
            onClick={() => runWorkflow(selectedWorkflow.id)}
            sx={{ color: '#00ff88', p: 0.25 }}
          >
            {running ? <CircularProgress size={14} sx={{ color: '#00ff88' }} /> : <Play size={14} />}
          </IconButton>
        </Box>

        {selectedWorkflow.lastRun && (
          <Typography variant="caption" sx={{ color: '#aaaaaa', display: 'block', mb: 1 }}>
            Last run: <UtcTime at={selectedWorkflow.lastRun} year />
          </Typography>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {selectedWorkflow.steps.map((step, index) => {
            const result = selectedExecution?.results[step.id];
            const bot = botInstances.find(b => b.id === step.botId);
            return (
              <Box
                key={step.id}
                sx={{
                  p: 0.75,
                  backgroundColor: '#0a0a0a',
                  border: '1px solid #333333',
                  borderRadius: 0.5
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {stepStatusIcon(result?.status === 'partial' ? 'success' : result?.status)}
                  <Typography variant="caption" sx={{ color: '#ffffff', fontSize: '0.7rem', flex: 1 }}>
                    {index + 1}. {bot?.name ?? 'Unknown bot'} → {String(step.parameters.target ?? '')}
                  </Typography>
                  {result?.usedMockData && (
                    <Chip label="mock" size="small" sx={{ height: 14, fontSize: '0.55rem', backgroundColor: '#ffaa00', color: '#000' }} />
                  )}
                </Box>
                {result?.status === 'failed' && result.errors[0] && (
                  <Typography variant="caption" sx={{ color: '#ff4444', fontSize: '0.65rem', display: 'block', mt: 0.25 }}>
                    {result.errors[0]}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 1, height: '100%' }}>
      <Typography variant="caption" sx={{ color: '#aaaaaa', mb: 1, display: 'block' }}>
        Sequential bot-mission chains
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {workflows.map(workflow => (
          <Box
            key={workflow.id}
            onClick={() => setSelectedId(workflow.id)}
            sx={{
              p: 0.5,
              backgroundColor: '#0a0a0a',
              border: '1px solid #333333',
              borderRadius: 0,
              color: '#ffffff',
              fontSize: '0.65rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              '&:hover': {
                borderColor: '#00f5ff',
                backgroundColor: 'rgba(0, 245, 255, 0.1)'
              }
            }}
          >
            <Box>
              <Typography variant="caption" sx={{ color: '#ffffff', display: 'block' }}>
                {workflow.name}
              </Typography>
              <Typography variant="caption" sx={{ color: '#666666', fontSize: '0.6rem' }}>
                {workflow.steps.length} step{workflow.steps.length === 1 ? '' : 's'}
              </Typography>
            </Box>
            <IconButton
              aria-label={`Delete workflow ${workflow.name}`}
              size="small"
              onClick={e => { e.stopPropagation(); deleteWorkflow(workflow.id); }}
              sx={{ color: '#ff4444', p: 0.25 }}
            >
              <Trash2 size={12} />
            </IconButton>
          </Box>
        ))}

        <Box
          onClick={() => setCreateOpen(true)}
          sx={{
            p: 0.5,
            backgroundColor: '#0a0a0a',
            border: '1px dashed #333333',
            borderRadius: 0,
            color: '#aaaaaa',
            fontSize: '0.65rem',
            cursor: 'pointer',
            textAlign: 'center',
            mt: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.5,
            '&:hover': {
              borderColor: '#00ff88',
              backgroundColor: 'rgba(0, 255, 136, 0.1)'
            }
          }}
        >
          <Plus size={12} />
          Create Workflow
        </Box>
      </Box>

      <CreateWorkflowDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        bots={botInstances}
        workflowEngine={workflowEngine}
        onWorkflowCreated={() => setWorkflows(workflowEngine.getWorkflows())}
      />
    </Box>
  );
};

export default WorkflowPanel;

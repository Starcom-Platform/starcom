import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { BotInstance, BotRosterService } from '../../../services/BotRosterService';
import type { EnhancedMissionResult } from '../../../execution/BotMissionExecutor';

const executeSimpleMission = vi.fn();
vi.mock('../../../execution/BotMissionExecutor', () => ({
  botMissionExecutor: {
    executeSimpleMission: (...args: unknown[]) => executeSimpleMission(...args)
  }
}));

const convertAndStoreIntelReport = vi.fn();
vi.mock('../../../integration/OsintIntelBridge', () => ({
  convertAndStoreIntelReport: (...args: unknown[]) => convertAndStoreIntelReport(...args)
}));

const publishOsintToNostr = vi.fn();
// The broadcast goes through the publish review (plan item 0.1); here it
// answers as a confirm would.
vi.mock('../../../../../services/publishing/netrunner', () => ({
  reviewOsintBroadcast: (...args: unknown[]) => publishOsintToNostr(...args)
}));

import BotCard from '../BotCard';

function makeBotInstance(overrides: Partial<BotInstance> = {}): BotInstance {
  return {
    id: 'spider-01', name: 'WebSpider Alpha', type: 'default', category: 'crawler',
    status: 'idle', icon: () => null, description: 'test bot', tasksCompleted: 0,
    autonomyLevel: 60, aiControlled: false, capabilities: ['collection'],
    specialization: 'network',
    ...overrides
  };
}

function makeResult(overrides: Partial<EnhancedMissionResult> = {}): EnhancedMissionResult {
  return {
    missionId: 'm1', botId: 'spider-01', target: 'example.com', status: 'success',
    intelCollected: 3, operationsPerformed: [], duration: 500, completedAt: Date.now(),
    errors: [], usedMockData: false, qualityScore: 80, confidenceLevel: 0.8, specializedFindings: {},
    toolsUsed: [], processingStages: [], rawDataGenerated: 0, observationsCreated: 0,
    correlationOpportunities: [], suggestedNextActions: [],
    ...overrides
  };
}

function makeBotService(): BotRosterService {
  return {
    getBotMetrics: () => ({ successRate: 0, operationsCompleted: 0, currentLoad: 0, healthStatus: 'good', lastActivity: 'No missions run yet' }),
    getBotStatusColor: () => '#88ff00'
  } as unknown as BotRosterService;
}

async function runAMission(target = 'example.com', { share = false } = {}) {
  const onMissionEvent = vi.fn();
  const onRefresh = vi.fn();
  render(
    <BotCard
      bot={makeBotInstance()}
      botService={makeBotService()}
      onDelete={vi.fn()}
      onRefresh={onRefresh}
      onMissionEvent={onMissionEvent}
    />
  );

  fireEvent.click(screen.getByText('Run Mission'));
  fireEvent.change(screen.getByLabelText(/target url or domain/i), { target: { value: target } });
  if (share) {
    fireEvent.click(screen.getByLabelText(/share findings with team/i));
  }
  fireEvent.click(screen.getByRole('button', { name: 'Run' }));

  return { onMissionEvent, onRefresh };
}

describe('BotCard', () => {
  beforeEach(() => {
    executeSimpleMission.mockReset();
    convertAndStoreIntelReport.mockReset().mockResolvedValue({ id: 'report-1', title: 'example.com — reconnaissance findings' });
    publishOsintToNostr.mockReset().mockResolvedValue({ success: true, eventId: 'evt-1', relaysOk: 2 });
  });

  it('reports a success mission event and does not broadcast when "share with team" is left unchecked', async () => {
    executeSimpleMission.mockResolvedValue(makeResult({ status: 'success' }));

    const { onMissionEvent } = await runAMission();

    await waitFor(() => expect(onMissionEvent).toHaveBeenCalledWith({
      botName: 'WebSpider Alpha', status: 'success', target: 'example.com',
      reportId: 'report-1', reportTitle: 'example.com — reconnaissance findings'
    }));
    expect(publishOsintToNostr).not.toHaveBeenCalled();
  });

  // It went only to the console, so a mission read as done with its report lost (plan item 9.3).
  it('says no report was saved, and why, when persisting the finding as a report fails', async () => {
    executeSimpleMission.mockResolvedValue(makeResult({ status: 'success' }));
    convertAndStoreIntelReport.mockRejectedValue(new Error('workspace write failed'));

    const { onMissionEvent } = await runAMission();

    await waitFor(() => expect(onMissionEvent).toHaveBeenCalledWith({
      botName: 'WebSpider Alpha', status: 'success', target: 'example.com',
      reportId: undefined, reportTitle: undefined,
      reportNotSaved: 'No Intel Report was saved: workspace write failed'
    }));
  });

  it('reports a failed mission event with the real error message when the executor throws', async () => {
    executeSimpleMission.mockRejectedValue(new Error('no adapter registered'));

    const { onMissionEvent } = await runAMission();

    await waitFor(() => expect(onMissionEvent).toHaveBeenCalledWith({
      botName: 'WebSpider Alpha', status: 'failed', target: 'example.com', reason: 'no adapter registered'
    }));
    expect(publishOsintToNostr).not.toHaveBeenCalled();
  });

  it('reports the real error reason when the mission resolves with status "failed" (not just when it throws)', async () => {
    executeSimpleMission.mockResolvedValue(makeResult({
      status: 'failed', errors: ['Tool execution timed out after 10000ms']
    }));

    const { onMissionEvent } = await runAMission();

    await waitFor(() => expect(onMissionEvent).toHaveBeenCalledWith({
      botName: 'WebSpider Alpha', status: 'failed', target: 'example.com',
      reason: 'Tool execution timed out after 10000ms',
      reportId: 'report-1', reportTitle: 'example.com — reconnaissance findings'
    }));
  });

  it('broadcasts to the team via Nostr only when the operative opts in and the mission produced results', async () => {
    executeSimpleMission.mockResolvedValue(makeResult({ status: 'success' }));

    await runAMission('example.com', { share: true });

    await waitFor(() => expect(publishOsintToNostr).toHaveBeenCalledTimes(1));
    expect(publishOsintToNostr.mock.calls[0][0]).toMatchObject({ target: 'example.com', status: 'success' });
  });

  /*
   * Whether the findings were shared went only to the console, after the one
   * notification had already said the mission completed (plan item 9.3). Now
   * the notification waits for the sharing and says how it went.
   */
  describe('says whether the findings were shared', () => {
    it('with how many relays took them', async () => {
      executeSimpleMission.mockResolvedValue(makeResult({ status: 'success' }));
      publishOsintToNostr.mockResolvedValue({ success: true, eventId: 'e1', relaysOk: 3 });
      const { onMissionEvent } = await runAMission('example.com', { share: true });
      await waitFor(() => expect(onMissionEvent).toHaveBeenCalledTimes(1));
      expect(onMissionEvent.mock.calls[0][0].sharing).toEqual({ published: true, relays: 3 });
    });

    it('not published when no relay took them', async () => {
      executeSimpleMission.mockResolvedValue(makeResult({ status: 'success' }));
      publishOsintToNostr.mockResolvedValue({ success: false, eventId: 'e1', relaysOk: 0, error: 'relay.example: blocked' });
      const { onMissionEvent } = await runAMission('example.com', { share: true });
      await waitFor(() => expect(onMissionEvent).toHaveBeenCalledTimes(1));
      expect(onMissionEvent.mock.calls[0][0].sharing).toEqual({ published: false, why: 'no relay took it (relay.example: blocked)' });
    });

    it('not published when it reports success but no relay counted', async () => {
      executeSimpleMission.mockResolvedValue(makeResult({ status: 'success' }));
      publishOsintToNostr.mockResolvedValue({ success: true, eventId: 'e1', relaysOk: 0 });
      const { onMissionEvent } = await runAMission('example.com', { share: true });
      await waitFor(() => expect(onMissionEvent).toHaveBeenCalledTimes(1));
      expect(onMissionEvent.mock.calls[0][0].sharing).toEqual({ published: false, why: 'no relay took it' });
    });

    it('not published when it was refused before any relay', async () => {
      executeSimpleMission.mockResolvedValue(makeResult({ status: 'success' }));
      publishOsintToNostr.mockResolvedValue({ success: false, error: 'signing was declined' });
      const { onMissionEvent } = await runAMission('example.com', { share: true });
      await waitFor(() => expect(onMissionEvent).toHaveBeenCalledTimes(1));
      expect(onMissionEvent.mock.calls[0][0].sharing).toEqual({ published: false, why: 'signing was declined' });
    });

    it('not published when the review was cancelled', async () => {
      executeSimpleMission.mockResolvedValue(makeResult({ status: 'success' }));
      publishOsintToNostr.mockResolvedValue(null);
      const { onMissionEvent } = await runAMission('example.com', { share: true });
      await waitFor(() => expect(onMissionEvent).toHaveBeenCalledTimes(1));
      expect(onMissionEvent.mock.calls[0][0].sharing).toEqual({ published: false, why: 'the review was cancelled' });
    });

    it('not published when sending threw', async () => {
      executeSimpleMission.mockResolvedValue(makeResult({ status: 'success' }));
      publishOsintToNostr.mockRejectedValue(new Error('IPFS upload failed'));
      const { onMissionEvent } = await runAMission('example.com', { share: true });
      await waitFor(() => expect(onMissionEvent).toHaveBeenCalledTimes(1));
      expect(onMissionEvent.mock.calls[0][0].sharing).toEqual({ published: false, why: 'IPFS upload failed' });
    });

    it('says nothing of sharing when it was not asked for', async () => {
      executeSimpleMission.mockResolvedValue(makeResult({ status: 'success' }));
      const { onMissionEvent } = await runAMission();
      await waitFor(() => expect(onMissionEvent).toHaveBeenCalledTimes(1));
      expect(onMissionEvent.mock.calls[0][0].sharing).toBeUndefined();
    });
  });

  it('does not broadcast a failed mission even if "share with team" was checked', async () => {
    executeSimpleMission.mockResolvedValue(makeResult({ status: 'failed' }));

    await runAMission('example.com', { share: true });

    await waitFor(() => expect(convertAndStoreIntelReport).toHaveBeenCalled());
    expect(publishOsintToNostr).not.toHaveBeenCalled();
  });

  it('passes on why no report was made when the bridge refuses sample data, and does not broadcast it', async () => {
    const refusal = 'Censys returned sample data, not collection, so no Intel Report was made from it';
    executeSimpleMission.mockResolvedValue(makeResult({ usedMockData: true, mockDataFrom: ['Censys'] }));
    convertAndStoreIntelReport.mockRejectedValue(Object.assign(new Error(refusal), { name: 'SampleDataRefusedError' }));

    const { onMissionEvent } = await runAMission('example.com', { share: true });

    await waitFor(() => expect(onMissionEvent).toHaveBeenCalledWith(expect.objectContaining({
      status: 'success',
      reportId: undefined,
      reportNotSaved: refusal
    })));
    expect(publishOsintToNostr).not.toHaveBeenCalled();
  });
});

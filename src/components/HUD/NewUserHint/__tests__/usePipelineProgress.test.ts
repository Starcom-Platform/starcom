/**
 * Where the operator is in the pipeline, read from the stores. A closed
 * mission was packaged and published before it closed (D-MX, MX12), so it
 * still counts as packaged.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { usePipelineProgress } from '../usePipelineProgress';
import { missionService } from '../../../../services/intel/MissionService';
import { intelWorkspaceManager } from '../../../../services/intel/IntelWorkspaceManager';
import { MissionStatus } from '../../../../types/intel/MissionUI';

describe('usePipelineProgress', () => {
  it('counts a mission as packaged once it was, closed since included, and a draft not', async () => {
    await missionService.createMission({ title: 'Still a draft', briefing: '...' });
    const closed = await missionService.createMission({ title: 'Closed since', briefing: '...' });
    await intelWorkspaceManager.updateMission({ ...closed, status: MissionStatus.CLOSED, closedAs: 'completed' });

    const { result } = renderHook(() => usePipelineProgress());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.missionCount).toBe(2);
    expect(result.current.packagedMissionCount).toBe(1);
  });
});

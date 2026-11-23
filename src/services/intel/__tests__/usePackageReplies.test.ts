/**
 * Which published missions can be watched for replies: those whose address
 * was recorded. A dispatched or closed one without it is counted, so silence
 * there is not read as nobody answering.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePackageReplies } from '../usePackageReplies';
import { MissionStatus, type MissionUI } from '../../../types/intel/MissionUI';

describe('usePackageReplies', () => {
  it('counts a dispatched or closed mission with no recorded address as one it cannot watch (D-MX, MX12)', () => {
    const missions = [MissionStatus.DISPATCHED, MissionStatus.CLOSED, MissionStatus.DRAFT].map((status) => ({ status }) as MissionUI);
    const { result } = renderHook(() => usePackageReplies(missions));
    expect(result.current.unwatchable).toBe(2);
    expect(result.current.watching).toBe(0);
  });
});

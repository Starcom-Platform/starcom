/**
 * The Cyber Threats layer asked for the last 48 hours measured from the wall
 * clock. Its records now come from a snapshot built with the deploy, each dated
 * by its list's own last update — so once a deploy was two days old, that window
 * would have excluded every indicator and drawn an empty globe. The build refuses
 * lists more than a week old; that is the recency rule, and the query must not
 * add a second one relative to the clock.
 *
 * @vitest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

const getDataMock = vi.fn();
vi.mock('../../services/CyberAttacks/RealTimeAttackService', () => ({ RealTimeAttackService: vi.fn() }));

import { useCyberAttacks3D } from '../useCyberAttacks3D';
import { RealTimeAttackService } from '../../services/CyberAttacks/RealTimeAttackService';

describe('useCyberAttacks3D — no clock-relative window over a snapshot', () => {
  beforeEach(() => {
    getDataMock.mockReset().mockResolvedValue([]);
    vi.mocked(RealTimeAttackService).mockImplementation(function () { return ({ getData: getDataMock, dispose: vi.fn() }) as unknown as RealTimeAttackService; });
  });

  it('asks for indicators without a time window', async () => {
    renderHook(() => useCyberAttacks3D(true, new THREE.Scene(), null, { updateInterval: 999999 }));
    await waitFor(() => expect(getDataMock).toHaveBeenCalled());
    expect(getDataMock.mock.calls[0][0].time_window).toBeUndefined();
  });
});

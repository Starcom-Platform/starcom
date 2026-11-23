/**
 * Showing a received package, or what its key published, asks the relays for
 * everything that key published (plan item 9.14, decision G6): the globe's
 * intake reads the newest reports from everyone, so what a package cites may
 * never have been asked for. A case or mission is this workspace's own, and
 * asks for nothing.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useShowOnGlobe } from '../useShowOnGlobe';
import { GlobeProvider } from '../../context/GlobeContext';
import { VisualizationModeProvider } from '../../context/VisualizationModeContext';
import { nostrStarcomIntelIngest } from '../../services/intel/NostrStarcomIntelIngest';

vi.mock('../useApplicationRouter', () => ({ useApplicationRouter: () => ({ navigateToApp: vi.fn() }) }));

const MECHA = 'a'.repeat(64);
const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <VisualizationModeProvider><GlobeProvider>{children}</GlobeProvider></VisualizationModeProvider>
);

let followed: ReturnType<typeof vi.spyOn>;
beforeEach(() => { followed = vi.spyOn(nostrStarcomIntelIngest, 'followAuthor').mockImplementation(() => {}); });

describe('useShowOnGlobe', () => {
  it("asks for everything a package's signer published, when showing the package", async () => {
    const { result } = renderHook(() => useShowOnGlobe(), { wrapper });
    await act(() => result.current({ kind: 'package', id: 'evt-1', signer: MECHA, name: 'Nova', cites: ['ic-1'] }));
    expect(followed).toHaveBeenCalledWith(MECHA);
  });

  it('asks for everything a key published, when showing what it published', async () => {
    const { result } = renderHook(() => useShowOnGlobe(), { wrapper });
    await act(() => result.current({ kind: 'publisher', id: MECHA }));
    expect(followed).toHaveBeenCalledWith(MECHA);
  });

  it('asks for nothing when showing a case', async () => {
    const { result } = renderHook(() => useShowOnGlobe(), { wrapper });
    await act(() => result.current({ kind: 'case', id: 'intelcase-none' }));
    expect(followed).not.toHaveBeenCalled();
  });
});

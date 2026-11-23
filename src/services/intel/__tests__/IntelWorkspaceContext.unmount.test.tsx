/**
 * A workspace provider unmounted while the workspace is still opening does
 * nothing when it opens. It set state on the unmounted component, and it
 * subscribed after its own cleanup had run, so that subscription was never
 * removed: every quick mount and unmount left a listener behind. Found as an
 * error after the test environment was torn down (2026-09-30).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, act } from '@testing-library/react';

const doubles = vi.hoisted(() => {
  let open!: () => void;
  const opened = new Promise<void>((r) => { open = r; });
  return {
    open: () => open(),
    manager: {
      ensureInitialized: vi.fn(() => opened),
      getReports: vi.fn(() => []),
      getIntelItems: vi.fn(() => []),
      subscribe: vi.fn(() => () => {}),
    },
  };
});
vi.mock('../IntelWorkspaceManager', () => ({ intelWorkspaceManager: doubles.manager }));

import { IntelWorkspaceProvider } from '../IntelWorkspaceContext';

describe('IntelWorkspaceProvider, unmounted while the workspace opens', () => {
  it('neither loads nor subscribes once the workspace has opened', async () => {
    const { unmount } = render(<IntelWorkspaceProvider><span /></IntelWorkspaceProvider>);
    unmount();
    await act(async () => { doubles.open(); await Promise.resolve(); await Promise.resolve(); });
    expect(doubles.manager.getReports).not.toHaveBeenCalled();
    expect(doubles.manager.subscribe).not.toHaveBeenCalled();
  });
});

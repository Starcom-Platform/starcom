/**
 * Closing a panel keeps it closed.
 *
 * Close only hid the panel and left the feature that opened it active, so the
 * next panel opened anywhere re-evaluated every trigger and showed the closed
 * one again: close the timeline, open the node graph, and the timeline came back
 * on top of it. Found by opening both in the running app.
 */
import React, { useEffect } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// One object for every render, as the real context gives: the manager lists the mode as an
// effect dependency, and a fresh object each render re-runs that effect without end.
const mode = vi.hoisted(() => ({ visualizationMode: { mode: 'CyberCommand', subMode: 'IntelReports' } }));
vi.mock('../../../../context/VisualizationModeContext', () => ({
  useVisualizationMode: () => mode,
}));
vi.mock('../../../../context/GlobeContext', () => ({
  useGlobeContext: () => ({ focusLocation: null }),
}));

import FloatingPanelManager from '../FloatingPanelManager';
import { useFloatingPanels } from '../FloatingPanelContext';

const TimelineBody: React.FC = () => <div>timeline body</div>;
const GraphBody: React.FC = () => <div>graph body</div>;

let panels: ReturnType<typeof useFloatingPanels> | null = null;

const Harness: React.FC = () => {
  const ctx = useFloatingPanels();
  panels = ctx;
  const { registerPanel } = ctx;
  useEffect(() => {
    const at = { anchorTo: 'screen' as const, x: 400, y: 400, offset: { x: 0, y: 0 } };
    registerPanel({ id: 'timeline-panel', type: 'wide', title: 'Timeline', component: TimelineBody,
      position: at, priority: 'primary', triggers: ['timeline'], data: {} });
    registerPanel({ id: 'node-graph-panel', type: 'wide', title: 'Node Graph', component: GraphBody,
      position: at, priority: 'primary', triggers: ['node-graph'], data: {} });
  }, [registerPanel]);
  return null;
};

describe('FloatingPanelManager closing a panel', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    panels = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps a closed panel closed when another panel opens', () => {
    render(<FloatingPanelManager><Harness /></FloatingPanelManager>);
    act(() => panels!.addActiveFeature('timeline'));
    expect(screen.getByText('timeline body')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Close Timeline'));
    expect(screen.queryByText('timeline body')).toBeNull();

    act(() => panels!.addActiveFeature('node-graph'));
    expect(screen.getByText('graph body')).toBeTruthy();
    expect(screen.queryByText('timeline body')).toBeNull();
  });

  it('opens a closed panel again when it is asked for again', () => {
    render(<FloatingPanelManager><Harness /></FloatingPanelManager>);
    act(() => panels!.addActiveFeature('timeline'));
    fireEvent.click(screen.getByLabelText('Close Timeline'));
    expect(screen.queryByText('timeline body')).toBeNull();

    act(() => panels!.addActiveFeature('timeline'));
    expect(screen.getByText('timeline body')).toBeTruthy();
  });
});

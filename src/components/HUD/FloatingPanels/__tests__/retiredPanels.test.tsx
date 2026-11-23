/**
 * Floating panels retired by Phase 4 (decision D5). Mission Control showed the
 * same mission list OpsCenter does (plan item 4.2). The Intelligence Dashboard
 * ran an analysis that found nothing and wrote a canned report (plan item 4.3).
 * The floating-panel system stays, and so do the panels that show something
 * nowhere else does.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const registerPanel = vi.fn();
vi.mock('../FloatingPanelContext', () => ({
  useFloatingPanels: () => ({
    registerPanel,
    unregisterPanel: vi.fn(),
    addActiveFeature: vi.fn(),
    removeActiveFeature: vi.fn(),
    activeFeatures: [],
    panels: [],
    activePanels: [],
  }),
}));

import FloatingPanelRegistrar from '../FloatingPanelRegistrar';
import FloatingPanelDemo from '../FloatingPanelDemo';

const registered = () => registerPanel.mock.calls.map(([panel]) => panel as { id: string; triggers?: string[] });

describe('no floating panel is Mission Control or the Intelligence Dashboard', () => {
  beforeEach(() => { registerPanel.mockReset(); });

  it('the registrar registers the others, and not Mission Control', () => {
    render(<FloatingPanelRegistrar />);
    const ids = registered().map((p) => p.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain('mission-control-panel');
    expect(registered().flatMap((p) => p.triggers ?? [])).not.toContain('mission-control');
    expect(ids).not.toContain('intelligence-dashboard-panel');
    expect(registered().flatMap((p) => p.triggers ?? [])).not.toContain('intelligence-dashboard');
  });

  it('nor does the diagnostics demo', () => {
    render(<FloatingPanelDemo />);
    const ids = registered().map((p) => p.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain('mission-control-panel');
  });

  it('and the diagnostics demo has no button for one', () => {
    render(<FloatingPanelDemo />);
    expect(document.body.textContent).not.toMatch(/Mission Control|Operations Dashboard|Intelligence Dashboard/);
  });
});

/**
 * A record handed to an application opens, even when that application is
 * already open, and a handoff is not carried into later navigations (found
 * while building plan item 1.4, search that finds records).
 *
 * An application read what it was handed once, on mounting, and stayed
 * mounted while the context changed; and each navigation added its context to
 * everything handed over before. So in OpsCenter, choosing another mission
 * from the header's search did nothing, nor did choosing the same one again
 * after closing it; and a case handed over once was handed over again to every
 * later visit to Cases.
 */
import React, { useEffect } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

vi.mock('../../../services/pollerScopes', () => ({ makeRouteScope: (appId: string) => `route:${appId}` }));
vi.mock('../../../services/pollerRegistry', () => ({ pollerRegistry: { stopAll: vi.fn() } }));
vi.mock('../../../applications/cybercommand/CyberCommandApplication', () => ({ default: () => null }));
vi.mock('../../../applications/netrunner/NetRunnerApplication', () => ({ default: () => null }));
vi.mock('../../../applications/intelanalyzer/AnalysisWorkbench', () => ({ default: () => null }));
vi.mock('../../../applications/inteldashboard/IntelDashboardApplication', () => ({ default: () => null }));
vi.mock('../../../applications/intelweb/IntelWebApplicationWrapper', () => ({ default: () => null }));
vi.mock('../../../applications/teamworkspace/TeamWorkspaceApplication', () => ({ default: () => null }));
vi.mock('../../../applications/marketexchange/MarketExchangeApplication', () => ({ default: () => null }));
vi.mock('../../../applications/cases/CasesApplication', () => ({ default: () => null }));

import { EnhancedApplicationRouterProvider, type ApplicationConfig, type EnhancedApplicationRouterContextType } from '../EnhancedApplicationRouter';
import { EnhancedApplicationRouterContext } from '../../../context/EnhancedApplicationRouterContext';
import { ApplicationRenderer } from '../ApplicationRenderer';

/** What each mount of an application was handed, as an application reads it: once, on mounting. */
const arrivals: Array<Record<string, unknown>> = [];
const Recording: React.FC<Record<string, unknown>> = (props) => {
  useEffect(() => { arrivals.push(props); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
};
const app = (id: string): ApplicationConfig => ({
  id: id as ApplicationConfig['id'], name: id, icon: '', description: '',
  defaultMode: 'standalone', supportedModes: ['standalone'], component: Recording,
});

function mount() {
  let router: EnhancedApplicationRouterContextType | null = null;
  const Grab = () => { router = React.useContext(EnhancedApplicationRouterContext); return null; };
  render(<EnhancedApplicationRouterProvider><Grab /><ApplicationRenderer /></EnhancedApplicationRouterProvider>);
  act(() => { router!.registerApplication(app('cases')); router!.registerApplication(app('teamworkspace')); });
  return (...args: Parameters<EnhancedApplicationRouterContextType['navigateToApp']>) => act(() => router!.navigateToApp(...args));
}

describe('handing a record to an application', () => {
  beforeEach(() => { arrivals.length = 0; });

  it('opens it when the application is already open, and when it is the same record again', () => {
    const navigate = mount();
    navigate('teamworkspace', undefined, { initialTab: 'missions', selectMissionId: 'mission-a' });
    navigate('teamworkspace', undefined, { initialTab: 'missions', selectMissionId: 'mission-b' });
    navigate('teamworkspace', undefined, { initialTab: 'missions', selectMissionId: 'mission-b' });
    expect(arrivals.map((p) => p.selectMissionId)).toEqual(['mission-a', 'mission-b', 'mission-b']);
  });

  it('leaves an open application as it is when nothing is handed over', () => {
    const navigate = mount();
    navigate('cases');
    navigate('cases');
    expect(arrivals).toHaveLength(1);
  });

  it('does not hand a record over again to a later visit', () => {
    const navigate = mount();
    navigate('cases', undefined, { selectCaseId: 'case-x' });
    navigate('teamworkspace');
    navigate('cases');
    expect(arrivals.map((p) => p.selectCaseId)).toEqual(['case-x', undefined, undefined]);
  });
});

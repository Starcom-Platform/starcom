import React from 'react';
import { vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { EnhancedApplicationRouterProvider, type ApplicationConfig } from '../EnhancedApplicationRouter';
import { EnhancedApplicationRouterContext } from '../../../context/EnhancedApplicationRouterContext';

vi.mock('../../../services/pollerScopes', () => ({ makeRouteScope: (appId: string) => `route:${appId}` }));

const stopAll = vi.fn();
vi.mock('../../../services/pollerRegistry', () => ({ pollerRegistry: { stopAll: (...args: unknown[]) => stopAll(...args) } }));

vi.mock('../../../applications/cybercommand/CyberCommandApplication', () => () => null);
vi.mock('../../../applications/netrunner/NetRunnerApplication', () => () => null);
vi.mock('../../../applications/intelanalyzer/AnalysisWorkbench', () => () => null);
vi.mock('../../../applications/inteldashboard/IntelDashboardApplication', () => () => null);
vi.mock('../../../applications/intelweb/IntelWebApplicationWrapper', () => () => null);
vi.mock('../../../applications/teamworkspace/TeamWorkspaceApplication', () => () => null);
vi.mock('../../../applications/marketexchange/MarketExchangeApplication', () => () => null);

const registerTestApp = (id: string): ApplicationConfig => ({
  id: id as ApplicationConfig['id'],
  name: id,
  icon: '',
  description: '',
  defaultMode: 'standalone',
  supportedModes: ['standalone'],
  component: () => null,
});

describe('EnhancedApplicationRouter teardown', () => {
  beforeEach(() => {
    stopAll.mockClear();
  });

  it('stops pollers on route change', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EnhancedApplicationRouterProvider>{children}</EnhancedApplicationRouterProvider>
    );

    const { result } = renderHook(() => React.useContext(EnhancedApplicationRouterContext), { wrapper });
    if (!result.current) throw new Error('Router context missing');

    act(() => {
      result.current.registerApplication(registerTestApp('cybercommand'));
      result.current.registerApplication(registerTestApp('netrunner'));
      result.current.navigateToApp('cybercommand');
    });

    act(() => {
      result.current?.navigateToApp('netrunner');
    });

    expect(stopAll).toHaveBeenCalledWith('route:cybercommand');
  });
});

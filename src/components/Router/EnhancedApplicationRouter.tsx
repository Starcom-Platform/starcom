import React, { useState, useCallback, useMemo, ReactNode, lazy } from 'react';
import type { GlyphName } from '../../symbols/uiSymbols';
import type { SectionId } from '../../styles/tokens';
import { EnhancedApplicationRouterContext } from '../../context/EnhancedApplicationRouterContext';
import { pollerRegistry } from '../../services/pollerRegistry';
import { makeRouteScope } from '../../services/pollerScopes';

// Lazy-loaded application components — each becomes its own chunk
// Only the active application is loaded, dramatically reducing initial bundle size
const CyberCommandApplication = lazy(() => import('../../applications/cybercommand/CyberCommandApplication'));
const NetRunnerApplication = lazy(() => import('../../applications/netrunner/NetRunnerApplication'));
const AnalysisWorkbench = lazy(() => import('../../applications/intelanalyzer/AnalysisWorkbench'));
const IntelDashboardApplication = lazy(() => import('../../applications/inteldashboard/IntelDashboardApplication'));
const CasesApplication = lazy(() => import('../../applications/cases/CasesApplication'));
const IntelWebApplicationWrapper = lazy(() => import('../../applications/intelweb/IntelWebApplicationWrapper'));
const TeamWorkspaceApplication = lazy(() => import('../../applications/teamworkspace/TeamWorkspaceApplication'));
const MarketExchangeApplication = lazy(() => import('../../applications/marketexchange/MarketExchangeApplication'));
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'EnhancedApplicationRouter' });

// Define application types and modes
export type ApplicationId = 
  | 'cybercommand'
  | 'netrunner'
  | 'intelanalyzer'
  | 'inteldashboard'
  | 'cases'
  | 'intelweb' // renamed from nodeweb
  | 'teamworkspace'
  | 'marketexchange';

export type PresentationMode = 'standalone' | 'modal' | 'embedded';

// Application context type - can be extended as needed
export interface ApplicationContext {
  [key: string]: string | number | boolean | null | undefined;
}

// Application state for preservation
export interface ApplicationStateData {
  [key: string]: unknown;
}

/** Where the bottom bar puts a destination. */
export type BarGroup = 'primary' | 'intel' | 'collab' | 'special';

export interface ApplicationConfig {
  id: ApplicationId;
  /** What a person reads: the bar, the search, the coach and the screen's own title. */
  name: string;
  /** Its glyph in the registry (K3): one icon wherever the app is offered. */
  glyph: GlyphName;
  /** The section it belongs to, whose tint its frame wears (BD2, BD10). */
  section: SectionId;
  description: string;
  group: BarGroup;
  defaultMode: PresentationMode;
  supportedModes: PresentationMode[];
  component: React.ComponentType<ApplicationContext>;
  isProtected?: boolean; // For CyberCommand
}

export interface ApplicationState {
  currentApp: ApplicationId | null;
  presentationMode: PresentationMode;
  context: ApplicationContext;
  history: ApplicationId[];
  /**
   * Counts navigations that handed something over. The open application is
   * mounted afresh for each, so it reads what it was handed as an application
   * arriving from elsewhere does, on mounting, even when it was already open.
   */
  arrival: number;
}

export interface EnhancedApplicationRouterContextType {
  // Current state
  currentApp: ApplicationId | null;
  presentationMode: PresentationMode;
  context: ApplicationContext;
  history: ApplicationId[];
  arrival: number;
  
  // Navigation methods
  navigateToApp: (appId: ApplicationId, mode?: PresentationMode, context?: ApplicationContext) => void;
  goBack: () => void;
  setContext: (key: string, value: string | number | boolean | null | undefined) => void;
  getContext: (key: string) => string | number | boolean | null | undefined;
  
  // Application registry
  registerApplication: (config: ApplicationConfig) => void;
  getApplication: (appId: ApplicationId) => ApplicationConfig | undefined;
  getAllApplications: () => ApplicationConfig[];
  
  // State management
  preserveState: (appId: ApplicationId, state: ApplicationStateData) => void;
  restoreState: (appId: ApplicationId) => ApplicationStateData | undefined;
}

// Application registry - stores registered applications
const applicationRegistry = new Map<ApplicationId, ApplicationConfig>();

// Application state preservation - stores application states
const applicationStates = new Map<ApplicationId, ApplicationStateData>();

// Default application configurations
/** Every application this build has, and how each one names itself. */
export const APPLICATIONS: ApplicationConfig[] = [
  {
    id: 'cybercommand',
    name: 'Globe',
    glyph: 'app:cybercommand',
    section: 'situation',
    description: 'The globe: where reports, events and missions are',
    group: 'primary',
    defaultMode: 'standalone',
    supportedModes: ['standalone'],
    component: CyberCommandApplication,
    isProtected: false // Now properly integrated
  },
  {
    id: 'netrunner',
    name: 'NetRunner',
    glyph: 'app:netrunner',
    section: 'collect',
    description: 'Advanced investigation and search tools',
    group: 'intel',
    defaultMode: 'standalone',
    supportedModes: ['standalone', 'modal'],
    component: NetRunnerApplication
  },
  {
    id: 'cases',
    name: 'Cases',
    glyph: 'app:cases',
    section: 'investigate',
    description: 'Investigations: assemble reports into a position worth acting on',
    group: 'intel',
    defaultMode: 'standalone',
    supportedModes: ['standalone', 'modal'],
    component: CasesApplication
  },
  {
    id: 'inteldashboard',
    name: 'IntelDashboard',
    glyph: 'app:inteldashboard',
    section: 'collect',
    description: 'Write and read intelligence reports',
    group: 'intel',
    defaultMode: 'standalone',
    supportedModes: ['standalone', 'modal'],
    component: IntelDashboardApplication
  },
  {
    id: 'intelanalyzer',
    name: 'IntelAnalyzer',
    glyph: 'app:intelanalyzer',
    section: 'analyse',
    description: 'Analyze reports and observations: patterns, corroboration and gaps',
    group: 'intel',
    defaultMode: 'standalone',
    supportedModes: ['standalone', 'modal'],
    component: AnalysisWorkbench
  },
  {
    id: 'intelweb', // renamed from nodeweb
    name: 'IntelWeb',
    glyph: 'app:intelweb',
    section: 'analyse',
    description: 'Intelligence connections and relationship mapping',
    group: 'intel',
    defaultMode: 'standalone',
    supportedModes: ['standalone', 'modal'],
    component: IntelWebApplicationWrapper
  },
  {
    id: 'teamworkspace',
    /**
     * Missions (K1). It was OpsCenter, and the bar listed it twice: OpsCenter,
     * opening on Overview, and Missions, the same app opening on its missions
     * tab. It is named for the tab the pipeline sends people to and opens on
     * it; Overview, Chat, Operatives and Admin stay as tabs. The id stays, so
     * /app/teamworkspace links still open it (appPath.ts).
     *
     * The description names what is in there, in the order it matters. An
     * earlier one advertised "project management", the one tab that is an
     * honest placeholder, and left out missions.
     */
    name: 'Missions',
    glyph: 'app:teamworkspace',
    section: 'assemble',
    description: 'Assemble missions from cases and reports, dispatch them, and coordinate the team',
    group: 'collab',
    defaultMode: 'standalone',
    supportedModes: ['standalone', 'modal'],
    component: TeamWorkspaceApplication
  },
  {
    id: 'marketexchange',
    name: 'MarketExchange',
    glyph: 'app:marketexchange',
    section: 'publish',
    description: 'Publish a report, and the opportunity board',
    group: 'special',
    defaultMode: 'standalone',
    supportedModes: ['standalone', 'modal'],
    component: MarketExchangeApplication
  }
];

// Initialize default applications
APPLICATIONS.forEach(app => {
  applicationRegistry.set(app.id, app);
});

/** A place the bar, the search and quick access can take a person. */
export interface Destination {
  key: string;
  app: ApplicationId;
  label: string;
  glyph: GlyphName;
  section: SectionId;
  description: string;
  group: BarGroup;
  /** Handed to the application on arrival; none for an application opened plain. */
  context?: ApplicationContext;
}

/**
 * Every place the bar, the header search and quick access offer: each
 * application, once (plan item 4.6, decision D5; K1).
 *
 * The bar kept its own list, with its own names, icons and descriptions, so the
 * globe was "CyberCommand" in one place and "Globe" in another. Missions was
 * listed beside OpsCenter, one app twice, until the app took its name (K1).
 */
export const DESTINATIONS: Destination[] = APPLICATIONS.map((app): Destination => (
  { key: app.id, app: app.id, label: app.name, glyph: app.glyph, section: app.section, description: app.description, group: app.group }
));

export const EnhancedApplicationRouterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ApplicationState>({
    currentApp: null,
    presentationMode: 'standalone',
    context: {},
    history: [],
    arrival: 0,
  });

  const navigateToApp = useCallback((
    appId: ApplicationId, 
    mode?: PresentationMode, 
    context?: ApplicationContext
  ) => {
    const app = applicationRegistry.get(appId);
    if (!app) {
      log.warn(`Application ${appId} not found in registry`);
      return;
    }

    const targetMode = mode || app.defaultMode;
    if (!app.supportedModes.includes(targetMode)) {
      log.warn(`Application ${appId} does not support mode ${targetMode}`);
      return;
    }

    if (state.currentApp && state.currentApp !== appId) {
      pollerRegistry.stopAll(makeRouteScope(state.currentApp));
    }

    // A navigation hands over what it passes and nothing from before: a case
    // handed over once was handed again to every later visit to Cases.
    const handsOver = Object.keys(context ?? {}).length > 0;
    setState(prevState => ({
      ...prevState,
      currentApp: appId,
      presentationMode: targetMode,
      context: context ?? {},
      arrival: handsOver ? prevState.arrival + 1 : prevState.arrival,
      history: prevState.currentApp 
        ? [...prevState.history.slice(-9), prevState.currentApp] // Keep last 10
        : prevState.history
    }));
  }, [state.currentApp]);

  const goBack = useCallback(() => {
    setState(prevState => {
      if (prevState.history.length === 0) return prevState;
      
      const previousApp = prevState.history[prevState.history.length - 1];
      const newHistory = prevState.history.slice(0, -1);

      if (prevState.currentApp) {
        pollerRegistry.stopAll(makeRouteScope(prevState.currentApp));
      }
      
      return {
        ...prevState,
        currentApp: previousApp,
        history: newHistory
      };
    });
  }, []);

  const setContext = useCallback((key: string, value: string | number | boolean | null | undefined) => {
    setState(prevState => ({
      ...prevState,
      context: {
        ...prevState.context,
        [key]: value
      }
    }));
  }, []);

  const getContext = useCallback((key: string) => {
    return state.context[key];
  }, [state.context]);

  const registerApplication = useCallback((config: ApplicationConfig) => {
    applicationRegistry.set(config.id, config);
  }, []);

  const getApplication = useCallback((appId: ApplicationId) => {
    return applicationRegistry.get(appId);
  }, []);

  const getAllApplications = useCallback(() => {
    return Array.from(applicationRegistry.values());
  }, []);

  const preserveState = useCallback((appId: ApplicationId, appState: ApplicationStateData) => {
    applicationStates.set(appId, appState);
  }, []);

  const restoreState = useCallback((appId: ApplicationId) => {
    return applicationStates.get(appId);
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue: EnhancedApplicationRouterContextType = useMemo(() => ({
    currentApp: state.currentApp,
    presentationMode: state.presentationMode,
    context: state.context,
    history: state.history,
    arrival: state.arrival,
    
    navigateToApp,
    goBack,
    setContext,
    getContext,
    
    registerApplication,
    getApplication,
    getAllApplications,
    
    preserveState,
    restoreState
  }), [
    state.currentApp,
    state.presentationMode,
    state.context,
    state.history,
    state.arrival,
    navigateToApp,
    goBack,
    setContext,
    getContext,
    registerApplication,
    getApplication,
    getAllApplications,
    preserveState,
    restoreState
  ]);

  return (
    <EnhancedApplicationRouterContext.Provider value={contextValue}>
      {children}
    </EnhancedApplicationRouterContext.Provider>
  );
};

import React from "react";
import AppRoutes from "./routes/routes";
import { WASMProvider } from "./context/WASMContext";
import { useBootServices } from "./hooks/useBootServices";
import { debugLogger, DebugCategory } from "./utils/debugLogger";
import { GlobeProvider } from "./context/GlobeContext.tsx";
import { CountrySelectionProvider } from "./context/CountrySelectionContext";
import { VisualizationModeProvider } from "./context/VisualizationModeContext";
import { VisualizationOverlayProvider } from "./context/VisualizationOverlayContext";
import { GeoPoliticalSettingsProvider } from "./hooks/useGeoPoliticalSettings";
import { SpaceWeatherProvider } from "./context/SpaceWeatherContext";
import { UnifiedGlobalCommandProvider } from "./context/UnifiedGlobalCommandContext";
import { GlobalGlobeContextMenuProvider } from "./context/GlobalGlobeContextMenuProvider";
import { RightSideBarProvider } from "./context/RightSideBarContext";
import SettingsInitializer from "./components/SettingsInitializer";
import NotificationSystem from "./components/NotificationSystem/NotificationSystem";
import { SpaceWeatherModeLayers } from './components/SpaceWeather/SpaceWeatherModeLayers';
import PreloaderManager from "./components/Preloader/PreloaderManager";
import DebugControlPanel from "./components/Debug/DebugControlPanel";
import { useDebugPanel } from "./hooks/useDebugPanel";
import { useFeatureFlag } from './utils/featureFlags';
import "./styles/globals.css";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ErrorBoundary from './components/Shared/ErrorBoundary';
import { RoutedPopupLayer } from './components/Popup/RoutedPopupLayer';
import { TemporalProvider } from './context/TemporalContext';
import SupportFunnelRoot from './components/SupportDrive/SupportFunnelRoot';
import IdentityNoticeRoot from './components/Identity/IdentityNoticeRoot';
import OwnNameRoot from './components/Identity/OwnNameRoot';
import CallsignRoot from './components/Identity/CallsignRoot';
import AgeQuestionRoot from './components/Identity/AgeQuestionRoot';
import KeyUnlockRoot from './components/Identity/KeyUnlockRoot';
import GlossaryRoot from './components/Help/GlossaryRoot';
import CoachRoot from './components/Coach/CoachRoot';
import PublishReviewRoot from './components/Publishing/PublishReviewRoot';
import UndoDeletionRoot from './components/Undo/UndoDeletionRoot';
import MainSettingsRoot from './components/Settings/MainSettingsRoot';
import CreditsRoot from './components/Credits/CreditsRoot';
import InterfaceSoundsRoot from './components/Sound/InterfaceSoundsRoot';
import { SecureChatProvider } from './communication';
import SecureChatManager from './components/SecureChat/SecureChatManager';
import { composeProviders } from './context/composeProviders';
import { DockHost } from './components/Dock/DockHost';

// Component loading debug
debugLogger.info(DebugCategory.COMPONENT_LOAD, 'App.tsx loaded - main application entry point');

const queryClient = new QueryClient();

/**
 * Uplink's side panel (decision D-EX, E2, W6): a slim Starcom page beside a Starcom tab or alone. It
 * shows the open case, its captures and its missions from the local workspace, and needs no relays,
 * IPFS, ingest or chat; started there, they doubled every relay socket a tab already holds (7 of 7,
 * measured 2026-10-11) and saved incoming intel from two copies at once.
 */
const SLIM_PAGE = typeof window !== 'undefined' && window.location.pathname.replace(/\/+$/, '') === '/panel';

const AppContent: React.FC = () => {
  const { isVisible, closePanel } = useDebugPanel();
  const secureChatEnabled = useFeatureFlag('secureChatEnabled');
  
  // The session's services, started once (see useBootServices).
  useBootServices({ slim: SLIM_PAGE });

  return (
    // DockHost wraps the app content rather than sitting inside the HUD shell:
    // docked components (SecureChatManager, the notifications) mount here,
    // above the shell, and a route without the HUD still needs
    // somewhere for them to land. See components/Dock/DockHost.tsx.
    <DockHost>
      <SettingsInitializer />
      {/* The page router and the application router wrap the popup layer, in App
          below, so what a popup shows can navigate too. See RoutedPopupLayer. */}
      <AppRoutes />
      {/* Notifications raised anywhere in the app, docked top-right. Mounted here, above
          the routes, so one raised from chat or Missions shows on every screen. */}
      <NotificationSystem />
      {/* Debug Control Panel - Toggle with Ctrl+Shift+D */}
      <DebugControlPanel isVisible={isVisible} onClose={closePanel} />
      {/* SecureChat — Nostr+IPFS+PQC encrypted comms (enable via secureChatEnabled flag) */}
      {secureChatEnabled && !SLIM_PAGE && <SecureChatManager />}
    </DockHost>
  );
};

// Group A: Visualization-related providers
const VisualizationProviders = composeProviders(
  VisualizationModeProvider,
  GlobeProvider,
  CountrySelectionProvider,
  VisualizationOverlayProvider,
  GlobalGlobeContextMenuProvider,
  GeoPoliticalSettingsProvider,
);

// Group B: Layout-related providers
// PopupProvider deliberately NOT included here (see below) — it needs to sit
// *inside* SpaceWeatherProvider/VisualizationProviders/etc., not outside them.
const LayoutProviders = composeProviders(
  // DashboardProvider fetched four EIA readings on every load, into a context
  // nothing read (critique audit of 2026-10-01). Removed with it.
  RightSideBarProvider,
);

const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <PreloaderManager>
      <ErrorBoundary>
        <WASMProvider>
          <LayoutProviders>
            <VisualizationProviders>
              <SpaceWeatherProvider>
                {/* MarketplaceProvider sat here and fetched /api/listings on mount, for
                    every visitor on every load, from a server deliberately deleted in
                    b7283a86. The marketplace it served was never routed. Removed with
                    it — see guard-absent-capabilities.mjs. */}
                  <UnifiedGlobalCommandProvider>
                      <SecureChatProvider>
                        {/* The shared time state, once, for every screen and every popup, so
                            the globe, the timeline and IntelAnalyzer read one window (decision
                            D-E). Inside the globe's HUD layout the analyzer could not reach it. */}
                        <TemporalProvider>
                        {/* PopupProvider renders its portal content (createPortal to
                            document.body) as a SIBLING of `children` within its own
                            render, not a descendant — so it only inherits context
                            from providers ABOVE where PopupProvider itself sits, never
                            from providers around `children`. It was previously
                            composed into LayoutProviders, outside every context below
                            it (VisualizationMode, SpaceWeather, Globe,
                            ...) — a real, previously-unnoticed bug: ANY popup whose
                            content used those hooks threw
                            "must be used within a ___Provider" and rendered nothing,
                            including the already-shipped SpaceWeatherSubRailSettingsPopup
                            (confirmed live: it threw the same class of error before this
                            fix). Moved here, as deep as reasonably possible, so popup
                            content has access to everything a normal in-tree component
                            would. The page router and the application router
                            wrap it for the same reason: a popup that navigates
                            threw while they sat inside AppContent. See
                            RoutedPopupLayer. */}
                        <RoutedPopupLayer>
                        <div data-testid="app-root">
                          <AppContent />
                          <SpaceWeatherModeLayers />
                          <SupportFunnelRoot />
                          {/* Says so when this browser mints a key that can sign as
                              the person — see IdentityNoticeRoot. Mounted app-wide
                              because the first signature can come from anywhere. */}
                          <IdentityNoticeRoot />
                          {/* "How old are you?", asked before Starcom makes a first key; under
                              13 it makes none, so nothing is posted (D-RS, RS39). */}
                          <AgeQuestionRoot />
                          {/* The passphrase, asked when something the person did needs
                              their locked key (D-KL). Nothing that runs on its own asks. */}
                          <KeyUnlockRoot />
                          {/* What to call you, asked once there is a key for the
                              name to stand for (plan item 2.1). */}
                          <OwnNameRoot />
                          <CallsignRoot />
                          {/* The glossary, opened by any "?" or the command box (plan item 3.2). */}
                          <GlossaryRoot />
                          {/* The coach, over real work, once someone starts it (plan item 6.1). */}
                          <CoachRoot />
                          {/* The publish review: every publish shows what goes and where
                              before anything is sent (plan item 0.1). App-wide, because a
                              publish can start from any screen. */}
                          <PublishReviewRoot />
                          {/* Undo for every deletion, held ten seconds before it is
                              final (plan item 0.6). App-wide, because a deletion can
                              start from any screen. */}
                          <UndoDeletionRoot />
                          {/* Settings, the app's own, opened from the header or More on a phone. */}
                          <MainSettingsRoot />
                          {/* Who made what Starcom draws: from Settings, and at /credits (TX11). */}
                          <CreditsRoot />
                          {/* The interface's sounds, heard from the document; silent until turned on (N12). */}
                          <InterfaceSoundsRoot />
                        </div>
                        </RoutedPopupLayer>
                        </TemporalProvider>
                      </SecureChatProvider>
                  </UnifiedGlobalCommandProvider>
              </SpaceWeatherProvider>
            </VisualizationProviders>
          </LayoutProviders>
        </WASMProvider>
      </ErrorBoundary>
    </PreloaderManager>
  </QueryClientProvider>
);

export default App;
import React, { lazy, Suspense } from 'react';
import RecordRoute from './RecordRoute';
import { Routes, Route, Navigate } from 'react-router-dom';
import MainPage from '../pages/MainPage/MainPage';

// Lazy-loaded standalone pages — these are not needed until their route is visited.
// Two shims survive the fold, because their address carries something the plain
// redirect cannot: a team, and a report to highlight (decision D-F, step 3.3).
const TeamWorkspace = lazy(() => import('../pages/Teams/TeamWorkspace'));
const JoinTeamPage = lazy(() => import('../pages/Teams/JoinTeamPage'));
const IntelDashboard = lazy(() => import('../pages/Intel/IntelDashboard'));
const UplinkPanel = lazy(() => import('../pages/UplinkPanel/UplinkPanel'));

/**
 * Route loading fallback
 */
const RouteLoadingFallback: React.FC = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    color: '#64b5f6',
    fontFamily: 'var(--sc-font-data)',
    fontSize: '14px',
    background: '#0a0a0f',
  }}>
    Loading...
  </div>
);

/** Suspense wrapper for lazy route components */
const SuspenseRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense fallback={<RouteLoadingFallback />}>{children}</Suspense>
);

/**
 * Main routing component for the application
 * 
 * We use a nested route structure to handle the main application screens:
 * - The parent route (/) renders MainPage, which owns navigation/layout and
 *   which of the 7 registered apps is showing via EnhancedApplicationRouterContext.
 *
 * A parallel set of child routes here (search/netrunner/intelanalyzer/...)
 * used to exist for URL deep-linking into those same 7 apps, synced via a
 * ViewContext/useRouteSync system — but that system tracked its OWN,
 * separate piece of state (ViewContext's currentScreen), never
 * EnhancedApplicationRouterContext, which is what MainPage/ApplicationRenderer
 * actually read to decide what to render. RouteSynchronizer, the component
 * meant to wire them together, had its one line of real logic commented out
 * ("TEMPORARILY DISABLED") — even fixed, it would only have kept the URL in
 * sync with a piece of state nothing else consulted. Deleted (see
 * docs/missions/00-current-state/navigation-and-app-structure.md) rather
 * than repaired.
 *
 * Addresses now sync against EnhancedApplicationRouterContext directly: each
 * application lives at /app/<id> (the Globe at /), and useApplicationUrl in
 * MainPage keeps the URL and the open application in step. See routes/appPath.
 */
const AppRoutes: React.FC = () => (
  <Routes>
    {/* Main Application Routes */}
    <Route path="/" element={<MainPage />}>
      {/* The Globe, and each application's own address. MainPage renders both,
          so the shell stays mounted while the address changes. */}
      <Route index element={null} />
      <Route path="app/:appId" element={null} />
      {/* A record inside an application: /app/cases/<id> is a case's page (plan item 1.2). */}
      <Route path="app/:appId/:recordId" element={null} />
      {/* The credits, opened over the app by CreditsRoot so the globe stays beneath them (TX11). */}
      <Route path="credits" element={null} />
    </Route>

    {/*
      A record, addressable. Nothing resolved to a specific case, report or
      mission before this — the lists were reachable and the things in them were
      not — so a link to what a colleague was discussing could not be sent.
    */}
    <Route path="/r/:kind/:id" element={<RecordRoute />} />

    {/* Starcom in Uplink's side panel (D-EX, E2, W6): a slim page the extension frames. */}
    <Route path="/panel" element={<SuspenseRoute><UplinkPanel /></SuspenseRoute>} />

    {/* Where a team invite link lands (plan item 2.3): Flotilla's ?r=&c= link. */}
    <Route path="/join" element={<SuspenseRoute><JoinTeamPage /></SuspenseRoute>} />

    {/* Legacy and Standalone Routes - These use their own components */}
    <Route path="/team/:teamId" element={<SuspenseRoute><TeamWorkspace /></SuspenseRoute>} />
    
    <Route path="/investigations" element={<Navigate to="/app/cases" replace />} />
    
    {/* /investigations/:investigationId retired along with the rest of the
        legacy Investigation cluster. It was backed by InvestigationApiService
        against an HTTP API at 127.0.0.1:8081 — early-prototype RelayNode
        work, NOT the RelayNode capability stack that actually shipped. The
        real AI Security Relay Node (the Jetson Orin AGX, Mk1/prototype) is
        deployed and integrates through Nostr and IPFS, which is what
        NostrStarcomIntelIngest / MissionPackageBroadcastService already use.
        The docs/testing/test-auth.sh + test-valid-jwt.sh scripts that hit
        :8081 are from that same dead prototype era and are not evidence of a
        live integration. */}
    <Route path="/investigations/:investigationId" element={<Navigate to="/app/cases" replace />} />

    <Route path="/intel" element={<SuspenseRoute><IntelDashboard /></SuspenseRoute>} />
    
    {/* Redirects to the same canonical Intel Dashboard app as /intel, below —
        this used to render IntelWorkspaceConsole directly with a
        "has moved, use the merged app" banner, which was self-contradictory
        (it WAS the merged app's own component). See
        docs/missions/01-architecture-decisions/canonical-intel-report-path.md. */}
    <Route path="/intel/workspace" element={<SuspenseRoute><IntelDashboard /></SuspenseRoute>} />

    {/* The form here was unstyled and linked from nowhere; the Intel Dashboard
        writes reports, with the same event-time fields (decision D-F, step 3.3). */}
    <Route path="/team/:teamId/new-report" element={<Navigate to="/app/inteldashboard" replace />} />
    
    {/* Same legacy-prototype cluster as /investigations/:investigationId above. */}
    <Route path="/cyber-investigation" element={<Navigate to="/app/cases" replace />} />

    {/* Intelligence Operations Routes — Cases, Info Gathering/Analysis. */}
    {/* /osint was retired: every service on it called an /api/osint backend that does
        not exist. A bookmark lands on the globe rather than on a page that cannot load. */}
    <Route path="/osint" element={<Navigate to="/" replace />} />
    
    {/* Cases is a registered application, and this is the screen it shows. The
        route stayed behind a wallet sign-in, so everyone else was sent to the
        globe without being told (decision D-F, step 3.3). */}
    <Route path="/cases-dashboard" element={<Navigate to="/app/cases" replace />} />
    
    {/* Case Manager consolidated onto the real, IndexedDB-backed Cases Dashboard — the
        previous /case-manager screen was an in-memory mock that never persisted anything. */}
    <Route path="/case-manager" element={<Navigate to="/app/cases" replace />} />

    {/* A static menu of tool categories, and a list of analysis screens whose own
        links led to routes that do not exist. Nothing linked to either, and both
        retire as /osint did (decision D-F, step 3.3). */}
    <Route path="/info-gathering" element={<Navigate to="/" replace />} />
    
    <Route path="/info-analysis" element={<Navigate to="/" replace />} />
    
    {/* The demo and test pages (/auth-demo, /enhanced-app-demo, /test-ui,
        /ux-test) are retired: what they showed was removed before them
        (plan item 4.1, decision D5). Their addresses fall to the catch-all. */}
    {/* Catch-all route - redirect to home */}
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default AppRoutes;

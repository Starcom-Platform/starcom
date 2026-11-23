import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { debugLogger, DebugCategory } from './utils/debugLogger';
import { env } from './config/env';
import { ThemeProvider } from '@mui/material/styles';
import GlobalStyles from '@mui/material/GlobalStyles';
import { starcomTheme } from './styles/starcomTheme';
import { tokenVariables } from './styles/tokens';
// Type, pairing A (plan item 8.2), self-hosted once: no font comes from Google.
import '@fontsource/oxanium/600.css';
import '@fontsource/oxanium/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/jetbrains-mono/400.css';
// Hindi's script (D-ML, L2): the faces are declared here, and fetched only when Devanagari is drawn.
import '@fontsource/ibm-plex-sans-devanagari/400.css';
import '@fontsource/ibm-plex-sans-devanagari/500.css';
import '@fontsource/ibm-plex-sans-devanagari/600.css';

// Global debugging setup
debugLogger.info(DebugCategory.COMPONENT_LOAD, 'main.tsx loaded - setting up global error monitoring');

// Analytics is not present in this build. The gate that used to live here was
// correct and never fired — but the loader shipped in the bundle anyway, one
// environment variable away from sending an investigator's IP and page path to
// a third party. See scripts/guard-absent-capabilities.mjs ('third-party analytics') for the reasoning, and
// scripts/guard-absent-capabilities.mjs for the check that keeps it out.

// Capture unhandled errors for WalletNotSelectedError tracking
window.addEventListener('error', (event) => {
  debugLogger.error(DebugCategory.CONSOLE_ERROR, 'GLOBAL ERROR EVENT', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error,
    timestamp: new Date().toISOString()
  });
  
  if (event.error?.name === 'WalletNotSelectedError' || event.message?.includes('WalletNotSelectedError')) {
    log.error('🎯 GLOBAL: WalletNotSelectedError caught in global error handler');
  }
});

// Capture unhandled promise rejections  
window.addEventListener('unhandledrejection', (event) => {
  debugLogger.error(DebugCategory.CONSOLE_ERROR, 'GLOBAL UNHANDLED PROMISE REJECTION', {
    reason: event.reason,
    promise: event.promise,
    timestamp: new Date().toISOString()
  });
  
  if (event.reason?.name === 'WalletNotSelectedError' || String(event.reason).includes('WalletNotSelectedError')) {
    log.error('🎯 GLOBAL PROMISE: WalletNotSelectedError caught in promise rejection handler');
  }
});

// Import console optimization to reduce noise
import './utils/consoleOptimization';
import { createLogger } from '@utils/logger';
import { registerServiceWorker } from './services/pwa/registerServiceWorker';
import { startLanguage } from './i18n/app/i18n';
const log = createLogger({ prefix: 'main' });

// The language of Starcom's screens (D-ML, L1): the person's choice, else their browser's.
void startLanguage();

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

// Create a memoized component to prevent re-renders that might cause duplicate detection
/**
 * The application, with no wallet at all.
 *
 * This was ConnectionProvider > WalletProvider > WalletModalProvider >
 * UnifiedAuthProvider > App, which put 2,356 KB of Solana, 36% of the raw
 * first-visit payload, in the entry graph for every visitor. The adapters then
 * moved beside the app, mounted on the first request for a wallet. The wallet
 * is now retired (plan item 4.4): identity is a Nostr key, and nothing any
 * plan still wants needs a wallet.
 */
const AppShell = React.memo(() => (
  <ThemeProvider theme={starcomTheme}>
    {/* The tokens as CSS custom properties, from the same source as the theme (plan item 8.1). */}
    <GlobalStyles styles={{ ':root': tokenVariables() }} />
    <App />
  </ThemeProvider>
));

root.render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>
);

/**
 * Offline capability, requested after the tree is mounted.
 *
 * Deliberately not awaited and deliberately last: registration must never sit
 * between a visitor and a first paint, and its failure must never be a failure
 * to start.
 */
void registerServiceWorker();

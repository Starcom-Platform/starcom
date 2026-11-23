import React, { useState, useEffect } from 'react';
import StarcomPreloader from './StarcomPreloader';
import './PreloaderManager.css';

// Extend window interface for global function
declare global {
  interface Window {
    hideInitialPreloader?: () => void;
  }
}

interface PreloaderManagerProps {
  children: React.ReactNode;
}

/**
 * PreloaderManager - shows the splash until the page has loaded, then fades.
 *
 * It held every visit for a minimum (2.5 s from the app, 1.8 s by default)
 * whatever had loaded: a fixed wait made to look like work (plan item 8.3).
 * The globe's own loader shows what the globe is waiting on.
 */
const PreloaderManager: React.FC<PreloaderManagerProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [showPreloader, setShowPreloader] = useState(true);
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    // Hide the initial HTML preloader when React preloader is ready
    if (typeof window !== 'undefined' && window.hideInitialPreloader) {
      window.hideInitialPreloader();
    }
    
    // Fade, then remove the splash from the DOM.
    const hidePreloader = () => {
      setIsLoading(false);
      setTimeout(() => {
        setShowPreloader(false);
      }, 800); // Match CSS transition duration (0.8s)
    };

    /**
     * What actually gates the handover: the document finishing its load.
     *
     * This used to look like readiness detection — it built a list of
     * "critical elements", checked they were all present, and carried a note
     * to "add other critical elements that should be loaded". The list held
     * one entry, `#root`, which is written in index.html and is therefore
     * present from the first byte. The check could not fail, so it decided
     * nothing; the real gate was always whichever load event happened to call
     * it. A reader had no way to know that from the code.
     *
     * The globe does publish a genuine ready signal — Globe.tsx calls
     * setGlobeInitialized once its scene exists — but GlobeLoadingProvider is
     * mounted BELOW this component, so this component cannot read it. That is
     * the reason it is not used here, recorded so the next person does not
     * have to rediscover it.
     */
    const handOver = () => {
      if (appReady) return;
      setAppReady(true);
      hidePreloader();
    };

    if (document.readyState === 'complete') {
      handOver();
      return;
    }

    document.addEventListener('DOMContentLoaded', handOver);
    window.addEventListener('load', handOver);

    // A ceiling, so a stalled asset cannot leave a visitor on the splash.
    const fallbackTimeout = setTimeout(handOver, 5000);

    return () => {
      document.removeEventListener('DOMContentLoaded', handOver);
      window.removeEventListener('load', handOver);
      clearTimeout(fallbackTimeout);
    };
  }, [appReady]);

  // Don't render children until preloader is completely hidden
  return (
    <>
      {showPreloader && (
        <div className={`preloader-overlay ${!isLoading ? 'fade-out' : ''}`}>
          <StarcomPreloader />
        </div>
      )}
      <div className={`app-content ${showPreloader ? 'hidden' : 'visible'}`}>
        {children}
      </div>
    </>
  );
};

export default PreloaderManager;

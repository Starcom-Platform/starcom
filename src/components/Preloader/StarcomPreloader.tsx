import React from 'react';
import './StarcomPreloader.css';

/**
 * StarcomPreloader - Shows immediately on app load
 * Provides instant visual feedback while the app initializes
 */
const StarcomPreloader: React.FC = () => {
  return (
    // Stable hook for "the app has not finished booting". Tests used to wait
    // on networkidle, which this app never reaches — it holds relay
    // WebSockets open by design — so they asserted against the splash screen.
    <div className="starcom-preloader" data-testid="app-preloader">
      <div className="starcom-preloader-background">
        {/* Animated stars background */}
        <div className="stars-layer stars-small"></div>
        <div className="stars-layer stars-medium"></div>
        <div className="stars-layer stars-large"></div>
        
        {/* Tactical grid overlay for the interface */}
        <div className="tactical-overlay"></div>
        
        {/* Central loading animation */}
        <div className="starcom-preloader-center">
          <div className="starcom-logo-container">
            <div className="starcom-logo-glow"></div>
            <div className="starcom-logo-text">STARCOM</div>
            <div className="starcom-logo-subtitle">Earth Intelligence Network</div>
          </div>
          
          {/* Orbital loading animation with intelligence network */}
          <div className="orbital-loader">
            <div className="loader-core">
              <div className="loader-core-surface"></div>
              <div className="loader-core-glint"></div>
            </div>

            {/* Data stream particles for inter-satellite communication */}
            <div className="data-stream data-stream-1"></div>
            <div className="data-stream data-stream-2"></div>
            <div className="data-stream data-stream-3"></div>
            <div className="data-stream data-stream-4"></div>
            
            <div className="orbit orbit-1">
              <div className="satellite satellite-1">
                <div className="sub-orbit">
                  <div className="sub-satellite"></div>
                </div>
              </div>
            </div>
            <div className="orbit orbit-2">
              <div className="satellite satellite-2">
                <div className="sub-orbit">
                  <div className="sub-satellite"></div>
                </div>
              </div>
            </div>
            <div className="orbit orbit-3">
              <div className="satellite satellite-3">
                <div className="sub-orbit">
                  <div className="sub-satellite"></div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Loading indicator — the orbital-loader animation above is the
              actual spinner; this is a status label, not a progress claim.
              (Previously also had a "progress-fill" bar that looped
              0%->100%->0% on a fixed 3s CSS keyframe animation regardless
              of real load state — no code ever drove its width from
              anything real. Removed rather than wired up: no event/callback
              for real progress currently exists on the asset-loading or
              bootstrap services this preloader covers, so an honest
              indeterminate indicator is the correct fix, not a fake bar.) */}
          <div className="loading-progress">
            <div className="progress-text">Initializing Systems...</div>
          </div>
        </div>
        
        {/* Scanning lines effect */}
        <div className="scan-lines">
          <div className="scan-line scan-line-1"></div>
          <div className="scan-line scan-line-2"></div>
          <div className="scan-line scan-line-3"></div>
        </div>
      </div>
    </div>
  );
};

export default StarcomPreloader;

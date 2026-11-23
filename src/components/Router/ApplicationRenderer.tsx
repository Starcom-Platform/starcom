import React, { Suspense } from 'react';
import { Glyph } from '../../symbols/Glyph';
import { useApplicationRouter } from '../../hooks/useApplicationRouter';
import './ApplicationRenderer.css';
import ApplicationErrorBoundary from './ApplicationErrorBoundary';

/**
 * Loading fallback for lazy-loaded application components
 */
const ApplicationLoadingFallback: React.FC = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    minHeight: '200px',
    color: '#64b5f6',
    fontFamily: 'var(--sc-font-data)',
    gap: '12px',
  }}>
    <div style={{
      width: '32px',
      height: '32px',
      border: '3px solid rgba(100, 181, 246, 0.2)',
      borderTopColor: '#64b5f6',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
    <span style={{ fontSize: '13px', opacity: 0.8 }}>Loading application...</span>
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

interface ApplicationRendererProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * ApplicationRenderer - Renders the current application based on router state
 * 
 * This component serves as the main renderer for the enhanced application system.
 * It automatically renders the current application based on the router state and
 * handles different presentation modes (standalone, modal, etc.)
 */
export const ApplicationRenderer: React.FC<ApplicationRendererProps> = ({ 
  className = '', 
  style = {} 
}) => {
  const { 
    currentApp, 
    presentationMode, 
    context,
    arrival,
    getApplication,
    goBack 
  } = useApplicationRouter();

  const handleCloseModal = () => {
    // Use goBack to return to previous application or close modal
    goBack();
  };

  // No application selected
  if (!currentApp) {
    return (
      <div className={`application-renderer no-app ${className}`} style={style}>
        <div className="no-app-message">
          <h2>No Application Selected</h2>
          <p>Select an application to get started</p>
        </div>
      </div>
    );
  }

  // Get application configuration
  const appConfig = getApplication(currentApp);
  if (!appConfig) {
    return (
      <div className={`application-renderer app-error ${className}`} style={style}>
        <div className="app-error-message">
          <h2>Application Not Found</h2>
          <p>Application "{currentApp}" is not registered in the system</p>
        </div>
      </div>
    );
  }

  const AppComponent = appConfig.component;

  // Render application based on presentation mode
  /**
   * Every application renders inside a boundary, keyed by app.
   *
   * Keyed because a boundary latches: without it, one failed screen stays
   * failed after navigating away and poisons every screen after it. Inside the
   * Suspense, so a chunk that fails to load is contained too.
   *
   * Keyed by arrival as well, so an application handed a record while it is
   * open mounts afresh and opens it: applications read what they are handed
   * once, on mounting.
   */
  const renderApplication = () => (
    <Suspense fallback={<ApplicationLoadingFallback />}>
      <ApplicationErrorBoundary key={`${currentApp}:${arrival ?? 0}`} appName={appConfig.name}>
        <AppComponent {...context} />
      </ApplicationErrorBoundary>
    </Suspense>
  );

  switch (presentationMode) {
    case 'standalone':
      return (
        <div 
          className={`application-renderer standalone ${currentApp}-app ${className}`} 
          style={style}
        >
          {/* No header here: the strip under the app's header names every screen
              (decision D-F, step 3.5). This one was skipped for a hand-written list of
              application ids that went stale — it still named nodeweb, gone since
              IntelWeb was renamed, and never gained cases — so Cases named itself
              three times and IntelWeb twice. */}
          <div className="application-content">
            {renderApplication()}
          </div>
        </div>
      );

    case 'modal':
      return (
        <div className={`application-renderer modal-backdrop ${className}`} style={style}>
          <div className={`modal-container ${currentApp}-modal`}>
            <div className="modal-header">
              <div className="app-info">
                <span className="app-icon"><Glyph name={appConfig.glyph} size={20} /></span>
                <h2 className="app-title">{appConfig.name}</h2>
              </div>
              <button 
                className="modal-close" 
                onClick={handleCloseModal}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal-content">
              {renderApplication()}
            </div>
          </div>
        </div>
      );

    case 'embedded':
      // Embedded mode - minimal chrome
      return (
        <div 
          className={`application-renderer embedded ${currentApp}-embedded ${className}`} 
          style={style}
        >
          {renderApplication()}
        </div>
      );

    default:
      return (
        <div className={`application-renderer mode-error ${className}`} style={style}>
          <div className="mode-error-message">
            <h2>Unsupported Presentation Mode</h2>
            <p>Presentation mode "{presentationMode}" is not supported</p>
          </div>
        </div>
      );
  }
};

export default ApplicationRenderer;

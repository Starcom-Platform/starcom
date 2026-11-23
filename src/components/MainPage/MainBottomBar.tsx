import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { useLabelsFit } from './useLabelsFit';
import { useLocation } from 'react-router-dom';
import { useApplicationRouter } from '../../hooks/useApplicationRouter';
import type { Destination } from '../Router/EnhancedApplicationRouter';
import styles from './MainBottomBar.module.css';
import SupportEntryButton from '../SupportDrive/SupportEntryButton';
import { openSupportFunnel } from '../SupportDrive/supportFunnelEvents';
import { usePhone } from '../../hooks/usePhone';
import PhoneBottomBar from './PhoneBottomBar';
import JobRail from './JobRail';
import { watchKeptNotes, watchOutbox } from '../../services/jobs/outboxJob';
import { Glyph } from '../../symbols/Glyph';
import { getSupportFunnelConfig } from '../../config/supportFunnelConfig';
import { useDestinations } from '../Router/useDestinations';
import { useMessages } from '../../i18n/app/i18n';


const MainBottomBar: React.FC = () => {
  const location = useLocation();
  const { currentApp, navigateToApp } = useApplicationRouter();

  // Every place the registry lists: one list, which the header search and
  // quick access read too (plan item 4.6).
  const navigationItems = useDestinations();
  const { m: { nav } } = useMessages();

  // Group navigation items by category for organized display
  const groupedNavItems = useMemo(() => {
    const groups: Record<string, Destination[]> = {
      primary: [],
      intel: [],
      collab: [],
      special: []
    };
    
    navigationItems.forEach(item => {
      groups[item.group].push(item);
    });
    
    return groups;
  }, [navigationItems]);

  // Check if a destination is the one open. One per application since K1.
  const isActive = useCallback((item: Destination) => {
    if (currentApp === item.app) return true;
    // Fallback to URL pathname checking for the Globe when the router state is not set
    if (item.app === 'cybercommand' && !currentApp) {
      return location.pathname === '/' || location.pathname === '/globe';
    }
    return false;
  }, [currentApp, location?.pathname]);

  // Handle navigation. An application opened plain is handed nothing: one
  // handed something mounts afresh, and choosing the Globe from the Globe
  // should not build it again.
  const handleNavigation = useCallback((item: Destination) => {
    if (item.context) navigateToApp(item.app, undefined, item.context);
    else navigateToApp(item.app);
  }, [navigateToApp]);

  const supportEnabled = useMemo(() => getSupportFunnelConfig().enabled, []);

  // Where the labels do not fit, the buttons show icons (decision D-F, step 3.2).
  const appsRef = useRef<HTMLDivElement>(null);
  const labelsFit = useLabelsFit(appsRef);
  const phone = usePhone();
  // The findings outbox on the job rail (BD13), watched while the bar is up.
  useEffect(() => watchOutbox(), []);
  // And the notes kept when no relay took them (W1).
  useEffect(() => watchKeptNotes(), []);

  // A phone gets five buttons with their names, and sheets for the rest (K2, BD5).
  if (phone) {
    return (
      <nav className={`${styles.mainBottomBar} ${styles.onPhone}`} aria-label={nav.main}>
        <PhoneBottomBar isActive={isActive} onNavigate={handleNavigation} supportEnabled={supportEnabled} onSupport={openSupportFunnel} />
      </nav>
    );
  }

  return (
    <nav className={styles.mainBottomBar} aria-label={nav.main}>
      <div ref={appsRef} className={styles.leftSection} data-labels={labelsFit ? 'shown' : 'icons'}>
        <div className={styles.navigationContainer}>
          {/* Primary section - CyberCommand Globe */}
          <div className={styles.navGroup}>
            {groupedNavItems.primary.map((item) => (
              <button
                key={item.key}
                className={`
                  ${styles.navButton} 
                  ${isActive(item) ? styles.active : ''} 
                `}
                onClick={() => handleNavigation(item)}
                data-sfx="switch"
                title={`${item.label}\n${item.description}`}
                aria-label={item.label}
                aria-current={isActive(item) ? 'page' : undefined}
                style={{ '--section-tint': `var(--sc-tint-${item.section})` } as React.CSSProperties}
              >
                <span className={styles.icon}><Glyph name={item.glyph} size={16} /></span>
                <span className={styles.label}>{item.label}</span>
              </button>
            ))}
          </div>
          
          {/* Intelligence section */}
          <div className={styles.navGroup}>
            <div className={styles.navGroupLabel}>Intelligence</div>
            {groupedNavItems.intel.map((item) => (
              <button
                key={item.key}
                className={`
                  ${styles.navButton} 
                  ${isActive(item) ? styles.active : ''} 
                `}
                onClick={() => handleNavigation(item)}
                data-sfx="switch"
                title={`${item.label}\n${item.description}`}
                aria-label={item.label}
                aria-current={isActive(item) ? 'page' : undefined}
                style={{ '--section-tint': `var(--sc-tint-${item.section})` } as React.CSSProperties}
              >
                <span className={styles.icon}><Glyph name={item.glyph} size={16} /></span>
                <span className={styles.label}>{item.label}</span>
              </button>
            ))}
          </div>
          
          {/* Collaboration section */}
          <div className={styles.navGroup}>
            <div className={styles.navGroupLabel}>Collaboration</div>
            {groupedNavItems.collab.map((item) => (
              <button
                key={item.key}
                className={`
                  ${styles.navButton} 
                  ${isActive(item) ? styles.active : ''} 
                `}
                onClick={() => handleNavigation(item)}
                data-sfx="switch"
                title={`${item.label}\n${item.description}`}
                aria-label={item.label}
                aria-current={isActive(item) ? 'page' : undefined}
                style={{ '--section-tint': `var(--sc-tint-${item.section})` } as React.CSSProperties}
              >
                <span className={styles.icon}><Glyph name={item.glyph} size={16} /></span>
                <span className={styles.label}>{item.label}</span>
              </button>
            ))}
          </div>
          
          {/* Special section */}
          <div className={styles.navGroup}>
            <div className={styles.navGroupLabel}>Exchange</div>
            {groupedNavItems.special.map((item) => (
              <button
                key={item.key}
                className={`
                  ${styles.navButton} 
                  ${isActive(item) ? styles.active : ''} 
                `}
                onClick={() => handleNavigation(item)}
                data-sfx="switch"
                title={`${item.label}\n${item.description}`}
                aria-label={item.label}
                aria-current={isActive(item) ? 'page' : undefined}
                style={{ '--section-tint': `var(--sc-tint-${item.section})` } as React.CSSProperties}
              >
                <span className={styles.icon}><Glyph name={item.glyph} size={16} /></span>
                <span className={styles.label}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* The job rail (BD14), and Support Ops: in the bar rather than over the
          page. Fixed to the screen's corner, Support covered whatever each
          screen put there. */}
      <div className={styles.rightSection}>
        <JobRail />
        {supportEnabled && <SupportEntryButton onOpen={openSupportFunnel} />}
      </div>
    </nav>
  );
};

export default MainBottomBar;

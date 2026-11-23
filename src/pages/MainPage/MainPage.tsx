import React, { useEffect } from 'react';
import { Outlet, useParams, useLocation } from 'react-router-dom';
import styles from './MainPage.module.css';
import GlobalHeader from '../../components/MainPage/GlobalHeader';
import CommandPalette from '../../components/CommandPalette/CommandPalette';
import MainMarqueeTopBar from '../../components/MainPage/MainMarqueeTopBar';
import MainBottomBar from '../../components/MainPage/MainBottomBar';
import MainCenter from '../../components/MainPage/MainCenter';
import { ApplicationRenderer } from '../../components/Router/ApplicationRenderer';
import { useApplicationRouter } from '../../hooks/useApplicationRouter';
import { componentTracker } from '../../utils/performanceMonitor';
import { useApplicationUrl } from './useApplicationUrl';

const MainPage: React.FC = () => {
  const { currentApp, context } = useApplicationRouter();
  const params = useParams();
  const location = useLocation();

  // The address and the open application follow each other; the root is the Globe.
  useApplicationUrl();
  
  // Track component mounting for performance monitoring
  useEffect(() => {
    componentTracker.trackComponentMount('MainPage');
    return () => {
      componentTracker.trackComponentUnmount('MainPage');
    };
  }, []);
  
  // DIAGNOSTIC: Log current application state
  if (import.meta.env.DEV) {
    console.log('🏠 MainPage: Enhanced Router state', {
      currentApp,
      context,
      urlParams: params,
      pathname: location.pathname
    });
  }
  
  return (
    <div className={styles.mainPage}>
      {/* Global header with logo, search, and user profile */}
  <GlobalHeader />
      {/* The command palette, over every application (D-CP): Ctrl/Cmd-K, /, or the header's box. */}
      <CommandPalette />
      
      {/* Marquee bar with current view title and status indicators */}
      <MainMarqueeTopBar />
      
      {/* Main content area - contains the active application */}
      <MainCenter>
        <ApplicationRenderer />
        <Outlet /> {/* This will render any nested route content */}
      </MainCenter>
      
      {/* Main navigation bar */}
      <MainBottomBar />
      
    </div>
  );
};

export default MainPage;

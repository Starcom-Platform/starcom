/**
 * Context Bridge - Phase 2 to Phase 3 Integration Component
 * 
 * This component handles the seamless integration between existing Phase 2 features
 * (Globe, Visualization, Space Weather) and new Phase 3 collaboration features.
 * It acts as a bridge for state synchronization and cross-feature communication.
 */

import React, { useEffect, useCallback } from 'react';
import { useGlobeContext } from '../../context/GlobeContext';
import { useVisualizationMode } from '../../context/VisualizationModeContext';
import { useNoaaSpaceWeatherSummary } from '../../hooks/useNoaaSpaceWeatherSummary';
import { useCollaboration } from '../../hooks/useUnifiedGlobalCommand';
import RealTimeEventSystem from '../../services/realTimeEventSystem';
import type { VisualizationMode } from '../../context/VisualizationModeContext';

interface ContextBridgeProps {
  children?: React.ReactNode;
}

interface SharedContextUpdate {
  type: string;
  data: {
    operatorId?: string;
    location?: { lat: number; lng: number };
    mode?: VisualizationMode;
    [key: string]: unknown;
  };
}

/**
 * ContextBridge manages cross-context state synchronization and feature integration
 */
// TODO: Add support for evidence chain-of-custody tracking and verification - PRIORITY: HIGH
const ContextBridge: React.FC<ContextBridgeProps> = ({ children }) => {
  const { 
    focusLocation, 
    setFocusLocation
  } = useGlobeContext();
  
  const { 
    visualizationMode, 
    setVisualizationMode 
  } = useVisualizationMode();
  
  const { 
    currentSession,
    collaborationState,
    sendMessage
  } = useCollaboration();

  /*
   * NOAA's own alerts, fetched only while there is a session to tell. This read the
   * space-weather context's alerts, which were Starcom's thresholds over NOAA's electric-
   * field grids, each stamped with the time it was computed — so every refresh re-sent
   * all of them as new, labelled "noaa", in a notification with no title or message.
   */
  const noaa = useNoaaSpaceWeatherSummary(Boolean(currentSession));
  const spaceWeatherAlerts = noaa.summary?.alerts;

  // Get the operator from collaboration state
  const operator = collaborationState.operator;

  // Create event system instance
  const eventSystem = RealTimeEventSystem.getInstance();

  // Synchronize globe focus changes with collaboration context
  const syncGlobeFocus = useCallback((location: { lat: number; lng: number }) => {
    if (currentSession && location) {
      // Send a message to share the focus change
      sendMessage(`Globe focus changed to lat: ${location.lat}, lng: ${location.lng}`);

      // Emit real-time event for other components
      eventSystem.emit({
        type: 'UI_UPDATE_CONTEXT',
        payload: {
          location,
          timestamp: Date.now(),
          operatorId: operator?.id
        },
        source: 'user',
        timestamp: new Date(),
        priority: 'normal'
      });
    }
  }, [currentSession, sendMessage, operator?.id, eventSystem]);

  // Synchronize visualization mode changes with collaboration
  const syncVisualizationMode = useCallback((mode: VisualizationMode) => {
    if (currentSession) {
      sendMessage(`Visualization mode changed to: ${JSON.stringify(mode)}`);

      // Emit real-time event
      eventSystem.emit({
        type: 'UI_UPDATE_CONTEXT',
        payload: {
          mode,
          timestamp: Date.now(),
          operatorId: operator?.id
        },
        source: 'user',
        timestamp: new Date(),
        priority: 'normal'
      });
    }
  }, [currentSession, sendMessage, operator?.id, eventSystem]);

  // Sync NOAA's newly issued alerts with collaboration notifications
  const syncSpaceWeatherAlerts = useCallback(() => {
    if (!currentSession || !spaceWeatherAlerts?.length) return;
    // Issued by SWPC in the last five minutes — its own issue time, so a refresh
    // does not re-send what was already sent.
    const recentAlerts = spaceWeatherAlerts.filter((alert) => Date.parse(alert.issuedAt) > Date.now() - 300000);
    recentAlerts.forEach((alert) => {
      eventSystem.emit({
        type: 'UI_SHOW_NOTIFICATION',
        payload: {
          title: `NOAA SWPC ${alert.productId}`,
          message: alert.headline,
          type: 'warning',
          session: currentSession.id,
          source: 'noaa'
        },
        source: 'system',
        timestamp: new Date(),
        priority: 'high'
      });
    });
  }, [currentSession, spaceWeatherAlerts, eventSystem]);

  // Handle shared context updates from collaboration
  const handleSharedContextUpdate = useCallback((update: SharedContextUpdate) => {
    switch (update.type) {
      case 'globe_focus':
        if (update.data.operatorId !== operator?.id && update.data.location) {
          // Another operator changed globe focus
          setFocusLocation(update.data.location);
          
          eventSystem.emit({
            type: 'UI_UPDATE_CONTEXT',
            payload: {
              location: update.data.location,
              operatorId: update.data.operatorId
            },
            source: 'collaboration',
            timestamp: new Date(),
            priority: 'normal'
          });
        }
        break;
        
      case 'visualization_mode':
        if (update.data.operatorId !== operator?.id && update.data.mode) {
          // Another operator changed visualization mode
          setVisualizationMode(update.data.mode);
          
          eventSystem.emit({
            type: 'UI_UPDATE_CONTEXT',
            payload: {
              mode: update.data.mode,
              operatorId: update.data.operatorId
            },
            source: 'collaboration',
            timestamp: new Date(),
            priority: 'normal'
          });
        }
        break;
        
      case 'marker_added':
        // Handle collaborative marker additions
        eventSystem.emit({
          type: 'UI_UPDATE_ANNOTATION',
          payload: update.data,
          source: 'collaboration',
          timestamp: new Date(),
          priority: 'normal'
        });
        break;
        
      case 'overlay_toggled':
        // Handle collaborative overlay toggles
        eventSystem.emit({
          type: 'UI_UPDATE_CONTEXT',
          payload: update.data,
          source: 'collaboration',
          timestamp: new Date(),
          priority: 'normal'
        });
        break;
    }
  }, [operator?.id, setFocusLocation, setVisualizationMode, eventSystem]);

  // Set up event listeners for cross-context synchronization
  useEffect(() => {
    // Subscribe to relevant events using the event system
    const unsubscribeFocus = eventSystem.subscribe(
      'context-bridge-focus',
      ['globe:focus-request'],
      (event) => {
        if (event.payload && typeof event.payload === 'object' && 'location' in event.payload) {
          const location = (event.payload as { location: { lat: number; lng: number } }).location;
          if (location && typeof location === 'object' && 'lat' in location && 'lng' in location) {
            setFocusLocation(location);
          }
        }
      }
    );

    const unsubscribeVisualization = eventSystem.subscribe(
      'context-bridge-visualization',
      ['visualization:mode-request'],
      (event) => {
        if (event.payload && typeof event.payload === 'object' && 'mode' in event.payload) {
          const mode = (event.payload as { mode: VisualizationMode }).mode;
          setVisualizationMode(mode);
        }
      }
    );

    const unsubscribeCollabSync = eventSystem.subscribe(
      'context-bridge-collab',
      ['collaboration:sync-request'],
      (event) => {
        if (event.payload && typeof event.payload === 'object') {
          handleSharedContextUpdate(event.payload as SharedContextUpdate);
        }
      }
    );

    return () => {
      unsubscribeFocus();
      unsubscribeVisualization();
      unsubscribeCollabSync();
    };
  }, [setFocusLocation, setVisualizationMode, handleSharedContextUpdate, eventSystem]);

  // Monitor and sync important state changes
  useEffect(() => {
    if (focusLocation) {
      syncGlobeFocus(focusLocation);
    }
  }, [focusLocation, syncGlobeFocus]);

  useEffect(() => {
    if (visualizationMode) {
      syncVisualizationMode(visualizationMode);
    }
  }, [visualizationMode, syncVisualizationMode]);

  useEffect(() => {
    syncSpaceWeatherAlerts();
  }, [syncSpaceWeatherAlerts]);

  // Enhanced integration effects for Phase 3 features
  useEffect(() => {
    if (currentSession) {
      // Emit session status for other components
      eventSystem.emit({
        type: 'UI_UPDATE_SESSION_STATUS',
        payload: {
          session: currentSession,
          operator: operator
        },
        source: 'collaboration',
        timestamp: new Date(),
        priority: 'normal'
      });

      // Broadcast current state to new session members
      const currentState = {
        globe: {
          focus: focusLocation
        },
        visualization: {
          mode: visualizationMode
        },
        spaceWeather: {
          alertCount: spaceWeatherAlerts?.length || 0,
          lastUpdate: noaa.summary ? Date.parse(noaa.summary.observedAt) : null
        }
      };

      sendMessage(`State broadcast: ${JSON.stringify(currentState)}`);
    } else {
      eventSystem.emit({
        type: 'UI_UPDATE_SESSION_STATUS',
        payload: {},
        source: 'collaboration',
        timestamp: new Date(),
        priority: 'low'
      });
    }
  }, [currentSession, operator, focusLocation, visualizationMode, spaceWeatherAlerts, noaa.summary, sendMessage, eventSystem]);

  return (
    <>
      {children}
    </>
  );
};

export default ContextBridge;

import React, { useState } from 'react';
import styles from './CyberCommandHUDLayout.module.css';
import { useWorkArea } from './useWorkArea';
import { HudFeature } from './HudFeature';
import CyberCommandLeftSideRail from '../../components/HUD/Bars/CyberCommandRails/CyberCommandLeftSideRail';
import CyberCommandLeftSideSubRail from '../../components/HUD/Bars/CyberCommandRails/CyberCommandLeftSideSubRail';
import { leftSubRailShown } from '../../components/HUD/Bars/CyberCommandRails/railModeConfig';
import CyberCommandRightSideRail from '../../components/HUD/Bars/CyberCommandRails/CyberCommandRightSideRail';
import CyberCommandTopLeftCorner from '../../components/HUD/Corners/CyberCommandTopLeft/CyberCommandTopLeft';
import CyberCommandBottomLeftCorner from '../../components/HUD/Corners/CyberCommandBottomLeft/CyberCommandBottomLeft';
import CyberCommandBottomRightCorner from '../../components/HUD/Corners/CyberCommandBottomRight/CyberCommandBottomRight';
import FloatingPanelManager from '../../components/HUD/FloatingPanels/FloatingPanelManager';
import FloatingPanelRegistrar from '../../components/HUD/FloatingPanels/FloatingPanelRegistrar';
import FloatingPanelDemo from '../../components/HUD/FloatingPanels/FloatingPanelDemo';
import NOAAFloatingIntegration from '../../components/HUD/FloatingPanels/NOAAFloatingIntegration';
import CyberCommandCenterManager from '../../components/HUD/CyberCommandCenter/CyberCommandCenterManager';
import { openPalette } from '../../features/palette/palette';
import TimeScrubber from '../../components/HUD/TimeScrubber/TimeScrubber';
import PaletteGlobeSource from '../../components/CommandPalette/PaletteGlobeSource';
import TimestreamDrawer from '../../components/PsiWatch/Timestream/TimestreamDrawer';
import { psiKitOn } from '../../services/psiWatch/psiKitSwitch';
import { GlobeLayerControlProvider } from '../../components/Globe/Hooks/useGlobeLayerControl';
import NewUserHint from '../../components/HUD/NewUserHint/NewUserHint';
import ContextBridge from '../../components/Bridge/ContextBridge';
import PhaseTransitionManager from '../../components/Bridge/PhaseTransitionManager';
import { AdaptiveInterfaceProvider } from '../../context/AdaptiveInterfaceContext';
import { EnhancedAdaptiveInterfaceProvider } from '../../components/Adaptive/EnhancedAdaptiveInterfaceProvider';
import AdaptiveUIController from '../../components/Adaptive/AdaptiveUIController';
import { useFeatureFlag } from '../../utils/featureFlags';
import { GlobeLoadingProvider } from '../../context/GlobeLoadingContext';
import { useVisualizationMode } from '../../context/VisualizationModeContext';
import { useSpaceWeatherSidebarLayout } from '../../components/SpaceWeather/SpaceWeatherSidebarLayout';
// SecureChatManager removed per legacy chat Stage 1 unmount

interface CyberCommandHUDLayoutProps {
  isEmbedded?: boolean;
}

const CyberCommandHUDLayout: React.FC<CyberCommandHUDLayoutProps> = ({ isEmbedded = false }) => {
  const { visualizationMode } = useVisualizationMode();
  const sidebarLayout = useSpaceWeatherSidebarLayout();
  // The sub rail's own gate (railModeConfig), so the layout mounts it exactly when
  // it has something to show: a copy kept in step by hand missed Intel Reports (BA4).
  const showLeftSubRail = leftSubRailShown(visualizationMode, sidebarLayout.isSpaceWeatherActive);
  // Psi Watch's Timestream under the globe (D-PW, PW38, PW65), in the time scrubber's place; the globe and the work area stop above it.
  const timestreamShown = visualizationMode.mode === 'PsiWatch' && psiKitOn();
  const [timestreamHeight, setTimestreamHeight] = useState(0);
  
  // Core feature flags
  const enhancedCenterEnabled = useFeatureFlag('enhancedCenter');

  // Publishes --work-* on :root from the work-area box's measured rect (what the
  // chrome leaves clear), so components that are not descendants of it stop
  // guessing how much chrome to clear. See useWorkArea.ts and .workArea.
  const workAreaRef = useWorkArea();
  const enhancedAdaptiveEnabled = useFeatureFlag('enhancedContextEnabled');
  // UI and testing flags
  const uiTestingDiagnosticsEnabled = useFeatureFlag('uiTestingDiagnosticsEnabled');

  // Ctrl/Cmd-K opens the command palette, which absorbed Quick Access (D-CP, CP5): the palette hears it itself.

  const AdaptiveProvider = enhancedAdaptiveEnabled ? EnhancedAdaptiveInterfaceProvider : AdaptiveInterfaceProvider;

  const hudContent = (
    <GlobeLoadingProvider>
        <AdaptiveProvider>
          <AdaptiveUIController>
            <PhaseTransitionManager>
              <ContextBridge>
                  <GlobeLayerControlProvider>
                {/* FloatingPanelManager renders its panels as its own children, so it has to
                    sit INSIDE every provider those panels read. It used to wrap them, which
                    meant a panel threw "must be used within a Provider" the moment it became
                    visible and a boundary removed it — invisible for as long as nothing could
                    make a panel visible. */}
                <FloatingPanelManager>
                  <div
                    className={`${styles.cyberCommandHudLayout} ${isEmbedded ? styles.embeddedMode : ''} ${timestreamShown ? styles.timestreamMode : ''}`}
                    style={{ '--psi-timestream-height': `${timestreamShown ? timestreamHeight : 0}px` } as React.CSSProperties}
                  >
                    {/* Docks itself (globeOrientation). Placed at the corner of this layout, the
                        rail covered the minimap and the top bar covered the clock. */}
                    <CyberCommandTopLeftCorner />
                    {/* The intelligence engine's status corner is retired with the engine: it
                        reported on analysis that found nothing (plan item 4.3). */}
                    {/* Docks itself (globeTemporalPosition). Placed by percentage it sat under
                        whatever the dock put in that corner. */}
                    <CyberCommandBottomLeftCorner />
                    {/* Docks itself (globeLayerCount), for the same reason. */}
                    <CyberCommandBottomRightCorner onOpenLayers={() => openPalette('', 'layers')} />
                    
                    {/* No top bar of the Globe's own (K4): its energy readings and settings are in
                        the one ticker under the header, which carries only the readings the visitor
                        has. For a visitor without an EIA key, every item it showed said so. */}
                    
                    {/* Removed non-functional CyberCommandBottomBar - MainBottomBar handles navigation now */}
                    {/* Temporal navigation. Was behind !isEmbedded, which every caller
                        passes true, so it has never rendered. */}
                    {/* In Psi Watch the Timestream is the time control (PW65): the scrubber gives way to it. */}
                    {!timestreamShown && (
                      <HudFeature name="TimeScrubber">
                        <div className={styles.timeScrubberBar}>
                          <TimeScrubber />
                        </div>
                      </HudFeature>
                    )}
                    {timestreamShown && (
                      <HudFeature name="TimestreamDrawer">
                        <div className={styles.timestreamBar}>
                          <TimestreamDrawer onHeight={setTimestreamHeight} />
                        </div>
                      </HudFeature>
                    )}
                    
                    {/* What the Globe offers the command palette while it is open (D-CP). */}
                    <PaletteGlobeSource />
                    <div className={styles.leftSideBar}><CyberCommandLeftSideRail /></div>
                    {showLeftSubRail && (
                      <div className={styles.leftSubRail}><CyberCommandLeftSideSubRail /></div>
                    )}
                    <div className={styles.rightSideBar}><CyberCommandRightSideRail /></div>
                    <div ref={workAreaRef} aria-hidden="true" className={`${styles.workArea} ${showLeftSubRail ? styles.workAreaWithSubRail : ''}`} />
                    <div className={`${styles.center} ${showLeftSubRail ? styles.centerWithSubRail : styles.centerNoSubRail} ${isEmbedded ? styles.embeddedCenter : ''}`}>
                      {enhancedCenterEnabled ? (
                        <CyberCommandCenterManager globeOnly={isEmbedded} />
                      ) : (
                        // Legacy center content - empty for now
                        <div />
                      )}
                    </div>
                    
                    {/* Connects NOAA datasets to floating panels. */}
                    <HudFeature name="NOAAFloatingIntegration"><NOAAFloatingIntegration /></HudFeature>

                    {/* Registers the six production panels. Without this the rail's
                        intelligence button and three globe interactions all call
                        addActiveFeature() against an empty registry and nothing happens. */}
                    <HudFeature name="FloatingPanelRegistrar"><FloatingPanelRegistrar /></HudFeature>
                    
                    {/* UI Testing Diagnostics - Only visible when diagnostics mode is enabled */}
                    {uiTestingDiagnosticsEnabled && (
                      <HudFeature name="FloatingPanelDemo"><FloatingPanelDemo /></HudFeature>
                    )}
                  </div>
                  
                  {/* The old secure chat system was removed here (legacy, non-functional) */}
                  
                </FloatingPanelManager>
                  </GlobeLayerControlProvider>
              </ContextBridge>
            </PhaseTransitionManager>
          </AdaptiveUIController>
        </AdaptiveProvider>
        
        {/* Subtle new-user hint. Non-blocking. */}
        <HudFeature name="NewUserHint"><NewUserHint /></HudFeature>
    </GlobeLoadingProvider>
  );

  // The "Phase 5" and "Phase 4" wrappers that came after this went in plan
  // item 8.3b (decisions B5 and B7). Neither ever mounted: the one caller
  // embeds this layout, and an embedded layout returned before them.
  return hudContent;
};

export default CyberCommandHUDLayout;

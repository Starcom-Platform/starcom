import { useEffect, useState } from 'react';
import { useFloatingPanels } from './FloatingPanelContext';
import SatelliteTrackingPanel from './panels/SatelliteTrackingPanel';
import ThreatAssessmentPanel from './panels/ThreatAssessmentPanel';
import NodeGraphPanel from './panels/NodeGraphPanel';
import TimelinePanel from './panels/TimelinePanel';

/**
 * FloatingPanelRegistrar — Production panel registration.
 *
 * Registers the core operational floating panels (Satellite Tracking,
 * Threat Assessment and the rest) so they can be activated via
 * `addActiveFeature()` from anywhere in the app.
 *
 * Mission Control is retired (plan item 4.2, decision D5): it showed the
 * same mission list the Missions app shows, where missions are worked. So is the
 * Intelligence Dashboard (plan item 4.3): its analysis found nothing, and
 * what was real in its report is in the board's Export draft.
 *
 * Unlike FloatingPanelDemo this component renders no UI — it only
 * calls `registerPanel()` once on mount.
 *
 * Activation examples:
 *   addActiveFeature('satellite-tracking') → opens Satellite Tracking
 *   addActiveFeature('threat-assessment')  → opens Threat Assessment
 *   addActiveFeature('security-alert')     → opens Threat Assessment (alt trigger)
 */
const FloatingPanelRegistrar: React.FC = () => {
  const { registerPanel } = useFloatingPanels();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (isInitialized) return;

    /*
     * No panel here is given `data`. Mission Control was passed
     * `{ missionCount: 3, activeOperations: 2 }`, which it never read — it held
     * three literal missions of its own — so the registration asserted a count
     * that matched nothing and fed nothing. The panels below had the same shape:
     * a plausible-looking data payload the component ignored, sitting next to a
     * fabricated fallback the component always used.
     *
     * Each now reads its real source, so there is nothing for the registrar to
     * seed.
     */

    // Satellite Tracking Panel — Orbital Asset Monitoring
    registerPanel({
      id: 'satellite-tracking-panel',
      type: 'stream',
      title: 'Satellite Tracking',
      component: SatelliteTrackingPanel,
      position: {
        anchorTo: 'screen',
        x: 120,
        y: 200,
        offset: { x: 0, y: 0 },
      },
      priority: 'primary',
      triggers: ['satellite-tracking', 'orbital-assets'],
      // Reads satelliteVisualizationService directly — see the note above.
    });

    // Threat Assessment Panel — Security Operations Center
    registerPanel({
      id: 'threat-assessment-panel',
      type: 'alert',
      title: 'Threat Assessment',
      component: ThreatAssessmentPanel,
      position: {
        anchorTo: 'screen',
        x: 140,
        y: 300,
        offset: { x: 0, y: 0 },
      },
      priority: 'primary',
      triggers: ['threat-assessment', 'security-alert', 'space-hazards'],
      // Reads useSpaceWeatherContext — see the note above. The `alertLevel:
      // 'orange'` this used to pass was a hardcoded claim about the sky.
    });

    // Node Graph Panel — Intelligence Entity Relationship Analysis
    registerPanel({
      id: 'node-graph-panel',
      type: 'wide',
      title: 'Node Graph — Intel Relationships',
      component: NodeGraphPanel,
      // Centred: a graph is read from the middle out.
      position: {
        anchorTo: 'work-area',
        x: 0.5,
        y: 0.5,
        offset: { x: 0, y: 0 },
      },
      priority: 'primary',
      triggers: ['node-graph', 'link-analysis', 'intel-graph'],
      data: {},
    });

    // Timeline Panel — Intelligence Temporal Analysis
    registerPanel({
      id: 'timeline-panel',
      type: 'wide',
      title: 'Timeline — Intel Events',
      component: TimelinePanel,
      // Bottom-centre, just above the time scrubber it works alongside.
      position: {
        anchorTo: 'work-area',
        x: 0.5,
        y: 1,
        offset: { x: 0, y: 0 },
      },
      priority: 'primary',
      triggers: ['timeline', 'temporal-view', 'intel-timeline'],
      data: {},
    });

    setIsInitialized(true);
  }, [registerPanel, isInitialized]);

  return null; // No UI — registration only
};

export default FloatingPanelRegistrar;

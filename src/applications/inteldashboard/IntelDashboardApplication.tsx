/**
 * Intel Dashboard Application
 * 
 * Application wrapper for the Intel Dashboard page to integrate with the Enhanced Application Router
 * Provides intelligence report management and dashboard functionality
 */

import React from 'react';
import { ApplicationContext } from '../../components/Router/ApplicationRouter';
import { IntelWorkspaceProvider } from '../../services/intel/IntelWorkspaceContext';
import IntelWorkspaceConsole from '../../components/Intel/IntelWorkspaceConsole';
import DataIntegrityBanner from '../../components/Intel/DataIntegrityBanner';
import ContributionBanner from '../../components/Intel/ContributionBanner';
import CaseReplayPanel from '../../components/Intel/CaseReplayPanel';

const IntelDashboardApplication: React.FC<ApplicationContext> = (props) => {
  // Unified Intel surface: workspace-backed console for Reports + Intel Items.
  // initialReportId deep-links to a specific report — e.g. from the globe's
  // Intel Report popup ("Open in Intel Dashboard") or from AnalysisWorkbench's
  // export handoff — both call navigateToApp('inteldashboard', ..., { reportId }).
  const initialReportId = typeof props.reportId === 'string' ? props.reportId : undefined;
  // "Create Intel Report" on the globe hands over the spot and how precisely the
  // click gave it, and the form opens there (plan item 0.11).
  const lat = Number(props.newReportLat);
  const lng = Number(props.newReportLng);
  const precisionM = Number(props.newReportPrecisionM);
  const newReportAt = typeof props.newReportLat === 'string' && Number.isFinite(lat) && Number.isFinite(lng)
    ? { lat, lng, ...(Number.isFinite(precisionM) && precisionM > 0 ? { precisionM } : {}) }
    : undefined;
  return (
    <IntelWorkspaceProvider>
      <DataIntegrityBanner />
      <ContributionBanner />
      {/* IV.D: walk an investigation forward, with the gaps in the record
          shown as gaps rather than smoothed over. */}
      <CaseReplayPanel />
      <IntelWorkspaceConsole
        initialReportId={initialReportId}
        newReportAt={newReportAt}
        // Back from the globe without picking a place: the form, as it was (plan item 3.5).
        restoreDraft={props.restoreDraft === true || props.restoreDraft === 'true'}
      />
    </IntelWorkspaceProvider>
  );
};

export default IntelDashboardApplication;

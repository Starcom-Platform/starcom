/**
 * Cases Application — the adjudication stage, finally inside the app.
 *
 * Cases existed as a full model, service, six-state lifecycle and dashboard,
 * and was reachable ONLY at the standalone /cases-dashboard route.
 * NewUserHint records the consequence verbatim: it "is inside no registered
 * app, and navigateToApp cannot reach it".
 *
 * That made the pipeline's middle stage invisible from the outside. An audit
 * enumerating Starcom's applications — IntelDashboard, IntelAnalyzer,
 * IntelWeb, OpsCenter, NetRunner — correctly concluded there was no Case
 * stage, which is exactly what a second node reported back to us. It also
 * made the step easy to skip from the inside: a stage absent from the
 * navigation is a stage nobody walks through.
 *
 * Registering it changes no data model and no lifecycle. It makes the
 * adjudication step between an observation and an action a place you can go.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ApplicationContext } from '../../components/Router/EnhancedApplicationRouter';
import { appPath, recordFromPath } from '../../routes/appPath';
import { recordPath } from '../../routes/recordLink';
import { IntelWorkspaceProvider } from '../../services/intel/IntelWorkspaceContext';
import CasesDashboard from '../../pages/Cases/CasesDashboard';

/**
 * Reads what another application hands over: a subject to open a case about
 * (with a note of where it came from), or a case to open. Nothing else in the
 * context is read, deliberately: an unrecognised key should do nothing rather
 * than something surprising.
 */
const CasesApplication: React.FC<ApplicationContext> = (context) => {
  const openCaseAbout = typeof context.openCaseAbout === 'string' ? context.openCaseAbout : undefined;
  /** Provenance for a case opened about something from another node. */
  const openCaseNote = typeof context.openCaseNote === 'string' ? context.openCaseNote : undefined;
  /** A case handed over by another application, to open on arrival. */
  const selectCaseId = typeof context.selectCaseId === 'string' ? context.selectCaseId : undefined;

  /*
   * The open case lives in the address, /app/cases/<id> (plan item 1.2), so a
   * case can be linked to, reloaded, and left with Back. Opening one moves the
   * address; the address decides what is shown.
   */
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const openCaseId = recordFromPath(pathname, 'cases');
  const openCase = useCallback(
    (caseId: string | null) => navigate(caseId ? recordPath('case', caseId) : appPath('cases')),
    [navigate],
  );

  // A case handed over moves into the address, once: afterwards the address
  // is what the person changes, with the list's button or with Back.
  const handedOver = useRef(false);
  useEffect(() => {
    if (!selectCaseId || handedOver.current) return;
    handedOver.current = true;
    if (openCaseId !== selectCaseId) navigate(recordPath('case', selectCaseId), { replace: true });
  }, [selectCaseId, openCaseId, navigate]);

  return (
    <IntelWorkspaceProvider>
      <CasesDashboard
        openCaseAbout={openCaseAbout}
        openCaseNote={openCaseNote}
        openCaseId={openCaseId}
        onOpenCase={openCase}
      />
    </IntelWorkspaceProvider>
  );
};

export default CasesApplication;

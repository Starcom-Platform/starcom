import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useApplicationRouter } from '../../hooks/useApplicationRouter';

// This legacy standalone page (routed at /intel) has been retired to a
// redirect shim, matching the precedent already set for /team/:teamId and
// /case-manager. Its two real, unique capabilities — a ?reportId= deep-link
// highlight and a "View on Globe" button — were ported into
// IntelWorkspaceConsole.tsx (reached via navigateToApp('inteldashboard')),
// which already had everything else this page offered (search, JSON
// import, a real detail/edit panel) and more. See
// docs/missions/01-architecture-decisions/canonical-intel-report-path.md.
// Kept as a route (not deleted outright) so old bookmarks/external links to
// /intel still land somewhere real instead of a dead route.
const IntelDashboard: React.FC = () => {
  const [searchParams] = useSearchParams();
  const reportId = searchParams.get('reportId') || undefined;
  const navigate = useNavigate();
  const { navigateToApp } = useApplicationRouter();

  useEffect(() => {
    navigateToApp('inteldashboard', 'modal', reportId ? { reportId } : undefined);
    navigate('/', { replace: true });
  }, [reportId, navigateToApp, navigate]);

  return null;
};

export default IntelDashboard;

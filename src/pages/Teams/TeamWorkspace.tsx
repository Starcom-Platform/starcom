import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApplicationRouter } from '../../hooks/useApplicationRouter';

// This legacy standalone page (routed at /team/:teamId) has been retired to
// a redirect shim — its one real, unique capability (an Investigations tab)
// was ported into TeamWorkspaceApplication.tsx ("Missions", OpsCenter until K1, reached via
// navigateToApp('teamworkspace')), which already had everything else this
// page offered and more (real chat, real signed invite codes, admin
// analytics) — see the Team UI Consolidation plan. Kept as a route (not
// deleted outright) so old bookmarks/external links to /team/:teamId still
// land somewhere real instead of a dead route. navigateToApp sets the
// shared app-router state before navigating; MainPage (mounted at "/")
// always renders <ApplicationRenderer />, which then shows Missions as
// a modal on top of it — the same mechanism this page's own "Message"
// button already used successfully.
const TeamWorkspace: React.FC = () => {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { navigateToApp } = useApplicationRouter();

  useEffect(() => {
    if (teamId) {
      navigateToApp('teamworkspace', 'modal', { initialTeamId: teamId, initialTab: 'overview' });
    }
    navigate('/', { replace: true });
  }, [teamId, navigateToApp, navigate]);

  return null;
};

export default TeamWorkspace;

/**
 * Keeps the URL and the open application in step, both ways.
 *
 * The application router holds which app is open, and the URL used to say
 * nothing about it except on the Globe. So a reload always came back to the
 * Globe, the browser's Back button left the site instead of returning to the
 * previous app, and no app could be linked to.
 *
 * Now, when the application changes, the URL moves to that app's path as a new
 * history entry, so Back returns to the app before. When the URL changes (Back,
 * Forward, a pasted link, a reload), the application follows.
 *
 * When both change in the same step, the application wins. That is how a page
 * that opens an app and then leaves arrives here: a record link, the /intel and
 * /team redirects and New Report all open an application and send the browser
 * to `/`. The address is corrected to the application's, replacing rather than
 * adding a history entry. One effect per direction, as this was first written,
 * each imposed its own view in that case and flipped to the Globe and back.
 *
 * Mounted once, in MainPage, which renders at `/` and `/app/:appId`. A standalone
 * page's URL is not an application's, so it is left alone.
 */
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApplicationRouter } from '../../hooks/useApplicationRouter';
import { appFromPath, appPath } from '../../routes/appPath';

export function useApplicationUrl(): void {
  const { currentApp, navigateToApp } = useApplicationRouter();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  // What the last run saw, so each run can tell which side moved.
  const last = useRef<{ pathname: string | null; app: string | null }>({ pathname: null, app: null });

  useEffect(() => {
    const pathChanged = last.current.pathname !== pathname;
    const appChanged = last.current.app !== currentApp;
    last.current = { pathname, app: currentApp };
    if (!pathChanged && !appChanged) return;

    const named = appFromPath(pathname);
    if (named === null) return;
    if (named === 'unknown') {
      navigate('/', { replace: true });
      return;
    }
    if (named === currentApp) return;

    if (appChanged && currentApp) {
      navigate(appPath(currentApp), { replace: pathChanged });
      return;
    }
    // An address may name a tab: /app/teamworkspace?tab=missions. It was never
    // read, so a link to the Missions tab opened on Overview.
    const tab = new URLSearchParams(search).get('tab');
    navigateToApp(named, undefined, tab ? { initialTab: tab } : undefined);
  }, [pathname, search, currentApp, navigate, navigateToApp]);
}

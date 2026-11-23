import React, { useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useApplicationRouter } from '../hooks/useApplicationRouter';
import { isRecordKind, recordPath, recordTarget } from './recordLink';

/**
 * Resolves /r/:kind/:id into an open application with that record selected.
 *
 * Navigates and then hands off to the shell, rather than rendering the
 * application itself: MainPage already owns application rendering, and a second
 * renderer would mean two places deciding what is on screen.
 *
 * An unrecognised kind falls through to the root rather than erroring. A link
 * someone mistyped, or one written against a future kind this build does not
 * have, should land them in the app — not on a stack trace.
 */
const RecordRoute: React.FC = () => {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const { navigateToApp } = useApplicationRouter();
  const valid = isRecordKind(kind) && typeof id === 'string' && id.length > 0;
  // A case has a page at its own address (plan item 1.2): send links there.
  const casePage = valid && kind === 'case';

  useEffect(() => {
    if (!valid || casePage) return;
    const target = recordTarget(kind, decodeURIComponent(id));
    navigateToApp(target.app, undefined, target.context);
  }, [kind, id, valid, casePage, navigateToApp]);

  if (casePage) return <Navigate to={recordPath('case', decodeURIComponent(id))} replace />;

  /**
   * Redirect either way.
   *
   * On success the app is already open and MainPage renders it — MainPage's
   * own auto-navigation is guarded on `!currentApp`, so it will not send the
   * arrival back to the globe.
   */
  return <Navigate to="/" replace />;
};

export default RecordRoute;

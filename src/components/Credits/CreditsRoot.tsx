import React, { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePopup } from '../Popup/PopupManager';
import { CreditsDialog } from './CreditsDialog';
import { CREDITS_EVENT, CREDITS_PATH } from './creditsEvents';

/**
 * Opens the credits when anything asks (creditsEvents.ts), and at the address /credits,
 * as a dialog of the popup layer over the app (decision TX11): the globe stays beneath
 * them, with its 8K maps, which a page of its own would have dropped. Closed at that
 * address, the address goes back to the app's. Mounted once, app-wide, like Settings.
 */
const CreditsRoot: React.FC = () => {
  const { showPopup } = usePopup();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const open = useRef(false);

  const show = useCallback(() => {
    if (open.current) return;
    open.current = true;
    showPopup({
      component: ({ onClose }: { onClose: () => void }) => <CreditsDialog onClose={onClose} />,
      label: 'Credits',
      backdrop: true,
      onClose: () => {
        open.current = false;
        if (pathRef.current === CREDITS_PATH) navigate('/', { replace: true });
      },
    });
  }, [showPopup, navigate]);

  useEffect(() => {
    window.addEventListener(CREDITS_EVENT, show);
    return () => window.removeEventListener(CREDITS_EVENT, show);
  }, [show]);

  /*
   * On arriving at the address, and not again until the address changes: the router moves
   * the address in a transition, a render after the dialog closes, so a dialog closed at
   * /credits was reopened before the address could leave it.
   */
  const arrived = useRef<string | null>(null);
  useEffect(() => {
    if (pathname === arrived.current) return;
    arrived.current = pathname;
    if (pathname === CREDITS_PATH) show();
  }, [pathname, show]);

  return null;
};

export default CreditsRoot;

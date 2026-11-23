import React from 'react';
import RouterProvider from '../../routes/RouterProvider';
import { ApplicationRouterProvider } from '../Router/ApplicationRouter';
import { PopupProvider } from './PopupManager';

/**
 * The popup layer, inside the page router and the application router.
 *
 * PopupProvider draws each popup beside its children, not inside them (see the note
 * where App.tsx mounts this), so a popup reaches only the providers above
 * PopupProvider. The two routers were mounted inside the app's content, below it, so
 * any popup that navigates threw: clicking an intel report on the globe took the whole
 * app to its error screen, from 6ffe9177 (2026-08-29) until it was found while
 * checking decision D-F, step 3.1. Here, what a popup shows can navigate like anything
 * else in the app, and the popup and the page move one router.
 */
export const RoutedPopupLayer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <RouterProvider>
    <ApplicationRouterProvider>
      <PopupProvider>{children}</PopupProvider>
    </ApplicationRouterProvider>
  </RouterProvider>
);

export default RoutedPopupLayer;

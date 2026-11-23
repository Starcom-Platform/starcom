import React from 'react';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { env } from '../config/env';

type RouterProviderProps = {
  children: React.ReactNode;
};

// Select router mode via env flags
// Preferred flags:
// - VITE_ROUTER_MODE=browser|hash
// - VITE_TARGET=vercel|ipfs (ipfs implies hash)
const getRouterMode = (): 'browser' | 'hash' => {
  // Read the raw var rather than env.routerMode here: env.routerMode
  // defaults unset to the string 'browser', which would short-circuit this
  // check before ever falling through to the VITE_TARGET=ipfs case below.
  const mode = import.meta.env.VITE_ROUTER_MODE as 'browser' | 'hash' | undefined;
  if (mode === 'browser' || mode === 'hash') return mode;
  if (env.target === 'ipfs') return 'hash';
  return 'browser';
};

export const RouterProvider: React.FC<RouterProviderProps> = ({ children }) => {
  const mode = getRouterMode();
  return mode === 'hash' ? (
    <HashRouter>{children}</HashRouter>
  ) : (
    <BrowserRouter>{children}</BrowserRouter>
  );
};

export default RouterProvider;

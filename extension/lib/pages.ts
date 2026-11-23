import uplink from '../permissions.json';

/** Starcom's own pages, where the bridge runs: starcom.app, and localhost only in a development build. */
export const STARCOM_PAGES = uplink.bridge_pages.patterns;
export const DEVELOPMENT_PAGES = ['http://localhost/*', 'http://127.0.0.1/*'];
export const bridgePages = (mode: string | undefined) => (mode === 'production' ? STARCOM_PAGES : [...STARCOM_PAGES, ...DEVELOPMENT_PAGES]);

/**
 * Where Starcom is, for the side panel's page: starcom.app, or the local preview while developing
 * (WXT_STARCOM_ORIGIN names another, such as the dev server's).
 */
export const starcomOrigin = (mode: string | undefined): string =>
  mode === 'production' ? 'https://starcom.app' : (import.meta.env.WXT_STARCOM_ORIGIN as string | undefined) ?? 'http://localhost:5210';

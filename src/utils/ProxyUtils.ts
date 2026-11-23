import { env } from '../config/env';

/**
 * Optional CORS proxy prefix.
 *
 * This previously hardcoded `http://localhost:8081/` with no override, so every
 * caller — UCDP, OpenWeatherMap, AlphaVantage — was permanently broken anywhere
 * that dev proxy was not running, which is every deployment. It is the same
 * defect as the `api.starcom.app` defaults swept in an earlier pass, and it was
 * missed then because it is a URL PREFIX rather than a base URL.
 *
 * Now: proxy through VITE_CORS_PROXY_URL when it is set, and otherwise go
 * DIRECT. Direct may fail CORS for some upstreams, but a CORS failure is an
 * honest, diagnosable error against the real host — whereas a request to a
 * nonexistent localhost port fails every time and blames the wrong thing.
 */
export const getProxiedUrl = (url: string): string => {
  const proxy = env.corsProxyUrl;
  if (!proxy) return url;
  return `${proxy.endsWith('/') ? proxy : `${proxy}/`}${url}`;
};

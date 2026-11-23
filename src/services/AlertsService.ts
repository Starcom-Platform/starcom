// src/services/AlertsService.ts
// Artifact-driven: Provides real-time or recent alert data for overlays (see globe-overlays.artifact)
import axios from 'axios';
import { env } from '../config/env';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'AlertsService' });

const ALERTS_API_URL = env.alertsApiUrl;

export interface Alert {
  id: string | number;
  lat: number;
  lng: number;
  type: string;
  message: string;
  timestamp?: string;
}

export const fetchAlerts = async (): Promise<Alert[]> => {
  // The default used to be https://api.starcom.app/alerts, a host that does
  // not resolve — so an unconfigured deployment logged a network error every
  // poll and looked like a service having a bad day. Unset is now unset.
  if (!ALERTS_API_URL) {
    log.debug('Alerts API not configured (VITE_ALERTS_API_URL unset) — no alerts source');
    return [];
  }

  try {
    const response = await axios.get(ALERTS_API_URL);
    // Defensive: ensure array of alerts
    if (Array.isArray(response.data)) return response.data;
    if (Array.isArray(response.data.alerts)) return response.data.alerts;
    return [];
  } catch (error) {
    log.error('Error fetching alerts:', error);
    return [];
  }
};

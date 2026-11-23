// src/services/SpaceAssetsService.ts
// Artifact-driven: Provides satellite and space debris data for overlays (see globe-overlays.artifact)
import axios from 'axios';
import { env } from '../config/env';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'SpaceAssetsService' });

const SPACE_ASSETS_API_URL = env.spaceAssetsApiUrl;

export interface SpaceAsset {
  id: string | number;
  lat: number;
  lng: number;
  type: string; // e.g., 'satellite', 'debris'
  name: string;
  altitude: number;
  timestamp?: string;
}

export const fetchSpaceAssets = async (): Promise<SpaceAsset[]> => {
  try {
    const response = await axios.get(SPACE_ASSETS_API_URL);
    if (Array.isArray(response.data)) return response.data;
    if (Array.isArray(response.data.assets)) return response.data.assets;
    return [];
  } catch (error) {
    log.error('Error fetching space assets:', error);
    return [];
  }
};

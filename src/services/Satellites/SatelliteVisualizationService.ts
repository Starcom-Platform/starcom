// Updated Satellite Visualization Service - Phase 2 Implementation
// Now uses SatelliteDataManager for intelligent satellite selection
// Handles real 21K+ CelesTrak data with smart curation

import { SatelliteDataManager, SatelliteData, SatellitePosition, SatelliteInfo, SelectionCriteria } from './SatelliteDataManager';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'SatelliteVisualizationService' });

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export class SatelliteVisualizationService {
  private dataManager: SatelliteDataManager;
  private selectedSatellites: string[] = [];
  private currentSelectionCriteria: SelectionCriteria = { maxCount: 100 };
  private lastSelectionUpdate: Date | null = null;
  private readonly SELECTION_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.dataManager = new SatelliteDataManager();
  }

  /**
   * Initialize the service and load satellite data
   */
  async initialize(): Promise<void> {
    log.debug('🛰️ Initializing SatelliteVisualizationService...');
    
    try {
      await this.dataManager.loadSatelliteData();
      await this.updateSelection();
      log.debug('🛰️ SatelliteVisualizationService initialized successfully');
    } catch (error) {
      log.error('🛰️ Failed to initialize SatelliteVisualizationService:', error);
      throw error;
    }
  }

  /**
   * The selected ~100 satellites, each at its propagated position now.
   *
   * ─── WHAT USED TO HAPPEN WHEN THIS FAILED ──────────────────────────────────
   *
   * A failure here returned three hardcoded satellites — the ISS over 0°N 0°E,
   * the Chinese station over Inner Mongolia, Hubble over Cape Canaveral —
   * fixed points on the ground, none of them where those craft are. Callers
   * could not tell them from data. So when CelesTrak refused a load,
   * the Satellites layer said so for its first minute; then the hook's
   * one-minute refresh check called this, got the fakes, drew them, cleared
   * the error and stamped the catalogue as loaded that second. Observed live
   * on 2026-09-11: the card's caveat went from "CelesTrak refused
   * active-satellites" to nothing at all, while this logged "FALLBACK MODE".
   *
   * It also made the hook's own refresh handling unreachable — that catch keeps
   * the last good satellites and lets them age into a staleness caveat, and it
   * never ran, because nothing ever threw. Now a failure throws.
   */
  async getSatelliteData(): Promise<SatelliteData[]> {
    log.debug('🛰️ Getting satellite data for visualization...');

    if (this.dataManager.needsUpdate()) {
      log.debug('🛰️ Satellite data cache expired, refreshing...');
      await this.dataManager.loadSatelliteData();
      await this.updateSelection();
    }

    if (this.needsSelectionUpdate()) {
      log.debug('🛰️ Updating satellite selection...');
      await this.updateSelection();
    }

    const positions = new Map(
      this.dataManager.getPositions(this.selectedSatellites).map((p) => [p.id, p]),
    );

    /*
     * Only satellites with a position. Each record used to start at lat 0,
     * lng 0 "to be updated in getPositions", and one whose orbit could not be
     * propagated — and had never been — was simply never updated: it was
     * returned, and drawn, over null island.
     */
    const selectedData: SatelliteData[] = [];
    for (const id of this.selectedSatellites) {
      const info = this.dataManager.getSatelliteInfo(id);
      const position = positions.get(id);
      if (!info || !position) continue;
      selectedData.push({
        id: info.id,
        name: info.name,
        lat: position.lat,
        lng: position.lng,
        altitude: position.altitude,
        type: this.mapTypeFromDisplayName(info.type),
        status: 'active',
        priority: 50, // Default priority
        country: info.country
      });
    }

    log.debug(`🛰️ Returning ${selectedData.length} satellites for visualization`);
    return selectedData;
  }

  /**
   * Update selection based on current criteria
   */
  async updateSelection(zoom?: number, region?: BoundingBox): Promise<void> {
    // Update criteria based on zoom level and region
    const criteria: SelectionCriteria = {
      ...this.currentSelectionCriteria,
      maxCount: this.calculateMaxCount(zoom),
      region: region ? {
        minLat: region.minLat,
        maxLat: region.maxLat,
        minLng: region.minLng,
        maxLng: region.maxLng
      } : undefined
    };

    this.selectedSatellites = this.dataManager.selectSatellites(criteria);
    this.lastSelectionUpdate = new Date();
    
    log.debug(`🛰️ Updated selection: ${this.selectedSatellites.length} satellites selected`);
  }

  /**
   * Get current satellite positions for rendering
   */
  getCurrentPositions(): SatellitePosition[] {
    return this.dataManager.getPositions(this.selectedSatellites);
  }

  /**
   * True if either the TLE cache (1hr) or the satellite selection (5min) is due for a
   * refresh. Lets a caller that periodically checks for a re-selection (see
   * useGlobeSatellites.ts) skip calling the much heavier getSatelliteData() entirely
   * in the common case where nothing has actually changed, rather than paying for a
   * full selected-satellite propagation pass just to find that out.
   */
  /** The whole catalogue with elements, for the globe to propagate itself (D-GV GV2); the selection stays the panel's. */
  catalogue(): SatelliteData[] {
    return this.dataManager.allWithElements();
  }

  isRefreshDue(): boolean {
    return this.dataManager.needsUpdate() || this.needsSelectionUpdate();
  }

  /**
   * Handle satellite interaction - find satellite at screen coordinates
   * Note: This is a placeholder - actual implementation would use Three.js raycasting
   */
  getSatelliteAt(screenCoords: { x: number; y: number }): SatelliteInfo | null {
    // This would be implemented with proper Three.js raycasting in Phase 3
    log.debug('🛰️ Satellite interaction at:', screenCoords);
    
    // For now, return first satellite as demo
    if (this.selectedSatellites.length > 0) {
      return this.dataManager.getSatelliteInfo(this.selectedSatellites[0]);
    }
    
    return null;
  }

  /**
   * Get detailed info for a specific satellite
   */
  getSatelliteInfo(id: string): SatelliteInfo | null {
    return this.dataManager.getSatelliteInfo(id);
  }

  /**
   * Update selection criteria (for filtering, searching, etc.)
   */
  setSelectionCriteria(criteria: Partial<SelectionCriteria>): void {
    this.currentSelectionCriteria = { ...this.currentSelectionCriteria, ...criteria };
    log.debug('🛰️ Updated selection criteria:', this.currentSelectionCriteria);
  }

  /**
   * Search satellites by name
   */
  searchSatellites(query: string): SatelliteInfo[] {
    const results: SatelliteInfo[] = [];
    
    for (const id of this.selectedSatellites) {
      const info = this.dataManager.getSatelliteInfo(id);
      if (info && info.name.toLowerCase().includes(query.toLowerCase())) {
        results.push(info);
      }
    }
    
    return results;
  }

  /**
   * Filter satellites by type
   */
  filterByType(types: SatelliteData['type'][]): void {
    this.setSelectionCriteria({ types });
    this.updateSelection();
  }

  /**
   * Get service statistics
   */
  getStats(): {
    totalInCache: number;
    selectedCount: number;
    lastUpdate: Date | null;
    cacheStats: Record<string, number>;
  } {
    const cacheStats = this.dataManager.getCacheStats();
    
    return {
      totalInCache: cacheStats.total,
      selectedCount: this.selectedSatellites.length,
      lastUpdate: cacheStats.lastUpdate,
      cacheStats: cacheStats.byType
    };
  }

  /**
   * Clear cache and force refresh
   */
  async refresh(): Promise<void> {
    log.debug('🛰️ Forcing satellite data refresh...');
    await this.dataManager.loadSatelliteData();
    await this.updateSelection();
  }

  dispose(): void {
    this.selectedSatellites = [];
    this.currentSelectionCriteria = { maxCount: 100 };
    this.lastSelectionUpdate = null;
    this.dataManager.clear();
    log.debug('🛰️ SatelliteVisualizationService disposed - caches cleared');
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private needsSelectionUpdate(): boolean {
    if (!this.lastSelectionUpdate) return true;
    return (Date.now() - this.lastSelectionUpdate.getTime()) > this.SELECTION_UPDATE_INTERVAL;
  }

  private calculateMaxCount(zoom?: number): number {
    if (!zoom) return 100; // Default count
    
    // Adjust satellite count based on zoom level
    if (zoom < 2) return 50;  // Zoomed out - fewer satellites
    if (zoom < 4) return 100; // Normal zoom
    if (zoom < 6) return 150; // Zoomed in - more satellites
    return 200; // Very zoomed in - maximum satellites
  }

  private mapTypeFromDisplayName(displayType: string): SatelliteData['type'] {
    const typeMap: Record<string, SatelliteData['type']> = {
      'Space Station': 'space_station',
      'GPS Satellite': 'gps_satellite',
      'Starlink Satellite': 'starlink',
      'Communication Satellite': 'communication',
      'Weather Satellite': 'weather',
      'Scientific Satellite': 'scientific',
      'Military Satellite': 'military',
      'Space Debris': 'debris',
      'Satellite': 'other'
    };
    
    return typeMap[displayType] || 'other';
  }
}

// Export singleton instance
export const satelliteVisualizationService = new SatelliteVisualizationService();

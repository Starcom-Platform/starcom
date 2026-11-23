// Satellite Data Manager - Phase 1 Implementation
// Centralized hub for all satellite data operations with smart curation
// Handles 16K+ CelesTrak satellites, selects ~100 for visualization, and propagates
// real positions (SGP4, via satellite.js) for the selected subset only.

import { json2satrec, propagate, gstime, eciToGeodetic, radiansToDegrees, SatRec } from 'satellite.js';
import { CELESTRAK_UPDATE_INTERVAL_MS, SpaceAssetsDataProvider, CelesTrakTLE } from '../data-management/providers/SpaceAssetsDataProvider';
import { latLngToGlobeLocal } from '../../utils/globeCoordinates';
import { createLogger } from '@utils/logger';
import { DEBRIS_CLOUDS, debrisCloudOf } from './debrisClouds';
const log = createLogger({ prefix: 'SatelliteDataManager' });

/**
 * What a viewer must know about these positions, whatever the catalogue's age
 * (decision D-F, step 13). Carried on the Satellites feed as its note, so the
 * share card prints it as a standing caveat and the globe's key shows it under
 * the source.
 *
 * The positions are PREDICTED for the present moment by SGP4 from orbital
 * elements, not observed. The feed's time stays the moment CelesTrak served the
 * catalogue — so "as of 19:47Z · 0m ago" is when the elements arrived, and this
 * says what was done with them. Without it that line reads as though every
 * satellite had been seen just now.
 *
 * The elements' own age was measured and deliberately not shown: across the 23
 * station records on 2026-09-19 they were 8h old at newest, 16h at the median
 * and 66h at oldest. At globe scale the prediction error that implies is a few
 * kilometres, far inside an 8 px mark. Stating the element age as "as of" would
 * have read as positions sixteen hours out of date, which is not what they are.
 */
export const SATELLITE_PREDICTED_NOTE =
  'Satellite positions are predicted from published orbital elements, not observed.';

export interface SatelliteData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  altitude: number;
  type: 'space_station' | 'gps_satellite' | 'starlink' | 'communication' | 'weather' | 'scientific' | 'military' | 'debris' | 'other';
  status: 'active' | 'inactive' | 'decayed' | 'unknown';
  priority: number; // 0-100, higher = more important for selection
  country?: string;
  launchDate?: Date;
  // Full orbital element set as fetched from CelesTrak — enough to build a real SGP4
  // SatRec via satellite.js's json2satrec(), unlike the previous reduced 4-field subset.
  // Present on every satellite actually ingested from CelesTrak (see
  // transformTLEToSatelliteData()); optional because SatelliteVisualizationService
  // also constructs SatelliteData-shaped objects for UI/fallback purposes that were
  // never fetched from CelesTrak and so have no real TLE to propagate.
  rawTle?: CelesTrakTLE;
  /** For a piece of one of the three debris clouds, the provider's key for it (debrisClouds.ts). */
  debrisOf?: string;
}

export interface SatellitePosition {
  id: string;
  position: {
    x: number; // 3D coordinates for Three.js
    y: number;
    z: number;
  };
  altitude: number;
  velocity: number;
  lat: number;
  lng: number;
}

export interface SatelliteInfo {
  id: string;
  name: string;
  type: string;
  altitude: number;
  velocity: number;
  nextPass?: PassInfo;
  launchDate?: Date;
  country: string;
  description?: string;
}

export interface PassInfo {
  time: Date;
  duration: number; // minutes
  maxElevation: number; // degrees
}

export interface SelectionCriteria {
  maxCount?: number;
  types?: SatelliteData['type'][];
  minPriority?: number;
  region?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  includeAlways?: string[]; // Always include these satellite IDs
}

export class SatelliteDataManager {
  private spaceAssetsProvider: SpaceAssetsDataProvider;
  private satelliteCache: Map<string, SatelliteData> = new Map();
  private lastUpdate: Date | null = null;
  /*
   * CelesTrak's own update interval, not an hour. The data now carries its real
   * download time, which for a cached group can be up to two hours old; with a
   * one-hour lifetime here, every five-minute selection check between hours one
   * and two would decide a refresh was due, re-read ~5 MB from IndexedDB and
   * rebuild every orbit — to receive the identical data CelesTrak had just said
   * had not changed.
   */
  private readonly CACHE_DURATION = CELESTRAK_UPDATE_INTERVAL_MS;

  // SGP4 propagation state. satrecCache is keyed the same as satelliteCache and built
  // lazily — json2satrec() (parsing orbital elements into a SatRec) is meaningfully
  // more expensive than propagate() (computing a position at a given time), so it's
  // done once per satellite and reused across every position tick.
  private satrecCache: Map<string, SatRec> = new Map();
  private lastKnownPosition: Map<string, { lat: number; lng: number; altitude: number }> = new Map();
  // Populated alongside lastKnownPosition, from the SAME propagate() call — read by
  // getSatelliteInfo() instead of running a second, separate propagate() just for
  // velocity (see the removed velocityAt() method for why that was wasteful: every
  // call to getSatelliteData() invoked getSatelliteInfo() for all ~100 selected
  // satellites AND getPositions() for the same ~100, each independently propagating).
  private lastKnownVelocity: Map<string, number> = new Map();
  // Tracks which satellites we've already logged a propagation-failure warning for,
  // so a persistently-decayed/invalid satellite doesn't spam the console on every tick.
  private warnedPropagationFailure: Set<string> = new Set();

  // Hardcoded high-priority satellites (always include)
  private readonly HIGH_PRIORITY_SATELLITES = [
    'ZARYA', // ISS module
    'INTERNATIONAL SPACE STATION',
    'ISS',
    'HUBBLE SPACE TELESCOPE',
    'TIANGONG',
    'CSS', // Chinese Space Station
    'JAMES WEBB SPACE TELESCOPE',
    'CHANDRA',
    'SPITZER'
  ];

  // GPS constellation identifiers
  private readonly GPS_IDENTIFIERS = [
    'GPS BIIR', 'GPS BIIF', 'GPS BIII'
  ];

  constructor() {
    this.spaceAssetsProvider = new SpaceAssetsDataProvider();
  }

  /**
   * Load all satellite data from CelesTrak
   * This fetches the full 16K+ satellite dataset
   */
  async loadSatelliteData(): Promise<void> {
    log.debug('🛰️ Loading satellite data from CelesTrak...');

    try {
      // Fetch multiple datasets in parallel. Note: 'starlink' is deliberately NOT
      // fetched separately — every Starlink satellite already appears in the
      // 'active-satellites' group (verified directly: 100% ID overlap), and
      // classifySatellite() already has a name-based fallback ("STARLINK" in the
      // object name) that every CelesTrak Starlink record satisfies, so classification
      // is unaffected. Fetching it separately was pure redundant bandwidth/parse time.
      // The debris clouds (D-GV GV2) are wanted, not needed: a cloud CelesTrak will not give is left out, and the
      // rest of the catalogue still loads.
      const debrisLoads = Promise.allSettled(DEBRIS_CLOUDS.map((cloud) => this.spaceAssetsProvider.fetchData(cloud.key)));
      const [activeSatellites, spaceStations, gpsOps] = await Promise.all([
        this.spaceAssetsProvider.fetchData('active-satellites'),
        this.spaceAssetsProvider.fetchData('space-stations'),
        this.spaceAssetsProvider.fetchData('gps-operational')
      ]);

      // Clear existing cache
      this.satelliteCache.clear();
      this.satrecCache.clear();

      // Process each dataset
      this.processSatelliteDataset(activeSatellites as CelesTrakTLE[], 'active');
      this.processSatelliteDataset(spaceStations as CelesTrakTLE[], 'stations');
      this.processSatelliteDataset(gpsOps as CelesTrakTLE[], 'gps');
      const debris = await debrisLoads;
      const debrisLoaded: string[] = [];
      debris.forEach((load, i) => {
        const cloud = DEBRIS_CLOUDS[i];
        // One whose age cannot be stated is left out like one that failed: it would not be captioned truly.
        if (load.status === 'fulfilled' && this.spaceAssetsProvider.getFetchedAt(cloud.key) !== null) {
          this.processSatelliteDataset(load.value as CelesTrakTLE[], cloud.key);
          debrisLoaded.push(cloud.key);
        } else {
          log.warn(`Satellites: ${cloud.name} left out:`, load.status === 'rejected' ? load.reason : 'no record of when it was served');
        }
      });

      /*
       * When CelesTrak served the data — not when it was read. A group read from
       * cache can be two hours old, and stamping the read time would caption
       * those orbital elements as fresh. The set is as old as its oldest member.
       *
       * No fallback to "now" when a time is missing: that is exactly the
       * fresh-looking caption this replaces, and a fallback nobody can reach is
       * one refactor from being reached — the hook's `?? Date.now()` was, the
       * moment the service stopped swallowing errors. A load whose age cannot
       * be stated fails, and says so.
       */
      const groups = ['active-satellites', 'space-stations', 'gps-operational'];
      const servedAt = groups.map((k) => this.spaceAssetsProvider.getFetchedAt(k));
      const unknown = groups.filter((_, i) => servedAt[i] === null);
      if (unknown.length > 0) {
        throw new Error(`CelesTrak data for ${unknown.join(', ')} loaded with no record of when it was served`);
      }
      const debrisServedAt = debrisLoaded.map((k) => this.spaceAssetsProvider.getFetchedAt(k) as number);
      this.lastUpdate = new Date(Math.min(...(servedAt as number[]), ...debrisServedAt));
      
      log.debug(`🛰️ Loaded ${this.satelliteCache.size} satellites into cache`);
      log.debug(`   - Cache breakdown:`);
      this.logCacheStats();

    } catch (error) {
      log.error('🛰️ Failed to load satellite data:', error);
      throw error;
    }
  }

  /**
   * Select interesting satellites based on criteria
   * This is the core intelligence of the system - choosing which ~100 to show
   */
  selectSatellites(criteria: SelectionCriteria = {}): string[] {
    const {
      maxCount = 100,
      types = [],
      minPriority = 0,
      region,
      includeAlways = []
    } = criteria;

    log.debug(`🛰️ Selecting satellites with criteria:`, {
      maxCount,
      types: types.length > 0 ? types : 'all',
      minPriority,
      hasRegion: !!region
    });

    const selected: Set<string> = new Set();
    
    // 1. Always include high-priority satellites
    for (const id of includeAlways) {
      if (this.satelliteCache.has(id)) {
        selected.add(id);
      }
    }

    // 2. Always include our hardcoded high-priority satellites
    for (const [id, satellite] of this.satelliteCache) {
      if (this.isHighPriority(satellite.name)) {
        selected.add(id);
      }
    }

    // 3. Select representatives from each category
    const categoryTargets = this.calculateCategoryTargets(maxCount);
    
    for (const [category, target] of Object.entries(categoryTargets)) {
      if (target === 0) continue;
      
      const categoryIds = this.selectFromCategory(category as SatelliteData['type'], target, selected);
      categoryIds.forEach(id => selected.add(id));
    }

    // 4. Apply regional filtering if specified
    // NOTE: relies on satellite.lat/.lng, which are inert 0 placeholders until
    // getPositions() has propagated a real position for that satellite (see
    // transformTLEToSatelliteData()). No current caller ever passes `region` here
    // (verified — selectSatellites() is only ever invoked with maxCount/types), so
    // this is presently unreachable. If region-based selection is wired up in the
    // future, it will need real positions available at selection time, before this
    // filter runs.
    let finalSelection = Array.from(selected);
    if (region) {
      finalSelection = finalSelection.filter(id => {
        const satellite = this.satelliteCache.get(id);
        if (!satellite) return false;

        return satellite.lat >= region.minLat &&
               satellite.lat <= region.maxLat &&
               satellite.lng >= region.minLng &&
               satellite.lng <= region.maxLng;
      });
    }

    // 5. Apply type filtering if specified
    if (types.length > 0) {
      finalSelection = finalSelection.filter(id => {
        const satellite = this.satelliteCache.get(id);
        return satellite && types.includes(satellite.type);
      });
    }

    // 6. Apply priority filtering
    finalSelection = finalSelection.filter(id => {
      const satellite = this.satelliteCache.get(id);
      return satellite && satellite.priority >= minPriority;
    });

    // 7. Limit to maxCount
    const result = finalSelection.slice(0, maxCount);
    
    log.debug(`🛰️ Selected ${result.length} satellites from ${this.satelliteCache.size} total`);
    this.logSelectionStats(result);

    return result;
  }

  /**
   * Get real 3D positions for selected satellites at the given time, via SGP4
   * propagation (satellite.js). Only computes positions for the requested (selected)
   * satellites, not the full ~16K cache — propagation is real work, unlike the old
   * fake math, so it's deliberately kept off the ~16K unselected records.
   */
  getPositions(satelliteIds: string[], time: Date = new Date()): SatellitePosition[] {
    return satelliteIds.map(id => {
      const satellite = this.satelliteCache.get(id);
      if (!satellite) {
        log.warn(`🛰️ Satellite not found: ${id}`);
        return null;
      }

      if (!satellite.rawTle) {
        // No real orbital elements to propagate (e.g. hardcoded fallback satellites) —
        // fall back to whatever position was last known, if any.
        return this.positionFromLastKnown(id);
      }

      const satrec = this.getOrBuildSatRec(id, satellite.rawTle);
      if (!satrec) {
        return this.positionFromLastKnown(id);
      }

      const pv = propagate(satrec, time);
      if (!pv || !pv.position) {
        this.warnPropagationFailure(id, satellite.name, satrec.error);
        return this.positionFromLastKnown(id);
      }

      const gmst = gstime(time);
      const geo = eciToGeodetic(pv.position, gmst);
      const lat = radiansToDegrees(geo.latitude);
      const lng = radiansToDegrees(geo.longitude);
      const altitude = geo.height;
      const velocity = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z);

      // satellite.js 6.x doesn't have the (7.1.0+) `communityDecayCheckEnabled` option
      // that catches long-decayed objects SGP4 "successfully" propagates to garbage
      // (often literally underground) positions instead of reporting an error — this
      // is the same check by hand: reject any result outside real orbital bounds
      // (anything from just-above-ground to well past geostationary/highly-elliptical
      // apogees), falling back to last-known-good exactly like a propagation error.
      if (!this.isPlausibleAltitude(altitude)) {
        this.warnPropagationFailure(id, satellite.name, 'implausible altitude ' + altitude.toFixed(0) + 'km');
        return this.positionFromLastKnown(id);
      }

      // Keep the cached record fresh too, so getSatelliteInfo() (used for hover/click
      // detail UI, called independently of this refresh cadence) reflects real,
      // current lat/lng/altitude rather than the stale ingest-time placeholder.
      satellite.lat = lat;
      satellite.lng = lng;
      satellite.altitude = altitude;
      this.lastKnownPosition.set(id, { lat, lng, altitude });
      this.lastKnownVelocity.set(id, velocity);

      return {
        id,
        position: this.convertToCartesian(lat, lng, altitude),
        altitude,
        velocity,
        lat,
        lng
      };
    }).filter((pos): pos is SatellitePosition => pos !== null);
  }

  private getOrBuildSatRec(id: string, rawTle: CelesTrakTLE): SatRec | null {
    const cached = this.satrecCache.get(id);
    if (cached) return cached;

    try {
      const satrec = json2satrec(rawTle as unknown as Parameters<typeof json2satrec>[0]);
      this.satrecCache.set(id, satrec);
      return satrec;
    } catch (error) {
      log.warn(`🛰️ Failed to build SatRec for ${id} (${rawTle.OBJECT_NAME}):`, error);
      return null;
    }
  }

  /**
   * Falls back to the last successfully-propagated position for a satellite whose
   * SatRec couldn't be built or whose latest propagation attempt failed/decayed.
   * Returns null (satellite omitted from the render set) only if no position has ever
   * been successfully computed for it.
   */
  private positionFromLastKnown(id: string): SatellitePosition | null {
    const last = this.lastKnownPosition.get(id);
    if (!last) return null;
    return {
      id,
      position: this.convertToCartesian(last.lat, last.lng, last.altitude),
      altitude: last.altitude,
      velocity: this.lastKnownVelocity.get(id) ?? 0,
      lat: last.lat,
      lng: last.lng
    };
  }

  private warnPropagationFailure(id: string, name: string, error: unknown): void {
    if (this.warnedPropagationFailure.has(id)) return;
    this.warnedPropagationFailure.add(id);
    log.warn(`🛰️ SGP4 propagation failed for ${name} (${id}), error code ${error} — using last known position`);
  }

  /**
   * Get satellite metadata for UI display. Reads the velocity last computed by
   * getPositions() rather than running its own propagate() call — getSatelliteInfo()
   * used to do exactly that (a real SGP4 propagation) on every call, and
   * getSatelliteData() calls getSatelliteInfo() for every selected satellite AND
   * getPositions() for the same set in the same pass, silently doubling the real
   * propagation cost for no benefit (the velocity it computed was never even read by
   * that caller). May be very slightly stale between position-refresh ticks — fine for
   * a UI info display, and consistent with how altitude already worked before this
   * fix (also a cache read, not a fresh computation).
   */
  getSatelliteInfo(id: string): SatelliteInfo | null {
    const satellite = this.satelliteCache.get(id);
    if (!satellite) return null;

    return {
      id: satellite.id,
      name: satellite.name,
      type: this.getTypeDisplayName(satellite.type),
      altitude: satellite.altitude,
      velocity: this.lastKnownVelocity.get(id) ?? 0,
      launchDate: satellite.launchDate,
      country: satellite.country || 'Unknown',
      description: this.generateDescription(satellite)
    };
  }

  /**
   * True if an altitude (km above Earth's surface) falls within the range any real
   * tracked satellite could plausibly occupy — from just above ground to comfortably
   * past geostationary/high-elliptical apogees. Used to catch SGP4 "successfully"
   * propagating a long-decayed object to a garbage (often underground) position.
   */
  private isPlausibleAltitude(altitudeKm: number): boolean {
    return Number.isFinite(altitudeKm) && altitudeKm > -50 && altitudeKm < 50000;
  }

  /**
   * Every satellite in the catalogue with orbital elements to propagate, in the order the cache holds them: what the
   * globe draws whole since D-GV GV2 (catalogPropagation.ts), where it drew a selection of a hundred.
   */
  allWithElements(): SatelliteData[] {
    return [...this.satelliteCache.values()].filter((satellite) => satellite.rawTle !== undefined);
  }

  /**
   * Check if cache needs refreshing
   */
  needsUpdate(): boolean {
    if (!this.lastUpdate) return true;
    return (Date.now() - this.lastUpdate.getTime()) > this.CACHE_DURATION;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { total: number; byType: Record<string, number>; lastUpdate: Date | null } {
    const byType: Record<string, number> = {};
    
    for (const satellite of this.satelliteCache.values()) {
      byType[satellite.type] = (byType[satellite.type] || 0) + 1;
    }

    return {
      total: this.satelliteCache.size,
      byType,
      lastUpdate: this.lastUpdate
    };
  }

  clear(): void {
    this.satelliteCache.clear();
    this.satrecCache.clear();
    this.lastKnownPosition.clear();
    this.lastKnownVelocity.clear();
    this.warnedPropagationFailure.clear();
    this.lastUpdate = null;
  }

  // =============================================================================
  // PRIVATE METHODS
  // =============================================================================

  private processSatelliteDataset(data: CelesTrakTLE[], source: string): void {
    if (!Array.isArray(data)) {
      log.warn(`🛰️ Invalid dataset from ${source}:`, typeof data);
      return;
    }

    log.debug(`🔄 Processing ${data.length} real satellites from ${source} (CelesTrak)`);
    let processedCount = 0;

    for (const tle of data) {
      const satellite = this.transformTLEToSatelliteData(tle, source);
      this.satelliteCache.set(satellite.id, satellite);
      processedCount++;
    }

    log.debug(`✅ Processed ${processedCount} real satellites from ${source} into cache`);
  }

  private transformTLEToSatelliteData(tle: CelesTrakTLE, source: string): SatelliteData {
    const type = this.classifySatellite(tle.OBJECT_NAME, source);
    const priority = this.calculatePriority(tle.OBJECT_NAME, type);

    // lat/lng/altitude start as inert placeholders — real SGP4 propagation only runs
    // for the ~100 satellites selectSatellites() actually picks (see getPositions()),
    // not for every one of the ~16K records fetched. Computing anything here for
    // records that are never selected would be pure waste.
    return {
      id: tle.NORAD_CAT_ID.toString(),
      name: tle.OBJECT_NAME,
      lat: 0,
      lng: 0,
      altitude: 0,
      type,
      status: 'active', // CelesTrak typically contains active objects
      priority,
      country: this.guessCountry(tle.OBJECT_NAME),
      rawTle: tle,
      ...(debrisCloudOf(source) ? { debrisOf: source } : {})
    };
  }

  private classifySatellite(name: string, source: string): SatelliteData['type'] {
    const nameUpper = name.toUpperCase();
    
    // Explicit source-based classification
    if (source === 'starlink') return 'starlink';
    if (source === 'gps') return 'gps_satellite';
    if (source === 'stations') return 'space_station';
    // Before the names: "COSMOS 2251 DEB" and "IRIDIUM 33 DEB" would read as communications satellites.
    if (debrisCloudOf(source)) return 'debris';

    // Name-based classification
    if (nameUpper.includes('STARLINK')) return 'starlink';
    if (nameUpper.includes('GPS') || nameUpper.includes('GALILEO') || nameUpper.includes('GLONASS')) return 'gps_satellite';
    if (nameUpper.includes('STATION') || nameUpper.includes('ISS') || nameUpper.includes('ZARYA') || nameUpper.includes('TIANGONG')) return 'space_station';
    if (nameUpper.includes('WEATHER') || nameUpper.includes('NOAA') || nameUpper.includes('GOES')) return 'weather';
    if (nameUpper.includes('HUBBLE') || nameUpper.includes('WEBB') || nameUpper.includes('CHANDRA') || nameUpper.includes('SPITZER')) return 'scientific';
    if (nameUpper.includes('COSMO') || nameUpper.includes('IRIDIUM') || nameUpper.includes('INTELSAT')) return 'communication';
    if (nameUpper.includes('DEBRIS') || nameUpper.includes('DEB')) return 'debris';
    if (nameUpper.includes('ROCKET') || nameUpper.includes('R/B')) return 'debris';

    return 'other';
  }

  private calculatePriority(name: string, type: SatelliteData['type']): number {
    // Base priority by type
    const typePriorities = {
      space_station: 95,
      scientific: 85,
      gps_satellite: 70,
      weather: 60,
      communication: 50,
      starlink: 30,
      military: 40,
      other: 20,
      debris: 10
    };

    let priority = typePriorities[type] || 20;

    // Boost for high-priority names
    if (this.isHighPriority(name)) {
      priority = Math.max(priority, 98);
    }

    return priority;
  }

  private isHighPriority(name: string): boolean {
    const nameUpper = name.toUpperCase();
    return this.HIGH_PRIORITY_SATELLITES.some(hp => nameUpper.includes(hp));
  }

  private calculateCategoryTargets(maxCount: number): Record<SatelliteData['type'], number> {
    // Smart distribution of selection budget
    const alwaysIncludeCount = 20; // High-priority satellites
    const remaining = maxCount - alwaysIncludeCount;

    return {
      space_station: 10,
      scientific: 8,
      gps_satellite: Math.floor(remaining * 0.3), // ~24
      weather: Math.floor(remaining * 0.15), // ~12
      communication: Math.floor(remaining * 0.15), // ~12
      starlink: Math.floor(remaining * 0.25), // ~20
      military: Math.floor(remaining * 0.1), // ~8
      other: Math.floor(remaining * 0.05), // ~4
      debris: 2 // Just a few for education
    };
  }

  private selectFromCategory(category: SatelliteData['type'], target: number, alreadySelected: Set<string>): string[] {
    const candidates = Array.from(this.satelliteCache.entries())
      .filter(([id, satellite]) => satellite.type === category && !alreadySelected.has(id))
      .sort(([, a], [, b]) => b.priority - a.priority) // Sort by priority descending
      .slice(0, target)
      .map(([id]) => id);

    return candidates;
  }

  private convertToCartesian(lat: number, lng: number, altitude: number): { x: number; y: number; z: number } {
    const earthRadius = 6371; // km
    const radius = earthRadius + altitude;
    const point = latLngToGlobeLocal(lat, lng, radius);

    return {
      x: point.x,
      y: point.y,
      z: point.z
    };
  }

  private guessCountry(name: string): string {
    const nameUpper = name.toUpperCase();
    if (nameUpper.includes('ISS') || nameUpper.includes('ZARYA')) return 'International';
    if (nameUpper.includes('TIANGONG') || nameUpper.includes('CSS')) return 'China';
    if (nameUpper.includes('PROGRESS') || nameUpper.includes('SOYUZ')) return 'Russia';
    if (nameUpper.includes('GPS') || nameUpper.includes('USA') || nameUpper.includes('GOES')) return 'USA';
    if (nameUpper.includes('GALILEO')) return 'Europe';
    if (nameUpper.includes('GLONASS')) return 'Russia';
    if (nameUpper.includes('STARLINK')) return 'USA';
    return 'Unknown';
  }

  private getTypeDisplayName(type: SatelliteData['type']): string {
    const displayNames = {
      space_station: 'Space Station',
      gps_satellite: 'GPS Satellite',
      starlink: 'Starlink Satellite',
      communication: 'Communication Satellite',
      weather: 'Weather Satellite',
      scientific: 'Scientific Satellite',
      military: 'Military Satellite',
      debris: 'Space Debris',
      other: 'Satellite'
    };
    return displayNames[type] || 'Satellite';
  }

  private generateDescription(satellite: SatelliteData): string {
    switch (satellite.type) {
      case 'space_station':
        return `Crewed space station orbiting at ${satellite.altitude.toFixed(0)} km altitude`;
      case 'gps_satellite':
        return `Global positioning satellite providing navigation services`;
      case 'starlink':
        return `Low Earth orbit internet constellation satellite`;
      case 'scientific':
        return `Scientific research satellite conducting space observations`;
      case 'weather':
        return `Weather monitoring satellite for Earth observation`;
      case 'communication':
        return `Communication satellite providing telecommunications services`;
      default:
        return `Satellite orbiting at ${satellite.altitude.toFixed(0)} km altitude`;
    }
  }

  private logCacheStats(): void {
    const stats = this.getCacheStats();
    for (const [type, count] of Object.entries(stats.byType)) {
      log.debug(`     ${type}: ${count}`);
    }
  }

  private logSelectionStats(selectedIds: string[]): void {
    const typeBreakdown: Record<string, number> = {};
    
    for (const id of selectedIds) {
      const satellite = this.satelliteCache.get(id);
      if (satellite) {
        typeBreakdown[satellite.type] = (typeBreakdown[satellite.type] || 0) + 1;
      }
    }

    log.debug(`   - Selection breakdown:`);
    for (const [type, count] of Object.entries(typeBreakdown)) {
      log.debug(`     ${type}: ${count}`);
    }
  }
}

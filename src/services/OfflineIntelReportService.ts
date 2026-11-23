/**
 * 🌐 Offline Intel Report Service
 * 
 * Reports saved offline, before plan item 0.11 sent the globe's right-click
 * to the report form:
 * - Securely stores reports locally
 * - Adds them to this device's reports, each under its own author
 * - Provides conflict resolution and data integrity
 *
 * No wallet is involved anywhere: the wallet was retired (plan item 4.4),
 * and it never was who wrote a report (plan item 2.2).
 */

import { IntelReportData, IntelReportFormData, IntelReportTransformer } from '../models/IntelReportData';
import { secureStorage } from '../security/storage/SecureStorageManager';
import { intelReportService } from './intel/IntelReportService';
import { nostrIdentityService } from './identity/NostrIdentityService';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'OfflineIntelReportService' });

// Storage keys for offline reports
const OFFLINE_STORAGE_KEYS = {
  OFFLINE_REPORTS: 'offline_intel_reports',
  SYNC_QUEUE: 'intel_sync_queue',
  SYNC_SETTINGS: 'intel_sync_settings',
  CONFLICT_RESOLUTION: 'intel_conflict_resolution'
} as const;

// Offline report states
export type OfflineReportStatus = 
  | 'draft'         // Being created/edited
  | 'pending'       // Ready for sync
  | 'syncing'       // Currently syncing
  | 'synced'        // Successfully synced
  | 'conflict'      // Merge conflict detected
  | 'error';        // Sync error

// Offline report structure
export interface OfflineIntelReport extends IntelReportData {
  // Offline-specific fields
  offlineId: string;                    // Unique offline identifier
  status: OfflineReportStatus;          // Current sync status
  createdOffline: boolean;              // Whether created offline
  lastModified: number;                 // Last modification timestamp
  syncAttempts: number;                 // Number of sync attempts
  conflictData?: ConflictData;          // Conflict resolution data
  
  // Metadata
  deviceInfo?: string;                  // Device/browser info
  userAgent?: string;                   // User agent string
  sessionId?: string;                   // Session identifier
}

// Conflict resolution data
export interface ConflictData {
  type: 'duplicate' | 'coordinate_mismatch' | 'content_mismatch' | 'timestamp_mismatch';
  onchainReport?: IntelReportData;      // Conflicting on-chain report
  resolution?: 'merge' | 'replace' | 'keep_both' | 'manual';
  resolvedAt?: number;                  // Resolution timestamp
  resolvedBy?: string;                  // User who resolved
}

// Sync settings
export interface SyncSettings {
  conflictResolution: 'ask' | 'merge' | 'replace' | 'keep_both';
  maxRetries: number;                   // Max sync retry attempts
  retryDelay: number;                   // Retry delay in ms
  batchSize: number;                    // Batch sync size
}

// Sync statistics
export interface SyncStats {
  totalOfflineReports: number;
  pendingSync: number;
  successfulSyncs: number;
  failedSyncs: number;
  conflicts: number;
  lastSyncAttempt?: number;
  lastSuccessfulSync?: number;
}

// Service events
export interface OfflineIntelServiceEvents {
  'report-created': OfflineIntelReport;
  'report-updated': OfflineIntelReport;
  'sync-started': { reportIds: string[] };
  'sync-progress': { completed: number; total: number };
  'sync-completed': { successful: number; failed: number };
  'conflict-detected': { report: OfflineIntelReport; conflict: ConflictData };
  'conflict-resolved': { report: OfflineIntelReport; resolution: string };
}

/**
 * Main Offline Intel Report Service
 */
export class OfflineIntelReportService {
  private static instance: OfflineIntelReportService;
  private eventListeners: Map<keyof OfflineIntelServiceEvents, Set<(data: unknown) => void>> = new Map();
  private syncInProgress = false;
  private currentSession: string;

  private constructor() {
    this.currentSession = this.generateSessionId();
    this.initializeDefaultSettings();
  }

  static getInstance(): OfflineIntelReportService {
    if (!OfflineIntelReportService.instance) {
      OfflineIntelReportService.instance = new OfflineIntelReportService();
    }
    return OfflineIntelReportService.instance;
  }

  // =============================================================================
  // OFFLINE REPORT CREATION & MANAGEMENT
  // =============================================================================

  /**
   * Create a new offline intel report
   */
  async createOfflineReport(
    data: Partial<IntelReportData>,
    coordinates?: { lat: number; lng: number }
  ): Promise<OfflineIntelReport> {
    const offlineId = this.generateOfflineId();
    const timestamp = Date.now();

    const offlineReport: OfflineIntelReport = {
      // Core data
      id: offlineId,
      title: data.title || 'Untitled Report',
      content: data.content || '',
      tags: data.tags || [],
      latitude: coordinates?.lat || data.latitude || 0,
      longitude: coordinates?.lng || data.longitude || 0,
      timestamp: data.timestamp || timestamp,
      author: data.author || 'Anonymous',

      // Offline-specific fields
      offlineId,
      status: 'draft',
      createdOffline: true,
      lastModified: timestamp,
      syncAttempts: 0,

      // Metadata
      deviceInfo: this.getDeviceInfo(),
      userAgent: navigator.userAgent,
      sessionId: this.currentSession
    };

    // Store offline report
    await this.saveOfflineReport(offlineReport);
    
    // Emit event
    this.emit('report-created', offlineReport);

    log.debug('📝 Offline intel report created:', {
      id: offlineId,
      coordinates: { lat: offlineReport.latitude, lng: offlineReport.longitude },
      title: offlineReport.title
    });

    return offlineReport;
  }

  /**
   * Create offline report from form data
   */
  async createOfflineReportFromForm(formData: IntelReportFormData): Promise<OfflineIntelReport> {
    const transformedData = IntelReportTransformer.formToBlockchain(formData);
    
    return this.createOfflineReport({
      title: transformedData.title,
      content: transformedData.content,
      tags: transformedData.tags,
      latitude: transformedData.latitude,
      longitude: transformedData.longitude,
      timestamp: transformedData.timestamp,
      author: transformedData.author
    });
  }

  /**
   * Update an existing offline report
   */
  async updateOfflineReport(
    offlineId: string,
    updates: Partial<OfflineIntelReport>
  ): Promise<OfflineIntelReport> {
    const reports = await this.getOfflineReports();
    const reportIndex = reports.findIndex(r => r.offlineId === offlineId);

    if (reportIndex === -1) {
      throw new Error(`Offline report not found: ${offlineId}`);
    }

    // An explicit status in `updates` always wins (sync success/error,
    // conflict resolution all need this). Only when the caller is just
    // editing content with no status opinion does an already-synced report
    // auto-demote to 'pending' — it's now out of sync with the canonical
    // copy. Previously this ternary ran unconditionally and silently
    // discarded any status passed in `updates`, which meant every explicit
    // status transition through this method (sync success/error included)
    // never actually took effect unless the report happened to already be
    // 'synced' — undetected until sync itself started working.
    const updatedReport: OfflineIntelReport = {
      ...reports[reportIndex],
      ...updates,
      lastModified: Date.now(),
      status: updates.status !== undefined
        ? updates.status
        : (reports[reportIndex].status === 'synced' ? 'pending' : reports[reportIndex].status)
    };

    reports[reportIndex] = updatedReport;
    await this.saveOfflineReports(reports);
    
    this.emit('report-updated', updatedReport);
    
    return updatedReport;
  }

  /**
   * Get all offline reports
   */
  async getOfflineReports(): Promise<OfflineIntelReport[]> {
    try {
      const reports = await secureStorage.getItem<OfflineIntelReport[]>(
        OFFLINE_STORAGE_KEYS.OFFLINE_REPORTS
      );
      return reports || [];
    } catch (error) {
      log.error('Failed to load offline reports:', error);
      return [];
    }
  }

  /**
   * Get reports by status
   */
  async getReportsByStatus(status: OfflineReportStatus): Promise<OfflineIntelReport[]> {
    const reports = await this.getOfflineReports();
    return reports.filter(r => r.status === status);
  }

  /**
   * Get a specific offline report
   */
  async getOfflineReport(offlineId: string): Promise<OfflineIntelReport | null> {
    const reports = await this.getOfflineReports();
    return reports.find(r => r.offlineId === offlineId) || null;
  }

  /**
   * Delete an offline report
   */
  async deleteOfflineReport(offlineId: string): Promise<boolean> {
    const reports = await this.getOfflineReports();
    const filteredReports = reports.filter(r => r.offlineId !== offlineId);
    
    if (filteredReports.length === reports.length) {
      return false; // Report not found
    }

    await this.saveOfflineReports(filteredReports);
    return true;
  }

  // =============================================================================
  // SYNC
  // =============================================================================

  /**
   * Add all pending offline reports to the workspace, each under the author it
   * was written under (plan item 2.2). No wallet: there is none (plan item 4.4).
   */
  async syncOfflineReports(): Promise<SyncStats> {
    if (this.syncInProgress) {
      throw new Error('Sync already in progress');
    }

    this.syncInProgress = true;
    const stats: SyncStats = {
      totalOfflineReports: 0,
      pendingSync: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      conflicts: 0
    };

    try {
      const reports = await this.getOfflineReports();
      const pendingReports = reports.filter(r => r.status === 'pending' || r.status === 'error');
      
      stats.totalOfflineReports = reports.length;
      stats.pendingSync = pendingReports.length;

      if (pendingReports.length === 0) {
        log.debug('🔄 No reports to sync');
        return stats;
      }

      // Emit sync start event
      this.emit('sync-started', { reportIds: pendingReports.map(r => r.offlineId) });

      // Get sync settings
      const settings = await this.getSyncSettings();
      
      // Process reports in batches
      const batches = this.chunkArray(pendingReports, settings.batchSize);
      let completed = 0;

      for (const batch of batches) {
        for (const report of batch) {
          try {
            await this.syncSingleReport(report);
            stats.successfulSyncs++;
          } catch (error) {
            log.error(`Failed to sync report ${report.offlineId}:`, error);
            stats.failedSyncs++;
            
            // Update report status
            await this.updateReportStatus(report.offlineId, 'error');
          }
          
          completed++;
          this.emit('sync-progress', { completed, total: pendingReports.length });
        }
      }

      // Update last sync timestamp
      await this.updateSyncTimestamp();
      
      // Emit completion event
      this.emit('sync-completed', { 
        successful: stats.successfulSyncs, 
        failed: stats.failedSyncs 
      });

    } finally {
      this.syncInProgress = false;
    }

    return stats;
  }

  /**
   * Sync a single offline report to the canonical intelReportService
   * (IndexedDB-backed, the same store every other producer in the app
   * writes to) — NOT to the blockchain. This used to submit to Solana via
   * a Web3 IntelReportService that nothing in the app ever initialized
   * (initializeWeb3Service had zero real callers), so syncing has never
   * once succeeded in the live app: every attempt threw "Web3 service not
   * initialized" immediately. The wallet is not needed at all: the report
   * keeps the author it was written under.
   */
  private async syncSingleReport(report: OfflineIntelReport): Promise<void> {
    // Update status to syncing
    await this.updateReportStatus(report.offlineId, 'syncing');

    try {
      // Check for conflicts
      const conflict = await this.detectConflicts(report);
      if (conflict) {
        report.conflictData = conflict;
        await this.updateReportStatus(report.offlineId, 'conflict');
        this.emit('conflict-detected', { report, conflict });
        return;
      }

      // Whoever wrote it, not the wallet: a wallet's key signs nothing this app
      // publishes (plan item 2.2). A report stored under the old 'offline-user'
      // placeholder takes the signer known now, or nobody. Sync runs on its own,
      // so it never creates an identity to name.
      const written = report.author && report.author !== 'offline-user' ? report.author : null;
      const author = written ?? nostrIdentityService.signerPubkey() ?? '';
      const created = await intelReportService.createReport({
        title: report.title,
        content: report.content,
        category: report.categories?.[0] || 'general',
        tags: report.tags,
        latitude: report.latitude,
        longitude: report.longitude
      }, author);

      // Update report with the canonical record it became. Goes through
      // saveOfflineReport (a plain upsert), not the public updateOfflineReport
      // — that method has its own status-clobbering logic ("flip synced ->
      // pending", presumably meant for later edits to an already-synced
      // report) that unconditionally overwrites whatever status is passed
      // in unless the report was already 'synced', which would have quietly
      // reset this same call back to 'syncing' forever.
      const updatedReport: OfflineIntelReport = {
        ...report,
        status: 'synced',
        lastModified: Date.now(),
        syncAttempts: report.syncAttempts + 1
      };

      await this.saveOfflineReport(updatedReport);

      log.debug('✅ Report synced successfully:', {
        offlineId: report.offlineId,
        reportId: created.id
      });

    } catch (error) {
      // Increment sync attempts
      const updatedReport: OfflineIntelReport = {
        ...report,
        syncAttempts: report.syncAttempts + 1,
        status: 'error',
        lastModified: Date.now()
      };

      await this.updateOfflineReport(report.offlineId, updatedReport);
      throw error;
    }
  }

  /**
   * Detect conflicts against the canonical Intel Report store (previously
   * checked the blockchain, via the same never-initialized Web3 service —
   * see syncSingleReport's comment).
   */
  private async detectConflicts(report: OfflineIntelReport): Promise<ConflictData | null> {
    try {
      const existingReports = await intelReportService.listReports();

      for (const existing of existingReports) {
        if (existing.latitude === undefined || existing.longitude === undefined) continue;

        // Check for coordinate conflicts (within 0.001 degrees)
        const latDiff = Math.abs(existing.latitude - report.latitude);
        const lngDiff = Math.abs(existing.longitude - report.longitude);

        if (latDiff < 0.001 && lngDiff < 0.001) {
          // Check content similarity
          const titleSimilarity = this.calculateSimilarity(existing.title, report.title);
          const contentSimilarity = this.calculateSimilarity(existing.content, report.content);

          const onchainReport: IntelReportData = {
            id: existing.id,
            title: existing.title,
            content: existing.content,
            tags: existing.tags,
            latitude: existing.latitude,
            longitude: existing.longitude,
            timestamp: existing.createdAt.getTime(),
            author: existing.author
          };

          if (titleSimilarity > 0.8 || contentSimilarity > 0.8) {
            return {
              type: 'duplicate',
              onchainReport,
              resolution: 'merge' // Default resolution
            };
          }

          if (titleSimilarity > 0.5 || contentSimilarity > 0.5) {
            return {
              type: 'coordinate_mismatch',
              onchainReport
            };
          }
        }
      }

      return null;
    } catch (error) {
      log.error('Error detecting conflicts:', error);
      return null;
    }
  }

  /**
   * Resolve a conflict
   */
  async resolveConflict(
    offlineId: string, 
    resolution: ConflictData['resolution']
  ): Promise<void> {
    const report = await this.getOfflineReport(offlineId);
    if (!report || !report.conflictData) {
      throw new Error('No conflict to resolve');
    }

    const conflictData: ConflictData = {
      ...report.conflictData,
      resolution,
      resolvedAt: Date.now(),
      resolvedBy: 'user'
    };

    let updatedReport: OfflineIntelReport;

    switch (resolution) {
      case 'merge':
        updatedReport = await this.mergeReports(report, report.conflictData.onchainReport!);
        break;
      
      case 'replace':
        updatedReport = {
          ...report,
          status: 'pending',
          conflictData: conflictData
        };
        break;
      
      case 'keep_both':
        // Keep offline report as separate entry
        updatedReport = {
          ...report,
          status: 'pending',
          conflictData: conflictData,
          title: `${report.title} (Offline Copy)`
        };
        break;
      
      default:
        throw new Error('Invalid resolution type');
    }

    await this.updateOfflineReport(offlineId, updatedReport);
    this.emit('conflict-resolved', { report: updatedReport, resolution: resolution || 'unknown' });
  }

  /**
   * Merge two reports intelligently
   */
  private async mergeReports(
    offlineReport: OfflineIntelReport,
    onchainReport: IntelReportData
  ): Promise<OfflineIntelReport> {
    // Intelligent merge logic
    const mergedReport: OfflineIntelReport = {
      ...offlineReport,
      
      // Use more recent content
      title: offlineReport.lastModified > onchainReport.timestamp 
        ? offlineReport.title 
        : onchainReport.title,
      
      content: offlineReport.lastModified > onchainReport.timestamp 
        ? offlineReport.content 
        : onchainReport.content,
      
      // Merge tags (unique)
      tags: [...new Set([...offlineReport.tags, ...onchainReport.tags])],
      
      // Use average coordinates if different
      latitude: (offlineReport.latitude + onchainReport.latitude) / 2,
      longitude: (offlineReport.longitude + onchainReport.longitude) / 2,
      
      // Use most recent timestamp
      timestamp: Math.max(offlineReport.timestamp, onchainReport.timestamp),
      
      // Keep offline metadata
      status: 'pending',
      lastModified: Date.now()
    };

    return mergedReport;
  }

  // =============================================================================
  // SETTINGS & CONFIGURATION
  // =============================================================================

  /**
   * Get sync settings
   */
  async getSyncSettings(): Promise<SyncSettings> {
    try {
      const settings = await secureStorage.getItem<SyncSettings>(
        OFFLINE_STORAGE_KEYS.SYNC_SETTINGS
      );
      return settings || this.getDefaultSyncSettings();
    } catch (error) {
      log.error('Failed to load sync settings:', error);
      return this.getDefaultSyncSettings();
    }
  }

  /**
   * Update sync settings
   */
  async updateSyncSettings(settings: Partial<SyncSettings>): Promise<void> {
    const currentSettings = await this.getSyncSettings();
    const updatedSettings = { ...currentSettings, ...settings };
    
    await secureStorage.setItem(
      OFFLINE_STORAGE_KEYS.SYNC_SETTINGS,
      updatedSettings
    );
  }

  /**
   * Get sync statistics
   */
  async getSyncStats(): Promise<SyncStats> {
    const reports = await this.getOfflineReports();
    
    return {
      totalOfflineReports: reports.length,
      pendingSync: reports.filter(r => r.status === 'pending').length,
      successfulSyncs: reports.filter(r => r.status === 'synced').length,
      failedSyncs: reports.filter(r => r.status === 'error').length,
      conflicts: reports.filter(r => r.status === 'conflict').length,
      lastSyncAttempt: await this.getLastSyncAttempt(),
      lastSuccessfulSync: await this.getLastSuccessfulSync()
    };
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Generate unique offline ID
   */
  private generateOfflineId(): string {
    return `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get device info
   */
  private getDeviceInfo(): string {
    return `${navigator.platform} | ${navigator.language} | ${screen.width}x${screen.height}`;
  }

  /**
   * Calculate text similarity
   */
  private calculateSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;
    
    // Simple similarity calculation (can be improved with more sophisticated algorithms)
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    const intersection = words1.filter(word => words2.includes(word));
    const union = [...new Set([...words1, ...words2])];
    
    return intersection.length / union.length;
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Save offline reports
   */
  private async saveOfflineReports(reports: OfflineIntelReport[]): Promise<void> {
    await secureStorage.setItem(
      OFFLINE_STORAGE_KEYS.OFFLINE_REPORTS,
      reports
    );
  }

  /**
   * Save single offline report
   */
  private async saveOfflineReport(report: OfflineIntelReport): Promise<void> {
    const reports = await this.getOfflineReports();
    const existingIndex = reports.findIndex(r => r.offlineId === report.offlineId);
    
    if (existingIndex >= 0) {
      reports[existingIndex] = report;
    } else {
      reports.push(report);
    }
    
    await this.saveOfflineReports(reports);
  }

  /**
   * Update report status
   */
  private async updateReportStatus(offlineId: string, status: OfflineReportStatus): Promise<void> {
    const reports = await this.getOfflineReports();
    const reportIndex = reports.findIndex(r => r.offlineId === offlineId);
    
    if (reportIndex >= 0) {
      reports[reportIndex] = {
        ...reports[reportIndex],
        status,
        lastModified: Date.now()
      };
      await this.saveOfflineReports(reports);
    }
  }

  /**
   * Get default sync settings
   */
  private getDefaultSyncSettings(): SyncSettings {
    return {
      conflictResolution: 'ask',
      maxRetries: 3,
      retryDelay: 5000,
      batchSize: 5
    };
  }

  /**
   * Initialize default settings
   */
  private async initializeDefaultSettings(): Promise<void> {
    const settings = await this.getSyncSettings();
    if (!settings) {
      await this.updateSyncSettings(this.getDefaultSyncSettings());
    }
  }

  /**
   * Update sync timestamp
   */
  private async updateSyncTimestamp(): Promise<void> {
    await secureStorage.setItem('last_sync_timestamp', Date.now());
  }

  /**
   * Get last sync attempt
   */
  private async getLastSyncAttempt(): Promise<number | undefined> {
    return await secureStorage.getItem<number>('last_sync_timestamp');
  }

  /**
   * Get last successful sync
   */
  private async getLastSuccessfulSync(): Promise<number | undefined> {
    return await secureStorage.getItem<number>('last_successful_sync');
  }

  // =============================================================================
  // EVENT SYSTEM
  // =============================================================================

  /**
   * Add event listener
   */
  on<K extends keyof OfflineIntelServiceEvents>(
    event: K,
    listener: (data: OfflineIntelServiceEvents[K]) => void
  ): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    
    this.eventListeners.get(event)!.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.eventListeners.get(event)?.delete(listener);
    };
  }

  /**
   * Emit event
   */
  private emit<K extends keyof OfflineIntelServiceEvents>(
    event: K,
    data: OfflineIntelServiceEvents[K]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          log.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Clear all offline data (for testing/reset)
   */
  async clearAllOfflineData(): Promise<void> {
    await secureStorage.removeItem(OFFLINE_STORAGE_KEYS.OFFLINE_REPORTS);
    await secureStorage.removeItem(OFFLINE_STORAGE_KEYS.SYNC_QUEUE);
    await secureStorage.removeItem(OFFLINE_STORAGE_KEYS.SYNC_SETTINGS);
    await secureStorage.removeItem(OFFLINE_STORAGE_KEYS.CONFLICT_RESOLUTION);
    await secureStorage.removeItem('last_sync_timestamp');
    await secureStorage.removeItem('last_successful_sync');
    
    log.debug('🗑️ All offline intel report data cleared');
  }
}

// Export singleton instance
export const offlineIntelReportService = OfflineIntelReportService.getInstance();

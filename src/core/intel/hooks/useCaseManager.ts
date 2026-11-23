/**
 * useCaseManager - Hook for Case Manager data with IntelDataCore
 * 
 * This hook provides access to Case Manager data from IntelDataCore
 * for use in React components.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  caseManagerAdapter, 
  CaseItem,
  CaseStats,
  CaseFilter
} from '../adapters/caseManagerAdapter';
import type { CaseSourceInput, CaseVerdict } from '../../../types/intel/IntelCaseUI';
import { 
  CaseRecord, 
  Collaborator, 
  CaseComment, 
  ActivityLogEntry 
} from '../types/intelDataModels';
import { enhancedEventEmitter } from '../events/enhancedEventEmitter';
import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'useCaseManager' });

export interface UseCaseManagerResult {
  // Case data
  cases: CaseItem[];
  selectedCase: CaseItem | null;
  stats: CaseStats;
  loading: boolean;
  error: string | null;
  
  // Actions
  applyFilters: (filters: CaseFilter[]) => Promise<void>;
  refreshData: () => Promise<void>;
  selectCase: (id: string | null) => Promise<void>;
  addCase: (caseData: Partial<CaseRecord>) => Promise<string | null>;
  updateCase: (id: string, updates: Partial<CaseRecord>, actorId?: string) => Promise<boolean>;
  deleteCase: (id: string) => Promise<boolean>;
  /** Plaintext for a CONFIDENTIAL+ case; null when the key is missing. */
  decryptCaseDescription: (caseId: string) => Promise<string | null>;
  linkEntitiesToCase: (caseId: string, entityIds: string[]) => Promise<boolean>;
  unlinkEntitiesFromCase: (caseId: string, entityIds: string[]) => Promise<boolean>;
  /** Records what argues AGAINST a case, kept separate from its supporting evidence. */
  linkContradictionsToCase: (caseId: string, entityIds: string[]) => Promise<boolean>;
  raiseRequirement: (caseId: string, question: string, because: string, staleAfter?: string, field?: { modality?: readonly string[]; geohash?: string }) => Promise<string | null>;
  /** The articles a case rests on (D-DP, DP7): adds them, returning how many were; takes one off. */
  addSources: (caseId: string, sources: readonly CaseSourceInput[]) => Promise<number>;
  removeSource: (caseId: string, url: string) => Promise<boolean>;
  answerRequirement: (caseId: string, requirementId: string, reportId: string) => Promise<boolean>;
  closeRequirement: (caseId: string, requirementId: string, reason: string) => Promise<boolean>;
  claimRequirement: (caseId: string, requirementId: string, claim: boolean) => Promise<boolean>;
  /** Record what a case concludes. Its method is the case itself. */
  statePosition: (caseId: string, statement: string, verdict: CaseVerdict, addressed?: Record<string, string>) => Promise<boolean>;
  unlinkContradictionsFromCase: (caseId: string, entityIds: string[]) => Promise<boolean>;
  linkCases: (sourceCaseId: string, targetCaseIds: string[]) => Promise<boolean>;
  
  // Collaboration features
  addCollaborator: (caseId: string, collaborator: Omit<Collaborator, 'addedAt'>) => Promise<boolean>;
  removeCollaborator: (caseId: string, userId: string, removedBy: string) => Promise<boolean>;
  addComment: (caseId: string, comment: Omit<CaseComment, 'id' | 'createdAt'>) => Promise<string | null>;
  updateComment: (caseId: string, commentId: string, updates: Partial<Omit<CaseComment, 'id' | 'createdAt' | 'createdBy'>>) => Promise<boolean>;
  deleteComment: (caseId: string, commentId: string, deletedBy: string) => Promise<boolean>;
  generateSharingToken: (caseId: string, generatedBy: string, expiresInHours?: number) => Promise<string | null>;
  revokeSharingToken: (caseId: string, revokedBy: string) => Promise<boolean>;
  getActivityLog: (caseId: string) => Promise<ActivityLogEntry[]>;
}

/**
 * Hook for accessing and manipulating Case Manager data
 */
export function useCaseManager(initialFilters: CaseFilter[] = []): UseCaseManagerResult {
  const [cases, setCases] = useState<CaseItem[]>([]);
  /**
   * Only the id is kept; the case itself is read from the list.
   *
   * This held a copy of the case, and loadData both depended on that copy and
   * wrote a fresh one back — so selecting a case changed loadData, which re-ran
   * the load effect, which wrote another copy, forever. Every turn raised the
   * shared loading flag, and the dashboard's table became a spinner the moment
   * anyone clicked a row. Read from the list, the case is also never older than
   * the list, and a case that leaves the list is no longer selected.
   */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedCase = useMemo(
    () => (selectedId ? cases.find((c) => c.id === selectedId) ?? null : null),
    [cases, selectedId]
  );
  const [stats, setStats] = useState<CaseStats>({
    totalCases: 0,
    openCases: 0,
    onHoldCases: 0,
    closedCases: 0,
    byStatus: {
      NEW: 0,
      OPEN: 0,
      IN_PROGRESS: 0,
      PENDING: 0,
      RESOLVED: 0,
      CLOSED: 0
    },
    byPriority: {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0
    },
    avgTimeToClose: 0,
    recentActivity: {
      created: 0,
      updated: 0,
      closed: 0
    }
  });
  const [filters, setFilters] = useState<CaseFilter[]>(initialFilters);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Keep track of event listeners to clean them up
  const eventListeners = useRef<Array<{ unsubscribe: () => void }>>([]);
  
  /**
   * Load case data based on current filters
   */
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch cases
      const casesData = await caseManagerAdapter.getCases(filters);
      setCases(casesData);
      
      // Fetch case statistics
      const statsData = await caseManagerAdapter.getCaseStats(filters);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred loading case data');
      log.error('Error loading Case Manager data:', err);
    } finally {
      setLoading(false);
    }
  }, [filters]);
  
  /**
   * Set up real-time event listeners
   */
  const setupEventListeners = useCallback(() => {
    // Clean up any existing listeners
    eventListeners.current.forEach(listener => listener.unsubscribe());
    eventListeners.current = [];
    
    // Listen for case created events
    const createdListener = enhancedEventEmitter.on('case:created', (event) => {
      setCases(prevCases => {
        // Make sure we don't add duplicates
        const exists = prevCases.some(c => c.id === event.caseId);
        if (exists) {
          return prevCases;
        }
        
        // Add the new case if it matches our filters
        // In a real implementation, we would check the filters here
        return [...prevCases, event.case];
      });
      
      // If stats need updating, do it here or refresh them
      loadData();
    });
    
    // Listen for case updated events
    const updatedListener = enhancedEventEmitter.on('case:updated', (event) => {
      setCases(prevCases => {
        // Replace the updated case
        return prevCases.map(c => 
          c.id === event.caseId ? event.case : c
        );
      });
      
      // Update stats if necessary
      loadData();
    });
    
    // Listen for case deleted events
    const deletedListener = enhancedEventEmitter.on('case:deleted', (event) => {
      setCases(prevCases => {
        // Remove the deleted case
        return prevCases.filter(c => c.id !== event.caseId);
      });
      
      // Update stats if necessary
      loadData();
    });
    
    // Store listeners for cleanup
    eventListeners.current.push(createdListener);
    eventListeners.current.push(updatedListener);
    eventListeners.current.push(deletedListener);
  }, [loadData]);
  
  /**
   * Apply new filters and reload data
   */
  const applyFilters = useCallback(async (newFilters: CaseFilter[]) => {
    setFilters(newFilters);
  }, []);
  
  /**
   * Select a case by ID. It touches neither the store nor the shared loading
   * flag: the case is already in the list, and a case outside the current
   * filters reads as not selected.
   */
  const selectCase = useCallback(async (id: string | null) => {
    setSelectedId(id);
  }, []);
  
  /**
   * Add a new case
   */
  const addCase = useCallback(async (caseData: Partial<CaseRecord>) => {
    try {
      const caseId = await caseManagerAdapter.addCase(caseData);
      if (caseId) {
        // Refresh data after adding the case
        await loadData();
      }
      return caseId;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred adding a case');
      log.error('Error adding case:', err);
      return null;
    }
  }, [loadData]);
  
  /**
   * Update an existing case
   */
  const updateCase = useCallback(async (id: string, updates: Partial<CaseRecord>, actorId?: string) => {
    try {
      const success = await caseManagerAdapter.updateCase(id, updates, actorId);
      if (success) {
        // Refresh data after updating the case
        await loadData();
      }
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred updating a case');
      log.error('Error updating case:', err);
      return false;
    }
  }, [loadData]);
  
  /**
   * Delete a case
   */
  const deleteCase = useCallback(async (id: string) => {
    try {
      const success = await caseManagerAdapter.deleteCase(id);
      if (success) {
        // Refresh data after deleting the case
        await loadData();
      }
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred deleting a case');
      log.error('Error deleting case:', err);
      return false;
    }
  }, [loadData]);
  
  /**
   * Recover a classified case's description. Deliberately does NOT set the
   * shared error state on failure: a missing key is an expected condition the
   * caller has to present in place, not a screen-level failure.
   */
  const decryptCaseDescription = useCallback(async (caseId: string) => {
    try {
      return await caseManagerAdapter.decryptCaseDescription(caseId);
    } catch {
      return null;
    }
  }, []);

  const unlinkEntitiesFromCase = useCallback(async (caseId: string, entityIds: string[]) => {
    try {
      const success = await caseManagerAdapter.unlinkEntitiesFromCase(caseId, entityIds);
      if (success) await loadData();
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred unlinking entities from case');
      return false;
    }
  }, [loadData]);

  /**
   * Record what the case concluded.
   *
   * `verdict` is not optional and has no default. A default would be one of
   * three real outcomes applied silently on the adjudicator's behalf, and
   * whichever was chosen would be wrong some of the time without anyone
   * noticing it had been chosen at all.
   */
  const statePosition = useCallback(async (
    caseId: string,
    statement: string,
    verdict: CaseVerdict,
    addressed?: Record<string, string>,
  ) => {
    try {
      const success = await caseManagerAdapter.statePosition(caseId, statement, verdict, addressed);
      if (success) await loadData();
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred recording the position');
      return false;
    }
  }, [loadData]);

  const raiseRequirement = useCallback(async (
    caseId: string, question: string, because: string, staleAfter?: string,
    field?: { modality?: readonly string[]; geohash?: string },
  ) => {
    try {
      const id = await caseManagerAdapter.raiseRequirement(caseId, question, because, staleAfter, field);
      if (id) await loadData();
      return id;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred raising the requirement');
      return null;
    }
  }, [loadData]);

  const addSources = useCallback(async (caseId: string, sources: readonly CaseSourceInput[]) => {
    try {
      const added = await caseManagerAdapter.addSources(caseId, sources);
      if (added) await loadData();
      return added;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred adding the source');
      return 0;
    }
  }, [loadData]);

  const removeSource = useCallback(async (caseId: string, url: string) => {
    try {
      const removed = await caseManagerAdapter.removeSource(caseId, url);
      if (removed) await loadData();
      return removed;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred removing the source');
      return false;
    }
  }, [loadData]);

  const answerRequirement = useCallback(async (caseId: string, requirementId: string, reportId: string) => {
    try {
      const success = await caseManagerAdapter.answerRequirement(caseId, requirementId, reportId);
      if (success) await loadData();
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred linking the answer');
      return false;
    }
  }, [loadData]);

  const claimRequirement = useCallback(async (caseId: string, requirementId: string, claim: boolean) => {
    try {
      const success = await caseManagerAdapter.claimRequirement(caseId, requirementId, claim);
      if (success) await loadData();
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred updating the claim');
      return false;
    }
  }, [loadData]);

  const closeRequirement = useCallback(async (caseId: string, requirementId: string, reason: string) => {
    try {
      const success = await caseManagerAdapter.closeRequirement(caseId, requirementId, reason);
      if (success) await loadData();
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred closing the requirement');
      return false;
    }
  }, [loadData]);

  const linkContradictionsToCase = useCallback(async (caseId: string, entityIds: string[]) => {
    try {
      const success = await caseManagerAdapter.linkContradictionsToCase(caseId, entityIds);
      if (success) await loadData();
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred recording a contradiction');
      return false;
    }
  }, [loadData]);

  const unlinkContradictionsFromCase = useCallback(async (caseId: string, entityIds: string[]) => {
    try {
      const success = await caseManagerAdapter.unlinkContradictionsFromCase(caseId, entityIds);
      if (success) await loadData();
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred removing a contradiction');
      return false;
    }
  }, [loadData]);

  const linkEntitiesToCase = useCallback(async (caseId: string, entityIds: string[]) => {
    try {
      const success = await caseManagerAdapter.linkEntitiesToCase(caseId, entityIds);
      if (success) {
        // Refresh data after linking entities
        await loadData();
      }
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred linking entities to case');
      log.error('Error linking entities:', err);
      return false;
    }
  }, [loadData]);
  
  /**
   * Link cases together
   */
  const linkCases = useCallback(async (sourceCaseId: string, targetCaseIds: string[]) => {
    try {
      const success = await caseManagerAdapter.linkCases(sourceCaseId, targetCaseIds);
      if (success) {
        // Refresh data after linking cases
        await loadData();
      }
      return success;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred linking cases');
      log.error('Error linking cases:', err);
      return false;
    }
  }, [loadData]);
  
  /**
   * Add a collaborator to a case
   */
  const addCollaborator = useCallback(async (
    caseId: string, 
    collaborator: Omit<Collaborator, 'addedAt'>
  ): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await caseManagerAdapter.addCollaborator(caseId, collaborator);
      
      if (result) {
        // Refresh all case data
        await loadData();
      }
      
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred adding collaborator');
      log.error('Error adding collaborator:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadData]);
  
  /**
   * Remove a collaborator from a case
   */
  const removeCollaborator = useCallback(async (
    caseId: string, 
    userId: string, 
    removedBy: string
  ): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await caseManagerAdapter.removeCollaborator(caseId, userId, removedBy);
      
      if (result) {
        // Refresh all case data
        await loadData();
      }
      
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred removing collaborator');
      log.error('Error removing collaborator:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadData]);
  
  /**
   * Add a comment to a case
   */
  const addComment = useCallback(async (
    caseId: string, 
    comment: Omit<CaseComment, 'id' | 'createdAt'>
  ): Promise<string | null> => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await caseManagerAdapter.addComment(caseId, comment);
      
      if (result) {
        // Refresh all case data
        await loadData();
      }
      
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred adding comment');
      log.error('Error adding comment:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadData]);
  
  /**
   * Update a comment on a case
   */
  const updateComment = useCallback(async (
    caseId: string, 
    commentId: string, 
    updates: Partial<Omit<CaseComment, 'id' | 'createdAt' | 'createdBy'>>
  ): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await caseManagerAdapter.updateComment(caseId, commentId, updates);
      
      if (result) {
        // Refresh all case data
        await loadData();
      }
      
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred updating comment');
      log.error('Error updating comment:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadData]);
  
  /**
   * Delete a comment from a case
   */
  const deleteComment = useCallback(async (
    caseId: string, 
    commentId: string, 
    deletedBy: string
  ): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await caseManagerAdapter.deleteComment(caseId, commentId, deletedBy);
      
      if (result) {
        // Refresh all case data
        await loadData();
      }
      
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred deleting comment');
      log.error('Error deleting comment:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadData]);
  
  
  /**
   * Generate a sharing token for external access
   */
  const generateSharingToken = useCallback(async (
    caseId: string, 
    generatedBy: string,
    expiresInHours: number = 24
  ): Promise<string | null> => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await caseManagerAdapter.generateSharingToken(caseId, generatedBy, expiresInHours);
      
      if (result) {
        // Refresh all case data
        await loadData();
      }
      
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred generating sharing token');
      log.error('Error generating sharing token:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadData]);
  
  /**
   * Revoke a sharing token
   */
  const revokeSharingToken = useCallback(async (
    caseId: string, 
    revokedBy: string
  ): Promise<boolean> => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await caseManagerAdapter.revokeSharingToken(caseId, revokedBy);
      
      if (result) {
        // Refresh all case data
        await loadData();
      }
      
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred revoking sharing token');
      log.error('Error revoking sharing token:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [loadData]);
  
  /**
   * Get activity log for a case
   */
  const getActivityLog = useCallback(async (
    caseId: string
  ): Promise<ActivityLogEntry[]> => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await caseManagerAdapter.getActivityLog(caseId);
      
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred getting activity log');
      log.error('Error getting activity log:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);
  
  /**
   * Load data when component mounts or filters change
   */
  useEffect(() => {
    loadData();
  }, [loadData, filters]);
  
  /**
   * Set up event listeners when component mounts
   */
  useEffect(() => {
    setupEventListeners();
    
    // Clean up event listeners when component unmounts
    return () => {
      eventListeners.current.forEach(listener => listener.unsubscribe());
      eventListeners.current = [];
    };
  }, [setupEventListeners]);
  
  return {
    cases,
    selectedCase,
    stats,
    loading,
    error,
    applyFilters,
    refreshData: loadData,
    selectCase,
    addCase,
    updateCase,
    deleteCase,
    decryptCaseDescription,
    linkEntitiesToCase,
    linkContradictionsToCase,
    statePosition,
    raiseRequirement,
    addSources,
    removeSource,
    answerRequirement,
    closeRequirement,
    claimRequirement,
    unlinkContradictionsFromCase,
    unlinkEntitiesFromCase,
    linkCases,
    addCollaborator,
    removeCollaborator,
    addComment,
    updateComment,
    deleteComment,
    generateSharingToken,
    revokeSharingToken,
    getActivityLog
  };
}

export default useCaseManager;

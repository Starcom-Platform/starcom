/**
 * Unit tests for CacheManager integration with StorageOrchestrator
 */

import { storageOrchestrator } from '../storage/storageOrchestrator';
import { cacheManager } from '../storage/cacheManager';
import { intelDataStore } from '../store/intelDataStore';
import { indexedDBAdapter } from '../storage/indexedDBAdapter';
import { NodeEntity, TimelineEvent } from '../types/intelDataModels';
import { enhancedEventEmitter } from '../events/enhancedEventEmitter';
import { vi } from 'vitest';

// Mock dependencies
vi.mock('../storage/cacheManager');
vi.mock('../store/intelDataStore');
vi.mock('../storage/indexedDBAdapter');
vi.mock('../events/enhancedEventEmitter');

describe('StorageOrchestrator with CacheManager', () => {
  // Sample test entities
  const testNode: NodeEntity = {
    id: 'test-node-1',
    type: 'node',
    label: 'Test Node',
    properties: { key: 'value' },
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z'
  };
  
  const testEvent: TimelineEvent = {
    id: 'test-event-1',
    type: 'timeline_event',
    title: 'Test Event',
    description: 'Test event description',
    timestamp: '2025-01-01T00:00:00.000Z',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z'
  };
  
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Mock intelDataStore methods
    (intelDataStore.createEntity as vi.Mock).mockResolvedValue({
      success: true,
      data: testNode
    });
    
    (intelDataStore.getEntity as vi.Mock).mockResolvedValue({
      success: true,
      data: testNode
    });
    
    (intelDataStore.updateEntity as vi.Mock).mockResolvedValue({
      success: true,
      data: { ...testNode, properties: { key: 'updated' } }
    });
    
    (intelDataStore.deleteEntity as vi.Mock).mockResolvedValue({
      success: true
    });
    
    (intelDataStore.queryEntities as vi.Mock).mockResolvedValue({
      success: true,
      data: [testNode, testEvent]
    });
    
    // Mock indexedDBAdapter methods
    (indexedDBAdapter.initialize as vi.Mock).mockResolvedValue(true);
    
    (indexedDBAdapter.storeEntity as vi.Mock).mockResolvedValue({
      success: true
    });
    
    (indexedDBAdapter.getEntity as vi.Mock).mockResolvedValue({
      success: true,
      data: testNode
    });
    
    (indexedDBAdapter.deleteEntity as vi.Mock).mockResolvedValue({
      success: true
    });
    
    (indexedDBAdapter.queryEntities as vi.Mock).mockResolvedValue({
      success: true,
      data: [testNode, testEvent]
    });
    
    // Mock cacheManager methods
    (cacheManager.cacheEntity as vi.Mock).mockImplementation(() => {});
    (cacheManager.getEntity as vi.Mock).mockReturnValue(null);
    (cacheManager.delete as vi.Mock).mockImplementation(() => {});
    (cacheManager.cacheQueryResult as vi.Mock).mockImplementation(() => {});
    (cacheManager.getQueryResult as vi.Mock).mockReturnValue(null);
    
    // Mock enhancedEventEmitter
    (enhancedEventEmitter.emit as vi.Mock).mockImplementation(() => {});
  });
  
  describe('storeEntity', () => {
    it('should cache entities when storing them', async () => {
      const result = await storageOrchestrator.storeEntity(testNode);
      
      expect(result.success).toBe(true);
      expect(cacheManager.cacheEntity).toHaveBeenCalledWith(testNode);
      // storageOrchestrator emits a single DataEvent object (with a `topic` field),
      // not the (topic, payload) two-argument form.
      expect(enhancedEventEmitter.emit).toHaveBeenCalledWith(expect.objectContaining({
        topic: 'entity:created',
        entityId: testNode.id,
        entityType: testNode.type
      }));
    });
  });
  
  describe('getEntity', () => {
    it('should retrieve from cache when available', async () => {
      // Setup cache hit
      (cacheManager.getEntity as vi.Mock).mockReturnValueOnce(testNode);
      
      const result = await storageOrchestrator.getEntity(testNode.id);
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(testNode);
      expect(intelDataStore.getEntity).not.toHaveBeenCalled();
      expect(indexedDBAdapter.getEntity).not.toHaveBeenCalled();
    });
    
    it('should retrieve from memory and cache when not in cache', async () => {
      const result = await storageOrchestrator.getEntity(testNode.id);
      
      expect(result.success).toBe(true);
      expect(cacheManager.cacheEntity).toHaveBeenCalledWith(testNode);
      expect(intelDataStore.getEntity).toHaveBeenCalledWith(testNode.id);
    });
    
    it('should retrieve from persistent storage and cache when not in memory', async () => {
      // Setup memory miss
      (intelDataStore.getEntity as vi.Mock).mockResolvedValueOnce({
        success: false,
        error: 'Not found in memory'
      });
      
      const result = await storageOrchestrator.getEntity(testNode.id);
      
      expect(result.success).toBe(true);
      expect(indexedDBAdapter.getEntity).toHaveBeenCalledWith(testNode.id);
      expect(cacheManager.cacheEntity).toHaveBeenCalledWith(testNode);
    });
  });
  
  describe('updateEntity', () => {
    it('should update cache when entity is updated', async () => {
      const updates = { properties: { key: 'updated' } };
      const updatedNode = { ...testNode, ...updates };
      
      (intelDataStore.updateEntity as vi.Mock).mockResolvedValueOnce({
        success: true,
        data: updatedNode
      });
      
      const result = await storageOrchestrator.updateEntity(testNode.id, updates);
      
      expect(result.success).toBe(true);
      expect(cacheManager.cacheEntity).toHaveBeenCalledWith(updatedNode);
      // storageOrchestrator emits a single DataEvent object (with a `topic` field),
      // not the (topic, payload) two-argument form.
      expect(enhancedEventEmitter.emit).toHaveBeenCalledWith(expect.objectContaining({
        topic: 'entity:updated',
        entityId: testNode.id,
        entityType: testNode.type
      }));
    });
  });
  
  describe('deleteEntity', () => {
    it('should remove entity from cache when deleted', async () => {
      const result = await storageOrchestrator.deleteEntity(testNode.id);
      
      expect(result.success).toBe(true);
      expect(cacheManager.delete).toHaveBeenCalledWith(`entity:${testNode.id}`);
      expect(cacheManager.delete).toHaveBeenCalledWith(`entity:${testNode.type}:${testNode.id}`);
      // storageOrchestrator emits a single DataEvent object (with a `topic` field),
      // not the (topic, payload) two-argument form.
      expect(enhancedEventEmitter.emit).toHaveBeenCalledWith(expect.objectContaining({
        topic: 'entity:deleted',
        entityId: testNode.id,
        entityType: testNode.type
      }));
    });
  });
  
  describe('queryEntities', () => {
    it('should use cached query results when available', async () => {
      // Setup cache hit
      const cachedResults = [testNode];
      (cacheManager.getQueryResult as vi.Mock).mockReturnValueOnce(cachedResults);
      
      const result = await storageOrchestrator.queryEntities({ types: ['node'] });
      
      expect(result.success).toBe(true);
      expect(result.data).toEqual(cachedResults);
      expect(intelDataStore.queryEntities).not.toHaveBeenCalled();
      expect(indexedDBAdapter.queryEntities).not.toHaveBeenCalled();
    });
    
    it('should cache query results from memory', async () => {
      const queryOptions = { types: ['node'] };
      const queryResult = [testNode];
      
      (intelDataStore.queryEntities as vi.Mock).mockResolvedValueOnce({
        success: true,
        data: queryResult
      });
      
      const result = await storageOrchestrator.queryEntities(queryOptions);
      
      expect(result.success).toBe(true);
      expect(cacheManager.cacheQueryResult).toHaveBeenCalledWith(queryOptions, queryResult);
    });
    
    it('should bypass cache when forceRefresh is true', async () => {
      const queryOptions = { types: ['node'], forceRefresh: true };
      
      await storageOrchestrator.queryEntities(queryOptions);
      
      expect(cacheManager.getQueryResult).not.toHaveBeenCalled();
      expect(intelDataStore.queryEntities).toHaveBeenCalledWith(queryOptions);
    });
  });
  
  describe('close', () => {
    it('should dispose of cacheManager resources on close', async () => {
      await storageOrchestrator.close();
      
      expect(cacheManager.dispose).toHaveBeenCalled();
      expect(indexedDBAdapter.close).toHaveBeenCalled();
    });
  });
});

/**
 * Unit tests for StorageOrchestrator
 */

// @ts-ignore - Mock setup ignores TypeScript checking
import { storageOrchestrator, Transaction, TransactionStatus } from '../storage/storageOrchestrator';
// @ts-ignore - Mock setup ignores TypeScript checking
import { intelDataStore } from '../store/intelDataStore';
// @ts-ignore - Mock setup ignores TypeScript checking
import { indexedDBAdapter } from '../storage/indexedDBAdapter';
// @ts-ignore - Mock setup ignores TypeScript checking
import { operationTracker } from '../performance/operationTracker';
import { NodeEntity, StorageResult, NodeType } from '../types/intelDataModels';
import { vi } from 'vitest';

// We're using TypeScript without Jest types, so define types for test functions
declare global {
  function describe(name: string, fn: () => void): void;
  function beforeEach(fn: () => void): void;
  function it(name: string, fn: () => Promise<void> | void): void;
  function expect<T>(value: T): any;
  namespace jest {
    function fn(): any;
    function clearAllMocks(): void;
    function mock(path: string, factory?: () => any): void;
  }
}

// Mock dependencies
vi.mock('../store/intelDataStore', () => ({
  intelDataStore: {
    createEntity: vi.fn(),
    getEntity: vi.fn(),
    updateEntity: vi.fn(),
    deleteEntity: vi.fn(),
    createRelationship: vi.fn(),
    getRelationships: vi.fn(),
    queryEntities: vi.fn()
  }
}));

vi.mock('../storage/indexedDBAdapter', () => ({
  indexedDBAdapter: {
    initialize: vi.fn(),
    storeEntity: vi.fn(),
    getEntity: vi.fn(),
    deleteEntity: vi.fn(),
    storeRelationship: vi.fn(),
    getRelationships: vi.fn(),
    queryEntities: vi.fn(),
    close: vi.fn()
  }
}));

vi.mock('../storage/cacheManager', () => ({
  cacheManager: {
    cacheEntity: vi.fn(),
    getEntity: vi.fn(),
    cacheQueryResult: vi.fn(),
    getQueryResult: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('../performance/operationTracker', () => ({
  operationTracker: {
    startOperation: vi.fn().mockReturnValue('test-operation-id'),
    endOperation: vi.fn(),
    trackEntityAccess: vi.fn(),
    optimizeQuery: vi.fn().mockReturnValue(null)
  }
}));

describe('StorageOrchestrator', () => {
  // Reset mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();

    // storageOrchestrator is a module-level singleton, so its private `initialized`
    // flag persists across tests unless reset here — otherwise, once any earlier
    // test successfully initializes it, every later initialize() call short-circuits
    // and returns true without ever touching the (freshly re-mocked) indexedDBAdapter.
    (storageOrchestrator as any).initialized = false;

    // Setup default mock returns
    (indexedDBAdapter.initialize as any).mockResolvedValue(true);
  });
  
  describe('Transaction', () => {
    it('should create a transaction with pending status', () => {
      const transaction = new Transaction();
      expect(transaction.getStatus()).toBe(TransactionStatus.PENDING);
    });
    
    it('should commit a transaction successfully', async () => {
      const transaction = new Transaction();
      
      const operation = vi.fn().mockResolvedValue(undefined);
      const rollback = vi.fn().mockResolvedValue(undefined);
      
      transaction.addOperation(operation, rollback);
      
      await transaction.commit();
      
      expect(operation).toHaveBeenCalledTimes(1);
      expect(rollback).not.toHaveBeenCalled();
      expect(transaction.getStatus()).toBe(TransactionStatus.COMMITTED);
    });
    
    it('should rollback a transaction on error', async () => {
      const transaction = new Transaction();
      
      const operation1 = vi.fn().mockResolvedValue(undefined);
      const rollback1 = vi.fn().mockResolvedValue(undefined);
      
      const operation2 = vi.fn().mockRejectedValue(new Error('Test error'));
      const rollback2 = vi.fn().mockResolvedValue(undefined);
      
      transaction.addOperation(operation1, rollback1);
      transaction.addOperation(operation2, rollback2);
      
      await expect(transaction.commit()).rejects.toThrow('Test error');
      
      expect(operation1).toHaveBeenCalledTimes(1);
      expect(operation2).toHaveBeenCalledTimes(1);
      expect(rollback1).toHaveBeenCalledTimes(1);
      expect(rollback2).toHaveBeenCalledTimes(1);
      expect(transaction.getStatus()).toBe(TransactionStatus.ROLLED_BACK);
    });
    
    it('should execute rollbacks in reverse order', async () => {
      const transaction = new Transaction();
      
      const rollbacks: string[] = [];
      
      const operation1 = vi.fn().mockResolvedValue(undefined);
      const rollback1 = vi.fn().mockImplementation(() => {
        rollbacks.push('rollback1');
        return Promise.resolve();
      });
      
      const operation2 = vi.fn().mockResolvedValue(undefined);
      const rollback2 = vi.fn().mockImplementation(() => {
        rollbacks.push('rollback2');
        return Promise.resolve();
      });
      
      const operation3 = vi.fn().mockRejectedValue(new Error('Test error'));
      const rollback3 = vi.fn().mockImplementation(() => {
        rollbacks.push('rollback3');
        return Promise.resolve();
      });
      
      transaction.addOperation(operation1, rollback1);
      transaction.addOperation(operation2, rollback2);
      transaction.addOperation(operation3, rollback3);
      
      await expect(transaction.commit()).rejects.toThrow('Test error');
      
      // Should rollback in reverse order
      expect(rollbacks).toEqual(['rollback3', 'rollback2', 'rollback1']);
    });
  });
  
  describe('initialize', () => {
    it('should initialize the IndexedDB adapter', async () => {
      const result = await storageOrchestrator.initialize();
      
      expect(indexedDBAdapter.initialize).toHaveBeenCalledTimes(1);
      expect(result).toBe(true);
    });
    
    it('should return false if IndexedDB initialization fails', async () => {
      (indexedDBAdapter.initialize as any).mockResolvedValue(false);
      
      const result = await storageOrchestrator.initialize();
      
      expect(result).toBe(false);
    });
    
    it('should handle initialization errors', async () => {
      (indexedDBAdapter.initialize as any).mockRejectedValue(new Error('Test error'));
      
      const result = await storageOrchestrator.initialize();
      
      expect(result).toBe(false);
    });
  });
  
  describe('storeEntity', () => {
    it('should store an entity in memory and persistent storage', async () => {
      const testEntity: Partial<NodeEntity> = {
        id: 'test-id',
        type: 'ip',
        title: 'Test Entity',
        value: '192.168.1.1',
        tags: ['test', 'ip']
      } as Partial<NodeEntity>;
      
      const memoryResult: StorageResult<NodeEntity> = {
        success: true,
        data: testEntity as NodeEntity
      };
      
      const persistResult: StorageResult<NodeEntity> = {
        success: true
      };
      
      (intelDataStore.createEntity as any).mockResolvedValue(memoryResult);
      (indexedDBAdapter.storeEntity as any).mockResolvedValue(persistResult);
      
      const result = await storageOrchestrator.storeEntity(testEntity);
      
      expect(intelDataStore.createEntity).toHaveBeenCalledWith(testEntity);
      expect(indexedDBAdapter.storeEntity).toHaveBeenCalledWith(testEntity, undefined);
      expect(result.success).toBe(true);
      expect(result.data).toBe(testEntity);
    });
    
    it('should skip persistent storage if persistenceMode is none', async () => {
      const testEntity: Partial<NodeEntity> = {
        id: 'test-id',
        type: 'ip',
        title: 'Test Entity'
      } as Partial<NodeEntity>;
      
      const memoryResult: StorageResult<NodeEntity> = {
        success: true,
        data: testEntity as NodeEntity
      };
      
      (intelDataStore.createEntity as any).mockResolvedValue(memoryResult);
      
      const result = await storageOrchestrator.storeEntity(testEntity, { persistenceMode: 'none' });
      
      expect(intelDataStore.createEntity).toHaveBeenCalledWith(testEntity);
      expect(indexedDBAdapter.storeEntity).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
    
    it('should handle memory storage errors', async () => {
      const testEntity: Partial<NodeEntity> = {
        type: 'ip',
        title: 'Test Entity'
      } as Partial<NodeEntity>;
      
      const memoryResult: StorageResult<NodeEntity> = {
        success: false,
        error: 'Memory error'
      };
      
      (intelDataStore.createEntity as any).mockResolvedValue(memoryResult);
      
      const result = await storageOrchestrator.storeEntity(testEntity);
      
      expect(intelDataStore.createEntity).toHaveBeenCalledWith(testEntity);
      expect(indexedDBAdapter.storeEntity).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toBe('Memory error');
    });
    
    it('should handle persistent storage errors', async () => {
      const testEntity: Partial<NodeEntity> = {
        id: 'test-id',
        type: 'ip',
        title: 'Test Entity'
      } as Partial<NodeEntity>;
      
      const memoryResult: StorageResult<NodeEntity> = {
        success: true,
        data: testEntity as NodeEntity
      };
      
      const persistResult: StorageResult<NodeEntity> = {
        success: false,
        error: 'Persistence error'
      };
      
      (intelDataStore.createEntity as any).mockResolvedValue(memoryResult);
      (indexedDBAdapter.storeEntity as any).mockResolvedValue(persistResult);
      
      const result = await storageOrchestrator.storeEntity(testEntity);
      
      expect(intelDataStore.createEntity).toHaveBeenCalledWith(testEntity);
      expect(indexedDBAdapter.storeEntity).toHaveBeenCalledWith(testEntity, undefined);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Persistence error');
    });
  });
  
  describe('getEntity', () => {
    it('should get an entity from memory if available', async () => {
      const testEntity = {
        id: 'test-id',
        type: 'ip',
        title: 'Test Entity',
        description: 'Test description',
        source: 'test',
        verified: false,
        confidence: 75,
        nodeType: NodeType.IP_ADDRESS,
        properties: { ip: '192.168.1.1' },
        attachments: [],
        tags: ['test', 'ip'],
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
        createdBy: 'test-user',
        metadata: {}
      } as unknown as NodeEntity;
      
      const memoryResult: StorageResult<NodeEntity> = {
        success: true,
        data: testEntity
      };
      
      (intelDataStore.getEntity as any).mockResolvedValue(memoryResult);
      
      const result = await storageOrchestrator.getEntity('test-id');
      
      expect(intelDataStore.getEntity).toHaveBeenCalledWith('test-id');
      expect(indexedDBAdapter.getEntity).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.data).toBe(testEntity);
    });
    
    it('should get an entity from persistent storage if not in memory', async () => {
      const testEntity = {
        id: 'test-id',
        type: 'ip',
        title: 'Test Entity',
        description: 'Test description',
        source: 'test',
        verified: false,
        confidence: 75,
        nodeType: NodeType.IP_ADDRESS,
        properties: { ip: '192.168.1.1' },
        attachments: [],
        tags: ['test', 'ip'],
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
        createdBy: 'test-user',
        metadata: {}
      } as unknown as NodeEntity;
      
      const memoryResult: StorageResult<NodeEntity> = {
        success: false,
        error: 'Not found in memory'
      };
      
      const persistResult: StorageResult<NodeEntity> = {
        success: true,
        data: testEntity
      };
      
      (intelDataStore.getEntity as any).mockResolvedValue(memoryResult);
      (indexedDBAdapter.getEntity as any).mockResolvedValue(persistResult);
      
      const result = await storageOrchestrator.getEntity('test-id');
      
      expect(intelDataStore.getEntity).toHaveBeenCalledWith('test-id');
      expect(indexedDBAdapter.getEntity).toHaveBeenCalledWith('test-id');
      expect(intelDataStore.createEntity).toHaveBeenCalledWith(testEntity);
      expect(result.success).toBe(true);
      expect(result.data).toBe(testEntity);
    });
    
    it('should return not found if entity is not in memory or persistent storage', async () => {
      const memoryResult: StorageResult<NodeEntity> = {
        success: false,
        error: 'Not found in memory'
      };
      
      const persistResult: StorageResult<NodeEntity> = {
        success: false,
        error: 'Not found in persistent storage'
      };
      
      (intelDataStore.getEntity as any).mockResolvedValue(memoryResult);
      (indexedDBAdapter.getEntity as any).mockResolvedValue(persistResult);
      
      const result = await storageOrchestrator.getEntity('test-id');
      
      expect(intelDataStore.getEntity).toHaveBeenCalledWith('test-id');
      expect(indexedDBAdapter.getEntity).toHaveBeenCalledWith('test-id');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Entity with ID test-id not found');
    });
  });
  
  // Additional tests for updateEntity, deleteEntity, createRelationship, getRelationships, and queryEntities would follow similar patterns
});

/**
 * Unit tests for CyberCommand data service
 * Testing data fetching, caching, rate limiting, and mock data generation
 */

import { 
  CyberCommandDataService,
  DataCache,
  RateLimiter,
  dataServiceRegistry
} from '../CyberCommandDataService';

import { vi } from 'vitest';
import type {
  VisualizationType,
  VisualizationData
} from '../../types/CyberCommandVisualization';

// Mock fetch globally
global.fetch = vi.fn();

describe('CyberCommandDataService', () => {
  let service: CyberCommandDataService;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = global.fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockClear();
    service = new CyberCommandDataService('IntelReports');
    vi.clearAllTimers();
    vi.useFakeTimers();
    dataServiceRegistry.clearAll();
  });

  afterEach(() => {
    vi.useRealTimers();
    service.stopRealTimeUpdates();
    service.clearCache();
    dataServiceRegistry.clearAll();
  });

  // =============================================================================
  // DATA CACHE TESTS
  // =============================================================================

  describe('DataCache', () => {
    let cache: DataCache;

    beforeEach(() => {
      cache = new DataCache();
    });

    test('should store and retrieve cached items', () => {
      const mockData: VisualizationData[] = [{
        id: 'test-1',
        type: 'IntelReports',
        location: { latitude: 40.7128, longitude: -74.0060 },
        timestamp: new Date(),
        metadata: {},
        priority: 'medium',
        status: 'active'
      }];

      cache.set('test-key', mockData, 5000);
      const result = cache.get('test-key');
      
      expect(result).toEqual(mockData);
    });

    test('should return null for missing keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    test('should clear all items', () => {
      const mockData: VisualizationData[] = [{
        id: 'test-1',
        type: 'IntelReports',
        location: { latitude: 40.7128, longitude: -74.0060 },
        timestamp: new Date(),
        metadata: {},
        priority: 'medium',
        status: 'active'
      }];

      cache.set('key1', mockData, 5000);
      cache.set('key2', mockData, 5000);
      
      cache.clear();
      
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });
  });

  // =============================================================================
  // RATE LIMITER TESTS
  // =============================================================================

  describe('RateLimiter', () => {
    let rateLimiter: RateLimiter;

    beforeEach(() => {
      rateLimiter = new RateLimiter();
    });

    test('should allow requests within limit', () => {
      expect(rateLimiter.canMakeRequest('test-key')).toBe(true);
      expect(rateLimiter.canMakeRequest('test-key')).toBe(true);
    });

    test('should reset properly', () => {
      rateLimiter.canMakeRequest('test-key');
      rateLimiter.reset();
      expect(rateLimiter.canMakeRequest('test-key')).toBe(true);
    });
  });

  // =============================================================================
  // NO SOURCE OF ITS OWN (plan item 8.3, block B2)
  // =============================================================================

  /*
   * The base service has no source behind it. It answered every read with
   * generated records (random "Operational" satellites, invented reports), failed
   * one read in twenty at random "for testing", and called itself online from
   * the start. A subclass that has a source overrides getData, as
   * RealTimeAttackService does.
   */
  describe('with no source of its own', () => {
    test('says it has none, and invents nothing', async () => {
      await expect(service.getData()).rejects.toMatchObject({ code: 'NO_SOURCE' });
    });

    test('is not online before a read has worked, nor after one fails', async () => {
      expect(service.getHealthStatus().isOnline).toBe(false);
      await service.getData().catch(() => {});
      expect(service.getHealthStatus().isOnline).toBe(false);
    });
  });

  describe('CyberCommandDataService Integration', () => {
    test('should create service instance', () => {
      expect(service).toBeDefined();
      expect(service.type).toBe('IntelReports');
    });

    test('should have basic methods', () => {
      expect(typeof service.getData).toBe('function');
      expect(typeof service.getHealthStatus).toBe('function');
      expect(typeof service.clearCache).toBe('function');
      expect(typeof service.stopRealTimeUpdates).toBe('function');
    });

    test('should get health status', () => {
      const status = service.getHealthStatus();
      
      expect(status).toHaveProperty('isOnline');
      expect(status).toHaveProperty('lastUpdate');
      expect(status).toHaveProperty('errorRate');
      expect(status).toHaveProperty('dataQuality');
    });
  });

  // =============================================================================
  // REGISTRY TESTS
  // =============================================================================

  describe('DataServiceRegistry', () => {
    test('should create and manage services', () => {
      const service1 = dataServiceRegistry.getService('IntelReports');
      const service2 = dataServiceRegistry.getService('IntelReports');
      
      expect(service1).toBe(service2); // Should return same instance
      
      const service3 = dataServiceRegistry.getService('CyberAttacks');
      expect(service3).not.toBe(service1); // Different types should be different instances
    });

    test('should clear all services', () => {
      dataServiceRegistry.getService('IntelReports');
      dataServiceRegistry.getService('CyberAttacks');
      
      const allServices = dataServiceRegistry.getAllServices();
      expect(allServices.length).toBeGreaterThan(0);
      
      dataServiceRegistry.clearAll();
      
      // Services should still exist but be reset
      const newService = dataServiceRegistry.getService('IntelReports');
      expect(newService).toBeDefined();
    });
  });
});

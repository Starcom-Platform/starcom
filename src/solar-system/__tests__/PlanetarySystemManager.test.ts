// PlanetarySystemManager.test.ts - TDD specifications for planetary system core

import * as THREE from 'three';
import { PlanetarySystemManager } from '../PlanetarySystemManager';
import { vi } from 'vitest';

// Mock THREE.js objects for testing
const mockScene = {
  add: vi.fn(),
  remove: vi.fn(),
  children: []
} as unknown as THREE.Scene;

const mockCamera = {
  position: new THREE.Vector3(0, 0, 5000),
  updateProjectionMatrix: vi.fn()
} as unknown as THREE.Camera;

describe('PlanetarySystemManager - Core Architecture', () => {
  let planetaryManager: PlanetarySystemManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCamera.position.set(0, 0, 5000);
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      planetaryManager = new PlanetarySystemManager(mockScene, {
        timeAcceleration: 1,
        showOrbitalPaths: true,
        enableLighting: true,
        performanceMode: 'balanced'
      });

      expect(planetaryManager).toBeDefined();
      expect(planetaryManager.isInitialized()).toBe(true);
      expect(planetaryManager.getTimeAcceleration()).toBe(1);
    });

    test('should accept custom configuration', () => {
      const customConfig = {
        timeAcceleration: 365,
        showOrbitalPaths: false,
        enableLighting: false,
        performanceMode: 'high' as const
      };

      planetaryManager = new PlanetarySystemManager(mockScene, customConfig);

      expect(planetaryManager.getTimeAcceleration()).toBe(365);
      expect(planetaryManager.getConfig().showOrbitalPaths).toBe(false);
      expect(planetaryManager.getConfig().enableLighting).toBe(false);
      expect(planetaryManager.getConfig().performanceMode).toBe('high');
    });

    test('should initialize all 7 non-Earth planets', () => {
      // Earth is deliberately not a Planet instance here: the real interactive Globe
      // already represents Earth at the world origin, and every position in this
      // system is geocentric (relative to Earth), so a separate "Earth" Planet would
      // trivially sit at (0,0,0) forever, overlapping the real globe.
      planetaryManager = new PlanetarySystemManager(mockScene);

      const planets = planetaryManager.getPlanets();
      const expectedNames = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
      for (const name of expectedNames) {
        expect(planets).toHaveProperty(name);
        expect(planets[name].isInitialized()).toBe(true);
      }
      expect(Object.keys(planets)).toHaveLength(7);
      expect(planets).not.toHaveProperty('earth');
    });

    test('Saturn has rings; other planets do not', () => {
      planetaryManager = new PlanetarySystemManager(mockScene);
      const planets = planetaryManager.getPlanets();

      expect(planets.saturn.hasRings()).toBe(true);
      expect(planets.jupiter.hasRings()).toBe(false);
      expect(planets.mercury.hasRings()).toBe(false);
    });

    test('should create a Moon orbiting the real Globe', () => {
      planetaryManager = new PlanetarySystemManager(mockScene);
      // Hidden until the solar system is shown (see "How much is drawn").
      expect(planetaryManager.getMoonPosition()).toBeInstanceOf(THREE.Vector3);
      expect(planetaryManager.isMoonVisible()).toBe(false);
    });
  });

  describe('Planetary Management', () => {
    beforeEach(() => {
      planetaryManager = new PlanetarySystemManager(mockScene);
    });

    test('should get planet by name', () => {
      const venus = planetaryManager.getPlanet('venus');
      expect(venus).toBeDefined();
      expect(venus!.getName()).toBe('venus');

      const mars = planetaryManager.getPlanet('mars');
      expect(mars).toBeDefined();
      expect(mars!.getName()).toBe('mars');
    });

    test('should return null for invalid planet name', () => {
      const invalid = planetaryManager.getPlanet('pluto');
      expect(invalid).toBeNull();
    });

    test('should get all planet positions', () => {
      const positions = planetaryManager.getAllPlanetPositions();

      expect(positions).toHaveProperty('mercury');
      expect(positions).toHaveProperty('venus');
      expect(positions).toHaveProperty('mars');

      expect(positions.venus).toBeInstanceOf(THREE.Vector3);
      expect(positions.mars).toBeInstanceOf(THREE.Vector3);
    });

    test('lists no planet as drawn until the solar system is shown, then all seven', () => {
      expect(planetaryManager.getVisiblePlanets()).toHaveLength(0);
      planetaryManager.setShown(1, 100_000);
      expect(planetaryManager.getVisiblePlanets()).toHaveLength(7);
    });
  });

  describe('Time and Orbital Updates', () => {
    beforeEach(() => {
      planetaryManager = new PlanetarySystemManager(mockScene);
    });

    test('should update planetary positions with time advancement', () => {
      const initialPositions = planetaryManager.getAllPlanetPositions();

      // Advance time by a large enough span that even Mars' slow orbit visibly moves
      planetaryManager.advanceTime(86400 * 10); // 10 days in seconds

      const newPositions = planetaryManager.getAllPlanetPositions();

      // Positions should change (planets are orbiting)
      expect(newPositions.venus.distanceTo(initialPositions.venus)).toBeGreaterThan(0);
      expect(newPositions.mars.distanceTo(initialPositions.mars)).toBeGreaterThan(0);
    });

    test('should handle time acceleration changes', () => {
      planetaryManager.setTimeAcceleration(365); // 1 year per day
      expect(planetaryManager.getTimeAcceleration()).toBe(365);

      planetaryManager.setTimeAcceleration(0.5); // Half speed
      expect(planetaryManager.getTimeAcceleration()).toBe(0.5);
    });

    test('should pause and resume orbital motion', () => {
      expect(planetaryManager.isPaused()).toBe(false);

      planetaryManager.pause();
      expect(planetaryManager.isPaused()).toBe(true);

      planetaryManager.resume();
      expect(planetaryManager.isPaused()).toBe(false);
    });

    test('should set specific date and time', () => {
      const testDate = new Date('2025-07-14T12:00:00Z');
      planetaryManager.setCurrentTime(testDate);

      const currentTime = planetaryManager.getCurrentTime();
      expect(currentTime.getTime()).toBe(testDate.getTime());
    });
  });

  describe('How much is drawn (decision K6, SS3)', () => {
    beforeEach(() => {
      planetaryManager = new PlanetarySystemManager(new THREE.Scene());
    });

    test('draws every planet and the Moon together, however far out: there are no tiers', () => {
      const planets = planetaryManager.getPlanets();
      planetaryManager.setShown(1, 2_000);
      for (const planet of Object.values(planets)) expect(planet.isVisible()).toBe(true);
      expect(planetaryManager.isMoonVisible()).toBe(true);

      planetaryManager.setShown(0, 2_000);
      for (const planet of Object.values(planets)) expect(planet.isVisible()).toBe(false);
      expect(planetaryManager.isMoonVisible()).toBe(false);
    });

    test('draws an orbit line only once the camera is out far enough to see it', () => {
      planetaryManager.setShown(1, 2_000);
      expect(planetaryManager.areOrbitalPathsVisible()).toBe(false);
      planetaryManager.setShown(1, 1_600_000);
      expect(planetaryManager.areOrbitalPathsVisible()).toBe(true);
      planetaryManager.setShown(0, 1_600_000);
      expect(planetaryManager.areOrbitalPathsVisible()).toBe(false);
    });

    test('draws no orbit line when orbit lines are turned off', () => {
      const plain = new PlanetarySystemManager(new THREE.Scene(), { showOrbitalPaths: false });
      plain.setShown(1, 1_600_000);
      expect(plain.areOrbitalPathsVisible()).toBe(false);
      plain.dispose();
    });

    test('moves the Moon with time', () => {
      const before = planetaryManager.getMoonPosition()!;
      planetaryManager.advanceTime(86400 * 5);
      expect(planetaryManager.getMoonPosition()!.distanceTo(before)).toBeGreaterThan(1);
    });
  });

  describe('Performance and Optimization', () => {
    beforeEach(() => {
      planetaryManager = new PlanetarySystemManager(mockScene, {
        performanceMode: 'balanced'
      });
    });

    test('should track performance metrics', () => {
      const metrics = planetaryManager.getPerformanceMetrics();

      expect(metrics).toHaveProperty('frameTime');
      expect(metrics).toHaveProperty('activePlanets');
      expect(metrics).toHaveProperty('visiblePlanets');
      expect(metrics).toHaveProperty('memoryUsage');

      expect(metrics.frameTime).toBeGreaterThanOrEqual(0);
      expect(metrics.activePlanets).toBe(7); // All 7 non-Earth planets
    });

    test('should automatically optimize based on performance', () => {
      // Simulate poor performance
      planetaryManager.reportFrameTime(50); // 20 FPS

      const metrics = planetaryManager.getPerformanceMetrics();
      expect(metrics.frameTime).toBe(50);

      // Should trigger optimization
      planetaryManager.optimizePerformance();

      // Performance mode should adjust
      const config = planetaryManager.getConfig();
      expect(config.performanceMode).toBe('low');
    });
  });

  describe('Lifecycle Management', () => {
    beforeEach(() => {
      planetaryManager = new PlanetarySystemManager(mockScene);
    });

    test('should dispose resources correctly', () => {
      planetaryManager.dispose();

      expect(planetaryManager.isInitialized()).toBe(false);
      expect(planetaryManager.isPaused()).toBe(true);
    });

    test('should handle multiple dispose calls gracefully', () => {
      expect(() => {
        planetaryManager.dispose();
        planetaryManager.dispose();
      }).not.toThrow();
    });
  });
});

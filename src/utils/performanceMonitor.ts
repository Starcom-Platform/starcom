/**
 * Simple Performance Monitoring Utility
 * Low-impact performance tracking for development insights
 */

import { createLogger } from '@utils/logger';
const log = createLogger({ prefix: 'performanceMonitor' });

export interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface ComponentMetrics {
  componentMounts: number;
  componentUnmounts: number;
  renderCycles: number;
  memoryUsage?: number;
  timestamp: number;
}

export interface PerformanceReport {
  metrics: PerformanceMetric[];
  totalOperations: number;
  averageDuration: number;
  slowestOperation: PerformanceMetric | null;
  fastestOperation: PerformanceMetric | null;
}

/**
 * Simple performance monitor that doesn't interfere with existing code
 */
export class SimplePerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private completedMetrics: PerformanceMetric[] = [];
  private readonly maxStoredMetrics = 1000;

  /**
   * Start timing an operation
   */
  startTiming(name: string, metadata?: Record<string, unknown>): string {
    const id = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      metadata
    };
    
    this.metrics.set(id, metric);
    return id;
  }

  /**
   * End timing an operation
   */
  endTiming(id: string): PerformanceMetric | null {
    const metric = this.metrics.get(id);
    if (!metric) {
      log.warn(`Performance metric not found: ${id}`);
      return null;
    }

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;

    this.metrics.delete(id);
    this.completedMetrics.push(metric);

    // Limit stored metrics to prevent memory issues
    if (this.completedMetrics.length > this.maxStoredMetrics) {
      this.completedMetrics.shift();
    }

    return metric;
  }

  /**
   * Time a function execution
   */
  async timeFunction<T>(
    name: string, 
    fn: () => T | Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const id = this.startTiming(name, metadata);
    try {
      const result = await fn();
      this.endTiming(id);
      return result;
    } catch (error) {
      this.endTiming(id);
      throw error;
    }
  }

  /**
   * Record a one-time measurement
   */
  measure(name: string, metadata?: Record<string, unknown>): void {
    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      endTime: performance.now(),
      duration: 0,
      metadata
    };

    this.completedMetrics.push(metric);

    // Limit stored metrics to prevent memory issues
    if (this.completedMetrics.length > this.maxStoredMetrics) {
      this.completedMetrics.shift();
    }
  }

  /**
   * Wrap function with timing
   */
  wrapWithTiming<T extends (...args: unknown[]) => unknown>(
    fn: T,
    name: string
  ): T {
    return ((...args: Parameters<T>) => {
      const id = this.startTiming(name);
      try {
        const result = fn(...args);
        this.endTiming(id);
        return result;
      } catch (error) {
        this.endTiming(id);
        throw error;
      }
    }) as T;
  }

  /**
   * Get performance report
   */
  getReport(): PerformanceReport {
    const metrics = [...this.completedMetrics];
    const totalOperations = metrics.length;
    
    if (totalOperations === 0) {
      return {
        metrics: [],
        totalOperations: 0,
        averageDuration: 0,
        slowestOperation: null,
        fastestOperation: null
      };
    }

    const durations = metrics.map(m => m.duration!).filter(d => d !== undefined);
    const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    
    const slowestOperation = metrics.reduce((slowest, current) => 
      !slowest || (current.duration! > slowest.duration!) ? current : slowest
    );
    
    const fastestOperation = metrics.reduce((fastest, current) => 
      !fastest || (current.duration! < fastest.duration!) ? current : fastest
    );

    return {
      metrics,
      totalOperations,
      averageDuration,
      slowestOperation,
      fastestOperation
    };
  }

  /**
   * Get metrics for a specific operation name
   */
  getMetricsFor(name: string): PerformanceMetric[] {
    return this.completedMetrics.filter(m => m.name === name);
  }

  /**
   * Clear all stored metrics
   */
  clearMetrics(): void {
    this.metrics.clear();
    this.completedMetrics.length = 0;
  }

  /**
   * Log performance summary to console
   */
  logSummary(): void {
    const report = this.getReport();
    console.group('🚀 Performance Summary');
    log.debug(`Total Operations: ${report.totalOperations}`);
    log.debug(`Average Duration: ${report.averageDuration.toFixed(2)}ms`);
    
    if (report.slowestOperation) {
      log.debug(`Slowest: ${report.slowestOperation.name} (${report.slowestOperation.duration!.toFixed(2)}ms)`);
    }
    
    if (report.fastestOperation) {
      log.debug(`Fastest: ${report.fastestOperation.name} (${report.fastestOperation.duration!.toFixed(2)}ms)`);
    }
    
    console.groupEnd();
  }
}

// Export singleton instance
export const performanceMonitor = new SimplePerformanceMonitor();

// Helper functions for quick use
export const timeOperation = (name: string, metadata?: Record<string, unknown>) => 
  performanceMonitor.startTiming(name, metadata);

export const endOperation = (id: string) => 
  performanceMonitor.endTiming(id);

export const timeFunction = <T>(
  name: string, 
  fn: () => T | Promise<T>,
  metadata?: Record<string, unknown>
) => performanceMonitor.timeFunction(name, fn, metadata);

// Component mounting/unmounting tracking for development
class ComponentPerformanceTracker {
  private componentMetrics: Map<string, ComponentMetrics> = new Map();
  private isDevelopment = process.env.NODE_ENV === 'development';

  trackComponentMount(componentName: string): void {
    if (!this.isDevelopment) return;

    const current = this.componentMetrics.get(componentName) || {
      componentMounts: 0,
      componentUnmounts: 0,
      renderCycles: 0,
      timestamp: Date.now()
    };

    this.componentMetrics.set(componentName, {
      ...current,
      componentMounts: current.componentMounts + 1,
      timestamp: Date.now()
    });

    // Warn if too many mounts in short period
    if (current.componentMounts > 10) {
      log.warn(`🚨 PERFORMANCE: ${componentName} has mounted ${current.componentMounts} times`);
    }
  }

  trackComponentUnmount(componentName: string): void {
    if (!this.isDevelopment) return;

    const current = this.componentMetrics.get(componentName);
    if (!current) return;

    this.componentMetrics.set(componentName, {
      ...current,
      componentUnmounts: current.componentUnmounts + 1,
      timestamp: Date.now()
    });
  }

  logComponentSummary(): void {
    if (!this.isDevelopment) return;

    console.group('📊 COMPONENT PERFORMANCE SUMMARY');
    
    for (const [componentName, metrics] of this.componentMetrics) {
      const mountUnmountRatio = metrics.componentUnmounts > 0 
        ? (metrics.componentMounts / metrics.componentUnmounts).toFixed(2)
        : 'N/A';

      log.debug(`${componentName}:`, {
        mounts: metrics.componentMounts,
        unmounts: metrics.componentUnmounts,
        ratio: mountUnmountRatio,
        lastActivity: new Date(metrics.timestamp).toISOString()
      });

      // Flag problematic components
      if (metrics.componentMounts > 5) {
        log.warn(`⚠️ ${componentName} shows signs of mounting storms`);
      }
    }

    console.groupEnd();
  }
}

export const componentTracker = new ComponentPerformanceTracker();

// Dev-only diagnostic: logs real, timestamped main-thread long tasks
// (the browser's own Long Tasks API only reports tasks >=50ms) so a future
// "the app just felt slow" report has actual evidence to correlate against
// specific background jobs (space-weather polling, Nostr reconnects, etc.)
// instead of guessing from console noise alone. No-op if the browser
// doesn't support the Long Tasks API (Firefox/Safari as of this writing)
// or if already started.
let longTaskObserver: PerformanceObserver | null = null;

export function initLongTaskMonitoring(): void {
  if (longTaskObserver) return;
  if (typeof PerformanceObserver === 'undefined') return;
  if (!PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const durationMs = Math.round(entry.duration);
        const details = { startTime: Math.round(entry.startTime), name: entry.name };
        // Bare method references (`const fn = log.warn`) lose `log`'s
        // `this` binding — call through the object directly instead.
        if (durationMs >= 150) {
          log.warn(`🐢 Long task: ${durationMs}ms`, details);
        } else {
          log.debug(`🐢 Long task: ${durationMs}ms`, details);
        }
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
    longTaskObserver = observer;
  } catch (err) {
    log.debug('Long task monitoring unavailable:', err);
  }
}

export function stopLongTaskMonitoring(): void {
  longTaskObserver?.disconnect();
  longTaskObserver = null;
}

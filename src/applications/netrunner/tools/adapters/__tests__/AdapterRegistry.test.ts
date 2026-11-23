import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registerAdapter,
  getAdapter,
  getAllAdapters,
  getAvailableAdapters,
  hasAdapter,
  __clearAdapterRegistryForTests
} from '../AdapterRegistry';
import { ToolAdapter } from '../../NetRunnerPowerTools';

// Create a mock adapter for testing
class MockToolAdapter implements ToolAdapter {
  private toolId: string;
  private name: string;
  private initialized: boolean = false;

  constructor(toolId: string, name: string) {
    this.toolId = toolId;
    this.name = name;
  }

  getToolId(): string {
    return this.toolId;
  }

  getToolSchema() {
    return {
      id: this.toolId,
      name: this.name,
      description: 'Mock tool for testing',
      category: 'analysis' as any,
      capabilities: ['Test capability'],
      premium: false,
      automationCompatible: true,
      source: 'Test',
      license: 'MIT',
      intelTypes: ['identity' as any],
      parameters: [],
      outputFormat: { type: 'json' as const }
    };
  }

  async initialize(): Promise<boolean> {
    this.initialized = true;
    return true;
  }

  async execute(): Promise<any> {
    return { success: true, result: 'Mock result' };
  }

  validateParameters(): boolean {
    return true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
  }
}

describe('AdapterRegistry Module', () => {
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;

  beforeEach(() => {
    console.log = vi.fn();
    console.warn = vi.fn();
    // Registered via the real registerAdapter() below — clear between tests
    // since the module-level registry Map has no other reset hook.
    __clearAdapterRegistryForTests();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    vi.clearAllMocks();
  });

  test('should register an adapter successfully', () => {
    const mockAdapter = new MockToolAdapter('mock-tool-1', 'Mock Tool 1');

    registerAdapter(mockAdapter);

    const retrievedAdapter = getAdapter('mock-tool-1');
    expect(retrievedAdapter).toBe(mockAdapter);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Registered adapter'));
  });

  test('should warn and overwrite when registering an adapter with an existing ID', () => {
    const mockAdapter1 = new MockToolAdapter('mock-tool-2', 'Mock Tool 2');
    const mockAdapter2 = new MockToolAdapter('mock-tool-2', 'Mock Tool 2 Duplicate');

    registerAdapter(mockAdapter1);
    registerAdapter(mockAdapter2);

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('already registered'));
    expect(getAdapter('mock-tool-2')).toBe(mockAdapter2);
  });

  test('should return undefined for non-existent adapter', () => {
    expect(getAdapter('non-existent-adapter')).toBeUndefined();
  });

  test('should get all registered adapters', () => {
    const mockAdapter1 = new MockToolAdapter('mock-tool-3', 'Mock Tool 3');
    const mockAdapter2 = new MockToolAdapter('mock-tool-4', 'Mock Tool 4');

    registerAdapter(mockAdapter1);
    registerAdapter(mockAdapter2);

    const allAdapters = getAllAdapters();
    expect(allAdapters).toHaveLength(2);
    expect(allAdapters).toContain(mockAdapter1);
    expect(allAdapters).toContain(mockAdapter2);
  });

  test('should maintain registry state correctly across multiple registrations', () => {
    const mockShodan = new MockToolAdapter('shodan', 'Shodan');
    const mockHarvester = new MockToolAdapter('theharvester', 'TheHarvester');
    const mockAnalyzer = new MockToolAdapter('intel-analyzer', 'Intel Analyzer');

    registerAdapter(mockShodan);
    registerAdapter(mockHarvester);
    registerAdapter(mockAnalyzer);

    const adapters = getAllAdapters();
    expect(adapters).toHaveLength(3);
    expect(adapters).toContain(mockShodan);
    expect(adapters).toContain(mockHarvester);
    expect(adapters).toContain(mockAnalyzer);
  });

  test('getAvailableAdapters is the same function as getAllAdapters', () => {
    const mockAdapter = new MockToolAdapter('mock-tool-5', 'Mock Tool 5');
    registerAdapter(mockAdapter);

    expect(getAvailableAdapters()).toEqual(getAllAdapters());
  });

  test('hasAdapter reflects real registry membership', () => {
    expect(hasAdapter('mock-tool-6')).toBe(false);

    registerAdapter(new MockToolAdapter('mock-tool-6', 'Mock Tool 6'));

    expect(hasAdapter('mock-tool-6')).toBe(true);
    expect(hasAdapter('still-not-registered')).toBe(false);
  });
});

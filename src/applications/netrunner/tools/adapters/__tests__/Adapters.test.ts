import { beforeEach, describe, expect, it, vi } from 'vitest';
/**
 * Unit tests for OSINT Adapters — response parsing and error handling.
 *
 * These tests run each adapter in mock mode (no API keys configured).
 * They verify that each adapter:
 *  - Creates instances and initializes in mock mode
 *  - Validates parameters correctly
 *  - Returns success response with expected shape
 *  - Returns error response for invalid params / uninitialised state
 */

// Mock apiConfigManager to prevent side effects
vi.mock('../../../../shared/config/ApiConfigManager', () => ({
  apiConfigManager: {
    getProviderConfig: () => null,
    shouldUseRealApis: () => false,
    loadConfig: vi.fn(),
    isInitialized: () => true,
  },
}));

// Mock NetRunnerPowerTools to provide stable tool IDs (they use uuidv4 at import time)
vi.mock('../../NetRunnerPowerTools', () => {
  const makeTool = (name: string, id: string) => ({
    id,
    name,
    description: `${name} OSINT tool`,
    category: 'OSINT',
    automationCompatible: true,
  });

  return {
    __esModule: true,
    netRunnerPowerTools: [
      makeTool('Shodan', 'test-shodan-id'),
      makeTool('Censys', 'test-censys-id'),
      makeTool('VirusTotal', 'test-vt-id'),
      makeTool('theHarvester', 'test-harvester-id'),
      makeTool('Intelligence Analyzer', 'test-intel-id'),
    ],
    // Re-export types/interfaces (they're erased at runtime, but we need the shape)
    // The adapters import ToolExecutionRequest as a type so this is fine.
  };
});

import { ShodanAdapter } from '../ShodanAdapter';
import { CensysAdapter } from '../CensysAdapter';
import { VirusTotalAdapter } from '../VirusTotalAdapter';
import { TheHarvesterAdapter } from '../TheHarvesterAdapter';

// ---------------------------------------------------------------------------
// Types (mirrored since we mocked the module)
// ---------------------------------------------------------------------------

interface ToolExecutionRequest {
  toolId: string;
  parameters: Record<string, unknown>;
  requestId: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(toolId: string, params: Record<string, unknown>): ToolExecutionRequest {
  return {
    toolId,
    parameters: params,
    requestId: 'req-001',
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// ShodanAdapter
// ---------------------------------------------------------------------------

describe('ShodanAdapter', () => {
  let adapter: ShodanAdapter;

  beforeEach(async () => {
    adapter = new ShodanAdapter();
    await adapter.initialize(); // no key of the user's own
  });

  it('initialises without a key', () => {
    expect(adapter.getToolId()).toBe('test-shodan-id');
    expect(adapter.getToolSchema().name).toBe('Shodan');
  });

  it('says Shodan is not available without a key, rather than answering with a sample host', async () => {
    const req = makeRequest('test-shodan-id', {
      query: 'apache',
      operation: 'search',
      limit: 5,
    });
    const resp = await adapter.execute(req);
    expect(resp.status).toBe('error');
    expect(resp.data).toBeNull();
    expect(resp.error).toMatch(/not available/);
  });

  it('returns error for host operation without IP', async () => {
    const req = makeRequest('test-shodan-id', {
      query: 'anything',
      operation: 'host',
    });
    const resp = await adapter.execute(req);
    expect(resp.status).toBe('error');
    expect(resp.error).toContain('IP');
  });

  it('returns error when not initialized', async () => {
    const fresh = new ShodanAdapter();
    // Don't call initialize
    const req = makeRequest('test-shodan-id', {
      query: 'test',
      operation: 'search',
    });
    const resp = await fresh.execute(req);
    expect(resp.status).toBe('error');
    expect(resp.error).toContain('not initialized');
  });
});

// ---------------------------------------------------------------------------
// CensysAdapter
// ---------------------------------------------------------------------------

describe('CensysAdapter', () => {
  let adapter: CensysAdapter;

  beforeEach(async () => {
    adapter = new CensysAdapter();
    await adapter.initialize();
  });

  it('initialises successfully in mock mode', () => {
    expect(adapter.getToolId()).toBe('test-censys-id');
  });

  it('executes search_hosts and returns mock data', async () => {
    const req = makeRequest('test-censys-id', {
      query: 'services.port: 443',
      operation: 'search_hosts',
      limit: 10,
    });
    const resp = await adapter.execute(req);
    expect(resp.status).toBe('success');
    expect(resp.data).toBeDefined();
  });

  it('returns error for view_host without IP', async () => {
    const req = makeRequest('test-censys-id', {
      query: 'anything',
      operation: 'view_host',
    });
    const resp = await adapter.execute(req);
    expect(resp.status).toBe('error');
    expect(resp.error).toContain('IP');
  });
});

// ---------------------------------------------------------------------------
// VirusTotalAdapter
// ---------------------------------------------------------------------------

describe('VirusTotalAdapter', () => {
  let adapter: VirusTotalAdapter;

  beforeEach(async () => {
    adapter = new VirusTotalAdapter();
    await adapter.initialize();
  });

  it('initialises successfully in mock mode', () => {
    expect(adapter.getToolId()).toBe('test-vt-id');
  });

  it('executes file_report and returns mock data', async () => {
    const req = makeRequest('test-vt-id', {
      query: '44d88612fea8a8f36de82e1278abb02f',
      operation: 'file_report',
    });
    const resp = await adapter.execute(req);
    expect(resp.status).toBe('success');
    expect(resp.data).toBeDefined();
    expect((resp.data as { data: unknown }).data).toBeDefined();
  });

  it('executes domain_report', async () => {
    const req = makeRequest('test-vt-id', {
      query: 'example.com',
      operation: 'domain_report',
    });
    const resp = await adapter.execute(req);
    expect(resp.status).toBe('success');
  });

  it('executes ip_report', async () => {
    const req = makeRequest('test-vt-id', {
      query: '93.184.216.34',
      operation: 'ip_report',
    });
    const resp = await adapter.execute(req);
    expect(resp.status).toBe('success');
  });
});

// ---------------------------------------------------------------------------
// TheHarvesterAdapter
// ---------------------------------------------------------------------------

describe('TheHarvesterAdapter', () => {
  let adapter: TheHarvesterAdapter;

  beforeEach(async () => {
    adapter = new TheHarvesterAdapter();
    await adapter.initialize();
  });

  it('initialises successfully', () => {
    expect(adapter.getToolId()).toBe('test-harvester-id');
  });

  it('says it is not available, rather than inventing emails, when no service is configured', async () => {
    const req = makeRequest('test-harvester-id', {
      query: 'example.com',
      operation: 'emails',
      domain: 'example.com',
    });
    const resp = await adapter.execute(req);
    expect(resp.status).toBe('error');
    expect(resp.data).toBeNull();
    expect(resp.error).toMatch(/not available/);
  });
});

// ---------------------------------------------------------------------------
// BaseAdapter — parameter validation
// ---------------------------------------------------------------------------

describe('BaseAdapter parameter validation', () => {
  let adapter: ShodanAdapter;

  beforeEach(async () => {
    adapter = new ShodanAdapter();
    await adapter.initialize();
  });

  it('validates parameters correctly', () => {
    expect(
      adapter.validateParameters({ query: 'apache', operation: 'search', limit: 10 })
    ).toBe(true);
  });

  it('rejects invalid operation option', () => {
    expect(
      adapter.validateParameters({ query: 'test', operation: 'invalid_op' })
    ).toBe(false);
  });

  it('rejects query that is too short', () => {
    expect(
      adapter.validateParameters({ query: 'ab', operation: 'search' })
    ).toBe(false);
  });

  it('rejects limit below min', () => {
    expect(
      adapter.validateParameters({ query: 'test', operation: 'search', limit: 0 })
    ).toBe(false);
  });

  it('rejects limit above max', () => {
    expect(
      adapter.validateParameters({ query: 'test', operation: 'search', limit: 999 })
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkAvailability
// ---------------------------------------------------------------------------

describe('checkAvailability', () => {
  it('returns unavailable before initialize()', async () => {
    const adapter = new ShodanAdapter();
    const status = await adapter.checkAvailability();
    expect(status.available).toBe(false);
    expect(status.reason).toContain('not initialized');
  });

  it('returns available after initialize()', async () => {
    const adapter = new ShodanAdapter();
    await adapter.initialize();
    const status = await adapter.checkAvailability();
    expect(status.available).toBe(true);
  });
});

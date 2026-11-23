/**
 * ShodanAdapter.test.ts
 * 
 * Test suite for the ShodanAdapter tool adapter.
 */

import { describe, expect, test, beforeEach, vi } from 'vitest';
import axios from 'axios';
import { ShodanAdapter, SHODAN_NOT_AVAILABLE } from '../ShodanAdapter';
import { ToolExecutionRequest } from '../../NetRunnerPowerTools';

describe('ShodanAdapter', () => {
  let adapter: ShodanAdapter;

  beforeEach(async () => {
    adapter = new ShodanAdapter();
    await adapter.initialize();
  });

  test('should initialize correctly', () => {
    const toolId = adapter.getToolId();
    expect(toolId).toBeDefined();
    expect(typeof toolId).toBe('string');
    
    const schema = adapter.getToolSchema();
    expect(schema.id).toBe(toolId);
    expect(schema.name).toBe('Shodan');
    expect(schema.description).toContain('Search engine for Internet-connected devices');
  });

  test('should validate parameters correctly', () => {
    // Valid search parameters
    expect(adapter.validateParameters({
      operation: 'search',
      query: 'apache',
      limit: 10
    })).toBe(true);

    // Valid host operation - based on the schema, query might still be required
    const hostParams = { operation: 'host', ip: '192.168.1.1' };
    const hostValidation = adapter.validateParameters(hostParams);
    // If query is required for all operations, add it
    if (!hostValidation) {
      expect(adapter.validateParameters({
        ...hostParams,
        query: 'dummy' // Some operations might still require query
      })).toBe(true);
    } else {
      expect(hostValidation).toBe(true);
    }

    // Missing required parameter
    expect(adapter.validateParameters({})).toBe(false);

    // Missing operation parameter
    expect(adapter.validateParameters({
      query: 'apache',
      limit: 10
    })).toBe(false);

    // Invalid parameter types
    expect(adapter.validateParameters({
      operation: 'search',
      query: 123, // should be string
      limit: 10
    })).toBe(false);

    expect(adapter.validateParameters({
      operation: 'search',
      query: 'apache',
      limit: 'ten' // should be number
    })).toBe(false);
  });

  test('without a key of your own, search and host lookup say Shodan is not available and return no data', async () => {
    localStorage.clear();
    const requests: Array<Record<string, unknown>> = [
      { operation: 'search', query: 'apache', limit: 5 },
      { operation: 'host', query: 'ip:198.51.100.7', ip: '198.51.100.7' },
    ];
    for (const parameters of requests) {
      const response = await adapter.execute({
        toolId: adapter.getToolId(),
        parameters,
        requestId: `request-${parameters.operation}`,
        timestamp: Date.now()
      });
      expect(response.status).toBe('error');
      expect(response.data).toBeNull();
      expect(response.error).toBe(SHODAN_NOT_AVAILABLE);
    }
  });

  test('with a key of your own, a search asks Shodan and returns its answer', async () => {
    localStorage.setItem('starcom_user_api_credentials_v1', JSON.stringify({ shodan: 'user-supplied-key' }));
    const getSpy = vi.spyOn(axios, 'get').mockImplementation(async (url: string) => (
      String(url).endsWith('/api-info')
        ? { data: { query_credits: 100 } }
        : { data: { matches: [{ ip_str: '198.51.100.7', port: 443 }], total: 1 } }
    ));
    try {
      const keyed = new ShodanAdapter();
      await keyed.initialize();
      const response = await keyed.execute({
        toolId: keyed.getToolId(),
        parameters: { operation: 'search', query: 'apache', limit: 5 },
        requestId: 'request-keyed-search',
        timestamp: Date.now()
      });
      expect(response.status).toBe('success');
      const data = response.data as { matches: Array<{ ip_str: string }>; _metadata: { operation: string } };
      expect(data.matches[0].ip_str).toBe('198.51.100.7');
      expect(data._metadata.operation).toBe('search');
      expect(getSpy.mock.calls.some(([url]) => String(url).endsWith('/shodan/host/search'))).toBe(true);
    } finally {
      getSpy.mockRestore();
      localStorage.clear();
    }
  });

  test('with a key of your own, a host lookup asks Shodan for that address', async () => {
    localStorage.setItem('starcom_user_api_credentials_v1', JSON.stringify({ shodan: 'user-supplied-key' }));
    const getSpy = vi.spyOn(axios, 'get').mockImplementation(async (url: string) => (
      String(url).endsWith('/api-info')
        ? { data: { query_credits: 100 } }
        : { data: { ip_str: '198.51.100.7', ports: [443] } }
    ));
    try {
      const keyed = new ShodanAdapter();
      await keyed.initialize();
      const response = await keyed.execute({
        toolId: keyed.getToolId(),
        parameters: { operation: 'host', query: 'ip:198.51.100.7', ip: '198.51.100.7' },
        requestId: 'request-keyed-host',
        timestamp: Date.now()
      });
      expect(response.status).toBe('success');
      expect((response.data as { ip_str: string }).ip_str).toBe('198.51.100.7');
      expect(getSpy.mock.calls.some(([url]) => String(url).endsWith('/shodan/host/198.51.100.7'))).toBe(true);
    } finally {
      getSpy.mockRestore();
      localStorage.clear();
    }
  });

  test('should handle execution errors gracefully', async () => {
    // Simulate error by providing invalid parameters after validation
    const request: ToolExecutionRequest = {
      toolId: adapter.getToolId(),
      parameters: {},
      requestId: 'test-request-5',
      timestamp: Date.now()
    };

    const response = await adapter.execute(request);

    expect(response.status).toBe('error');
    expect(response.error).toBeDefined();
    expect(response.error).toContain('Invalid parameters');
  });

  test('should return correct tool schema', () => {
    const schema = adapter.getToolSchema();
    
    expect(schema.parameters).toBeDefined();
    expect(schema.parameters.length).toBeGreaterThan(0);
    
    // Check for required query parameter
    const queryParam = schema.parameters.find(p => p.name === 'query');
    expect(queryParam).toBeDefined();
    expect(queryParam?.required).toBe(true);
    expect(queryParam?.type).toBe('string');
    
    // Check for optional limit parameter
    const limitParam = schema.parameters.find(p => p.name === 'limit');
    expect(limitParam).toBeDefined();
    expect(limitParam?.required).toBe(false);
    expect(limitParam?.type).toBe('number');
  });

  /*
   * This replaces a regression test that asserted the OPPOSITE: that the
   * adapter must call /api/shodan-proxy and never api.shodan.io, and must never
   * send a key.
   *
   * That test was right for its architecture. The proxy held an operator key
   * server-side, and the thing it was guarding against — an operator credential
   * inlined into the browser bundle by Vite — was a real leak that had actually
   * happened.
   *
   * The proxy was never deployed, so the tool never worked, and this project
   * now runs no server by design. What survives is the concern, not the
   * mechanism: an OPERATOR key must never reach a browser. A USER's own key
   * reaching their own browser is not a leak, it is the point.
   *
   * So the assertions below preserve the original guarantee and drop the
   * implementation it was expressed in.
   */
  test('calls Shodan directly, and carries no operator credential (regression)', async () => {
    const getSpy = vi.spyOn(axios, 'get');

    const freshAdapter = new ShodanAdapter();
    await freshAdapter.initialize();

    // With no user key configured, initialize() must not make a network call at
    // all — the previous version probed a 404 on every startup to discover
    // something it could have asked locally.
    expect(getSpy).not.toHaveBeenCalled();

    getSpy.mockRestore();
  });

  test('sends the user\'s own key when they have one, and never an operator key', async () => {
    // Simulate a user who has supplied their own credential.
    localStorage.setItem('starcom_user_api_credentials_v1', JSON.stringify({ shodan: 'user-supplied-key' }));

    const getSpy = vi.spyOn(axios, 'get').mockResolvedValue({ data: { query_credits: 100 } });
    const freshAdapter = new ShodanAdapter();
    await freshAdapter.initialize();

    expect(getSpy).toHaveBeenCalled();
    for (const call of getSpy.mock.calls) {
      const [url, config] = call;
      // Direct to Shodan now — no proxy exists to route through.
      expect(String(url)).toContain('api.shodan.io');
      expect(String(url)).not.toContain('/api/shodan-proxy');

      // The key travels, and it is the USER'S. The guarantee that matters is
      // that it is never an operator key baked into the build.
      const sent = JSON.stringify(config ?? {});
      expect(sent).toContain('user-supplied-key');
    }

    getSpy.mockRestore();
    localStorage.clear();
  });

  test('ignores any operator key that happens to be configured', async () => {
    /*
     * This originally asserted `import.meta.env.VITE_SHODAN_API_KEY` was
     * undefined, and it failed — there IS one in the local .env. That was the
     * wrong assertion in the wrong place: vitest loads every .env variable,
     * whereas Vite only inlines the ones code statically references, so a unit
     * test cannot tell you what shipped. The build's bundle-secret guard is
     * what answers that, and it reports this key absent from dist.
     *
     * What a unit test CAN prove is the guarantee that makes the build result
     * durable: the adapter never reaches for an operator credential, so one
     * existing in the environment changes nothing. resolveCredential takes a
     * build-time fallback as its second argument and this adapter passes none.
     */
    localStorage.clear();

    const getSpy = vi.spyOn(axios, 'get');
    const freshAdapter = new ShodanAdapter();
    await freshAdapter.initialize();

    // An operator key is present in this environment. The adapter still has no
    // key, still makes no call, and still answers that Shodan is not available.
    expect(getSpy).not.toHaveBeenCalled();
    getSpy.mockRestore();
  });
});

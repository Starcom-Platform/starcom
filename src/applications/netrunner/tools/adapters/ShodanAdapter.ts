/**
 * ShodanAdapter.ts
 * 
 * Adapter for the Shodan OSINT tool.
 * Provides an interface for making requests to the Shodan API.
 */

import axios from 'axios';
import { resolveCredential } from '../../../../shared/config/userCredentialStore';
import { 
  ToolExecutionRequest, 
  ToolExecutionResponse, 
  ToolSchema,
  IntelType,
  netRunnerPowerTools
} from '../NetRunnerPowerTools';
import { BaseAdapter } from './BaseAdapter';

/**
 * Shodan client — calls api.shodan.io directly with the USER'S OWN key.
 *
 * It previously called /api/shodan-proxy, a serverless function holding an
 * operator key. That was the right fix for the problem it addressed: the
 * earlier design used a VITE_-prefixed variable, and Vite inlines those into
 * the bundle, so the operator's real key shipped to every browser.
 *
 * What changed is the constraint, not the reasoning. The proxy was never
 * deployed — /api/shodan-proxy has 404'd for as long as api/ has been dark — so
 * this tool has simply not worked. And Starcom now runs no server at all, which
 * is a deliberate position rather than an accident.
 *
 * Bring-your-own-key resolves both. An OPERATOR's key in a browser is a leak; a
 * USER's own key in their own browser is just their key, spending their quota
 * against their rate limit. That is already settled doctrine here — see
 * src/api/eia.ts and userCredentialStore — and it needs no server.
 *
 * Verified before committing to it: api.shodan.io returns
 * `access-control-allow-origin: *`, so a browser may call it directly.
 */
class ShodanApiClient {
  private baseUrl = 'https://api.shodan.io';

  /**
   * The user's key, read at call time so adding one takes effect immediately.
   *
   * NO BUILD-TIME FALLBACK IS PASSED, deliberately. resolveCredential accepts an
   * operator key as a second argument and none is given, because none exists —
   * the VITE_SHODAN_API_KEY variable was removed when this moved to a proxy, and
   * reintroducing it would inline an operator credential into every bundle.
   *
   * So this is bring-your-own-key with nothing behind it. A user without a key
   * gets a clear prompt rather than silently spending someone else's quota.
   */
  private key(): string | null {
    return resolveCredential('shodan').value;
  }

  /** Thrown as a first-class state, not an error condition: having no key is
   *  the normal case for a new user, and the message has to be actionable. */
  private requireKey(): string {
    const k = this.key();
    if (!k) {
      throw new Error(
        'No Shodan API key. Add your own key in settings to use this tool — '
        + 'it is used from your browser and never sent to Starcom.',
      );
    }
    return k;
  }

  hasKey(): boolean {
    return this.key() !== null;
  }

  async search(query: string, limit: number = 10): Promise<Record<string, unknown>> {
    try {
      const response = await axios.get(`${this.baseUrl}/shodan/host/search`, {
        params: { key: this.requireKey(), query, limit },
        timeout: 30000
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Shodan rejected this API key. Check it in settings.');
        }
        if (error.response?.status === 402) {
          throw new Error('Shodan API quota exceeded');
        }
        throw new Error(`Shodan API error: ${error.response?.data?.error || error.message}`);
      }
      throw error;
    }
  }

  async host(ip: string): Promise<Record<string, unknown>> {
    try {
      const response = await axios.get(`${this.baseUrl}/shodan/host/${encodeURIComponent(ip)}`, {
        params: { key: this.requireKey() },
        timeout: 30000
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Shodan rejected this API key. Check it in settings.');
        }
        if (error.response?.status === 404) {
          throw new Error(`Host ${ip} not found in Shodan database`);
        }
        throw new Error(`Shodan API error: ${error.response?.data?.error || error.message}`);
      }
      throw error;
    }
  }

  async getApiInfo(): Promise<Record<string, unknown>> {
    try {
      const response = await axios.get(`${this.baseUrl}/api-info`, {
        params: { key: this.requireKey() },
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Shodan rejected this API key. Check it in settings.');
        }
        throw new Error(`Shodan API error: ${error.response?.data?.error || error.message}`);
      }
      throw error;
    }
  }
}

/** What a request gets back when the person has set no Shodan key of their own. */
export const SHODAN_NOT_AVAILABLE =
  'Shodan is not available: no Shodan API key of your own is set, so nothing was collected. '
  + 'Add one under Keys in the globe\'s Settings (the Settings button on the bar along the top of the globe).';

export class ShodanAdapter extends BaseAdapter {
  // Shodan answers only with the USER'S own key. There is no operator key
  // anywhere, so "no key" is the ordinary state for a new user, and the tool
  // says so. It used to answer with a sample host instead (203.0.113.1,
  // "Example Corp"), which a mission could have filed as a finding about its
  // target. See ShodanApiClient for why bring-your-own-key replaced the proxy.
  private shodanClient: ShodanApiClient;

  constructor() {
    // Find the Shodan tool from the collection
    const shodanTool = netRunnerPowerTools.find(tool => tool.name === 'Shodan');
    
    if (!shodanTool) {
      throw new Error('Shodan tool not found in the NetRunnerPowerTools collection');
    }
    
    // Define the tool schema for Shodan
    const schema: ToolSchema = {
      id: shodanTool.id,
      name: shodanTool.name,
      description: shodanTool.description,
      parameters: [
        {
          name: 'query',
          type: 'string',
          description: 'Search query (e.g., "apache", "country:US", "port:22")',
          required: true,
          validation: {
            pattern: '^.{3,}$' // At least 3 characters
          }
        },
        {
          name: 'limit',
          type: 'number',
          description: 'Maximum number of results to return',
          required: false,
          default: 10,
          validation: {
            min: 1,
            max: 100
          }
        },
        {
          name: 'operation',
          type: 'string',
          description: 'Operation to perform: "search" or "host"',
          required: true,
          default: 'search',
          options: ['search', 'host']
        },
        {
          name: 'ip',
          type: 'string',
          description: 'IP address (only for "host" operation)',
          required: false,
          validation: {
            pattern: '^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$'
          }
        }
      ],
      outputFormat: {
        type: 'json',
        schema: {
          total: 'number',
          matches: 'array',
          ip_str: 'string'
        }
      }
    };
    
    super(shodanTool.id, schema);

    // The key is read at call time, so one added later takes effect without a reload.
    this.shodanClient = new ShodanApiClient();
  }

  async initialize(): Promise<boolean> {
    try {
      // Whether the user has supplied a key is a local question with an
      // immediate answer, so it is asked directly rather than by making a
      // network call to find out. The previous version probed the proxy on
      // every initialize, which is why an unconfigured tool cost a round trip
      // to a 404 before falling back.
      if (this.shodanClient.hasKey()) {
        // Check the key now, so a rejected one is reported at startup rather than
        // on the first search. Nothing stands in for a rejected key: searches then
        // report Shodan's own refusal.
        try {
          await this.shodanClient.getApiInfo();
          console.log('Shodan adapter initialized with the user\'s own API key');
        } catch (error) {
          console.warn('Shodan rejected the key that is set:', error);
        }
      } else {
        console.log('No Shodan key configured — Shodan will report that it is not available.');
      }

      return await super.initialize();
    } catch (error) {
      console.error('Failed to initialize Shodan adapter', error);
      return false;
    }
  }
  
  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResponse> {
    const startTime = Date.now();
    
    // Check if adapter is initialized
    if (!this.initialized) {
      return this.createErrorResponse(
        request, 
        'Shodan adapter not initialized'
      );
    }
    
    // Validate parameters
    if (!this.validateParameters(request.parameters)) {
      return this.createErrorResponse(
        request, 
        'Invalid parameters for Shodan operation'
      );
    }
    
    try {
      // Determine the operation to perform
      const operation = (request.parameters.operation || 'search') as string;
      let results: Record<string, unknown>;
      
      const client = this.shodanClient;
      
      if (operation === 'host') {
        // Check if IP is provided for host operation
        const ip = request.parameters.ip as string;
        if (!ip) {
          return this.createErrorResponse(
            request, 
            'IP address is required for host operation'
          );
        }
        
        // Without the person's own key there is nothing to ask. Say so, rather than answer.
        if (!client.hasKey()) {
          return this.createErrorResponse(request, SHODAN_NOT_AVAILABLE);
        }
        results = await client.host(ip);
      } else {
        // Extract parameters for search operation
        const query = request.parameters.query as string;
        const limit = (request.parameters.limit || 10) as number;
        
        // Without the person's own key there is nothing to ask. Say so, rather than answer.
        if (!client.hasKey()) {
          return this.createErrorResponse(request, SHODAN_NOT_AVAILABLE);
        }
        results = await client.search(query, limit);
      }
      
      // Determine intel types generated
      const intelTypes: IntelType[] = ['network', 'infrastructure'];
      
      // Add vulnerability intel if present
      if ('vulns' in results || 
          (results.matches as Array<Record<string, unknown>>)?.some(m => 'vulns' in m)) {
        intelTypes.push('vulnerability');
      }
      
      // Add metadata about the execution
      const enhancedResults = {
        ...results,
        _metadata: {
          toolId: this.toolId,
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          intelTypes,
          operation
        }
      };
      
      const executionTime = Date.now() - startTime;
      return this.createSuccessResponse(request, enhancedResults, executionTime);
    } catch (error) {
      return this.createErrorResponse(
        request, 
        `Error executing Shodan operation: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

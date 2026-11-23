/**
 * CensysAdapter.ts
 * 
 * Adapter for the Censys OSINT tool.
 * Provides an interface for querying the Censys v2 API for host and certificate data.
 */

import axios from 'axios';
import {
  ToolExecutionRequest,
  ToolExecutionResponse,
  ToolSchema,
  netRunnerPowerTools
} from '../NetRunnerPowerTools';
import { BaseAdapter } from './BaseAdapter';
import { resolveCredential } from '../../../../shared/config/userCredentialStore';

/**
 * Censys v2 client — calls search.censys.io directly with the USER'S OWN
 * credentials.
 *
 * It previously proxied through api/censys-proxy.ts, which held CENSYS_API_ID
 * and CENSYS_SECRET server-side. That was correct for the problem it solved:
 * the earlier design used VITE_-prefixed variables, and Vite inlines those, so
 * the operator's real credentials shipped in every bundle.
 *
 * The proxy was never deployed, so this tool has not worked. And Starcom now
 * runs no server, deliberately. Bring-your-own-key resolves both: an OPERATOR's
 * credential in a browser is a leak, a USER's own credential in their own
 * browser is just theirs.
 *
 * Verified before relying on it: search.censys.io returns
 * `access-control-allow-origin: *`, so browser calls are permitted.
 *
 * Censys uses HTTP Basic with two parts, so the stored credential is
 * `API_ID:SECRET` and is split here. Storing it joined keeps userCredentialStore
 * ignorant of any provider's credential shape, which is what lets providers be
 * added without touching it.
 */
class CensysApiClient {
  private baseUrl = 'https://search.censys.io/api/v2';

  /** No build-time fallback is passed: no operator credential exists, and
   *  introducing one would inline it into every bundle. */
  private basicAuth(): string | null {
    const raw = resolveCredential('censys').value;
    if (!raw || !raw.includes(':')) return null;
    return btoa(raw);
  }

  private requireAuth(): string {
    const a = this.basicAuth();
    if (!a) {
      throw new Error(
        'No Censys credentials. Add yours as API_ID:SECRET in settings to use this '
        + 'tool — they are used from your browser and never sent to Starcom.',
      );
    }
    return a;
  }

  hasCredentials(): boolean {
    return this.basicAuth() !== null;
  }

  private headers() {
    return { Authorization: `Basic ${this.requireAuth()}` };
  }

  async searchHosts(query: string, perPage: number = 25): Promise<Record<string, unknown>> {
    const response = await axios.get(`${this.baseUrl}/hosts/search`, {
      params: { q: query, per_page: perPage },
      headers: this.headers(),
      timeout: 30000
    });
    return response.data;
  }

  async viewHost(ip: string): Promise<Record<string, unknown>> {
    const response = await axios.get(`${this.baseUrl}/hosts/${encodeURIComponent(ip)}`, {
      headers: this.headers(),
      timeout: 30000
    });
    return response.data;
  }

  async searchCertificates(query: string, perPage: number = 25): Promise<Record<string, unknown>> {
    const response = await axios.get(`${this.baseUrl}/certificates/search`, {
      params: { q: query, per_page: perPage },
      headers: this.headers(),
      timeout: 30000
    });
    return response.data;
  }

  async getAccount(): Promise<Record<string, unknown>> {
    const response = await axios.get(`${this.baseUrl}/account`, {
      headers: this.headers(),
      timeout: 10000
    });
    return response.data;
  }
}

// Mock Censys client for development
const mockCensysClient = {
  _isMockData: true,
  async searchHosts(query: string, perPage: number = 25) {
    return {
      code: 200,
      status: 'OK',
      result: {
        query,
        total: 0,
        hits: [],
        links: { next: '', prev: '' }
      },
      _isMockData: true,
      // Censys takes the person's OWN credentials (resolveCredential, see the header). The old
      // advice — set VITE_CENSYS_API_ID and VITE_CENSYS_SECRET — would have inlined a secret into
      // the public bundle, the exact thing that header explains this adapter stopped doing.
      _note: `Sample Censys response for "${query}" (limit: ${perPage}). Add your own Censys credentials to query Censys.`
    };
  },
  async viewHost(ip: string) {
    return {
      code: 200,
      result: { ip, services: [], location: {}, autonomous_system: {} },
      _isMockData: true
    };
  },
  async searchCertificates(query: string, perPage: number = 25) {
    return {
      code: 200,
      result: { query, total: 0, hits: [], links: {} },
      _isMockData: true,
      _note: `Mock Censys certificate search for "${query}" (limit: ${perPage}).`
    };
  },
  async getAccount() {
    return { login: 'mock-user', email: 'mock@example.com', _isMockData: true };
  }
};

export class CensysAdapter extends BaseAdapter {
  private censysClient: CensysApiClient | typeof mockCensysClient = mockCensysClient;
  private useMockClient: boolean = true;

  constructor() {
    const censysTool = netRunnerPowerTools.find(tool => tool.name === 'Censys');

    if (!censysTool) {
      throw new Error('Censys tool not found in the NetRunnerPowerTools collection');
    }

    const schema: ToolSchema = {
      id: censysTool.id,
      name: censysTool.name,
      description: censysTool.description,
      parameters: [
        {
          name: 'query',
          type: 'string',
          description: 'Censys search query (e.g., "services.port: 443 and location.country: US")',
          required: true,
          validation: { pattern: '^.{2,}$' }
        },
        {
          name: 'operation',
          type: 'string',
          description: 'Operation: "search_hosts", "view_host", or "search_certificates"',
          required: true,
          default: 'search_hosts',
          options: ['search_hosts', 'view_host', 'search_certificates']
        },
        {
          name: 'ip',
          type: 'string',
          description: 'IP address (only for "view_host" operation)',
          required: false,
          validation: { pattern: '^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$' }
        },
        {
          name: 'limit',
          type: 'number',
          description: 'Maximum results per page',
          required: false,
          default: 25,
          validation: { min: 1, max: 100 }
        }
      ],
      outputFormat: {
        type: 'json',
        schema: { total: 'number', hits: 'array', result: 'object' }
      }
    };

    super(censysTool.id, schema);
  }

  async initialize(): Promise<boolean> {
    // Real-vs-mock is decided by whether the USER has supplied credentials.
    // There is no operator credential anywhere — not in the bundle, not on a
    // server — so "none configured" is the ordinary state for a new user, and
    // the mock exists so the tool is explorable without them.
    const client = new CensysApiClient();
    if (!client.hasCredentials()) {
      this.censysClient = mockCensysClient;
      this.useMockClient = true;
      return super.initialize();
    }
    try {
      // Credentials present: confirm they work now rather than on the user's
      // first search.
      await client.getAccount();
      this.censysClient = client;
      this.useMockClient = false;
    } catch {
      this.censysClient = mockCensysClient;
      this.useMockClient = true;
    }
    return super.initialize();
  }

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResponse> {
    if (!this.initialized) {
      return this.createErrorResponse(request, 'CensysAdapter not initialized. Call initialize() first.');
    }

    if (!this.validateParameters(request.parameters)) {
      return this.createErrorResponse(request, 'Invalid parameters for Censys operation.');
    }

    const startTime = Date.now();
    const operation = (request.parameters.operation as string) || 'search_hosts';
    const query = request.parameters.query as string;
    const limit = (request.parameters.limit as number) || 25;

    try {
      let result: Record<string, unknown>;

      switch (operation) {
        case 'view_host': {
          const ip = request.parameters.ip as string;
          if (!ip) {
            return this.createErrorResponse(request, 'IP address is required for view_host operation.');
          }
          result = await this.censysClient.viewHost(ip);
          break;
        }
        case 'search_certificates':
          result = await this.censysClient.searchCertificates(query, limit);
          break;
        case 'search_hosts':
        default:
          result = await this.censysClient.searchHosts(query, limit);
          break;
      }

      return this.createSuccessResponse(request, result, Date.now() - startTime);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return this.createErrorResponse(request, 'Invalid Censys API credentials.');
        }
        if (error.response?.status === 429) {
          return this.createErrorResponse(request, 'Censys API rate limit exceeded.');
        }
        return this.createErrorResponse(request, `Censys API error: ${error.response?.data?.error || error.message}`);
      }
      return this.createErrorResponse(request, `Censys operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

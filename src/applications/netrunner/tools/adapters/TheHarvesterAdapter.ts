/**
 * TheHarvesterAdapter.ts
 *
 * Adapter for theHarvester OSINT tool.
 * theHarvester is a separate program; this adapter reaches it through a service
 * endpoint that exposes its email, subdomain and name harvesting over HTTP.
 *
 * Without that endpoint there is nothing to ask, and the adapter says so. It used
 * to answer anyway, with emails, subdomains and employee names built from lists of
 * common prefixes and first names, so a mission could file "john.doe@<target>" or
 * a "Manager at <company>" as if it had been collected.
 */

import axios from 'axios';
import {
  ToolExecutionRequest,
  ToolExecutionResponse,
  ToolSchema,
  IntelType,
  netRunnerPowerTools
} from '../NetRunnerPowerTools';
import { BaseAdapter } from './BaseAdapter';

/** What every request gets back when this adapter was given no theHarvester service. */
export const THEHARVESTER_NOT_AVAILABLE =
  'theHarvester is not available: no theHarvester service is configured, so nothing was collected';

class TheHarvesterClient {
  private readonly apiEndpoint: string | null;

  constructor(apiEndpoint?: string) {
    this.apiEndpoint = apiEndpoint || null;
  }

  isConfigured(): boolean {
    return this.apiEndpoint !== null;
  }

  private async harvest(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.apiEndpoint) {
      throw new Error(THEHARVESTER_NOT_AVAILABLE);
    }
    try {
      const response = await axios.post(`${this.apiEndpoint}/harvest/${path}`, body, { timeout: 60000 });
      return response.data;
    } catch (error) {
      throw new Error(`theHarvester API error: ${error}`);
    }
  }

  gatherEmails(domain: string, limit: number = 10): Promise<Record<string, unknown>> {
    return this.harvest('emails', { domain, limit, sources: ['google', 'bing', 'dnsdumpster', 'duckduckgo'] });
  }

  gatherSubdomains(domain: string, limit: number = 10): Promise<Record<string, unknown>> {
    return this.harvest('subdomains', { domain, limit, sources: ['dnsdumpster', 'virustotal', 'crtsh', 'netcraft'] });
  }

  gatherNames(company: string, limit: number = 10): Promise<Record<string, unknown>> {
    return this.harvest('names', { company, limit, sources: ['linkedin', 'google', 'bing', 'duckduckgo'] });
  }
}

export class TheHarvesterAdapter extends BaseAdapter {
  private harvesterClient: TheHarvesterClient;

  constructor(apiEndpoint?: string) {
    // Find the theHarvester tool from the collection
    const harvesterTool = netRunnerPowerTools.find(tool => tool.name === 'theHarvester');

    if (!harvesterTool) {
      throw new Error('theHarvester tool not found in the NetRunnerPowerTools collection');
    }

    // Define the tool schema for theHarvester
    const schema: ToolSchema = {
      id: harvesterTool.id,
      name: harvesterTool.name,
      description: harvesterTool.description,
      parameters: [
        {
          name: 'operation',
          type: 'string',
          description: 'Operation type: "emails", "subdomains", or "names"',
          required: true,
          options: ['emails', 'subdomains', 'names'],
          default: 'emails'
        },
        {
          name: 'domain',
          type: 'string',
          description: 'Target domain for email or subdomain harvesting',
          required: false,
          validation: {
            // Any number of labels: www.example.com and example.co.uk are domains too.
            pattern: '^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,}$'
          }
        },
        {
          name: 'company',
          type: 'string',
          description: 'Company name for employee name harvesting',
          required: false
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
        }
      ],
      outputFormat: {
        type: 'json',
        schema: {
          domain: 'string',
          emails: 'array',
          subdomains: 'array',
          names: 'array',
          count: 'number'
        }
      }
    };

    super(harvesterTool.id, schema);

    this.harvesterClient = new TheHarvesterClient(apiEndpoint);
  }

  async initialize(): Promise<boolean> {
    try {
      // Nothing to connect to here: whether a service was given is answered per
      // request, in execute().
      console.log('Initializing theHarvester adapter');
      return await super.initialize();
    } catch (error) {
      console.error('Failed to initialize theHarvester adapter', error);
      return false;
    }
  }

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResponse> {
    const startTime = Date.now();

    // Check if adapter is initialized
    if (!this.initialized) {
      return this.createErrorResponse(
        request,
        'theHarvester adapter not initialized'
      );
    }

    // Validate parameters
    if (!this.validateParameters(request.parameters)) {
      return this.createErrorResponse(
        request,
        'Invalid parameters for theHarvester operation'
      );
    }

    // Without a service there is nothing to ask. Say so, rather than answer.
    if (!this.harvesterClient.isConfigured()) {
      return this.createErrorResponse(request, THEHARVESTER_NOT_AVAILABLE);
    }

    try {
      // Determine the operation to perform
      const operation = request.parameters.operation as string;
      const limit = (request.parameters.limit || 10) as number;
      let results: Record<string, unknown>;

      // Execute the appropriate operation
      switch (operation) {
        case 'emails': {
          // Check if domain is provided for email operation
          const emailDomain = request.parameters.domain as string;
          if (!emailDomain) {
            return this.createErrorResponse(
              request,
              'Domain is required for email harvesting operation'
            );
          }
          results = await this.harvesterClient.gatherEmails(emailDomain, limit);
          break;
        }

        case 'subdomains': {
          // Check if domain is provided for subdomain operation
          const subdomainTarget = request.parameters.domain as string;
          if (!subdomainTarget) {
            return this.createErrorResponse(
              request,
              'Domain is required for subdomain harvesting operation'
            );
          }
          results = await this.harvesterClient.gatherSubdomains(subdomainTarget, limit);
          break;
        }

        case 'names': {
          // Check if company is provided for name operation
          const company = request.parameters.company as string;
          if (!company) {
            return this.createErrorResponse(
              request,
              'Company name is required for employee name harvesting operation'
            );
          }
          results = await this.harvesterClient.gatherNames(company, limit);
          break;
        }

        default:
          return this.createErrorResponse(
            request,
            `Unsupported operation: ${operation}. Supported operations are: "emails", "subdomains", "names"`
          );
      }

      // Determine intel types generated
      let intelTypes: IntelType[] = [];

      if (operation === 'emails' || operation === 'names') {
        intelTypes = ['identity', 'network'];
      } else if (operation === 'subdomains') {
        intelTypes = ['network', 'infrastructure'];
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
        `Error executing theHarvester operation: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

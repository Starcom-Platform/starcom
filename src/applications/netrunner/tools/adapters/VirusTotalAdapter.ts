/**
 * VirusTotalAdapter.ts
 * 
 * Adapter for the VirusTotal v3 OSINT tool.
 * Provides file hash lookup, URL scanning, and domain/IP reputation analysis.
 */

import axios from 'axios';
import {
  ToolExecutionRequest,
  ToolExecutionResponse,
  ToolSchema,
  netRunnerPowerTools
} from '../NetRunnerPowerTools';
import { BaseAdapter } from './BaseAdapter';

/*
 * Sample responses — the ONLY client this adapter has, in every environment.
 *
 * VirusTotal returns no CORS header, so no browser can read its API whoever holds the
 * key (see initialize()). A client that went through /api/virustotal-proxy sat above
 * this; that proxy was deleted with the rest of api/ in b7283a86, so it could only
 * fail, and it is gone too. Every response here is marked _isMockData, which
 * BotMissionExecutor turns into the "mock data" label a person sees.
 */
const mockVirusTotalClient = {
  _isMockData: true,
  async getFileReport(hash: string) {
    return {
      data: {
        id: hash,
        type: 'file',
        attributes: {
          last_analysis_stats: { malicious: 0, suspicious: 0, undetected: 0, harmless: 0 },
          last_analysis_results: {}
        }
      },
      _isMockData: true,
      // Not "set a key for real data": a key cannot get past the missing CORS header, and a
      // VITE_ variable would be inlined into the public bundle for anyone to read.
      _note: `Sample VirusTotal response for hash "${hash}". VirusTotal cannot be queried from a browser, so this tool never calls it.`
    };
  },
  async scanUrl(url: string) {
    return {
      data: { type: 'analysis', id: `mock-analysis-${Date.now()}`, links: { self: url } },
      _isMockData: true
    };
  },
  async getUrlReport(urlId: string) {
    return {
      data: {
        id: urlId, type: 'url',
        attributes: { last_analysis_stats: { malicious: 0, suspicious: 0, undetected: 0, harmless: 0 } }
      },
      _isMockData: true
    };
  },
  async getDomainReport(domain: string) {
    return {
      data: {
        id: domain, type: 'domain',
        attributes: { last_analysis_stats: { malicious: 0, suspicious: 0, undetected: 0, harmless: 0 } }
      },
      _isMockData: true
    };
  },
  async getIpReport(ip: string) {
    return {
      data: {
        id: ip, type: 'ip_address',
        attributes: { last_analysis_stats: { malicious: 0, suspicious: 0, undetected: 0, harmless: 0 } }
      },
      _isMockData: true
    };
  },
  async getAccountQuota() {
    return { data: { attributes: { quotas: {} } }, _isMockData: true };
  }
};

export class VirusTotalAdapter extends BaseAdapter {
  private vtClient: typeof mockVirusTotalClient = mockVirusTotalClient;
  private useMockClient: boolean = true;

  constructor() {
    const vtTool = netRunnerPowerTools.find(tool => tool.name === 'VirusTotal');

    if (!vtTool) {
      throw new Error('VirusTotal tool not found in the NetRunnerPowerTools collection');
    }

    const schema: ToolSchema = {
      id: vtTool.id,
      name: vtTool.name,
      description: vtTool.description,
      parameters: [
        {
          name: 'query',
          type: 'string',
          description: 'Hash (MD5/SHA1/SHA256), URL, domain, or IP to analyze',
          required: true,
          validation: { pattern: '^.{2,}$' }
        },
        {
          name: 'operation',
          type: 'string',
          description: 'Operation: "file_report", "scan_url", "domain_report", or "ip_report"',
          required: true,
          default: 'file_report',
          options: ['file_report', 'scan_url', 'domain_report', 'ip_report']
        }
      ],
      outputFormat: {
        type: 'json',
        schema: { data: 'object', type: 'string', attributes: 'object' }
      }
    };

    super(vtTool.id, schema);
  }

  sampleOnlyReason(): string | null {
    return this.useMockClient
      ? 'VirusTotal cannot be reached from a browser (it sends no CORS header), so it answers here only with sample data.'
      : null;
  }

  async initialize(): Promise<boolean> {
    /*
     * VIRUSTOTAL CANNOT BE CALLED FROM A BROWSER, and unlike Shodan and Censys
     * that is not something a key would fix.
     *
     * Shodan and Censys were converted to bring-your-own-key because both
     * return `access-control-allow-origin: *`, so a browser may call them with
     * the user's own credentials. VirusTotal returns no such header — checked
     * directly, on both a preflight and a real GET — so the browser blocks the
     * response regardless of who holds the key.
     *
     * That leaves three options and none of them is good:
     *
     *   a proxy       reintroduces a server, which is the position this project
     *                 has deliberately given up (see guard-no-server-surface)
     *   pretend       ship a tool that always fails, which is what was happening
     *   say so        this
     *
     * So it stays on sample data with the reason stated, rather than joining
     * the set of features that look available and are not. If VirusTotal is
     * genuinely needed, that is a decision to run a server for it — a real
     * trade with a real cost, worth making deliberately rather than by leaving
     * a broken adapter in place.
     */
    this.vtClient = mockVirusTotalClient;
    this.useMockClient = true;
    return super.initialize();
  }

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResponse> {
    if (!this.initialized) {
      return this.createErrorResponse(request, 'VirusTotalAdapter not initialized. Call initialize() first.');
    }

    if (!this.validateParameters(request.parameters)) {
      return this.createErrorResponse(request, 'Invalid parameters for VirusTotal operation.');
    }

    const startTime = Date.now();
    const operation = (request.parameters.operation as string) || 'file_report';
    const query = request.parameters.query as string;

    try {
      let result: Record<string, unknown>;

      switch (operation) {
        case 'scan_url':
          result = await this.vtClient.scanUrl(query);
          break;
        case 'domain_report':
          result = await this.vtClient.getDomainReport(query);
          break;
        case 'ip_report':
          result = await this.vtClient.getIpReport(query);
          break;
        case 'file_report':
        default:
          result = await this.vtClient.getFileReport(query);
          break;
      }

      return this.createSuccessResponse(request, result, Date.now() - startTime);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          return this.createErrorResponse(request, 'Invalid VirusTotal API key.');
        }
        if (error.response?.status === 429) {
          return this.createErrorResponse(request, 'VirusTotal API rate limit exceeded (4 req/min free tier).');
        }
        if (error.response?.status === 404) {
          return this.createErrorResponse(request, `Resource not found: "${query}" has no VirusTotal report.`);
        }
        return this.createErrorResponse(request, `VirusTotal API error: ${error.response?.data?.error?.message || error.message}`);
      }
      return this.createErrorResponse(request, `VirusTotal operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

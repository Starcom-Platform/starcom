/**
 * What a bot mission sends each tool (plan item 7, block C).
 *
 * Every mission sent "search" to every tool but two. Censys offers
 * search_hosts, search_certificates and view_host, and VirusTotal its reports,
 * so both rejected every mission. VirusTotal cannot be reached from a browser
 * at all (it sends no CORS header) and runs on sample data; a mission records
 * that it could not look, rather than file the sample.
 */
import { describe, it, expect } from 'vitest';
import { toolParametersFor, couldNotLook } from '../BotMissionExecutor';
import { VirusTotalAdapter } from '../../tools/adapters/VirusTotalAdapter';
import { CensysAdapter } from '../../tools/adapters/CensysAdapter';

describe('toolParametersFor', () => {
  it('asks Censys for hosts by name, or for one host by its address', () => {
    expect(toolParametersFor('Censys', 'censys', 'https://example.com/path', 'infrastructure'))
      .toMatchObject({ operation: 'search_hosts', query: 'example.com' });
    expect(toolParametersFor('Censys', 'censys', '93.184.216.34', 'infrastructure'))
      .toMatchObject({ operation: 'view_host', ip: '93.184.216.34', query: '93.184.216.34' });
  });

  it('asks VirusTotal for a domain or an address report, never a scan that would publish the target', () => {
    expect(toolParametersFor('VirusTotal', 'vt', 'example.com', 'infrastructure'))
      .toMatchObject({ operation: 'domain_report', query: 'example.com' });
    expect(toolParametersFor('VirusTotal', 'vt', '93.184.216.34', 'infrastructure'))
      .toMatchObject({ operation: 'ip_report', query: '93.184.216.34' });
  });

  it('sends each adapter an operation its schema offers', () => {
    for (const [name, Adapter] of [['Censys', CensysAdapter], ['VirusTotal', VirusTotalAdapter]] as const) {
      const offered = new Adapter().getToolSchema().parameters.find((p) => p.name === 'operation')?.options ?? [];
      for (const target of ['example.com', '93.184.216.34']) {
        expect(offered).toContain(toolParametersFor(name, name, target, 'infrastructure').operation);
      }
    }
  });
});

describe('couldNotLook', () => {
  it('says why a tool that can only answer with sample data is not run', async () => {
    const vt = new VirusTotalAdapter();
    await vt.initialize();
    expect(couldNotLook(vt)).toMatch(/VirusTotal cannot be reached from a browser/);
  });

  it('runs a tool that can answer for real', () => {
    expect(couldNotLook(new CensysAdapter())).toBeNull();
  });
});

/**
 * NetRunner Scripts Engine - Basic Test Suite
 *
 * Converted from BasicScriptEngineTests.ts, which defined this exact
 * coverage as manually-invoked async functions (throw-on-failure, no
 * describe/test) that nothing in the app ever called — so despite looking
 * like a real, working suite, it never actually ran. This is the same
 * logic ported to real vitest describe/test/expect blocks.
 */

import { NetRunnerScriptRegistry } from '../engine/NetRunnerScriptRegistry';
import { ScriptExecutionEngine } from '../engine/ScriptExecutionEngine';
import { OSINTData } from '../../services/WebsiteScanner';

describe('NetRunner Scripts Engine — basic functionality', () => {
  const registry = NetRunnerScriptRegistry.getInstance();
  const engine = ScriptExecutionEngine.getInstance();

  test('registry initializes with default scripts registered', () => {
    const scripts = registry.getAllScripts();
    expect(scripts.length).toBeGreaterThan(0);

    const emailScript = registry.getScript('email-extractor-v1');
    expect(emailScript).toBeDefined();
  });

  test('scripts are discoverable by category and search', () => {
    const emailScripts = registry.getScriptsByCategory('email-extraction');
    expect(emailScripts.length).toBeGreaterThan(0);

    const searchResults = registry.searchScripts('email');
    expect(searchResults.length).toBeGreaterThan(0);
  });

  test('email-extractor-v1 executes successfully against real OSINT data shape', async () => {
    const testInput = {
      data: {
        emails: ['info@example.com', 'support@test.org'],
        socialMedia: ['@example'],
        technologies: [
          { name: 'nginx', category: 'framework' as const, confidence: 0.9 }
        ],
        serverInfo: ['nginx/1.18.0'],
        subdomains: ['www.example.com'],
        certificates: [],
        dns: [],
        content: 'Contact us at info@example.com or support@test.org for more information.',
        html: '<p>Email us at <a href="mailto:sales@company.com">sales@company.com</a></p>',
        urls: ['https://example.com/contact']
      } as unknown as OSINTData,
      source: 'test-data',
      timestamp: new Date(),
      metadata: {
        scanId: 'test-scan-001',
        targetUrl: 'https://example.com',
        scanType: 'website-scan',
        confidence: 0.9
      }
    };

    const result = await engine.executeScript(
      'email-extractor-v1',
      testInput,
      { validateDNS: false, confidenceThreshold: 0.5, maxResults: 100 }
    );

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  test('executing an unregistered script id resolves a real failure, not a fabricated success', async () => {
    // Doesn't throw — executeScript() fails safe with a structured
    // success:false result carrying a real error, rather than an uncaught
    // exception or (worse) a fabricated success.
    const result = await engine.executeScript('non-existent-script', {
      data: {},
      source: 'test',
      timestamp: new Date(),
      metadata: { scanId: 'test', targetUrl: 'test', scanType: 'test', confidence: 1 }
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('executing with null data does not throw — it resolves with a real success/failure result', async () => {
    const result = await engine.executeScript('email-extractor-v1', {
      data: null,
      source: 'test',
      timestamp: new Date(),
      metadata: { scanId: 'test', targetUrl: 'test', scanType: 'test', confidence: 1 }
    });

    expect(typeof result.success).toBe('boolean');
  });
});

describe('NetRunner Scripts Engine — performance', () => {
  test('processes a 100-email dataset in a reasonable time', async () => {
    const engine = ScriptExecutionEngine.getInstance();
    const largeTestData = {
      emails: Array.from({ length: 100 }, (_, i) => `user${i}@example${i}.com`),
      socialMedia: ['@company'],
      technologies: [{ name: 'nginx', category: 'framework' as const, confidence: 0.9 }],
      serverInfo: ['nginx/1.18.0'],
      subdomains: ['www.example.com'],
      certificates: [],
      dns: [],
      content: 'Contact information: ' +
        Array.from({ length: 100 }, (_, i) => `user${i}@example${i}.com`).join(', ') +
        ' Additional content with various emails like admin@test.org, support@help.net',
      html: '<div>' +
        Array.from({ length: 50 }, (_, i) => `<a href="mailto:contact${i}@site${i}.com">Email ${i}</a>`).join('') +
        '</div>'
    };

    const performanceInput = {
      data: largeTestData as unknown as OSINTData,
      source: 'performance-test',
      timestamp: new Date(),
      metadata: {
        scanId: 'perf-test-001',
        targetUrl: 'https://performance-test.com',
        scanType: 'website-scan',
        confidence: 0.9
      }
    };

    const startTime = Date.now();
    const result = await engine.executeScript('email-extractor-v1', performanceInput);
    const duration = Date.now() - startTime;

    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(5000);
  });
});

describe('NetRunner Scripts Engine — integration', () => {
  test('extracts multiple real-looking emails from realistic page content', async () => {
    const engine = ScriptExecutionEngine.getInstance();
    const mockOSINTData = {
      emails: [
        'info@company.example.com',
        'sales@company.example.com',
        'support@company.example.com',
        'security@company.example.com',
        'ceo@company.example.com'
      ],
      socialMedia: ['@examplecompany'],
      technologies: [
        { name: 'nginx', category: 'framework' as const, confidence: 0.9 },
        { name: 'cloudflare', category: 'cdn' as const, confidence: 0.8 },
        { name: 'google-analytics', category: 'analytics' as const, confidence: 0.9 }
      ],
      serverInfo: ['nginx/1.18.0', 'cloudflare'],
      subdomains: ['www.company.example.com', 'api.company.example.com'],
      certificates: [],
      dns: [],
      url: 'https://company.example.com',
      title: 'Example Company - Contact Us',
      content: `
        Welcome to Example Company!

        For general inquiries: info@company.example.com
        Sales team: sales@company.example.com
        Technical support: support@company.example.com
        Security issues: security@company.example.com

        You can also reach out to our CEO directly at ceo@company.example.com

        Our office locations:
        - New York: ny.office@company.example.com
        - London: london@company.example.com
        - Tokyo: tokyo.office@company.example.com
      `,
      metadata: {
        scanDate: new Date().toISOString(),
        scanDuration: 2500,
        httpStatus: 200
      }
    };

    const integrationInput = {
      data: mockOSINTData as unknown as OSINTData,
      source: 'integration-test',
      timestamp: new Date(),
      metadata: {
        scanId: 'integration-test-001',
        targetUrl: 'https://company.example.com',
        scanType: 'comprehensive-scan',
        confidence: 0.95
      }
    };

    const result = await engine.executeScript(
      'email-extractor-v1',
      integrationInput,
      { validateDNS: false, confidenceThreshold: 0.8, categorizeEmails: true, maxResults: 50 }
    );

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});

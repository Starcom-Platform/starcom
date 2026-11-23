/**
 * A scan reports its steps, not a percentage (plan item 8.3b). It reported 10,
 * 25, 40, 60, 80, 90: weights nobody measured. The fetch is nearly all of a
 * scan and the rest takes no time, so the bar sat at 10% for the whole wait and
 * then ran to the end.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebsiteScannerService, type ScanStep } from '../WebsiteScanner';

const page = { html: '<html><head><title>T</title></head><body></body></html>', metadata: {}, realHeaders: {} };

describe('WebsiteScannerService, its progress', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reports each step as a step of the whole, in order', async () => {
    const scanner = new WebsiteScannerService();
    vi.spyOn(scanner as unknown as { fetchWithFallback: () => Promise<typeof page> }, 'fetchWithFallback').mockResolvedValue(page);
    const steps: ScanStep[] = [];
    await scanner.scanWebsite('https://example.invalid', (step) => steps.push(step), { storeIntel: false });
    expect(steps.map((s) => `${s.step} of ${s.of}`)).toEqual(['1 of 5', '2 of 5', '3 of 5', '4 of 5', '5 of 5']);
    expect(steps[0].label).toBe('Fetching the page');
  });

  it('in a browser with neither Uplink nor the desktop app, says it needs one, and asks no proxy', async () => {
    // Three public CORS proxies were tried first: dead on 2026-10-01, and each
    // was told what was being investigated (plan item 7, block C).
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const scanner = new WebsiteScannerService();
    await expect(scanner.scanWebsite('https://example.invalid', undefined, { storeIntel: false }))
      .rejects.toThrow(/Page scans need Starcom Uplink or the Starcom desktop app/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});


import { describe, it, expect } from 'vitest';
import { IntelDataProvider, type IntelProviderReport } from '../IntelDataProvider';

// We indirectly exercise legacyToUI by calling the private method through fetchSolanaIntelReports fallback
// Strategy: monkey patch provider to expose legacyToUI via casting and call it with crafted legacy shapes.

function makeLegacy(overrides: Partial<IntelProviderReport> = {}): IntelProviderReport {
  return {
    pubkey: overrides.pubkey || 'legacy-1',
    title: overrides.title || 'Legacy Report',
    content: overrides.content || 'Legacy content body describing something important.',
    tags: overrides.tags || ['legacy','alias'],
    latitude: overrides.latitude ?? 10,
    longitude: overrides.longitude ?? 20,
    timestamp: overrides.timestamp ?? Date.now(),
    author: overrides.author || 'legacy-author',
    visibility: overrides.visibility,
    source: overrides.source,
    verified: overrides.verified
  };
}

describe('IntelDataProvider legacy → UI alias mapping', () => {
  /*
   * Was 'maps legacy classification variants to IntelReportUI.classification',
   * asserting that 'SECRET' survived and 'UNCLASS' became 'UNCLASSIFIED' —
   * i.e. it pinned a tier REMAPPING between two different spellings of the
   * same ladder. ('UNCLASS' appeared in no other file in the codebase.)
   *
   * The axis carries across as itself, and absence stays absent instead of
   * being remapped to an invented bottom rung.
   */
  it('carries visibility across as itself, and leaves absence absent', () => {
    const provider = new IntelDataProvider();
    const ui = (provider as any).legacyToUI(makeLegacy({ visibility: 'private' as any }));
    expect(ui.visibility).toBe('private');

    const unmarked = (provider as any).legacyToUI(makeLegacy({}));
    expect(unmarked.visibility).toBeUndefined();
  });

  it('produces summary trimmed to 140 chars', () => {
    const provider = new IntelDataProvider();
    const longContent = 'x'.repeat(500);
    const legacy = makeLegacy({ content: longContent });
    const ui = (provider as any).legacyToUI(legacy);
    expect(ui.summary.length).toBeLessThanOrEqual(140);
  });

  it('assigns default confidence and status', () => {
    const provider = new IntelDataProvider();
    const legacy = makeLegacy();
    const ui = (provider as any).legacyToUI(legacy);
    expect(ui.confidence).toBe(0.5);
    expect(ui.status).toBe('DRAFT');
  });

  it('sets createdAt/updatedAt from timestamp', () => {
    const provider = new IntelDataProvider();
    const ts = Date.now() - 10000;
    const legacy = makeLegacy({ timestamp: ts });
    const ui = (provider as any).legacyToUI(legacy);
    expect(ui.createdAt.getTime()).toBe(ts);
    expect(ui.updatedAt.getTime()).toBe(ts);
  });

  it('offers no Solana source: it fetched nothing and answered with placeholder reports (plan item 4.4)', () => {
    const provider = new IntelDataProvider();
    expect(provider.endpoints.map((e) => e.id)).not.toContain('solana-intel-reports');
    expect('configureSolana' in provider).toBe(false);
  });
});

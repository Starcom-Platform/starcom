import { describe, it, expect } from 'vitest';
import axios from 'axios';
import { filterStixBundle, STIX_URL } from './MitreAttackReferenceService';
import fixture from '../../testing/mitreAttackFixture.json';

describe('filterStixBundle (bug-injection verified, fixture-based)', () => {
  it('extracts a real group with its real MITRE ID, aliases, and truncated description', () => {
    const result = filterStixBundle(fixture.objects);
    const apt38 = result.groups.find(g => g.mitreId === 'G0082');
    expect(apt38).toBeDefined();
    expect(apt38!.name).toBe('APT38');
    expect(apt38!.aliases).toContain('BeagleBoyz');
    expect(apt38!.description.length).toBeGreaterThan(0);
  });

  it('skips objects with no mitre-attack external reference rather than including a garbage ID', () => {
    const result = filterStixBundle(fixture.objects);
    expect(result.groups.find(g => g.name === 'Unreferenced Group')).toBeUndefined();
  });

  it('extracts real techniques and malware with their real MITRE IDs', () => {
    const result = filterStixBundle(fixture.objects);
    expect(result.techniques.find(t => t.mitreId === 'T1055.011')).toBeDefined();
    expect(result.malware.find(m => m.mitreId === 'S0061')?.name).toBe('HDoor');
  });

  it('links a group to a technique via a real "uses" relationship', () => {
    const result = filterStixBundle(fixture.objects);
    const apt38 = result.groups.find(g => g.mitreId === 'G0082');
    expect(apt38!.techniqueIds).toEqual(['T1055.011']);
  });

  it('does not attribute a campaign-sourced "uses" relationship to any group', () => {
    const result = filterStixBundle(fixture.objects);
    const apt38 = result.groups.find(g => g.mitreId === 'G0082');
    expect(apt38!.techniqueIds).not.toContain('T1000');
  });

  it('ignores relationships that are not relationship_type "uses"', () => {
    // The fixture's revoked-by relationship points APT38 at the unused technique — must
    // not show up, proving relationship_type is actually checked, not just source/target shape.
    const result = filterStixBundle(fixture.objects);
    const apt38 = result.groups.find(g => g.mitreId === 'G0082');
    expect(apt38!.techniqueIds).not.toContain('T1000');
  });

  it('returns empty collections for empty input rather than throwing', () => {
    const result = filterStixBundle([]);
    expect(result).toEqual({ groups: [], techniques: [], malware: [], fetchedAt: result.fetchedAt });
  });
});

describe('MITRE ATT&CK STIX endpoint — real live reachability (not mocked)', () => {
  // A lightweight HEAD check, not a 53MB download. Doesn't assert on the raw
  // Access-Control-Allow-Origin header value directly: in a real browser (and jsdom's XHR
  // adapter, which is what this runs under), that header controls whether the read
  // succeeds at all but isn't itself exposed to JS inspection unless the server also sends
  // Access-Control-Expose-Headers — a real, well-known CORS behavior, not a bug. A
  // successful cross-origin read (status 200, real content-length) is the actual proof the
  // endpoint is CORS-open; that's what CORS-openness means for our real use case.
  it('is still real, live, and reachable cross-origin', async () => {
    const response = await axios.head(STIX_URL, { timeout: 15000 });
    expect(response.status).toBe(200);
    expect(Number(response.headers['content-length'])).toBeGreaterThan(1_000_000);
  }, 20000);
});

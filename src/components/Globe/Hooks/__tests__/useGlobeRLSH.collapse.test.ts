/**
 * Co-located RLSH markers must not hide each other on the globe.
 *
 * The globe draws one 3D model per report at its coordinates, and the RLSH
 * source geocodes to a CITY CENTROID — so the 197 embedded markers occupy 107
 * distinct coordinates. San Diego was fourteen models stacked in one spot,
 * Seattle thirteen, Portland nine. Exactly one of each stack could be hovered
 * or clicked, so 121 of 197 people were unreachable and invisible while still
 * costing a model and a raycast target.
 *
 * The scraped dataset this was measured on is gone (RS49): profiles now come only as heroes submit them,
 * and several may still name one place. The collapse is unit-tested.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { collapseCoLocated } from '../useGlobeRLSH';
import type { IntelReportOverlayMarker } from '../../../../interfaces/IntelReportOverlay';

const marker = (over: Partial<IntelReportOverlayMarker>): IntelReportOverlayMarker => ({
  pubkey: 'p', title: 't', content: '', tags: [], latitude: 0, longitude: 0,
  timestamp: 0, author: 'wiki.rlsh.net', ...over,
});

describe('collapseCoLocated', () => {
  it('draws one pin per location instead of one per person', () => {
    const stack = [
      marker({ pubkey: 'a', title: 'Axle', groupId: 'g1', groupSize: 3 }),
      marker({ pubkey: 'b', title: 'Bearman', groupId: 'g1', groupSize: 3 }),
      marker({ pubkey: 'c', title: 'Brick', groupId: 'g1', groupSize: 3 }),
      marker({ pubkey: 'z', title: 'Elsewhere', groupId: 'g2', groupSize: 1 }),
    ];
    const out = collapseCoLocated(stack);
    expect(out).toHaveLength(2);
    expect(out.map((m) => m.groupId).sort()).toEqual(['g1', 'g2']);
  });

  it('keeps the count so the tooltip can say who is hidden', () => {
    const out = collapseCoLocated([
      marker({ pubkey: 'a', title: 'Axle', groupId: 'g1', groupSize: 14 }),
      marker({ pubkey: 'b', title: 'Bearman', groupId: 'g1', groupSize: 14 }),
    ]);
    expect(out[0].groupSize).toBe(14);
  });

  it('lets an ACTIVE member represent the location', () => {
    // A city's pin standing for a retired member while an active one hides
    // behind it misreports the thing a reader most wants to know.
    const out = collapseCoLocated([
      marker({ pubkey: 'r', title: 'Aaa Retired', groupId: 'g1', tags: ['Retired'] }),
      marker({ pubkey: 'a', title: 'Zzz Active', groupId: 'g1', tags: ['Active'] }),
    ]);
    expect(out[0].title).toBe('Zzz Active');
  });

  it('picks the same representative on every load', () => {
    const input = [
      marker({ pubkey: 'a', title: 'Bravo', groupId: 'g1', tags: ['Active'] }),
      marker({ pubkey: 'b', title: 'Alpha', groupId: 'g1', tags: ['Active'] }),
    ];
    // A pin that changed identity between loads would make the globe flicker
    // between two people for no reason a viewer could see.
    expect(collapseCoLocated(input)[0].title).toBe('Alpha');
    expect(collapseCoLocated([...input].reverse())[0].title).toBe('Alpha');
  });

  it('leaves an ungrouped marker alone', () => {
    const out = collapseCoLocated([
      marker({ pubkey: 'x', title: 'Solo One' }),
      marker({ pubkey: 'y', title: 'Solo Two' }),
    ]);
    expect(out).toHaveLength(2);
  });

  it('collapses on EVERY path, not just the first load', () => {
    /*
     * A live defect in this very feature, found the day it shipped.
     *
     * useGlobeRLSH collapsed on initial load and did NOT collapse in its
     * service subscribe callback, so the first thing that notified the service
     * — flipping the role filter, or the status filter — re-stacked all 43
     * hidden people. The fix undid itself on the first interaction.
     *
     * It was invisible because the log proving the collapse works is emitted
     * on the path that HAS it, so driving the app confirmed the wrong half.
     *
     * Asserted by reading the hook's source: both paths must reach the
     * collapse. A behavioural test would need to drive a React subscription
     * against a service that returns placeholder markers under test, which
     * would assert the fixture rather than the wiring.
     */
    const src = readFileSync(
      new URL('../useGlobeRLSH.ts', import.meta.url),
      'utf8',
    );
    // No raw setReports(markers) — every set must go through a collapsed value.
    expect(src).not.toMatch(/setReports\(\s*markers\s*\)/);
    // And the shared helper exists, so the two paths cannot diverge again.
    expect(src).toMatch(/fetchDrawnMarkers/);
    const collapseCalls = src.match(/collapseCoLocated\(/g) ?? [];
    // Once in the helper, once on the initial load, once in the definition.
    expect(collapseCalls.length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * What the globe says while its layers load, and after (decision D-LS, LS2 and LS4): each feed as it stands,
 * the time waited from when it was first seen loading, why one failed, and a layer that drew nothing once its
 * feeds are in. Nothing is claimed that is not known: a layer that cannot say what it drew is never called empty.
 */
import { describe, it, expect } from 'vitest';
import { feedKeys, isStillLoading, layerLoadStatus } from '../layerLoadStatus';
import type { FeedProvenance } from '../../capture/shareCardProvenance';

const NOW = Date.parse('2026-10-16T22:00:00Z');
const feed = (over: Partial<FeedProvenance> & { name: string; layer: string }): FeedProvenance => ({ lastUpdated: null, ...over });

describe('layerLoadStatus', () => {
  it('says nothing when every shown layer drew what it loaded', () => {
    expect(layerLoadStatus({
      shown: ['CommHubs'], now: NOW, firstLoadingAt: new Map(), drew: () => true,
      feeds: [feed({ name: 'Submarine cable map', layer: 'CommHubs', timestamped: false })],
    })).toBeNull();
  });

  it('lists each feed still loading, by name, with the time waited since it was first seen loading', () => {
    const status = layerLoadStatus({
      shown: ['ConflictZones'], now: NOW, drew: () => false,
      firstLoadingAt: new Map([['ConflictZones#0', NOW - 9_400]]),
      feeds: [
        feed({ name: 'GDELT conflict events', layer: 'ConflictZones', loading: true }),
        feed({ name: 'Displacement (UNHCR)', layer: 'ConflictZones', timestamped: false }),
      ],
    })!;
    expect(status.loading).toEqual([{ key: 'ConflictZones#0', layer: 'ConflictZones', name: 'GDELT conflict events', waitedMs: 9_400 }]);
    expect(status.failed).toEqual([]);
    // Not empty while a feed is still loading.
    expect(status.empty).toEqual([]);
  });

  it('counts the progress a layer states', () => {
    const status = layerLoadStatus({
      shown: ['OpenMissions'], now: NOW, drew: () => false, firstLoadingAt: new Map(),
      feeds: [feed({ name: 'Mission Packages on The Record', layer: 'OpenMissions', loading: true, progress: { done: 14, total: 68 } })],
    })!;
    expect(status.loading[0]).toMatchObject({ waitedMs: 0, progress: { done: 14, total: 68 } });
  });

  it('says which feed failed and why, beside those still loading', () => {
    const status = layerLoadStatus({
      shown: ['CommHubs', 'CyberThreats'], now: NOW, drew: () => false, firstLoadingAt: new Map(),
      feeds: [
        feed({ name: 'Submarine cable map', layer: 'CommHubs', error: 'HTTP 503' }),
        feed({ name: 'Threat blocklists', layer: 'CyberThreats', loading: true }),
      ],
    })!;
    expect(status.failed).toEqual([{ key: 'CommHubs#0', layer: 'CommHubs', name: 'Submarine cable map', error: 'HTTP 503' }]);
    expect(status.loading.map((f) => f.name)).toEqual(['Threat blocklists']);
  });

  it('calls a layer empty once its feeds are in and it drew nothing, in its feeds\' own words', () => {
    const status = layerLoadStatus({
      shown: ['SceneIncidents'], now: NOW, drew: (layer) => (layer === 'SceneIncidents' ? false : null), firstLoadingAt: new Map(),
      feeds: [feed({ name: 'Scene incidents via Mecha Jono (1 past its end, not drawn; 2 naming no place, listed)', layer: 'SceneIncidents', lastUpdated: '2026-10-16T21:00:00Z' })],
    })!;
    expect(status.empty).toEqual([{ layer: 'SceneIncidents', feeds: ['Scene incidents via Mecha Jono (1 past its end, not drawn; 2 naming no place, listed)'] }]);
  });

  it('never calls a layer empty when it cannot say what it drew, nor one that failed', () => {
    expect(layerLoadStatus({
      shown: ['RLSH'], now: NOW, drew: () => null, firstLoadingAt: new Map(),
      feeds: [feed({ name: 'RLSH registry', layer: 'RLSH', lastUpdated: '2026-03-02T15:15:00Z' })],
    })).toBeNull();
    const failed = layerLoadStatus({
      shown: ['CommHubs'], now: NOW, drew: () => false, firstLoadingAt: new Map(),
      feeds: [feed({ name: 'Submarine cable map', layer: 'CommHubs', error: 'HTTP 503' })],
    })!;
    expect(failed.empty).toEqual([]);
  });

  it('waits on a feed that has not reported yet, rather than calling the layer empty or failed', () => {
    const status = layerLoadStatus({
      shown: ['Satellites'], now: NOW, drew: () => false, firstLoadingAt: new Map([['Satellites#0', NOW - 2_000]]),
      feeds: [feed({ name: 'CelesTrak satellite catalogue', layer: 'Satellites' })],
    })!;
    expect(status.loading).toEqual([{ key: 'Satellites#0', layer: 'Satellites', name: 'CelesTrak satellite catalogue', waitedMs: 2_000 }]);
    expect(status.empty).toEqual([]);
  });

  it('reads only the shown layers\' feeds', () => {
    expect(layerLoadStatus({
      shown: ['Satellites'], now: NOW, drew: () => true, firstLoadingAt: new Map(),
      feeds: [feed({ name: 'Threat blocklists', layer: 'CyberThreats', loading: true }), feed({ name: 'CelesTrak satellite catalogue', layer: 'Satellites', lastUpdated: '2026-10-16T21:50:00Z' })],
    })).toBeNull();
  });

  it('keys each feed by its layer and its place there, not by a name that may change while it loads', () => {
    const feeds = [
      feed({ name: 'Scene incidents, via Mecha Jono', layer: 'SceneIncidents', loading: true }),
      feed({ name: 'Cables', layer: 'CommHubs', loading: true }),
      feed({ name: 'Scene events, via Mecha Jono', layer: 'SceneEvents', loading: true }),
      feed({ name: 'A second Comm Hubs feed', layer: 'CommHubs', loading: true }),
    ];
    expect(feedKeys(feeds)).toEqual(['SceneIncidents#0', 'CommHubs#0', 'SceneEvents#0', 'CommHubs#1']);
    expect(feedKeys([{ ...feeds[0], name: 'Scene incidents from Mixmag Asia, via Mecha Jono' }])).toEqual(['SceneIncidents#0']);
  });

  it('waits on a feed that counts its progress short of its total, though some of it is in', () => {
    // Intel Reports: one relay of six has answered, so the feed has a time, and five are still to come.
    const status = layerLoadStatus({
      shown: ['IntelReports'], now: NOW, drew: () => null, firstLoadingAt: new Map(),
      feeds: [feed({ name: 'Intel Reports from the relays (1 of 6 answered)', layer: 'IntelReports', lastUpdated: '2026-10-16T21:59:00Z', loading: true, progress: { done: 1, total: 6 } })],
    })!;
    expect(status.loading).toEqual([expect.objectContaining({ layer: 'IntelReports', progress: { done: 1, total: 6 } })]);
    expect(isStillLoading(feed({ name: 'x', layer: 'L', lastUpdated: '2026-10-16T21:59:00Z', loading: true, progress: { done: 6, total: 6 } }), NOW)).toBe(false);
    // A refresh in flight over data in hand, with no count, is in.
    expect(isStillLoading(feed({ name: 'x', layer: 'L', lastUpdated: '2026-10-16T21:59:00Z', loading: true }), NOW)).toBe(false);
  });
});

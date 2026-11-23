/**
 * The test that a comment could not be.
 *
 * TEAM_STATE and REFUTATION both sat on 30083 for as long as they coexisted,
 * and the thing meant to prevent that was a docstring listing four of the five
 * taken kinds. This asserts the property directly, so the next collision fails
 * a build instead of reaching a relay.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { kinds as nostrKinds } from 'nostr-tools';
import {
  PROTOCOL_KINDS, APP_KINDS, UNGOVERNED_KINDS, ALL_KIND_ALLOCATIONS, KIND_USE, UNUSED_KINDS, retentionOf,
} from '../kindRegistry';
import { ROSTER_ITEM_KIND } from '../../roster/rosterItem';
import { REFUTATION_KIND } from '../../intel/findings/refutation';
import { FINDING_KIND } from '../../intel/findings/FindingsBroadcastService';
import { MISSION_PACKAGE_KIND } from '../../intel/MissionPackageBroadcastService';
import { CAPABILITY_KIND } from '../../intel/capability/missionCapability';

describe('kind allocation', () => {
  it('assigns no number twice', () => {
    const seen = new Map<number, string>();
    const collisions: string[] = [];
    for (const [name, kind] of ALL_KIND_ALLOCATIONS) {
      const prior = seen.get(kind);
      if (prior) collisions.push(`${kind}: ${prior} and ${name}`);
      else seen.set(kind, name);
    }
    expect(collisions).toEqual([]);
  });

  it('is the single source of truth — every module agrees with it', () => {
    // A registry nobody reads is a second comment. These are the real
    // constants the publishing code uses.
    expect(REFUTATION_KIND).toBe(PROTOCOL_KINDS.REFUTATION);
    expect(FINDING_KIND).toBe(PROTOCOL_KINDS.ATTESTED_CLAIM);
    expect(MISSION_PACKAGE_KIND).toBe(PROTOCOL_KINDS.MISSION_PACKAGE);
    expect(CAPABILITY_KIND).toBe(PROTOCOL_KINDS.DISPATCH_CAPABILITY);
  });

  it('keeps team announcements off NIP-51 follow sets', () => {
    // 30000 is NIP-51 follow sets — a kind every list-aware client already
    // reads. Nothing was ever published there, which made it a trapdoor rather
    // than a live bug: it would have activated the day someone finished the
    // feature and saw no reason to question the number already sitting there.
    expect(APP_KINDS.TEAM_ANNOUNCEMENT).not.toBe(30000);
    expect(APP_KINDS.TEAM_ANNOUNCEMENT).toBeGreaterThan(30089);
  });

  it('keeps team state off the protocol block', () => {
    // The specific regression: team gossip on the kind peers subscribe to for
    // refutations, per a published specification. Nothing publishes team state
    // any more, but events of the kind remain on relays, so it stays apart.
    expect(APP_KINDS.TEAM_STATE).not.toBe(REFUTATION_KIND);
    expect(APP_KINDS.TEAM_STATE).not.toBe(FINDING_KIND);
  });

  it('classifies retention by range, the way relays do', () => {
    expect(retentionOf(30082)).toBe('addressable');
    expect(retentionOf(30083)).toBe('addressable');
    expect(retentionOf(1984)).toBe('regular');
    expect(retentionOf(22242)).toBe('ephemeral');
  });

  it('records that refutation cannot be a regular event at 30083', () => {
    // Not a preference. NIP-01 derives storage semantics from the number, so
    // the spec calling this "regular" does not make relays treat it as one —
    // they will replace on (pubkey, kind, d), and no d-tag is specified.
    expect(retentionOf(PROTOCOL_KINDS.REFUTATION)).not.toBe('regular');
    expect(retentionOf(PROTOCOL_KINDS.REFUTATION)).toBe('addressable');
  });

  it('leaves the protocol room to grow before app kinds start', () => {
    const protocolMax = Math.max(...Object.values(PROTOCOL_KINDS));
    const appInBlock = Object.values(APP_KINDS).filter(k => k > 30079 && k <= protocolMax + 5);
    expect(appInBlock).toEqual([]);
  });
});

/**
 * The registry holds every kind the application touches, and says what Starcom does with each (the EIN transition
 * audit, 21 Nov 2026, findings 1 and 2). It called itself complete while fourteen kinds in use were missing from it,
 * and the node descriptor built from it told peers Starcom publishes five kinds when it publishes about twenty-five.
 */
describe('every kind in use', () => {
  const allocated = new Set(ALL_KIND_ALLOCATIONS.map(([, kind]) => kind));

  it('is allocated, and each allocation is either in use or listed as unused', () => {
    const used = Object.keys(KIND_USE).map(Number);
    expect(used.filter((k) => !allocated.has(k))).toEqual([]);
    expect([...allocated].filter((k) => !(k in KIND_USE) && !UNUSED_KINDS.has(k))).toEqual([]);
    expect([...UNUSED_KINDS].filter((k) => k in KIND_USE)).toEqual([]);
  });

  it('says whether Starcom publishes it, reads it, or only signs it', () => {
    const silent = Object.entries(KIND_USE).filter(([, u]) => !u.publishes && !u.reads && !u.signs).map(([k]) => k);
    expect(silent).toEqual([]);
  });

  it('agrees with the roster module', () => {
    expect(ROSTER_ITEM_KIND).toBe(PROTOCOL_KINDS.ROSTER_ITEM);
  });

  /** Files whose "kind" constants are not Nostr kinds, each with why. */
  const NOT_EVENT_KINDS: Record<string, string> = {
    'src/features/globe/marks/kindMarks.ts': 'the globe\'s mark kinds: KIND_MARK_PX is a size in pixels',
    'src/features/globe/marks/kindAtlas.ts': 'the globe\'s mark kinds: KIND_ATLAS_ROW_COUNT is a count of rows',
    'src/services/nostr/kindRegistry.ts': 'the registry itself',
  };

  function sourceFiles(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === '__tests__' || name === '__fixtures__' || name === 'node_modules') continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) sourceFiles(full, out);
      else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
    }
    return out;
  }

  it('in the code is registered: every kind number written in a filter, a template or a kind constant', () => {
    const root = process.cwd();
    const patterns = [
      /\bkinds?\s*:\s*\[?\s*(\d+(?:\s*,\s*\d+)*)/g,
      /\b[A-Z_]*KINDS?\s*=\s*\[?\s*(\d+(?:\s*,\s*\d+)*)/g,
      /\b(?:KIND_[A-Z_]+|[A-Z_]+_KIND)\s*=\s*(\d+)/g,
    ];
    const unregistered: string[] = [];
    const found = new Set<number>();
    for (const file of sourceFiles(join(root, 'src'))) {
      const rel = relative(root, file).split('\\').join('/');
      if (rel in NOT_EVENT_KINDS) continue;
      const text = readFileSync(file, 'utf8');
      for (const re of patterns) {
        for (const m of text.matchAll(re)) {
          for (const n of m[1].split(/\s*,\s*/).map(Number)) {
            found.add(n);
            if (!(n in KIND_USE)) unregistered.push(`${rel}: ${n}`);
          }
        }
      }
      // nostr-tools' own names for kinds, e.g. kinds.ChannelMessage.
      for (const m of text.matchAll(/\bkinds\.([A-Z][A-Za-z]+)/g)) {
        const n = (nostrKinds as unknown as Record<string, unknown>)[m[1]];
        if (typeof n === 'number') found.add(n);
        if (typeof n === 'number' && !(n in KIND_USE)) unregistered.push(`${rel}: ${n} (kinds.${m[1]})`);
      }
    }
    expect([...new Set(unregistered)]).toEqual([]);
    // Not vacuous: the scan finds the kinds written in the code (17 on 21 Nov 2026).
    expect(found.size).toBeGreaterThanOrEqual(15);
  });
});


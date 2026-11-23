/**
 * A Mission Package works toward a Cause or an Initiative (the owner's RS59, 2026-10-23; spec rev 18): its tags carry
 * `toward` links as roster items do, and the cause counts the package as work toward it, never the people.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { towardOfPackage, towardTags } from '../packageToward';
import { citingWork, citingWorkText } from '../citingWork';
import type { ReadRosterItem } from '../rosterItem';
import type { AcceptedPackage } from '../../intel/MissionPackageIngest';

const CAUSE = `30084:${'c'.repeat(64)}:cause-clean-water`;
const OTHER = `30084:${'d'.repeat(64)}:initiative-wells`;
const pkg = (pubkey: string, d: string, tags: string[][], at = 1_792_000_000): AcceptedPackage =>
  ({ event: { id: `${d}-id`, pubkey, created_at: at, kind: 30079, tags: [['d', d], ...tags], content: '{}', sig: '' }, check: { manifest: { name: d } } } as unknown as AcceptedPackage);
const story = (author: string, d: string, toward: string): ReadRosterItem =>
  ({ d, kind: 'story', title: d, limits: [], places: [], toward: [{ coordinate: toward, relay: '' }], counts: [], text: '', author, createdAt: 1_791_000_000, address: `30084:${author}:${d}` });

describe('towardOfPackage', () => {
  it('reads each roster address a package says it works toward, once, and nothing else', () => {
    expect(towardOfPackage([
      ['a', CAUSE, 'wss://relay.example', 'toward'],
      ['a', CAUSE, '', 'toward'],
      ['a', OTHER, '', 'toward'],
      ['a', `30079:${'e'.repeat(64)}:a-mission`, '', 'toward'],
      ['a', `30084:${'f'.repeat(64)}:counted-not-toward`, '', 'counts'],
      ['a', 'not an address', '', 'toward'],
      ['e', 'x'],
    ])).toEqual([{ coordinate: CAUSE, relay: 'wss://relay.example' }, { coordinate: OTHER, relay: '' }]);
  });

  it('writes them as the tags a reader reads back, each once', () => {
    const tags = towardTags([{ coordinate: CAUSE, relay: '' }, { coordinate: CAUSE, relay: 'wss://x.example' }, { coordinate: 'nope', relay: '' }]);
    expect(tags).toEqual([['a', CAUSE, '', 'toward']]);
    expect(towardOfPackage(tags)).toEqual([{ coordinate: CAUSE, relay: '' }]);
    expect(towardTags()).toEqual([]);
  });
});

describe('citingWork, with the missions toward a cause (RS59)', () => {
  const A = 'a'.repeat(64);
  const B = 'b'.repeat(64);
  const packages = [
    pkg(A, 'm-old', [['a', CAUSE, '', 'toward']], 1_792_000_000),
    pkg(B, 'm-new', [['a', CAUSE, '', 'toward']], 1_792_500_000),
    pkg(B, 'm-elsewhere', [['a', OTHER, '', 'toward']]),
  ];

  it('counts the packages toward it beside the roster items, newest first, and their publishers once each', () => {
    const work = citingWork(CAUSE, [story(A, 'told', CAUSE)], packages);
    expect(work.missions.map((p) => p.event.tags[0][1])).toEqual(['m-new', 'm-old']);
    expect(work.items).toHaveLength(1);
    expect(work.publishers).toBe(2);
    expect(citingWorkText(work, 'cite it')).toBe('3 pieces of work cite it, from 2 publishers: 1 story, 2 missions.');
  });

  it('says so of missions alone, and counts none without packages', () => {
    expect(citingWorkText(citingWork(OTHER, [], packages), 'toward it')).toBe('1 piece of work toward it, from 1 publisher: 1 mission.');
    expect(citingWork(CAUSE, [story(A, 'told', CAUSE)]).missions).toEqual([]);
  });
});

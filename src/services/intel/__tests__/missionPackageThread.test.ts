/**
 * The reply convention, pinned.
 *
 * This is the answer to the question a peer said was blocking them, so the
 * shape matters more than usual: they will implement against it, and changing
 * it after that costs them a release.
 */
import { describe, it, expect } from 'vitest';
import {
  coordinateFor, packageIdentifier, parsePackageCoordinate,
  repliedCoordinates, MISSION_PACKAGE_KIND,
} from '../missionPackageThread';

/** What the broadcaster builds: an identifier from the id, then a coordinate. */
const packageCoordinate = (pubkey: string, packageId: string) =>
  coordinateFor(pubkey, packageIdentifier(packageId));

const PUBKEY = 'a'.repeat(64);

describe('addressing a Mission Package', () => {
  it('names it by kind, publisher and d tag', () => {
    expect(packageCoordinate(PUBKEY, 'mission-1'))
      .toBe(`30079:${PUBKEY}:starcom_mission_package_mission-1`);
  });

  it('uses the same d tag the broadcaster writes', () => {
    // If these two ever diverge, every reply addresses a package that does not
    // exist and nothing fails — it just silently matches nothing.
    expect(packageIdentifier('mission-1')).toBe('starcom_mission_package_mission-1');
  });

  it('round-trips', () => {
    const parsed = parsePackageCoordinate(packageCoordinate(PUBKEY, 'mission-1'));
    expect(parsed).toEqual({
      kind: MISSION_PACKAGE_KIND,
      pubkey: PUBKEY,
      identifier: 'starcom_mission_package_mission-1',
      packageId: 'mission-1',
    });
  });

  it('keeps colons that belong to the package id', () => {
    // A `d` tag may legally contain colons. Splitting on all of them would
    // truncate the id and match the wrong package, or none.
    const parsed = parsePackageCoordinate(`30079:${PUBKEY}:starcom_mission_package_a:b:c`);
    expect(parsed?.packageId).toBe('a:b:c');
  });
});

describe('what is NOT a package coordinate', () => {
  it('refuses another kind', () => {
    // A reply to someone's long-form post is not a reply to a package.
    expect(parsePackageCoordinate(`30023:${PUBKEY}:starcom_mission_package_x`)).toBeNull();
  });

  it('refuses a malformed coordinate', () => {
    expect(parsePackageCoordinate('30079')).toBeNull();
    expect(parsePackageCoordinate(`30079:${PUBKEY}`)).toBeNull();
    expect(parsePackageCoordinate(`30079:${PUBKEY}:`)).toBeNull();
    expect(parsePackageCoordinate(`:${PUBKEY}:d`)).toBeNull();
  });

  it('refuses a kind that is not a number', () => {
    expect(parsePackageCoordinate(`kind:${PUBKEY}:d`)).toBeNull();
  });

  it('reports a coordinate whose d tag is not a package identifier', () => {
    // Right kind, someone else's naming. Addressable and ours to read, but we
    // cannot claim to know which package it means.
    const parsed = parsePackageCoordinate(`30079:${PUBKEY}:something-else`);
    expect(parsed?.packageId).toBeNull();
    expect(parsed?.identifier).toBe('something-else');
  });
});

describe('recognising a reply', () => {
  const coordinate = packageCoordinate(PUBKEY, 'mission-1');

  it('finds the coordinate in an a tag', () => {
    expect(repliedCoordinates({ tags: [['a', coordinate]] })).toEqual([coordinate]);
  });

  it('does not mistake an e tag for one', () => {
    // An `e` tag pins one revision of a replaceable event; the convention is
    // the coordinate precisely so a republish does not orphan the thread.
    expect(repliedCoordinates({ tags: [['e', coordinate]] })).toEqual([]);
  });

  it('ignores a tags for other kinds', () => {
    expect(repliedCoordinates({ tags: [['a', `30023:${PUBKEY}:other`]] })).toEqual([]);
  });

  it('reads several, without repeating one', () => {
    const other = packageCoordinate(PUBKEY, 'mission-2');
    expect(repliedCoordinates({ tags: [['a', coordinate], ['a', other], ['a', coordinate]] }))
      .toEqual([coordinate, other]);
  });

  it('survives an event with no tags at all', () => {
    expect(repliedCoordinates({})).toEqual([]);
    expect(repliedCoordinates({ tags: [[], ['a'], ['a', '']] })).toEqual([]);
  });

  it('matches the tag shape a conformant reply carries', () => {
    // The convention, stated as the thing the reader filters on: one `a` tag
    // holding the coordinate. A writer has to emit exactly this.
    expect(repliedCoordinates({ tags: [['a', coordinate]] })).toEqual([coordinate]);
  });
});

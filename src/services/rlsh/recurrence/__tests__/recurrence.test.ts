/**
 * RLSH recurrence missions (D-RR) against the kit's own vectors (`vectors_rlsh.json`): every refusal with its reason,
 * the coalition count's rule exactly, and each fixture read as the kit says.
 */
import { describe, it, expect } from 'vitest';
import vectors from '../../../psiWatch/kit-v0/vectors_rlsh.json';
import armed from '../../../psiWatch/kit-v0/fixtures/rlsh/recurrence_window.armed.json';
import closed from '../../../psiWatch/kit-v0/fixtures/rlsh/recurrence_window.closed.json';
import caseNote from '../../../psiWatch/kit-v0/fixtures/rlsh/recurrence_case.json';
import pkg from '../../../psiWatch/kit-v0/fixtures/rlsh/celebration_safety.package.json';
import ending from '../../../psiWatch/kit-v0/fixtures/rlsh/celebration_safety.ending.json';
import {
  coalitionCount, readRecurrenceCase, readRecurrenceWindow, rlshFamilyOf, rlshRefusalOf, stateAt, versionAt, type RlshNote,
} from '../recurrence';
import { checksOf, endReasonOf, objectiveCodes, packageCaseOf, packageWindowOf } from '../recurrencePackage';
import type { PackageManifest } from '../../../exchange/types';

const note = (f: { event: unknown }) => f.event as RlshNote;

describe('the refusals (kit section 6)', () => {
  for (const c of vectors.refusals) {
    it(`refuses ${c.case}`, () => {
      expect(rlshRefusalOf(c.event as RlshNote)).toBe((c.expect as { refused: string }).refused);
    });
  }
  it('takes every fixture the kit says it takes', () => {
    expect(rlshRefusalOf(note(armed))).toBeNull();
    expect(rlshRefusalOf(note(caseNote))).toBeNull();
  });
});

describe('the coalition count (kit 5.6)', () => {
  for (const c of vectors.coalition_count.cases) {
    it(c.case, () => {
      const tp = c.taking_part ? { operators: Number(c.taking_part[1]), agents: Number(c.taking_part[2]) } : null;
      const got = coalitionCount(c.until, c.now, tp);
      expect(got.shown).toBe(c.expect.shown);
      if (got.shown) expect([got.operators, got.agents]).toEqual([c.expect.operators, c.expect.agents]);
      else expect(got.why).toBe(c.expect.why);
    });
  }
});

describe('a window note', () => {
  it('is read with its place at city scale, its lines and its package, and its state held to the clock', () => {
    const w = readRecurrenceWindow(note(armed))!;
    expect(rlshFamilyOf(note(armed))).toBe('recurrence_window');
    expect(w.published).toBe('armed');
    expect(w.tzid).toBe('America/New_York');
    expect(w.point).toEqual({ lat: 40.71, lng: -74.01 });
    expect(w.areas.length).toBeGreaterThan(0);
    expect(w.scoreLine).toMatch(/^On past clinch and title nights/);
    expect(w.packageAddress).toMatch(/^30079:/);
    // Armed before `from`, live from it, closed a second after `until`.
    expect(stateAt(w, w.window.from - 1)).toBe('armed');
    expect(stateAt(w, w.window.from)).toBe('live');
    expect(stateAt(w, w.window.until + 1)).toBe('closed');
  });

  it('says why a closed one closed', () => {
    expect(readRecurrenceWindow(note(closed))?.closedBecause).toBe('passed');
  });
});

describe('the Case', () => {
  it('keeps every count on its own line with its owner, never summed', () => {
    const c = readRecurrenceCase(note(caseNote))!;
    expect(c.nights.length).toBeGreaterThan(0);
    expect(c.counts.every((x) => x.owner && c.owners[x.owner])).toBe(true);
    expect(c.scoreLine).toBeTruthy();
  });
});

describe('the field package', () => {
  const manifest = JSON.parse(pkg.event.content) as PackageManifest;
  it('carries its window, its phases, its Case and its topics to look up', () => {
    const w = packageWindowOf(manifest)!;
    expect(w.window.from).toBe(1812673800);
    expect(w.window.until).toBe(1812701100);
    expect(w.tzid).toBe('America/New_York');
    expect(w.phases.before).toHaveLength(2);
    expect(w.phases.night).toHaveLength(3);
    expect(packageCaseOf(manifest)?.address).toMatch(/recurrence-case-nyc-celebration-recurrence$/);
    expect(checksOf(pkg.event.tags)).toEqual(['mask_laws', 'recording_consent', 'citizens_arrest', 'volunteer_immunity']);
  });

  it('codes its objectives as the operator writes them: P1, P2, P3, S1, S2, T1', () => {
    expect([...objectiveCodes(manifest.objectives ?? []).values()]).toEqual(['P1', 'P2', 'P3', 'S1', 'S2', 'T1']);
  });

  it('says why the ended one ended, and offers no topics', () => {
    const ended = JSON.parse(ending.event.content) as PackageManifest;
    expect(endReasonOf(ended)).toBe('Its window has passed.');
    expect(checksOf(ending.event.tags)).toEqual([]);
  });

  it('stands at a moment as it stood then: the open one before the ending, the ending after', () => {
    const versions = [pkg.event, ending.event];
    expect(versionAt(versions, 1_790_000_000)).toBe(pkg.event);
    expect(versionAt(versions, ending.event.created_at)).toBe(ending.event);
  });
});

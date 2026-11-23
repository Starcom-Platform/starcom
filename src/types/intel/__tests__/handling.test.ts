/**
 * The two handling axes and the three predicates that read them.
 *
 * These cover the property that makes the migration safe: under the legacy
 * bridge, every record written against the old clearance ladder produces the
 * SAME decision from the new predicates as it did from the old `>= CONFIDENTIAL`
 * checks. If that stops holding, stored records silently change meaning.
 */
import { describe, it, expect } from 'vitest';
import {
  requiresProtection,
  requiresRestrictedDistribution,
  requiresCare,
  sensitivityOf,
  visibilityOf,
  VISIBILITY_LABELS,
  type ContentSensitivity,
  type InformationVisibility,
} from '../IntelItemUI';

/*
 * LADDER, OLD_ENCRYPT_AT_REST, OLD_BLOCK_PUBLIC_RELAY and OLD_REDACT stood
 * here — transcriptions of what the three re-keyed call sites did before Stage
 * 6, used by the 'legacy bridge' block to prove the new predicates agreed with
 * the old checks rung for rung.
 *
 * 7c/2 removed that block when it deleted the bridge, and left these behind:
 * four unused constants holding thirteen of the tier literals this migration
 * is counting down. Nothing referenced them, and nothing said so, because an
 * unused const in a test file breaks nothing.
 *
 * The property they served now lives in handlingBackfill.test.ts.
 */

describe('the predicates', () => {
  it('requiresProtection is only the top of the sensitivity axis', () => {
    expect(requiresProtection('protected')).toBe(true);
    expect(requiresProtection('careful')).toBe(false);
    expect(requiresProtection('open')).toBe(false);
  });

  it('requiresCare covers careful AND protected', () => {
    expect(requiresCare('careful')).toBe(true);
    expect(requiresCare('protected')).toBe(true);
    expect(requiresCare('open')).toBe(false);
  });

  /**
   * The distinction the ladder could not express: 'careful' redacts without
   * demanding encryption at rest. Under the old scheme the only way to get
   * redaction was CONFIDENTIAL, which also forced encryption.
   */
  it("'careful' redacts but does not encrypt — a state the ladder had no rung for", () => {
    expect(requiresCare('careful')).toBe(true);
    expect(requiresProtection('careful')).toBe(false);
  });

  it("'limited' restricts distribution without demanding anything of the content", () => {
    expect(requiresRestrictedDistribution('limited')).toBe(true);
    expect(requiresRestrictedDistribution('private')).toBe(true);
    expect(requiresRestrictedDistribution('public')).toBe(false);
  });

  /**
   * Absent means the author did not say. For an OSINT app the open reading is
   * the correct reading of silence — and demanding a declaration nobody made
   * is what produced 17 spurious errors on the first attempt at this migration.
   */
  it('treats an unstated axis as the open case', () => {
    expect(requiresProtection(undefined)).toBe(false);
    expect(requiresCare(undefined)).toBe(false);
    expect(requiresRestrictedDistribution(undefined)).toBe(false);
  });
});

/*
 * ─── THE 'legacy bridge' BLOCK LIVED HERE ────────────────────────────────
 *
 * It asserted that for every rung of the old ladder, the new predicates
 * returned what the old checks returned — the property that made re-keying
 * the three behaviours safe without rewriting stored data.
 *
 * Stage 7c deleted the bridge, so there is no code here to assert against.
 * The property did not go away, it MOVED: the same mapping is now applied
 * once, by the one-time backfill in IntelWorkspaceManager, and is covered by
 * services/intel/__tests__/handlingBackfill.test.ts — which seeds state
 * exactly as an older build wrote it and checks the same boundary.
 *
 * Deleting these without that file existing would have dropped the property
 * entirely. It exists, and it is mutation-tested.
 */

describe('the axes are independent', () => {
  /**
   * The whole reason for the split. Every combination is reachable and none
   * of them constrains another — under the ladder, six of these nine were
   * inexpressible.
   */
  const VIS: InformationVisibility[] = ['public', 'limited', 'private'];
  const SENS: ContentSensitivity[] = ['open', 'careful', 'protected'];

  it('admits all nine combinations, each deciding two things separately', () => {
    const seen = new Set<string>();
    for (const v of VIS) {
      for (const s of SENS) {
        seen.add(`${requiresRestrictedDistribution(v)}/${requiresProtection(s)}/${requiresCare(s)}`);
      }
    }
    // 2 distribution outcomes x 3 distinct content outcomes (open, careful, protected)
    expect(seen.size).toBe(6);
  });
});

/*
 * Plan item 0.5, decision D2: ask every time. A missing distribution used to
 * read as Public, so a record nobody had decided on could be published to
 * relays that cannot recall it.
 */
describe('a distribution nobody has decided on', () => {
  it('reads as undecided, not as Public', () => {
    expect(visibilityOf({})).toBeUndefined();
    expect(visibilityOf(undefined)).toBeUndefined();
    expect(visibilityOf({ visibility: 'limited' })).toBe('limited');
  });

  it('is offered as three choices that each say what happens', () => {
    expect(VISIBILITY_LABELS.public).toMatch(/anyone can read it, and it cannot be recalled/);
    expect(VISIBILITY_LABELS.limited).toMatch(/team's internal relay/);
    expect(VISIBILITY_LABELS.private).toMatch(/never published/);
  });
});
